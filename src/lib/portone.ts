import "server-only";

// PortOne V2 결제 단건 조회 + 검증 공유 헬퍼 — 학생 액션(confirmPortonePayment)·웹훅 라우트 공용.
// 성공 시 customData의 enrollmentId 반환. 금액·통화·상태를 서버가 authoritative하게 검증(클라/웹훅 body 신뢰 금지).
// transient=true는 일시 오류(네트워크·5xx)라 웹훅에서 재시도(500) 유도용. false/미지정은 확정 실패(재시도 무의미).
// 프로젝트가 strictNullChecks off라 판별 유니온 내로잉이 안 되므로 평탄한 형태로 둔다(속성 접근이 안전).
export type VerifiedPayment = {
  ok: boolean;
  enrollmentId?: string;
  error?: string;
  transient?: boolean;
  // 성공 시 결제 상세(payments 기록용).
  amount?: number;
  currency?: string;
  pgTxId?: string;
  method?: string;
  receiptUrl?: string;
  raw?: unknown;
};

type PortonePayment = {
  status?: string;
  currency?: string;
  amount?: { total?: number };
  customData?: unknown;
  transactionId?: string;
  pgTxId?: string;
  receiptUrl?: string;
  method?: { type?: string };
};

export async function getVerifiedPortonePayment(paymentId: string): Promise<VerifiedPayment> {
  const pid = String(paymentId ?? "").trim();
  if (!pid) return { ok: false, error: "결제 정보를 확인할 수 없어요." };

  const secret = process.env.PORTONE_V2_API_SECRET;
  if (!secret) return { ok: false, error: "결제 설정이 필요합니다. 관리자에게 문의해 주세요." };

  let pay: PortonePayment;
  try {
    const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(pid)}`, {
      headers: { Authorization: `PortOne ${secret}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 상태코드·PG 오류 타입 등 상세는 서버 로그에만 남기고, 학생에겐 일반 문구만 노출.
      console.error("[getVerifiedPortonePayment] PortOne 조회 실패:", res.status, body);
      // 5xx는 일시 오류로 간주(재시도 가치), 그 외(401 등)는 설정 오류.
      const transient = res.status >= 500;
      return {
        ok: false,
        error: transient
          ? "결제 확인 중 일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요."
          : "결제 확인에 실패했어요. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.",
        transient,
      };
    }
    pay = await res.json();
  } catch (err) {
    console.error("[getVerifiedPortonePayment] PortOne 조회 예외:", err);
    return { ok: false, error: "결제 확인 중 네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.", transient: true };
  }

  if (pay.status !== "PAID") return { ok: false, error: `결제가 완료되지 않았어요(상태 ${pay.status ?? "알 수 없음"}).` };
  // 통화만 여기서 검증. 금액은 enrollment 유효가격(price_krw ?? 전역 고정가) 기준으로 호출자(settlePortonePayment)가 검증.
  if (pay.currency !== "KRW") return { ok: false, error: "결제 금액이 일치하지 않아요." };

  // customData는 V2에서 문자열로 반환될 수 있음 → 파싱.
  let custom: { enrollmentId?: string } = {};
  try {
    custom = typeof pay.customData === "string" ? JSON.parse(pay.customData) : ((pay.customData as { enrollmentId?: string }) ?? {});
  } catch {
    custom = {};
  }
  const enrollmentId = String(custom.enrollmentId ?? "").trim();
  if (!enrollmentId) return { ok: false, error: "결제 정보가 일치하지 않아요." };

  return {
    ok: true,
    enrollmentId,
    amount: Number(pay.amount?.total),
    currency: pay.currency,
    pgTxId: pay.pgTxId ?? pay.transactionId,
    method: pay.method?.type,
    receiptUrl: pay.receiptUrl,
    raw: pay,
  };
}

// PortOne V2 결제 단건 raw 조회(검증 없음) — 취소 웹훅에서 누적 취소금액(amount.cancelled) 읽기용.
export type RawPayment = {
  ok: boolean;
  raw?: PortonePayment & { amount?: { total?: number; cancelled?: number } };
  error?: string;
  transient?: boolean;
};

export async function fetchPortonePaymentRaw(paymentId: string): Promise<RawPayment> {
  const pid = String(paymentId ?? "").trim();
  const secret = process.env.PORTONE_V2_API_SECRET;
  if (!pid || !secret) return { ok: false, error: "결제 설정이 필요합니다." };
  try {
    const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(pid)}`, {
      headers: { Authorization: `PortOne ${secret}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[fetchPortonePaymentRaw] PortOne 조회 실패:", res.status);
      return { ok: false, error: `PortOne ${res.status}`, transient: res.status >= 500 };
    }
    return { ok: true, raw: await res.json() };
  } catch (err) {
    console.error("[fetchPortonePaymentRaw] 예외:", err);
    return { ok: false, error: "네트워크 오류", transient: true };
  }
}

// PortOne V2 결제 취소(환불) — admin 환불 액션에서 호출. amount 미지정=전액 취소.
// POST /payments/{id}/cancel (Authorization: PortOne {secret}). 성공 시 취소 금액 반환.
export type CancelResult = { ok: boolean; cancelledAmount?: number; error?: string; transient?: boolean };

export async function cancelPortonePayment(paymentId: string, opts: { reason: string; amount?: number }): Promise<CancelResult> {
  const pid = String(paymentId ?? "").trim();
  if (!pid) return { ok: false, error: "결제 정보를 확인할 수 없어요." };

  const secret = process.env.PORTONE_V2_API_SECRET;
  if (!secret) return { ok: false, error: "결제 설정이 필요합니다. 관리자에게 문의해 주세요." };

  const body: Record<string, unknown> = { reason: opts.reason };
  if (typeof opts.amount === "number" && opts.amount > 0) body.amount = opts.amount; // 미지정 = 전액

  try {
    const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(pid)}/cancel`, {
      method: "POST",
      headers: { Authorization: `PortOne ${secret}`, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      console.error("[cancelPortonePayment] PortOne 취소 실패:", res.status, raw);
      // admin 전용 화면이라 PG 원문 사유를 그대로 노출(pgMessage가 가장 구체적 — 예 "취소가능 금액을 초과했습니다.(P568)").
      let detail = "";
      try {
        const j = JSON.parse(raw);
        const msg = j?.pgMessage ?? j?.message ?? j?.type ?? "";
        detail = msg ? `${msg}${j?.pgCode ? ` (${j.pgCode})` : ""}` : "";
      } catch {
        detail = "";
      }
      return { ok: false, error: detail ? `환불 실패: ${detail}` : `환불 실패(PortOne ${res.status}).`, transient: res.status >= 500 };
    }
    const json = await res.json().catch(() => ({}));
    // 응답 형태: { cancellation: { totalAmount, ... } } — 취소 금액 파싱(실패해도 성공 처리).
    const cancelledAmount = Number(json?.cancellation?.totalAmount ?? opts.amount ?? 0) || undefined;
    return { ok: true, cancelledAmount };
  } catch (err) {
    console.error("[cancelPortonePayment] PortOne 취소 예외:", err);
    return { ok: false, error: "환불 처리 중 네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.", transient: true };
  }
}
