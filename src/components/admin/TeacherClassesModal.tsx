"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeSlots, formatDateKo, lessonEndDate } from "@/lib/availability";
import type { CurrentTeacher, TeacherClassItem } from "@/components/admin/TeacherRequestsManager";

const STATUS_LABEL: Record<string, string> = {
  승인: "승인",
  결제대기: "결제 대기",
  결제완료: "결제 완료",
};

const STATUS_BADGE: Record<string, string> = {
  승인: "bg-accent-blue-soft text-accent-blue-ink",
  결제대기: "bg-[#FFF7E6] text-[#B97400]",
  결제완료: "bg-[#E1F5EE] text-[#0F6E56]",
};

// 학생 표시명: 한글명 (영문명).
function studentLabel(item: TeacherClassItem): string {
  const en = item.studentEnglishName?.trim();
  return en ? `${item.studentName} (${en})` : item.studentName;
}

// 수업 기간 "시작일 ~ 종료일"(YYYY-MM-DD). 종료일=lessonEndDate(시작+주간 slots+횟수), 계산 불가 시 시작일만.
function schedulePeriod(item: TeacherClassItem): string {
  if (!item.startDate) return "-";
  const [y, m, d] = item.startDate.split("-").map(Number);
  if (!y || !m || !d) return item.startDate;
  const end = lessonEndDate(new Date(y, m - 1, d), item.slots, item.totalSessions);
  if (!end) return item.startDate;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${item.startDate} ~ ${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`;
}

export default function TeacherClassesModal({ teacher, onClose }: { teacher: CurrentTeacher | null; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 열림 시: Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  useEffect(() => {
    if (!teacher) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [teacher, onClose]);

  if (!teacher) return null;

  const name = teacher.name || teacher.email;
  const title = `${name} · 진행 중인 수업`;
  const classes = teacher.classes;

  return (
    <>
      {/* 오버레이 */}
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-rule flex items-center justify-between border-b px-6 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-ink truncate text-lg font-bold">{name}</h2>
            <span className="bg-accent-blue-soft text-accent-blue-ink shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold">진행 중인 수업</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          {classes.length === 0 ? (
            <p className="text-muted-fg py-8 text-center text-sm">진행 중인 수업이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {classes.map((item) => (
                <li key={item.enrollmentId} className="border-rule rounded-xl border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-ink truncate font-bold">{item.courseTitle}</p>
                      <p className="text-muted-fg mt-0.5 truncate text-sm">{studentLabel(item)}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[item.status] ?? "bg-surface text-muted-fg")}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-y-1.5 text-sm">
                    <div className="flex gap-2">
                      <dt className="text-muted-fg-faint w-24 shrink-0">주간 일정</dt>
                      <dd className="text-ink break-words">{summarizeSlots(item.slots, true, " / ") || "-"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-fg-faint w-24 shrink-0">수업 일정</dt>
                      <dd className="text-ink break-words">{schedulePeriod(item)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-fg-faint w-24 shrink-0">수업 횟수</dt>
                      <dd className="text-ink">{item.totalSessions}회</dd>
                    </div>
                    {item.status === "결제완료" ? (
                      <div className="flex gap-2">
                        <dt className="text-muted-fg-faint w-24 shrink-0">진행</dt>
                        <dd className="text-ink">
                          {item.done}/{item.total}회
                          <span className="text-muted-fg-faint"> · 다음 {item.nextDate ? formatDateKo(item.nextDate) : "예정 수업 없음"}</span>
                        </dd>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <dt className="text-muted-fg-faint w-24 shrink-0">시작 예정</dt>
                        <dd className="text-ink">{item.startDate ? formatDateKo(item.startDate) : "-"}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-rule flex justify-end border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </>
  );
}
