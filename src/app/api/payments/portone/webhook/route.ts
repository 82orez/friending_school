import { Webhook } from "@portone/server-sdk";
import { getVerifiedPortonePayment } from "@/lib/portone";
import { finalizeEnrollmentPayment } from "@/lib/payment";

// PortOne V2 웹훅 — 결제 완료를 서버가 직접 통지받아 확정(클라 콜백 유실·모바일 리다이렉트 보강).
// 서명 검증(@portone/server-sdk Webhook.verify) 후 Transaction.Paid만 처리 → 결제 재조회·검증 → finalize(role:"system").
// 멱등: finalize의 '결제대기' 상태 게이트로 이미 처리된 건은 무시(200). 위조 웹훅은 서명 실패로 400.
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.PORTONE_V2_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[portone webhook] PORTONE_V2_WEBHOOK_SECRET 미설정");
    return new Response("misconfigured", { status: 500 });
  }

  // 서명 검증엔 원문 body 문자열이 필요.
  const raw = await req.text();
  const headers = Object.fromEntries(req.headers) as Record<string, string>;

  let webhook: Awaited<ReturnType<typeof Webhook.verify>>;
  try {
    webhook = await Webhook.verify(secret, raw, headers);
  } catch (err) {
    console.error("[portone webhook] 서명 검증 실패:", err);
    return new Response("invalid signature", { status: 400 });
  }

  // 결제 승인 이벤트만 처리. 그 외(취소·가상계좌 발급·실패 등)는 무시(200).
  if (!("type" in webhook) || webhook.type !== "Transaction.Paid") {
    return new Response("ignored", { status: 200 });
  }

  const paymentId = webhook.data?.paymentId;
  if (!paymentId) return new Response("no paymentId", { status: 200 });

  // 서명은 신뢰하되 금액·enrollmentId는 PortOne REST로 재검증(공유 헬퍼).
  const verified = await getVerifiedPortonePayment(paymentId);
  if (!verified.ok) {
    // 일시 오류(네트워크·5xx)면 500으로 PortOne 재전송 유도, 확정 실패(금액/상태 불일치 등)면 200으로 종료.
    console.error("[portone webhook] 결제 검증 실패:", paymentId, verified.error);
    return new Response(verified.error, { status: verified.transient ? 500 : 200 });
  }

  const res = await finalizeEnrollmentPayment(verified.enrollmentId, { id: "system", role: "system" });
  if (!res.ok) {
    // "이미 처리된 신청입니다" 등은 정상(멱등) → 200. 로깅만.
    console.warn("[portone webhook] finalize 미확정:", verified.enrollmentId, res.error);
  }
  return new Response("ok", { status: 200 });
}
