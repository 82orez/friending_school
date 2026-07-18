"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeSlots, formatDate, scheduleDateRange, fmtTime, lessonEndMin } from "@/lib/availability";
import { getCourse } from "@/data/courses";
import { useLang } from "@/components/LangProvider";
import type { CurrentTeacher, TeacherClassItem, TeacherCoverItem } from "@/components/admin/TeacherRequestsManager";

const STATUS_LABEL: Record<string, string> = {
  승인: "승인",
  결제대기: "결제 대기",
  결제완료: "결제 완료",
};
const STATUS_LABEL_EN: Record<string, string> = {
  승인: "Approved",
  결제대기: "Payment pending",
  결제완료: "Paid",
};

const STATUS_BADGE: Record<string, string> = {
  승인: "bg-accent-blue-soft text-accent-blue-ink",
  결제대기: "bg-[#FFF7E6] text-[#B97400]",
  결제완료: "bg-[#E1F5EE] text-[#0F6E56]",
};

// 학생 표시명: ko="한글명 (영문명)" / en="영문명" 우선.
function studentLabel(item: { studentName: string; studentEnglishName: string | null }, en: boolean): string {
  const eng = item.studentEnglishName?.trim();
  if (en) return eng || item.studentName;
  return eng ? `${item.studentName} (${eng})` : item.studentName;
}

// 과정명: en이면 레지스트리 영문명 → DB 영문 스냅샷 → 한글명 폴백(classroom.ts와 동일 체인).
function courseLabel(item: { course: string; courseEnglishTitle?: string | null; courseTitle: string }, en: boolean): string {
  return en ? (getCourse(item.course)?.englishTitle ?? item.courseEnglishTitle ?? item.courseTitle) : item.courseTitle;
}

// 대체 회차 1건 — covering=내가 대타(정상 담당), away=내 회차가 넘어감(read-only, dim).
function CoverRow({ item, en }: { item: TeacherCoverItem; en: boolean }) {
  const away = item.kind === "away";
  return (
    <li className={cn("border-rule rounded-lg border bg-white px-3 py-2.5", away && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", away ? "bg-surface text-muted-fg" : "bg-cta/10 text-cta")}
        >
          {away ? (en ? "Reassigned" : "대체됨") : en ? "Covering" : "대타"}
        </span>
        <span className="text-ink text-sm font-bold">
          {formatDate(item.sessionDate, !en)} {fmtTime(item.startMin)}~{fmtTime(lessonEndMin(item.endMin))}
        </span>
        {item.isMakeup && (
          <span className="bg-accent-blue-soft text-accent-blue-ink shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">{en ? "Makeup" : "보강"}</span>
        )}
      </div>
      <p className="text-muted-fg mt-1 text-sm">
        {courseLabel(item, en)} · {studentLabel(item, en)}
      </p>
      <p className="text-muted-fg-faint mt-0.5 text-xs">
        {away
          ? en
            ? `Covered by ${item.counterpartName ?? "-"}`
            : `대체 강사: ${item.counterpartName ?? "-"}`
          : en
            ? `For ${item.counterpartName ?? "-"}`
            : `원 강사: ${item.counterpartName ?? "-"}`}
      </p>
    </li>
  );
}

export default function TeacherClassesModal({ teacher, onClose }: { teacher: CurrentTeacher | null; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const en = useLang() === "en";

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
  const title = `${name} · ${en ? "In-progress classes" : "진행 중인 수업"}`;
  const classes = teacher.classes;
  const covers = teacher.coverSessions ?? [];

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
            <span className="bg-accent-blue-soft text-accent-blue-ink shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold">
              {en ? "In progress" : "진행 중인 수업"}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={en ? "Close" : "닫기"}
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          {classes.length === 0 && covers.length === 0 ? (
            <p className="text-muted-fg py-8 text-center text-sm">{en ? "No classes in progress." : "진행 중인 수업이 없습니다."}</p>
          ) : classes.length === 0 ? null : (
            <ul className="flex flex-col gap-3">
              {classes.map((item) => (
                <li key={item.enrollmentId} className="border-rule rounded-xl border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-ink truncate font-bold">{courseLabel(item, en)}</p>
                      <p className="text-muted-fg mt-0.5 truncate text-sm">{studentLabel(item, en)}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[item.status] ?? "bg-surface text-muted-fg")}>
                      {(en ? STATUS_LABEL_EN : STATUS_LABEL)[item.status] ?? item.status}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-y-1.5 text-sm">
                    <div className="flex gap-2">
                      <dt className="text-muted-fg-faint w-24 shrink-0">{en ? "Weekly" : "주간 일정"}</dt>
                      <dd className="text-ink break-words">{summarizeSlots(item.slots, !en, " / ") || "-"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-fg-faint w-24 shrink-0">{en ? "Period" : "수업 일정"}</dt>
                      <dd className="text-ink break-words">{scheduleDateRange(item.startDate, item.slots, item.totalSessions)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-fg-faint w-24 shrink-0">{en ? "Sessions" : "수업 횟수"}</dt>
                      <dd className="text-ink">{en ? item.totalSessions : `${item.totalSessions}회`}</dd>
                    </div>
                    {item.status === "결제완료" ? (
                      <div className="flex gap-2">
                        <dt className="text-muted-fg-faint w-24 shrink-0">{en ? "Progress" : "진행"}</dt>
                        <dd className="text-ink">
                          {en ? `${item.done}/${item.total}` : `${item.done}/${item.total}회`}
                          <span className="text-muted-fg-faint">
                            {" · "}
                            {en ? "Next " : "다음 "}
                            {item.nextDate ? formatDate(item.nextDate, !en) : en ? "no upcoming class" : "예정 수업 없음"}
                          </span>
                        </dd>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <dt className="text-muted-fg-faint w-24 shrink-0">{en ? "Starts" : "시작 예정"}</dt>
                        <dd className="text-ink">{item.startDate ? formatDate(item.startDate, !en) : "-"}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          )}

          {covers.length > 0 && (
            <section className={cn(classes.length > 0 && "border-rule mt-6 border-t pt-5")}>
              <h3 className="text-ink text-sm font-bold">{en ? "Substitute sessions" : "대체 수업"}</h3>
              <p className="text-muted-fg-faint mt-0.5 text-xs">
                {en ? "Upcoming sessions affected by one-off teacher reassignment." : "1회성 강사 대체로 얽힌 앞으로의 회차입니다."}
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {covers.map((s) => (
                  <CoverRow key={s.classId} item={s} en={en} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="border-rule flex justify-end border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          >
            {en ? "Close" : "닫기"}
          </button>
        </div>
      </div>
    </>
  );
}
