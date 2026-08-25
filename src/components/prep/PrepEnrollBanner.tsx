"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, formatWon } from "@/lib/prep";
import { PREP_MAX_CAPACITY, PREP_SESSION_COUNT } from "@/data/prep";
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

// 신청 가능한(승인 + 시작 전) 프렙 강좌. 페이지가 공개 RLS로 읽어 내려준다.
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
  enrolled: number;
  /** 내 신청 상태 — 없으면 미신청. */
  myStatus: "입금대기" | "수강확정" | null;
};

const seatLabel = (c: OpenPrepCourse): string =>
  // 정원 상한(1000)은 사실상 '제한 없음'이라 N/1000으로 보여 주면 이상하다.
  c.capacity >= PREP_MAX_CAPACITY ? `${c.enrolled}명 신청` : `${c.enrolled}/${c.capacity}명`;

/**
 * 프렌딩 상단의 프렙 수강신청 배너 + 신청 모달.
 * ⚠️ 액션 호출·toast·router.refresh()는 이 컴포넌트가 전담한다(프렙 UI 규약).
 */
export default function PrepEnrollBanner({
  courses,
  isLoggedIn,
  profileMissing,
}: {
  courses: OpenPrepCourse[];
  isLoggedIn: boolean;
  /** 신청 자격에서 빠진 프로필 항목(휴대폰 인증·성·이름·영어 이름). 비어 있어야 신청할 수 있다. */
  profileMissing: string[];
}) {
  const profileReady = profileMissing.length === 0;
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
          배경은 /prep 히어로와 같은 새벽 일러스트(banner variant) — 흰 카드로는 위 히어로에 눌려 안 보였다. */}
      <section className="relative isolate mt-6 overflow-hidden rounded-2xl bg-[#1b2450]">
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
                      {c.myStatus && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                            c.myStatus === "수강확정" ? "bg-[#E1F5EE] text-[#0F6E56]" : "bg-[#FFF7E6] text-[#B97400]",
                          )}>
                          {c.myStatus === "수강확정" ? "수강 확정" : "신청 완료 · 입금 대기"}
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
                        className="text-ink shrink-0 rounded-full bg-white px-5 py-2 text-sm font-bold transition-opacity hover:opacity-90">
                        신청하기
                      </button>
                    ))}
                </div>

                {/* 세부 정보 — 신청 전에 조건을 다 볼 수 있게. 모달에도 같은 값이 요약으로 다시 나온다. */}
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  {(
                    [
                      ["기간", `${fmtDateKo(c.firstDate)} ~ ${fmtDateKo(c.lastDate)} (${c.sessionCount}회)`],
                      ["시간", `${fmtTime(c.startMin)}~${fmtRoomEnd(c.startMin + c.durationMin)} (${c.durationMin}분)`],
                      ["진행 방식", `Zoom 그룹 수업 · ${roomLevelLabelKo(c.level)}`],
                      ["강사", c.frienderName],
                      ["수강료", `${formatWon(c.priceKrw)} (무통장 입금)`],
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
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-xs font-bold",
                                    c.myStatus === "수강확정" ? "bg-[#E1F5EE] text-[#0F6E56]" : "bg-[#FFF7E6] text-[#B97400]",
                                  )}>
                                  {c.myStatus === "수강확정" ? "수강 확정" : "신청 완료 · 입금 대기"}
                                </span>
                              )}
                            </span>
                            <span className="text-muted-fg mt-1 block text-sm">
                              {c.frienderName} · {fmtDateKo(c.firstDate)} ~ {fmtDateKo(c.lastDate)} ({c.sessionCount}회)
                            </span>
                            <span className="text-muted-fg mt-0.5 block text-sm">
                              {fmtTime(c.startMin)}~{fmtRoomEnd(c.startMin + c.durationMin)} · {roomLevelLabelKo(c.level)} · {seatLabel(c)}
                            </span>
                            <span className="text-ink mt-1 block text-base font-bold">{formatWon(c.priceKrw)}</span>
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
                      ["금액", selected ? formatWon(selected.priceKrw) : "-"],
                    ] as const
                  ).map(([label, value]) => (
                    <Fragment key={label}>
                      <dt className="text-muted-fg-faint">{label}</dt>
                      <dd className="text-ink font-semibold break-words">{value}</dd>
                    </Fragment>
                  ))}
                </dl>
                <p className="text-muted-fg-faint mt-2 text-xs">신청 후 위 계좌로 입금해 주세요. 관리자가 입금을 확인하면 수강이 확정됩니다.</p>
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
                  disabled={pending || !selected || !!selected.myStatus || !profileReady}
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
                  <span className="text-ink font-semibold">{confirmTarget.title}</span> · {formatWon(confirmTarget.priceKrw)}
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
