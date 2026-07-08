import { Webhook } from "@portone/server-sdk";
import { createAdminClient } from "@/utils/supabase/admin";
import { fetchPortonePaymentRaw } from "@/lib/portone";
import { settlePortonePayment, refundEnrollmentPayment } from "@/lib/payment";

// PortOne V2 웹훅 — 결제 완료/취소를 서버가 직접 통지받아 DB 동기화(클라 콜백 유실·모바일 리다이렉트·외부(콘솔) 환불 보강).
// 서명 검증(@portone/server-sdk Webhook.verify) 후:
//  - Transaction.Paid → settlePortonePayment(검증+기록+확정+과오납 자동환불)
//  - Transaction.Cancelled / PartialCancelled → refundEnrollmentPayment(수강 취소·미래 수업 취소 동기화)
// 멱등: 상태 게이트로 이미 처리된 건은 무시(200). 위조 웹훅은 서명 실패로 400. 일시 오류만 500(PortOne 재전송).
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

  if (!("type" in webhook)) return new Response("ignored", { status: 200 });

  // 결제 승인 → 정산 파이프라인.
  if (webhook.type === "Transaction.Paid") {
    const paymentId = webhook.data?.paymentId;
    if (!paymentId) return new Response("no paymentId", { status: 200 });
    const res = await settlePortonePayment(paymentId, { id: "system", role: "system" });
    // 일시 오류만 재전송 유도. "이미 처리"·과오납 등은 정상 종료(200).
    if (!res.ok && res.transient) return new Response(res.error ?? "retry", { status: 500 });
    if (!res.ok) console.warn("[portone webhook] Paid 미확정:", paymentId, res.error);
    return new Response("ok", { status: 200 });
  }

  // 결제 취소(콘솔/API 환불 포함) → DB 동기화. 부분 취소도 동일 경로.
  if (webhook.type === "Transaction.Cancelled" || webhook.type === "Transaction.PartialCancelled") {
    const paymentId = webhook.data?.paymentId;
    if (!paymentId) return new Response("no paymentId", { status: 200 });

    const admin = createAdminClient();
    const { data: rows } = await admin.from("payments").select("payment_id, enrollment_id, amount").eq("payment_id", paymentId).limit(1);
    const payment = rows?.[0];
    if (!payment) {
      // 우리 기록에 없는 결제 — 무시(200).
      console.warn("[portone webhook] 취소 대상 결제 미기록:", paymentId);
      return new Response("unknown payment", { status: 200 });
    }

    // PortOne 기준 누적 취소금액(절대값)으로 멱등 동기화. 조회 실패(일시)면 재전송 유도.
    const rawPay = await fetchPortonePaymentRaw(paymentId);
    if (!rawPay.ok) return new Response(rawPay.error ?? "retry", { status: rawPay.transient ? 500 : 200 });
    const totalCancelled = Number(rawPay.raw?.amount?.cancelled) || payment.amount || 0;

    await refundEnrollmentPayment(admin, {
      payment: { payment_id: payment.payment_id, enrollment_id: payment.enrollment_id, amount: payment.amount },
      totalCancelledAmount: totalCancelled,
      reason: "PortOne 결제 취소",
      actor: { id: "system", role: "system" },
    });
    return new Response("ok", { status: 200 });
  }

  return new Response("ignored", { status: 200 });
}
