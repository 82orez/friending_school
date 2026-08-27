"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, formatWon, prepPaymentDeadlineLabel } from "@/lib/prep";
import { PAYMENT_BANK } from "@/data/payment";
import { PREP_PAYMENT_DEADLINE_MSG } from "@/data/prep";
import { ENROLLMENT_STATUS_BADGE, ENROLLMENT_STATUS_LABEL, type EnrollmentDisplayStatus } from "@/data/enrollment-status";
import { cancelPrepEnrollment } from "@/app/prep/enroll-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// snake_case 그대로 받는다 — 페이지가 스냅샷 컬럼을 그대로 넘긴다(변환할 파생값이 없다).
export type MyPrepEnrollment = {
  id: string;
  course_id: string;
  course_title: string;
  start_min: number;
  duration_min: number;
  session_count: number;
  first_session_date: string | null;
  last_session_date: string | null;
  price_krw: number;
  status: "입금대기" | "수강확정" | "취소";
  paid_at: string | null;
  created_at: string;
  /** 환불 누적액(payments.cancelled_amount). 0이면 환불 이력 없음 — 취소 배지를 「환불됨」으로 가르는 근거. */
  refundedKrw: number;
};

// DB enum → 표시 상태. 문구·색은 src/data/enrollment-status.ts가 갖는다
// (정규 과정 섹션과 같은 탭에 있어 같은 뜻이면 같은 배지여야 한다).
// ⚠️ '입금대기'는 화면에 「결제 대기」로 뜬다 — 프렙은 무통장만 있지만 어휘를 하나로 맞춘다.
const DISPLAY_STATUS: Record<MyPrepEnrollment["status"], EnrollmentDisplayStatus> = {
  입금대기: "결제대기",
  수강확정: "수강확정",
  취소: "취소됨",
};

// 취소 + 환불 기록이면 「환불됨」. DB 상태는 둘 다 '취소'라 금액 기록으로만 갈린다.
const displayStatus = (e: MyPrepEnrollment): EnrollmentDisplayStatus =>
  e.status === "취소" && e.refundedKrw > 0 ? "환불됨" : DISPLAY_STATUS[e.status];

export default function MyPrepEnrollments({ enrollments }: { enrollments: MyPrepEnrollment[] }) {
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = useState<MyPrepEnrollment | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmCancel = () => {
    const target = cancelTarget;
    setCancelTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    startTransition(async () => {
      const res = await cancelPrepEnrollment(target.course_id);
      if (res.ok) {
        router.refresh();
        toast.success("신청을 취소했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    // 껍데기·헤더·행 여백은 StudentEnrollments(필리핀 화상영어 과정)와 같은 값 —
    // 같은 탭에 두 섹션이 나란히 놓이므로 한쪽만 다르면 바로 눈에 띈다.
    <section className="border-rule overflow-hidden rounded-2xl border bg-white">
      <div className="border-rule flex items-center gap-2 border-b px-6 py-5">
        <span aria-hidden>📘</span>
        <h2 className="text-ink text-base font-bold">프렙 강좌</h2>
        <span className="text-muted-fg-faint ml-auto text-sm">{enrollments.length}건</span>
      </div>

      {enrollments.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-muted-fg text-sm">신청한 프렙 강좌가 없어요.</p>
          <Link href="/prep" className="text-accent-blue-ink mt-3 inline-block text-sm font-bold underline underline-offset-2">
            프렙 강좌 소개 보기
          </Link>
        </div>
      ) : (
        <ul className="list-none">
          {enrollments.map((e) => {
            const period =
              e.first_session_date && e.last_session_date
                ? `${fmtDateKo(e.first_session_date)} ~ ${fmtDateKo(e.last_session_date)} (${e.session_count}회)`
                : "-";
            return (
              <li key={e.id} className="border-rule border-b px-6 py-4 last:border-b-0">
                {/* 배치는 필리핀 화상영어 과정 행(EnrollmentRow)과 같은 순서 —
                    제목(flex-1) → 상태 배지 → 액션. 두 섹션이 세로로 붙어 있어 배지가 좌우로 갈리면
                    시선이 오른쪽 끝과 왼쪽을 오간다(실제 피드백). 취소 버튼이 정규 행의 ▾ 자리를 쓴다. */}
                <div className="flex items-center gap-3">
                  <p className="text-ink min-w-0 flex-1 truncate text-base font-bold">{e.course_title}</p>
                  {/* 환불 건은 정규 과정과 같은 파생 판정(취소 + 환불 기록) — 그냥 '취소됨'으로 두면 돈을 돌려받은 사실이 안 보인다. */}
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", ENROLLMENT_STATUS_BADGE[displayStatus(e)])}>
                    {ENROLLMENT_STATUS_LABEL[displayStatus(e)]}
                  </span>
                  {e.status === "입금대기" && (
                    <button
                      type="button"
                      onClick={() => setCancelTarget(e)}
                      disabled={pending}
                      className="border-brand/40 text-brand hover:bg-brand/5 shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60">
                      신청 취소
                    </button>
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                  {(
                    [
                      ["기간", period],
                      ["시각", `${fmtTime(e.start_min)}~${fmtRoomEnd(e.start_min + e.duration_min)} (${e.duration_min}분)`],
                      ["수강료", formatWon(e.price_krw)],
                      ...(e.refundedKrw > 0 ? ([["환불", `${formatWon(e.refundedKrw)} 환불 완료`]] as const) : []),
                    ] as const
                  ).map(([label, value]) => (
                    <Fragment key={label}>
                      <dt className="text-muted-fg-faint">{label}</dt>
                      <dd className="text-ink font-semibold break-words">{value}</dd>
                    </Fragment>
                  ))}
                </dl>

                {e.status === "입금대기" && (
                  <div className="border-rule bg-surface mt-3 rounded-lg border p-3 text-sm">
                    <p className="text-ink font-bold">입금 안내</p>
                    <p className="text-ink mt-1">
                      {PAYMENT_BANK.bank} {PAYMENT_BANK.account} · 예금주 {PAYMENT_BANK.holder}
                    </p>
                    {/* 기한은 **신청일(created_at) 기준**이라 다음 날 다시 열어도 날짜가 따라 움직이지 않는다. */}
                    <p className="text-ink mt-1 font-semibold">입금 기한 {prepPaymentDeadlineLabel(e.created_at)}</p>
                    <p className="text-muted-fg-faint mt-1 text-xs">입금이 확인되면 수강이 확정되고 문자로 알려 드립니다.</p>
                    <p className="text-brand mt-1 text-xs font-bold">{PREP_PAYMENT_DEADLINE_MSG}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={cancelTarget !== null} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>신청을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && (
                <>
                  <span className="text-ink font-semibold">{cancelTarget.course_title}</span> 신청이 취소됩니다. 같은 강좌에 다시 신청할 수 있어요.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} variant="brand">
              신청 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
