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
import PrepHeroArt from "@/components/prep/PrepHeroArt";
import PrepCourseDetailModal from "@/components/prep/PrepCourseDetailModal";
import { gradientOf, isOngoing, priceLabel, seatLabel, weekdaysLabel, type OpenPrepCourse } from "@/components/prep/course-display";
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
  /** 접수 시간창(KST 07:00~19:00) 안인지 — 서버가 계산한 첫 렌더 값(hydration mismatch 방지). */
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
      {/* 히어로 — 배경은 /prep 소개 페이지와 같은 새벽 일러스트(banner variant).
          ⚠️ 위 여백 없음: 프렌딩 홈(/)은 이 영역이 뜰 때 자체 히어로를 숨기므로 항상 컨테이너 첫 자식이다. */}
      <section className="relative isolate overflow-hidden rounded-2xl bg-[#1b2450]">
        <PrepHeroArt variant="banner" className="absolute inset-0 -z-10 h-full w-full" />
        {/* 왼쪽만 진하게 — 오른쪽 해·하늘을 살려 두려고 단색 대신 그라디언트 오버레이를 쓴다. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/55 to-black/25" />

        <div className="flex flex-col gap-3 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-7 md:py-7">
          <div className="min-w-0">
            <span className="inline-block rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur-[2px]">
              매일 함께 외치는, 샤우팅 · 매월 {PREP_SESSION_COUNT}회
            </span>
            <h2 className="mt-2 text-lg font-extrabold text-white md:text-2xl">소리 내어 말하면 입이 트여요</h2>
            <p className="mt-1 text-sm text-white/80">
              지금 신청할 수 있는 강좌 {courses.length}개{mine.length > 0 && <span className="font-bold text-white"> · 내 신청 {mine.length}건</span>}
              <span className="text-white/50"> · </span>
              <Link href="/prep" className="font-semibold text-white underline underline-offset-2 hover:opacity-90">
                강좌 소개 보기
              </Link>
            </p>
            {/* 마감 시간대에도 강좌 정보는 그대로 두고 이유만 알린다 — 숨기면 '강좌가 사라졌다'로 읽힌다. */}
            {!applyOpen && (
              <p className="mt-2 inline-block rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/85 backdrop-blur-[2px]">
                지금은 수강신청 시간이 아니에요 · 매일 {PREP_APPLY_WINDOW_LABEL}
              </p>
            )}
          </div>

          {!isLoggedIn && (
            <Link
              href="/login"
              className="text-ink shrink-0 rounded-full bg-white px-6 py-2.5 text-center text-sm font-bold transition-opacity hover:opacity-90">
              로그인하고 신청
            </Link>
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
            const hostName = host?.name ?? c.frienderName;
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

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-accent-blue-ink bg-accent-blue-soft/60 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold">
                    매월 {PREP_SESSION_COUNT}회
                  </span>
                  <span className="text-muted-fg bg-surface rounded-full px-2.5 py-0.5 text-[11.5px] font-bold">{roomLevelLabelKo(c.level)}</span>
                </div>

                <p className="text-muted-fg-faint mt-2 text-[13px] font-semibold">
                  {seatLabel(c)} · {weekdaysLabel(c.sessions.map((s) => s.date))} · {fmtTime(c.startMin)}~{fmtRoomEnd(c.startMin + c.durationMin)}
                </p>
                <p className="text-ink mt-1 text-[13px] font-bold break-words">{priceLabel(c)}</p>

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
