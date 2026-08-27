"use client";

import { Fragment, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, fmtDateShort, formatWon, frienderLabel } from "@/lib/prep";
import { formatPhone } from "@/lib/phone";
import { kstDateTimeText } from "@/lib/kst";
import { PREP_STATUS_BADGE, PREP_STATUS_LABEL } from "@/data/prep";
import { roomLevelLabelKo } from "@/data/room-levels";
import { cn } from "@/lib/utils";
import PrepSessionCalendar from "@/components/admin/PrepSessionCalendar";
import type { AdminPrepCourse } from "@/components/admin/PrepCoursesManager";

// 개설된 프렙 강좌 상세(읽기 전용). FrienderInfoModal의 패널 스켈레톤을 이식했다.
// 심사 목록 아코디언과 달리 여기서는 프렌더 연락처까지 함께 본다(폐강·일정 문의가 강좌 단위로 생긴다).
export default function PrepCourseInfoModal({ course, onClose }: { course: AdminPrepCourse | null; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 열림 시: Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  // 중첩 확인 다이얼로그(role=alertdialog)가 열려 있으면 Esc는 그쪽만 닫도록 양보한다.
  useEffect(() => {
    if (!course) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [course, onClose]);

  if (!course) return null;

  const dates = course.sessions.map((s) => s.session_date);
  const period = dates.length > 0 ? `${fmtDateKo(dates[0])} ~ ${fmtDateKo(dates[dates.length - 1])} (${dates.length}회)` : "-";

  const active = course.enrollments.filter((e) => e.status !== "취소");
  const waiting = course.enrollments.filter((e) => e.status === "입금대기").length;
  const cancelled = course.enrollments.length - active.length;

  const rows: [string, string][] = [
    ["프렌더", frienderLabel(course.friender_name, course.friender_nickname)],
    ["연락처", course.friender_phone ? formatPhone(course.friender_phone) : "-"],
    ["이메일", course.friender_email || "-"],
    ["기간", period],
    ["시각", `${fmtTime(course.start_min)}~${fmtRoomEnd(course.start_min + course.duration_min)} (${course.duration_min}분)`],
    ["난이도", roomLevelLabelKo(course.level)],
    ["제한 인원", `${course.capacity}명`],
    ["수강료", formatWon(course.price_krw)],
    ["승인 일시", course.reviewed_at ? kstDateTimeText(course.reviewed_at) : "-"],
    ["소개", course.description?.trim() || "-"],
  ];

  return (
    <>
      {/* 오버레이 */}
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={course.title}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between border-b px-6 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", PREP_STATUS_BADGE[course.status])}>
              {PREP_STATUS_LABEL[course.status]}
            </span>
            <h2 className="text-ink truncate text-lg font-bold">{course.title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-muted-fg-faint">{label}</dt>
                <dd className="text-ink font-semibold break-words whitespace-pre-wrap">{value}</dd>
              </Fragment>
            ))}
          </dl>

          {dates.length > 0 && (
            <div className="border-rule mt-4 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-ink text-sm font-bold">수업 일자</p>
                <p className="text-cta text-sm font-bold">총 {dates.length}회</p>
              </div>
              <PrepSessionCalendar dates={dates} />
              <p className="text-muted-fg mt-2 text-xs">{period}</p>
            </div>
          )}

          {/* 수강신청 — 요약만 보여 주고 처리는 「프렙 수강신청」 탭에서 한다.
              ⚠️ 한때 이 카드가 신청자 목록과 입금 확인·취소 버튼을 통째로 들고 있었는데, 신청이 늘면
              모달(max-h-[90vh]) 안에서 검색도 정렬도 없이 스크롤만 길어졌다 → 전용 탭으로 이관. */}
          <div className="border-rule mt-4 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink text-sm font-bold">수강신청</p>
              <p className="text-cta text-sm font-bold">
                {active.length}명{waiting > 0 && <span className="text-[#B97400]"> · 입금대기 {waiting}</span>}
                {cancelled > 0 && <span className="text-muted-fg-faint"> · 취소 {cancelled}</span>}
              </p>
            </div>
            {course.enrollments.length === 0 ? (
              <p className="text-muted-fg mt-2 text-sm">아직 신청자가 없습니다.</p>
            ) : (
              <Link
                href={`/admin/prep-enrollments?course=${course.id}`}
                className="border-rule text-accent-blue-ink hover:border-accent-blue hover:bg-accent-blue-soft mt-2 inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-bold transition-colors">
                수강신청 관리에서 보기
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>

          {course.sessions.length > 0 && (
            <div className="border-rule mt-4 rounded-xl border p-3">
              <p className="text-ink text-sm font-bold">커리큘럼 {course.sessions.length}회</p>
              <ol className="text-muted-fg mt-2 list-none space-y-1 text-xs">
                {course.sessions.map((s, i) => (
                  <li key={s.session_date} className="flex gap-2">
                    <span className="text-muted-fg-faint w-20 shrink-0">
                      {i + 1}강 {fmtDateShort(s.session_date)}
                    </span>
                    <span className="text-ink break-words">{s.topic?.trim() || "-"}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="border-rule flex justify-end border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors">
            닫기
          </button>
        </div>
      </div>
    </>
  );
}
