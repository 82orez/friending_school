"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { addDays, fmtDateShort, formatWon, weekdayOf } from "@/lib/prep";
import { roomLevelLabelKo } from "@/data/room-levels";
import { PAYMENT_BANK } from "@/data/payment";
import { PREP_APPLY_CLOSED_MSG, PREP_GUIDE, PREP_PAYMENT_DEADLINE_LABEL, PREP_PAYMENT_DEADLINE_MSG } from "@/data/prep";
import type { HostProfile } from "@/components/friending/FriendingRooms";
import PrepCourseBoard from "@/components/prep/PrepCourseBoard";
import {
  gradientOf,
  hostLabel,
  isOngoing,
  periodLabel,
  priceLabel,
  seatLabel,
  weekdaysLabel,
  type OpenPrepCourse,
} from "@/components/prep/course-display";

/**
 * 샤우팅 강좌 세부정보 모달 — 카드의 「세부정보 보기」가 연다.
 * 패널 스켈레톤(Esc·body scroll lock·닫기 포커스)은 RoomInfoModal에서 이식했고,
 * `course === null`이면 언마운트한다(같은 규약).
 * ⚠️ 서버 액션은 부르지 않는다 — 신청·취소는 부모(PrepEnrollBanner)가 소유하고 여기선 콜백만 부른다.
 */

// 레퍼런스 목업(shouting.html)의 탭 4종. '전체'는 필터 없음이고 나머지는 카드의 cat과 매칭한다.
type Cat = "intro" | "guide" | "board";
const TABS: { key: "all" | Cat; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "intro", label: "수업 소개" },
  { key: "guide", label: "이용안내" },
  { key: "board", label: "게시판" },
];

// 주(월요일 시작)의 시작 날짜 문자열.
// ⚠️ Date 객체·toISOString()을 쓰지 않는다 — KST에서 하루 밀린다(PrepCourseForm의 toKey와 같은 함정).
//    addDays·weekdayOf는 Date.UTC 산술이라 TZ에 안전하다.
const weekStartOf = (dateStr: string): string => {
  const dow = weekdayOf(dateStr); // 0=일
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
};

const fmtMd = (dateStr: string): string => {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}`;
};

export default function PrepCourseDetailModal({
  course,
  host,
  isLoggedIn,
  profileMissing,
  applyOpen,
  pending,
  onApply,
  onCancelEnroll,
  onClose,
}: {
  course: OpenPrepCourse | null;
  host: HostProfile | null;
  isLoggedIn: boolean;
  /** 신청 자격에서 빠진 프로필 항목 — 비어 있어야 신청할 수 있다. */
  profileMissing: string[];
  applyOpen: boolean;
  pending: boolean;
  onApply: (course: OpenPrepCourse) => void;
  onCancelEnroll: (course: OpenPrepCourse) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<"all" | Cat>("all");
  // 커리큘럼 주 이동 — 기준은 '내가 듣기 시작하는 회차'가 속한 주다.
  const [week, setWeek] = useState<string | null>(null);

  const courseId = course?.id ?? null;
  useEffect(() => {
    // 강좌가 바뀌면(다른 카드에서 다시 열면) 탭·주를 초기화한다.
    setTab("all");
    setWeek(course ? weekStartOf(course.remainingFirstDate) : null);
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!course) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // 신청 확인 AlertDialog가 열려 있으면 그쪽만 닫히도록 양보한다.
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

  const firstWeek = course ? weekStartOf(course.firstDate) : null;
  const lastWeek = course ? weekStartOf(course.lastDate) : null;

  // 이번 주에 속한 회차 — 날짜 문자열 비교만으로 판정한다(사전순 = 시간순).
  const weekSessions = useMemo(() => {
    if (!course || !week) return [];
    const end = addDays(week, 6);
    return course.sessions.filter((s) => s.date >= week && s.date <= end);
  }, [course, week]);

  if (!course) return null;

  const profileReady = profileMissing.length === 0;
  const hostName = hostLabel(host, course.frienderName); // 「이름(닉네임)」 — 강좌 카드와 같은 헬퍼
  const show = (cat: Cat) => tab === "all" || tab === cat;

  return (
    <>
      {/* 오버레이 */}
      <div
        aria-hidden="true"
        onClick={() => {
          if (!document.querySelector('[role="alertdialog"]')) onClose();
        }}
        className="fixed inset-0 z-[110] bg-black/40"
      />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${course.title} 세부정보`}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* 헤더 — 강좌가 아니라 **누구의 강좌인지**를 먼저 보여 준다(레퍼런스 modal-head). */}
        <div className="border-rule flex items-center gap-3 border-b px-5 py-4">
          {host?.avatarUrl ? (
            <Image
              src={host.avatarUrl}
              alt={`${hostName}님 프로필 사진`}
              width={44}
              height={44}
              className="border-rule size-11 shrink-0 rounded-xl border object-cover"
            />
          ) : (
            <span
              aria-hidden
              style={{ background: gradientOf(course.frienderId) }}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-extrabold text-white">
              {hostName.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="text-ink truncate text-[15px] font-extrabold">{hostName}님</span>
              <span
                title="프렌더"
                aria-hidden
                className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-[50%_50%_50%_3px] bg-[#DC52B8] text-[8px] font-bold text-white">
                F
              </span>
              {host?.nationality && (
                <span className="text-muted-fg bg-surface shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">{host.nationality}</span>
              )}
            </p>
            <p className="text-muted-fg mt-0.5 truncate text-sm font-semibold">{course.title}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-auto px-5 py-4">
          {/* 탭 — sticky라 스크롤 중에도 이동할 수 있다(레퍼런스 .fd-tab-row). */}
          <div className="sticky top-0 z-[1] -mx-5 flex gap-1.5 bg-white px-5 pb-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex-1 rounded-full py-2 text-[13px] font-bold transition-colors",
                  tab === t.key ? "bg-ink text-white" : "bg-surface text-muted-fg hover:text-ink",
                )}>
                {t.label}
              </button>
            ))}
          </div>

          {!profileReady && isLoggedIn && (
            <div className="border-brand/30 bg-brand/5 rounded-xl border px-4 py-3 text-sm">
              <p className="text-brand font-bold">신청 전에 프로필을 완성해 주세요</p>
              <p className="text-ink mt-1">
                <span className="font-bold">{profileMissing.join(" · ")}</span>이(가) 필요합니다. 수업 안내 문자와 출석부에 쓰입니다.{" "}
                <Link href="/mypage" className="text-accent-blue-ink font-bold underline underline-offset-2">
                  마이페이지에서 등록하기
                </Link>
              </p>
            </div>
          )}

          {/* ① 강좌 소개 */}
          {show("intro") && course.description?.trim() && (
            <section className="bg-surface rounded-xl p-4">
              <h3 className="text-ink mb-2 text-[13px] font-extrabold">수업 소개</h3>
              <p className="text-muted-fg text-sm leading-relaxed break-words whitespace-pre-wrap">{course.description}</p>
            </section>
          )}

          {/* ② 프렌더 소개 — bio가 없으면 카드를 아예 만들지 않는다(빈 제목만 남는다). */}
          {show("intro") && host?.bio?.trim() && (
            <section className="bg-surface rounded-xl p-4">
              <h3 className="text-ink mb-2 text-[13px] font-extrabold">프렌더 소개</h3>
              <p className="text-muted-fg text-sm leading-relaxed break-words whitespace-pre-wrap">{host.bio}</p>
            </section>
          )}

          {/* ③ 강좌 정보 — 레퍼런스 '방정보'. 신청 판단에 필요한 조건을 한 곳에 모은다. */}
          {show("guide") && (
            <section className="bg-surface rounded-xl p-4">
              <h3 className="text-ink mb-2 text-[13px] font-extrabold">강좌 정보</h3>
              <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                {(
                  [
                    ["난이도", roomLevelLabelKo(course.level)],
                    [
                      "요일·시간",
                      `${weekdaysLabel(course.sessions.map((s) => s.date))} · ${fmtTime(course.startMin)}~${fmtRoomEnd(course.startMin + course.durationMin)} (${course.durationMin}분)`,
                    ],
                    ["기간", periodLabel(course)],
                    ["방법", "Zoom 그룹 수업"],
                    ["수강료", `${priceLabel(course)} · 무통장 입금`],
                    ["신청 현황", seatLabel(course)],
                  ] as const
                ).map(([label, value]) => (
                  <Fragment key={label}>
                    <dt className="text-muted-fg-faint font-semibold">{label}</dt>
                    <dd className="text-ink font-bold break-words">{value}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          )}

          {/* ④ 진행 가이드 — 강좌마다 다르지 않은 공통 안내(src/data/prep.ts). */}
          {show("guide") && (
            <section className="bg-surface rounded-xl p-4">
              <h3 className="text-ink mb-2 text-[13px] font-extrabold">진행 가이드</h3>
              <ul className="text-muted-fg list-none space-y-1 text-[13px]">
                {PREP_GUIDE.map((g) => (
                  <li key={g} className="relative pl-3 leading-relaxed before:absolute before:left-0 before:content-['-']">
                    {g}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ⑤ 커리큘럼 — 주 단위로 넘겨 본다(20회를 한 번에 펼치면 모달이 스크롤만 길어진다). */}
          {show("guide") && week && (
            <section className="bg-surface rounded-xl p-4">
              <h3 className="text-ink mb-2 text-[13px] font-extrabold">커리큘럼</h3>
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeek(addDays(week, -7))}
                  disabled={!firstWeek || week <= firstWeek}
                  aria-label="이전 주"
                  className="text-muted-fg hover:text-ink rounded px-1 text-lg leading-none transition-colors disabled:opacity-30">
                  ‹
                </button>
                <span className="text-ink text-sm font-extrabold">
                  {fmtMd(week)} ~ {fmtMd(addDays(week, 6))}
                </span>
                <button
                  type="button"
                  onClick={() => setWeek(addDays(week, 7))}
                  disabled={!lastWeek || week >= lastWeek}
                  aria-label="다음 주"
                  className="text-muted-fg hover:text-ink rounded px-1 text-lg leading-none transition-colors disabled:opacity-30">
                  ›
                </button>
              </div>
              {weekSessions.length === 0 ? (
                <p className="text-muted-fg-faint text-[13px]">이 주에는 진행되는 회차가 없어요.</p>
              ) : (
                <ul className="list-none">
                  {weekSessions.map((s) => (
                    <li key={s.no} className="border-rule flex gap-3 border-b py-2 text-[13px] last:border-b-0">
                      <span className="text-muted-fg-faint w-20 shrink-0 font-semibold">{fmtDateShort(s.date)}</span>
                      <span className="text-ink min-w-0 flex-1 font-bold break-words">{s.topic?.trim() || "주제 미정"}</span>
                      {/* ⚠️ 분모는 강좌 전체 회차 수 — 잔여 개수를 쓰면 "7/14회차"가 된다. */}
                      <span className="text-muted-fg-faint shrink-0">
                        {s.no}/{course.sessionCount}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* ⑥ 입금 안내 — 결제는 계좌 이체 1단계뿐이다(카드결제 미구현). */}
          {show("guide") && (
            <section className="border-rule rounded-xl border p-4">
              <h3 className="text-ink mb-2 text-[13px] font-extrabold">입금 안내</h3>
              <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                {(
                  [
                    ["입금 계좌", `${PAYMENT_BANK.bank} ${PAYMENT_BANK.account}`],
                    ["예금주", PAYMENT_BANK.holder],
                    // ⚠️ 정가가 아니라 **청구액**(중도 신청이면 잔여 비례) — RPC가 스냅샷에 넣는 값과 같아야 한다.
                    ["금액", formatWon(course.chargeKrw)],
                    // 모달의 신청 버튼은 접수 시간창(07~19시) 안에서만 눌리므로 기한의 "오늘"은 항상 신청일과 같다.
                    ["입금 기한", `오늘 ${PREP_PAYMENT_DEADLINE_LABEL}까지`],
                  ] as const
                ).map(([label, value]) => (
                  <Fragment key={label}>
                    <dt className="text-muted-fg-faint font-semibold">{label}</dt>
                    <dd className="text-ink font-bold break-words">{value}</dd>
                  </Fragment>
                ))}
              </dl>
              <p className="text-muted-fg-faint mt-2 text-xs">
                신청 후 위 계좌로 입금해 주세요. 관리자가 입금을 확인하면 수강이 확정됩니다.
                {isOngoing(course) && ` 이미 시작한 강좌라 남은 ${course.remainingCount}회분으로 계산된 금액입니다.`}
              </p>
              {/* 기한은 자리를 잡아 두고 입금하지 않는 신청을 막는 조건이라 안내가 아니라 경고로 보여 준다. */}
              <p className="text-brand mt-2 text-xs font-bold">{PREP_PAYMENT_DEADLINE_MSG}</p>
              {/* 모달을 연 채 19:00을 넘길 수 있어 틱으로 자동 반영된다(신청 버튼도 함께 잠긴다). */}
              {!applyOpen && <p className="text-brand mt-2 text-xs font-bold">{PREP_APPLY_CLOSED_MSG}</p>}
            </section>
          )}

          {/* ⑦ 게시판 — ⚠️ 여기만 `show("board")`가 아니라 `tab === "board"`다(「전체」 탭에서 제외).
              마운트가 곧 데이터 로드라 탭을 눌러야 요청이 나가고, 길이를 예측할 수 없는 상호작용
              영역이라 「전체」의 훑어보기 흐름을 끊지 않게 한다. key로 강좌가 바뀌면 상태를 버린다. */}
          {tab === "board" && <PrepCourseBoard key={course.id} courseId={course.id} isLoggedIn={isLoggedIn} />}
        </div>

        <div className="border-rule flex flex-wrap justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60">
            닫기
          </button>
          {!isLoggedIn ? (
            <Link href="/login" className="bg-cta hover:bg-cta/90 rounded-md px-4 py-2 text-sm font-bold text-white transition-colors">
              로그인하고 신청
            </Link>
          ) : course.myStatus === "입금대기" ? (
            <button
              type="button"
              onClick={() => onCancelEnroll(course)}
              disabled={pending}
              className="border-brand/40 text-brand hover:bg-brand/5 rounded-md border px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60">
              신청 취소
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onApply(course)}
              disabled={pending || !!course.myStatus || !profileReady || !applyOpen}
              title={applyOpen ? undefined : PREP_APPLY_CLOSED_MSG}
              className="bg-cta hover:bg-cta/90 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50">
              {pending && <Loader2 className="size-4 animate-spin" />}
              {course.myStatus === "수강확정" ? "수강 확정됨" : "신청하기"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
