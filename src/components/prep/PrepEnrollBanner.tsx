"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ENROLLMENT_STATUS_BADGE, ENROLLMENT_STATUS_LABEL, type EnrollmentDisplayStatus } from "@/data/enrollment-status";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, formatWon, isPrepApplyOpen } from "@/lib/prep";
import { PREP_APPLY_CLOSED_MSG, PREP_APPLY_WINDOW_LABEL, PREP_MAX_CAPACITY, PREP_SESSION_COUNT } from "@/data/prep";
import { roomLevelLabelKo } from "@/data/room-levels";
import { applyPrepCourse, cancelPrepEnrollment } from "@/app/prep/enroll-actions";
import PrepHeroArt from "@/components/prep/PrepHeroArt";
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

// 신청 가능한(승인 + **남은 회차가 있는**) 프렙 강좌. 페이지가 공개 RLS로 읽어 내려준다.
// ⚠️ 시작된 강좌도 남은 회차만큼 신청을 받는다(중도 신청) → 표시 금액은 정가가 아니라 `chargeKrw`다.
export type OpenPrepCourse = {
  id: string;
  title: string;
  description: string | null;
  frienderName: string;
  level: string;
  capacity: number;
  startMin: number;
  durationMin: number;
  priceKrw: number;
  sessionCount: number;
  firstDate: string;
  lastDate: string;
  /** 지금 신청하면 듣게 되는 회차 수. 시작 전 강좌는 sessionCount와 같다. */
  remainingCount: number;
  /** 내 첫 수강 회차가 될 날짜. */
  remainingFirstDate: string;
  /** 실제 청구액(잔여 비례). 잔여 = 전체이면 priceKrw 원값. */
  chargeKrw: number;
  enrolled: number;
  /** 내 신청 상태 — 없으면 미신청. */
  myStatus: "입금대기" | "수강확정" | null;
};

const seatLabel = (c: OpenPrepCourse): string =>
  // 정원 상한(1000)은 사실상 '제한 없음'이라 N/1000으로 보여 주면 이상하다.
  c.capacity >= PREP_MAX_CAPACITY ? `${c.enrolled}명 신청` : `${c.enrolled}/${c.capacity}명`;

// 이미 시작해 일부 회차가 지나간 강좌 — 기간·수강료를 '잔여' 기준으로 바꿔 보여 준다.
const isOngoing = (c: OpenPrepCourse): boolean => c.remainingCount < c.sessionCount;

// 기간은 **내가 듣게 될 구간**을 먼저 보여 준다. 전체 일정은 회차 수와 함께 괄호로 남긴다
// (진행 중 강좌에서 강좌 시작일을 앞세우면 "이미 지난 날짜부터 결제하는" 것처럼 읽힌다).
const periodLabel = (c: OpenPrepCourse): string =>
  isOngoing(c)
    ? `${fmtDateKo(c.remainingFirstDate)} ~ ${fmtDateKo(c.lastDate)} (남은 ${c.remainingCount}회)`
    : `${fmtDateKo(c.firstDate)} ~ ${fmtDateKo(c.lastDate)} (${c.sessionCount}회)`;

// 진행 중이면 청구액이 정가가 아니므로 근거(전체 N회 M원 중 잔여 K회)를 함께 적는다.
const priceLabel = (c: OpenPrepCourse): string =>
  isOngoing(c)
    ? `${formatWon(c.chargeKrw)} (전체 ${c.sessionCount}회 ${formatWon(c.priceKrw)} 중 남은 ${c.remainingCount}회)`
    : formatWon(c.priceKrw);

/**
 * 프렌딩 상단의 프렙 수강신청 배너 + 신청 모달.
 * ⚠️ 액션 호출·toast·router.refresh()는 이 컴포넌트가 전담한다(프렙 UI 규약).
 */
// DB enum → 표시 상태(마이페이지와 공용 어휘).
const BANNER_STATUS: Record<"입금대기" | "수강확정", EnrollmentDisplayStatus> = { 입금대기: "결제대기", 수강확정: "수강확정" };

export default function PrepEnrollBanner({
  courses,
  isLoggedIn,
  profileMissing,
  applyOpenInitial,
}: {
  courses: OpenPrepCourse[];
  isLoggedIn: boolean;
  /** 신청 자격에서 빠진 프로필 항목(휴대폰 인증·성·이름·영어 이름). 비어 있어야 신청할 수 있다. */
  profileMissing: string[];
  /** 접수 시간창(KST 08:00~19:00) 안인지 — 서버가 계산한 첫 렌더 값(hydration mismatch 방지). */
  applyOpenInitial: boolean;
}) {
  const profileReady = profileMissing.length === 0;

  // 접수 시간창 — 1분 틱으로 갱신해 배너를 열어 둔 채 19:00을 넘겨도 버튼이 자동으로 잠긴다
  // (PrepSessionList의 틱과 같은 방식이되 초기값만 서버에서 받는다).
  // ⚠️ 서버 authoritative는 RPC join_prep_course이고 여기는 표시 레이어일 뿐이다.
  const [applyOpen, setApplyOpen] = useState(applyOpenInitial);
  useEffect(() => {
    setApplyOpen(isPrepApplyOpen()); // 캐시된 SSR 값 보정
    const t = setInterval(() => setApplyOpen(isPrepApplyOpen()), 60_000);
    return () => clearInterval(t);
  }, []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(courses[0]?.id ?? null);
  const [confirmTarget, setConfirmTarget] = useState<OpenPrepCourse | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OpenPrepCourse | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = useMemo(() => courses.find((c) => c.id === selectedId) ?? null, [courses, selectedId]);
  const mine = useMemo(() => courses.filter((c) => c.myStatus), [courses]);

  if (courses.length === 0) return null;

  const closeModal = () => {
    if (!pending) setOpen(false);
  };

  const confirmApply = () => {
    const target = confirmTarget;
    setConfirmTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    startTransition(async () => {
      const res = await applyPrepCourse(target.id);
      if (res.ok) {
        setOpen(false);
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
        router.refresh();
        toast.success("신청을 취소했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    <>
      {/* 배너 — 강좌 세부 정보(기간·시간·진행 방식·강사·수강료)를 여기서 바로 보여 준다.
          모달까지 열어야 조건을 알 수 있으면 신청 전에 비교가 안 된다.
          배경은 /prep 히어로와 같은 새벽 일러스트(banner variant) — 흰 카드로는 위 히어로에 눌려 안 보였다.
          ⚠️ 위 여백 없음: /friending은 이 배너가 뜰 때 히어로를 숨기므로 배너가 항상 컨테이너 첫 자식이다. */}
      <section className="relative isolate overflow-hidden rounded-2xl bg-[#1b2450]">
        <PrepHeroArt variant="banner" className="absolute inset-0 -z-10 h-full w-full" />
        {/* 왼쪽만 진하게 — 오른쪽 해·하늘을 살려 두려고 단색 대신 그라디언트 오버레이를 쓴다. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/75 via-black/55 to-black/25" />

        <div className="px-5 py-5 md:px-7 md:py-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <span className="inline-block rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur-[2px]">
                프렙 강좌 · 매월 {PREP_SESSION_COUNT}회 말하기 훈련
              </span>
              <h2 className="mt-2 text-lg font-extrabold text-white md:text-2xl">여럿이 함께, 아침으로 여는 영어 스몰톡 훈련</h2>
              <p className="mt-1 text-sm text-white/80">
                지금 신청할 수 있는 강좌 {courses.length}개
                {mine.length > 0 && <span className="font-bold text-white"> · 내 신청 {mine.length}건</span>}
                <span className="text-white/50"> · </span>
                <Link href="/prep" className="font-semibold text-white underline underline-offset-2 hover:opacity-90">
                  강좌 소개 보기
                </Link>
              </p>
              {/* 마감 시간대에도 강좌 정보는 그대로 두고 이유만 알린다 — 배너를 숨기면 '강좌가 사라졌다'로 읽힌다. */}
              {!applyOpen && (
                <p className="mt-2 inline-block rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/85 backdrop-blur-[2px]">
                  지금은 수강신청 시간이 아니에요 · 매일 {PREP_APPLY_WINDOW_LABEL}
                </p>
              )}
            </div>

            {!isLoggedIn && (
              <Link
                href="/login?next=/friending"
                className="text-ink shrink-0 rounded-full bg-white px-6 py-2.5 text-center text-sm font-bold transition-opacity hover:opacity-90">
                로그인하고 신청
              </Link>
            )}
          </div>

          <ul className="mt-4 list-none space-y-3">
            {courses.map((c) => (
              <li key={c.id} className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-[2px] transition-colors hover:bg-white/15">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold break-words text-white">{c.title}</span>
                      {/* 이미 시작한 강좌라는 사실을 금액보다 먼저 알린다 — 아래 dl의 '남은 N회'가 왜 그런지의 근거다. */}
                      {isOngoing(c) && (
                        <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white">
                          진행 중 · 남은 {c.remainingCount}회
                        </span>
                      )}
                      {c.myStatus && (
                        // 마이페이지 배지와 같은 어휘·색(src/data/enrollment-status.ts) — 한 상태를
                        // 화면마다 다르게 부르지 않는다. '입금대기'는 여기서도 「결제 대기」.
                        <span
                          className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", ENROLLMENT_STATUS_BADGE[BANNER_STATUS[c.myStatus]])}>
                          {ENROLLMENT_STATUS_LABEL[BANNER_STATUS[c.myStatus]]}
                        </span>
                      )}
                    </p>
                    {c.description?.trim() && <p className="mt-1 line-clamp-2 text-sm text-white/75">{c.description}</p>}
                  </div>

                  {isLoggedIn &&
                    (c.myStatus ? (
                      <Link
                        href="/mypage/enrollments"
                        className="shrink-0 text-sm font-bold text-white underline underline-offset-2 hover:opacity-90">
                        내 신청 보기
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(c.id);
                          setOpen(true);
                        }}
                        // 접수 시간창 밖이면 잠근다. 라벨은 그대로 둔다(문구가 바뀌면 카드 폭이 흔들린다) —
                        // 이유는 배너 상단 안내가 갖는다.
                        disabled={!applyOpen}
                        title={applyOpen ? undefined : PREP_APPLY_CLOSED_MSG}
                        className="text-ink shrink-0 rounded-full bg-white px-5 py-2 text-sm font-bold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                        신청하기
                      </button>
                    ))}
                </div>

                {/* 세부 정보 — 신청 전에 조건을 다 볼 수 있게. 모달에도 같은 값이 요약으로 다시 나온다. */}
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  {(
                    [
                      ["기간", periodLabel(c)],
                      ["시간", `${fmtTime(c.startMin)}~${fmtRoomEnd(c.startMin + c.durationMin)} (${c.durationMin}분)`],
                      ["진행 방식", `Zoom 그룹 수업 · ${roomLevelLabelKo(c.level)}`],
                      ["강사", c.frienderName],
                      ["수강료", `${priceLabel(c)} (무통장 입금)`],
                      ["신청 현황", seatLabel(c)],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex gap-2.5">
                      <dt className="w-16 shrink-0 text-white/60">{label}</dt>
                      <dd className="min-w-0 font-medium break-words text-white">{value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 신청 모달 — RoomInfoModal과 같은 골격(오버레이 z-110 / 패널 z-120). */}
      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => {
              if (!document.querySelector('[role="alertdialog"]')) closeModal();
            }}
            className="fixed inset-0 z-[110] bg-black/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="프렙 강좌 수강신청"
            className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-rule flex items-center justify-between border-b px-5 py-4 md:px-6">
              <h2 className="text-ink text-lg font-bold">프렙 강좌 수강신청</h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="닫기"
                className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                <X className="size-5" />
              </button>
            </div>

            <div className="overflow-auto px-5 py-5 md:px-6">
              {!profileReady && (
                <div className="border-brand/30 bg-brand/5 mb-4 rounded-xl border px-4 py-3 text-sm">
                  <p className="text-brand font-bold">신청 전에 프로필을 완성해 주세요</p>
                  <p className="text-ink mt-1">
                    <span className="font-bold">{profileMissing.join(" · ")}</span>이(가) 필요합니다. 수업 안내 문자와 출석부에 쓰입니다.{" "}
                    <Link href="/mypage" className="text-accent-blue-ink font-bold underline underline-offset-2">
                      마이페이지에서 등록하기
                    </Link>
                  </p>
                </div>
              )}

              <ul className="list-none space-y-2.5">
                {courses.map((c) => {
                  const active = selectedId === c.id;
                  return (
                    <li key={c.id}>
                      <label
                        className={cn(
                          "block cursor-default rounded-xl border p-4 transition-colors",
                          active ? "border-accent-blue bg-accent-blue-soft/40" : "border-rule bg-white",
                        )}>
                        <span className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="prep-course"
                            checked={active}
                            onChange={() => setSelectedId(c.id)}
                            disabled={!!c.myStatus}
                            className="mt-1 size-4 shrink-0"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-ink text-base font-bold">{c.title}</span>
                              {c.myStatus && (
                                <span
                                  className={cn("rounded-full px-2 py-0.5 text-xs font-bold", ENROLLMENT_STATUS_BADGE[BANNER_STATUS[c.myStatus]])}>
                                  {ENROLLMENT_STATUS_LABEL[BANNER_STATUS[c.myStatus]]}
                                </span>
                              )}
                            </span>
                            <span className="text-muted-fg mt-1 block text-sm">
                              {c.frienderName} · {periodLabel(c)}
                            </span>
                            <span className="text-muted-fg mt-0.5 block text-sm">
                              {fmtTime(c.startMin)}~{fmtRoomEnd(c.startMin + c.durationMin)} · {roomLevelLabelKo(c.level)} · {seatLabel(c)}
                            </span>
                            <span className="text-ink mt-1 block text-base font-bold">{priceLabel(c)}</span>
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {/* 무통장 입금 안내 — 결제는 계좌 이체 1단계뿐이다(카드결제 미구현). */}
              <div className="border-rule bg-surface mt-4 rounded-xl border p-4">
                <p className="text-ink text-sm font-bold">입금 안내</p>
                <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                  {(
                    [
                      ["입금 계좌", `${PAYMENT_BANK.bank} ${PAYMENT_BANK.account}`],
                      ["예금주", PAYMENT_BANK.holder],
                      // ⚠️ 정가가 아니라 **청구액**(중도 신청이면 잔여 비례) — RPC가 스냅샷에 넣는 값과 같아야 한다.
                      ["금액", selected ? formatWon(selected.chargeKrw) : "-"],
                    ] as const
                  ).map(([label, value]) => (
                    <Fragment key={label}>
                      <dt className="text-muted-fg-faint">{label}</dt>
                      <dd className="text-ink font-semibold break-words">{value}</dd>
                    </Fragment>
                  ))}
                </dl>
                <p className="text-muted-fg-faint mt-2 text-xs">
                  신청 후 위 계좌로 입금해 주세요. 관리자가 입금을 확인하면 수강이 확정됩니다.
                  {selected && isOngoing(selected) && ` 이미 시작한 강좌라 남은 ${selected.remainingCount}회분으로 계산된 금액입니다.`}
                </p>
                {/* 모달을 연 채 19:00을 넘길 수 있어 틱으로 자동 반영된다(신청 버튼도 함께 잠긴다). */}
                {!applyOpen && <p className="text-brand mt-2 text-xs font-bold">{PREP_APPLY_CLOSED_MSG}</p>}
              </div>
            </div>

            <div className="border-rule flex flex-wrap justify-end gap-2 border-t px-5 py-4 md:px-6">
              <button
                type="button"
                onClick={closeModal}
                disabled={pending}
                className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60">
                닫기
              </button>
              {selected?.myStatus === "입금대기" ? (
                <button
                  type="button"
                  onClick={() => setCancelTarget(selected)}
                  disabled={pending}
                  className="border-brand/40 text-brand hover:bg-brand/5 rounded-md border px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60">
                  신청 취소
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => selected && setConfirmTarget(selected)}
                  disabled={pending || !selected || !!selected.myStatus || !profileReady || !applyOpen}
                  className="bg-cta hover:bg-cta/90 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-50">
                  {pending && <Loader2 className="size-4 animate-spin" />}이 강좌 신청하기
                </button>
              )}
            </div>
          </div>
        </>
      )}

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
