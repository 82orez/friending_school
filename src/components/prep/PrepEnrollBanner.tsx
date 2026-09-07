"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ENROLLMENT_STATUS_BADGE, ENROLLMENT_STATUS_LABEL, type EnrollmentDisplayStatus } from "@/data/enrollment-status";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, formatWon, isPrepApplyOpen } from "@/lib/prep";
import { PREP_APPLY_WINDOW_LABEL, PREP_PAYMENT_DEADLINE_MSG, PREP_SESSION_COUNT } from "@/data/prep";
import { roomLevelLabelKo } from "@/data/room-levels";
import { applyPrepCourse, cancelPrepEnrollment } from "@/app/prep/enroll-actions";
import HeroBubbles from "@/components/HeroBubbles";
import PrepCourseDetailModal from "@/components/prep/PrepCourseDetailModal";
import { gradientOf, hostLabel, isOngoing, periodLabel, priceLabel, type OpenPrepCourse } from "@/components/prep/course-display";
import type { HostProfile } from "@/components/friending/FriendingRooms";
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

// 타입 정의처는 course-display.ts로 옮겼지만 홈 page.tsx가 여기서 import해 왔으므로 재수출한다.
export type { OpenPrepCourse };

/**
 * 프렌딩 홈(/) 상단의 샤우팅 수강신청 영역 — 다크 히어로 + 강좌 카드 그리드.
 * 강좌 조건 비교와 신청은 카드가 아니라 **세부정보 모달**이 맡는다(강좌가 여럿이면
 * 카드마다 dl을 펼쳐 두는 방식으로는 첫 화면이 이 영역 하나로 채워진다).
 * ⚠️ 액션 호출·toast·router.refresh()는 이 컴포넌트가 전담한다(샤우팅 UI 규약).
 */
// DB enum → 표시 상태(마이페이지와 공용 어휘).
const BANNER_STATUS: Record<"입금대기" | "수강확정", EnrollmentDisplayStatus> = { 입금대기: "결제대기", 수강확정: "수강확정" };

export default function PrepEnrollBanner({
  courses,
  hosts,
  isLoggedIn,
  profileMissing,
  applyOpenInitial,
}: {
  courses: OpenPrepCourse[];
  /** 개설 프렌더 공개 프로필 — 연습방 카드와 같은 맵(연락처는 서버 select 단계에서 제외됨). */
  hosts: Record<string, HostProfile>;
  isLoggedIn: boolean;
  /** 신청 자격에서 빠진 프로필 항목(휴대폰 인증·성·이름·영어 이름). 비어 있어야 신청할 수 있다. */
  profileMissing: string[];
  /** 접수 시간창(KST 10:00~19:00) 안인지 — 서버가 계산한 첫 렌더 값(hydration mismatch 방지). */
  applyOpenInitial: boolean;
}) {
  // 접수 시간창 — 1분 틱으로 갱신해 화면을 열어 둔 채 19:00을 넘겨도 버튼이 자동으로 잠긴다
  // (PrepSessionList의 틱과 같은 방식이되 초기값만 서버에서 받는다).
  // ⚠️ 서버 authoritative는 RPC join_prep_course이고 여기는 표시 레이어일 뿐이다.
  const [applyOpen, setApplyOpen] = useState(applyOpenInitial);
  useEffect(() => {
    setApplyOpen(isPrepApplyOpen()); // 캐시된 SSR 값 보정
    const t = setInterval(() => setApplyOpen(isPrepApplyOpen()), 60_000);
    return () => clearInterval(t);
  }, []);
  const router = useRouter();
  const [detailTarget, setDetailTarget] = useState<OpenPrepCourse | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<OpenPrepCourse | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OpenPrepCourse | null>(null);
  const [pending, startTransition] = useTransition();

  const mine = useMemo(() => courses.filter((c) => c.myStatus), [courses]);

  if (courses.length === 0) return null;

  const confirmApply = () => {
    const target = confirmTarget;
    setConfirmTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    startTransition(async () => {
      const res = await applyPrepCourse(target.id);
      if (res.ok) {
        setDetailTarget(null);
        router.refresh();
        toast.success("신청이 접수되었습니다. 안내된 계좌로 입금해 주세요.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const confirmCancel = () => {
    const target = cancelTarget;
    setCancelTarget(null);
    if (!target) return;
    startTransition(async () => {
      const res = await cancelPrepEnrollment(target.id);
      if (res.ok) {
        setDetailTarget(null);
        router.refresh();
        toast.success("신청을 취소했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    <>
      {/* 히어로 — v14 목업 shouting.html의 `.lesson-hero` 이식(사진 + 어두운 오버레이 + 가운데 2줄).
          프렌딩 홈 히어로(src/app/page.tsx)와 **같은 스켈레톤**이다 — 같은 목업의 형제 히어로이고
          `showPrepBanner`로 둘 중 하나만 뜨므로 두 히어로가 한 규칙으로 정렬돼야 한다.
          ⚠️ `isolate` + `-z-10` 조합이라 카피 블록에 `relative z-10`을 따로 주지 않는다.
          ⚠️ 위 여백 없음: 프렌딩 홈(/)은 이 영역이 뜰 때 자체 히어로를 숨기므로 항상 컨테이너 첫 자식이다. */}
      <section className="relative isolate flex min-h-[140px] items-center justify-center overflow-hidden rounded-2xl bg-[#1b2450] md:min-h-[190px]">
        {/* 강좌가 있으면 이 히어로가 홈 첫 화면 LCP다 → priority. bg-[#1b2450]은 로드 전/실패 시 대체 배경. */}
        <Image src="/images/hero-shouting.jpg" alt="" fill sizes="(max-width: 1100px) 100vw, 1100px" priority className="-z-10 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-black/45" />
        <HeroBubbles className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full md:block" />

        <div className="px-5 py-8 text-center md:px-16">
          <p className="text-[12px] font-bold text-white/95 md:text-[15px]">매일 함께 외치는, 샤우팅</p>
          <h2 className="mt-1.5 text-[22px] font-bold tracking-[-0.04em] text-white md:mt-2 md:text-[34px]">소리 내어 말하면 입이 트여요</h2>
          {/* 회차 수는 알약 배지가 사라지며 이 줄로 옮겼다(레퍼런스 아이브로우는 카피 한 줄뿐이라). */}
          <p className="mt-2 text-sm text-white/80">
            매월 {PREP_SESSION_COUNT}회<span className="text-white/50"> · </span>
            지금 신청할 수 있는 강좌 {courses.length}개{mine.length > 0 && <span className="font-bold text-white"> · 내 신청 {mine.length}건</span>}
          </p>
          {/* 마감 시간대에도 강좌 정보는 그대로 두고 이유만 알린다 — 숨기면 '강좌가 사라졌다'로 읽힌다. */}
          {!applyOpen && (
            <p className="mt-3 inline-block rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/85 backdrop-blur-[2px]">
              지금은 수강신청 시간이 아니에요 · 매일 {PREP_APPLY_WINDOW_LABEL}
            </p>
          )}
          {/* ⚠️ 어두운 판에서 남색 bg-cta는 묻힌다 → 히어로 안의 CTA는 흰 알약 + text-ink. */}
          {!isLoggedIn && (
            <div className="mt-4">
              <Link
                href="/login"
                className="text-ink inline-block rounded-full bg-white px-6 py-2.5 text-center text-sm font-bold transition-opacity hover:opacity-90">
                로그인하고 신청
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* 강좌 목록 — 흰 판 위 카드 그리드(연습방 카드와 같은 색 토큰·같은 그리드 규칙).
          ⚠️ 다크 판 위에 반투명 카드를 올리면 bg-white·border-rule 같은 토큰을 못 써 규칙이 갈린다. */}
      <section className="mt-5">
        <h3 className="text-ink text-[15px] font-extrabold">샤우팅</h3>
        <p className="text-muted-fg-faint mt-0.5 text-sm">혼자 하기 어려우시다면, 함께 소리내서 연습해요.</p>

        <ul className="mt-3 grid list-none gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => {
            const host = hosts[c.frienderId] ?? null;
            const hostName = hostLabel(host, c.frienderName); // 「이름(닉네임)」 — 상세 모달 헤더와 같은 헬퍼
            return (
              <li key={c.id} className="border-rule flex flex-col rounded-2xl border bg-white p-4">
                {/* 개설 프렌더 — 누구의 강좌인지가 먼저다(레퍼런스 강사 카드). */}
                <div className="flex items-center gap-2.5">
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
                      style={{ background: gradientOf(c.frienderId) }}
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-extrabold text-white">
                      {hostName.slice(0, 1)}
                    </span>
                  )}
                  <p className="text-ink flex min-w-0 items-center gap-1.5 text-[15px] font-extrabold">
                    <span className="min-w-0 truncate">{hostName}님</span>
                    <span
                      title="프렌더"
                      aria-hidden
                      className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-[50%_50%_50%_3px] bg-[#DC52B8] text-[8px] font-bold text-white">
                      F
                    </span>
                  </p>
                </div>

                <p className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-ink text-[15px] font-bold break-words">{c.title}</span>
                  {/* 이미 시작한 강좌라는 사실을 금액보다 먼저 알린다 — 아래 '남은 N회'의 근거다. */}
                  {isOngoing(c) && (
                    <span className="bg-surface text-muted-fg shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">
                      진행 중 · 남은 {c.remainingCount}회
                    </span>
                  )}
                  {c.myStatus && (
                    // 마이페이지 배지와 같은 어휘·색(src/data/enrollment-status.ts) — 한 상태를
                    // 화면마다 다르게 부르지 않는다. '입금대기'는 여기서도 「결제 대기」.
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", ENROLLMENT_STATUS_BADGE[BANNER_STATUS[c.myStatus]])}>
                      {ENROLLMENT_STATUS_LABEL[BANNER_STATUS[c.myStatus]]}
                    </span>
                  )}
                </p>

                {/* 소개는 2줄로 자른다 — 전문은 모달 「소개」 탭이 갖는다.
                    ⚠️ 소개가 없어도 자리를 비워 둬 카드마다 CTA 높이가 어긋나지 않게 한다. */}
                <p className="text-muted-fg mt-1 line-clamp-2 min-h-[2.6em] text-[13px] leading-relaxed">{c.description?.trim() ?? ""}</p>

                {/* 난이도 pill은 빨강 계열(`brand`/`progress` 토큰)로 카드에서 가장 먼저 눈에 띄게 한다. */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-accent-blue-ink bg-accent-blue-soft/60 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold">
                    매월 {PREP_SESSION_COUNT}회
                  </span>
                  <span className="text-progress bg-brand/10 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold">{roomLevelLabelKo(c.level)}</span>
                </div>

                {/* 비교 항목은 한 줄 요약 대신 dl 리스트 — 강좌가 여럿일 때 기간·시간·수업일·수강료가
                    카드마다 같은 자리에 와야 눈으로 훑을 수 있다(신청 현황은 비교에 쓰이지 않아 뺐다). */}
                <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                  <dt className="text-muted-fg-faint font-semibold">기간</dt>
                  <dd className="text-ink font-semibold break-words">{periodLabel(c)}</dd>
                  <dt className="text-muted-fg-faint font-semibold">시간</dt>
                  <dd className="text-ink font-semibold">
                    {fmtTime(c.startMin)}~{fmtRoomEnd(c.startMin + c.durationMin)}
                  </dd>
                  <dt className="text-muted-fg-faint font-semibold">수업일</dt>
                  <dd className="text-ink font-semibold break-words">매월 평일 기준 {PREP_SESSION_COUNT}회</dd>
                  <dt className="text-muted-fg-faint font-semibold">수강료</dt>
                  <dd className="text-ink font-bold break-words">{priceLabel(c)}</dd>
                </dl>

                {/* CTA — 카드는 비교용 요약까지만. 조건 상세·신청은 모달이 맡는다. */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailTarget(c)}
                    aria-haspopup="dialog"
                    className="border-rule text-muted-fg hover:bg-surface hover:text-ink w-full rounded-full border py-2.5 text-[13px] font-bold transition-colors">
                    세부정보 보기
                  </button>
                  {c.myStatus && (
                    <Link
                      href="/mypage/enrollments"
                      className="text-accent-blue-ink shrink-0 text-[13px] font-bold underline underline-offset-2 hover:opacity-90">
                      내 신청
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <PrepCourseDetailModal
        course={detailTarget}
        host={detailTarget ? (hosts[detailTarget.frienderId] ?? null) : null}
        isLoggedIn={isLoggedIn}
        profileMissing={profileMissing}
        applyOpen={applyOpen}
        pending={pending}
        onApply={setConfirmTarget}
        onCancelEnroll={setCancelTarget}
        onClose={() => {
          if (!pending) setDetailTarget(null);
        }}
      />

      {/* 신청 확인 */}
      <AlertDialog open={confirmTarget !== null} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>이 강좌를 신청할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget && (
                <>
                  <span className="text-ink font-semibold">{confirmTarget.title}</span> · {formatWon(confirmTarget.chargeKrw)}
                  {isOngoing(confirmTarget) && (
                    <>
                      {" "}
                      · {fmtDateKo(confirmTarget.remainingFirstDate)}부터 남은 {confirmTarget.remainingCount}회
                    </>
                  )}
                  <br />
                  신청 후 안내된 계좌로 입금하시면, 관리자 확인 뒤 수강이 확정됩니다.
                  <br />
                  <span className="text-brand font-semibold">{PREP_PAYMENT_DEADLINE_MSG}</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmApply} variant="brand">
              신청하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 취소 확인 */}
      <AlertDialog open={cancelTarget !== null} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>신청을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>입금 전 신청만 취소할 수 있어요. 취소 후 같은 강좌에 다시 신청할 수 있습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} variant="brand">
              신청 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
