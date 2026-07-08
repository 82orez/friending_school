"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDown, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { cancelEnrollment, testCardPay } from "@/app/mypage/actions";
import { summarizeSlots, type Slot } from "@/lib/availability";
import { PAYMENT_BANK } from "@/data/payment";
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

export type StudentEnrollment = {
  id: string;
  courseTitle: string;
  priceLabel: string; // 결제 금액 표시(과정 고정가, 예 "₩240,000")
  teacherName: string | null;
  startDate: string;
  slots: Slot[];
  status: "신청" | "승인" | "결제대기" | "결제완료" | "거절" | "취소";
  teacherNote: string | null;
  createdAt: string;
};

// 학생 화면 상태 라벨(강사 승인 흐름 — 승인 시 결제대기, 입금 확인 시 결제완료).
const STATUS_LABEL: Record<StudentEnrollment["status"], string> = {
  신청: "승인 대기",
  승인: "승인됨",
  결제대기: "결제 대기",
  결제완료: "결제 완료",
  거절: "거절됨",
  취소: "취소됨",
};

const STATUS_BADGE: Record<StudentEnrollment["status"], string> = {
  신청: "bg-accent-blue-soft text-accent-blue-ink",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  결제대기: "bg-[#F3EEFD] text-[#6B4AD4]",
  결제완료: "bg-[#E6F4EA] text-[#1E7E34]",
  거절: "bg-brand/10 text-brand",
  취소: "bg-rule text-muted-fg",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export default function StudentEnrollments({ enrollments }: { enrollments: StudentEnrollment[] }) {
  const [rows, setRows] = useState(enrollments);

  return (
    <section className="border-rule overflow-hidden rounded-2xl border bg-white">
      <div className="border-rule flex items-center gap-2 border-b px-6 py-5">
        <span aria-hidden>📋</span>
        <h2 className="text-ink text-base font-bold">수강신청 내역</h2>
        <span className="text-muted-fg-faint ml-auto text-sm">{rows.length}건</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-muted-fg text-sm">아직 수강신청 내역이 없어요.</p>
          <Link
            href="/#courses"
            className="bg-cta mt-4 inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            과정 둘러보기
          </Link>
        </div>
      ) : (
        <ul className="list-none">
          {rows.map((e) => (
            <EnrollmentRow key={e.id} row={e} onUpdated={(updated) => setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EnrollmentRow({ row, onUpdated }: { row: StudentEnrollment; onUpdated: (updated: StudentEnrollment) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const cancellable = row.status === "신청" || row.status === "승인" || row.status === "결제대기";

  const cancel = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await cancelEnrollment(row.id);
      if (res.ok) {
        onUpdated({ ...row, status: "취소" });
        toast.success("신청을 취소했어요.");
      } else {
        toast.error(res.error ?? "취소 중 문제가 발생했어요.");
      }
    });
  };

  const payWithCard = () => {
    setPayOpen(false);
    startTransition(async () => {
      const res = await testCardPay(row.id);
      if (res.ok) {
        onUpdated({ ...row, status: "결제완료" });
        toast.success("테스트 결제가 완료되어 수업이 확정되었어요.");
      } else {
        toast.error(res.error ?? "결제 중 문제가 발생했어요.");
      }
    });
  };

  return (
    <li className="border-rule border-b last:border-b-0">
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-3 px-6 py-4 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-ink truncate text-[15px] font-bold">{row.courseTitle}</p>
            <p className="text-muted-fg mt-0.5 truncate text-sm">
              {row.teacherName ?? "강사"} · 시작 {row.startDate}
            </p>
            <p className="text-muted-fg-faint mt-0.5 text-xs">신청일 {formatDate(row.createdAt)}</p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[row.status])}>{STATUS_LABEL[row.status]}</span>
          <ChevronDown aria-hidden className="text-muted-fg-faint size-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mx-6 mb-4">
          <dl className="bg-surface border-rule rounded-xl border px-4 py-2">
            {[
              ["강사", row.teacherName ?? "강사"],
              ["수업 일정", summarizeSlots(row.slots)],
              ["시작일", row.startDate],
              ...(row.status === "거절" && row.teacherNote ? ([["거절 사유", row.teacherNote]] as [string, string][]) : []),
            ].map(([label, value]) => (
              <div key={label} className="border-rule flex justify-between gap-4 border-b py-2.5 last:border-b-0">
                <dt className="text-muted-fg shrink-0 text-sm">{label}</dt>
                <dd className="text-ink text-right text-sm font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>

          {row.status === "결제대기" && (
            <div className="mt-3 rounded-xl border border-[#6B4AD4]/30 bg-[#F3EEFD] px-4 py-3.5">
              <p className="text-[15px] font-bold text-[#6B4AD4]">💳 입금 안내</p>
              <dl className="mt-2 space-y-1.5 text-sm">
                {[
                  ["결제 금액", row.priceLabel || "-"],
                  ["입금 은행", PAYMENT_BANK.bank],
                  ["계좌번호", PAYMENT_BANK.account],
                  ["예금주", PAYMENT_BANK.holder],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-muted-fg shrink-0">{label}</dt>
                    <dd className={cn("text-ink text-right break-words", label === "결제 금액" ? "font-bold" : "font-medium")}>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-muted-fg-faint mt-2.5 text-xs leading-relaxed">
                위 계좌로 입금해 주세요. 입금이 확인되면(영업일 기준 1~2일) 수업이 확정되며 문자로 안내드려요.
              </p>
            </div>
          )}

          {cancellable && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={pending}
                className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50"
              >
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                신청 취소
              </button>
            </div>
          )}

          {/* 테스트 카드 결제(개발용) — 입금 안내·신청 취소 아래에 별도 배치. PortOne 연동 전 임시 스텁. */}
          {row.status === "결제대기" && (
            <div className="border-rule-faint mt-3 rounded-lg border border-dashed px-4 py-3">
              <button
                type="button"
                onClick={() => setPayOpen(true)}
                disabled={pending}
                className="bg-cta inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" aria-hidden />}
                테스트 카드 결제
              </button>
              <p className="text-muted-fg-faint mt-1.5 text-center text-[11px] leading-relaxed">
                개발용 테스트 결제입니다. 실제 청구는 발생하지 않으며, 결제 시스템(PortOne) 연동 전까지만 제공됩니다.
              </p>
            </div>
          )}
        </div>
      </details>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수강신청을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{row.courseTitle}</span> 신청이 취소되며, 강사님께 취소 알림이 전송됩니다. 이 작업은 되돌릴 수
              없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={cancel} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              신청 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={payOpen} onOpenChange={setPayOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>테스트 카드 결제를 진행할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{row.courseTitle}</span> 수업이 바로 확정됩니다(결제 금액{" "}
              <span className="text-ink font-semibold">{row.priceLabel || "-"}</span>). 개발용 테스트 결제라 실제 청구는 발생하지 않아요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction onClick={payWithCard} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              테스트 결제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
