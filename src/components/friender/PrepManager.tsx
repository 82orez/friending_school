"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, fmtDateShort, formatWon, kstToday } from "@/lib/prep";
import { PREP_REQUESTABLE_STATUSES, PREP_SESSION_COUNT, PREP_STATUS_BADGE, PREP_STATUS_LABEL } from "@/data/prep";
import { roomLevelLabelKo } from "@/data/room-levels";
import { createPrepCourse, deletePrepCourse, requestPrepReview, updatePrepCourse } from "@/app/friender/prep-actions";
import { cn } from "@/lib/utils";
import PrepCourseForm, { type PrepCourse, type PrepFormValues } from "@/components/friender/PrepCourseForm";
import PrepEditModal from "@/components/friender/PrepEditModal";
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

export type { PrepCourse };

export default function PrepManager({ courses, hasZoomUrl }: { courses: PrepCourse[]; hasZoomUrl: boolean }) {
  const router = useRouter();
  // 개설 폼은 상태를 스스로 들고 있으므로, 개설 성공 뒤에는 key를 바꿔 다시 마운트해 비운다.
  const [createKey, setCreateKey] = useState(0);
  const [editTarget, setEditTarget] = useState<PrepCourse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrepCourse | null>(null);
  const [reviewTarget, setReviewTarget] = useState<PrepCourse | null>(null);
  const [pending, startTransition] = useTransition();

  const today = useMemo(() => kstToday(), []);
  // 이미 시작된 강좌는 일정·시각을 못 바꾼다(서버도 같은 판정으로 기존 값을 유지한다).
  // ⚠️ '승인'된 강좌만 잠근다 — 초안이 묵는 사이 첫 회차가 지났다고 잠그면 일정을 다시 못 잡아 영영 요청할 수 없다.
  const startedOf = (c: PrepCourse): boolean => c.status === "승인" && c.sessions.length > 0 && c.sessions[0].date <= today;

  // 승인 요청 조건 — 서버(requestPrepReview)가 authoritative고 여기서는 미리 안내만 한다.
  const filledTopicsOf = (c: PrepCourse): number => c.sessions.filter((s) => s.topic?.trim()).length;
  const reviewBlockerOf = (c: PrepCourse): string | null => {
    if (!hasZoomUrl) return "프로필에서 Zoom URL을 먼저 등록해 주세요.";
    if (c.sessions.length !== PREP_SESSION_COUNT) return `수업 일자를 ${PREP_SESSION_COUNT}회로 맞춰 주세요.`;
    if (filledTopicsOf(c) !== PREP_SESSION_COUNT) return `회차 주제를 모두 입력해 주세요. (${filledTopicsOf(c)}/${PREP_SESSION_COUNT})`;
    if (c.sessions[0].date <= today) return "첫 수업 일자가 지났습니다. 일정을 수정한 뒤 요청해 주세요.";
    return null;
  };

  const submitCreate = (values: PrepFormValues) => {
    startTransition(async () => {
      const res = await createPrepCourse(values);
      if (res.ok) {
        setCreateKey((k) => k + 1);
        router.refresh();
        toast.success("임시저장했습니다. 목록에서 「승인 요청」을 눌러 주세요.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const confirmReview = () => {
    const target = reviewTarget;
    setReviewTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    startTransition(async () => {
      const res = await requestPrepReview(target.id);
      if (res.ok) {
        router.refresh();
        toast.success(target.status === "거절" ? "다시 승인 요청을 보냈습니다." : "승인 요청을 보냈습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const submitEdit = (values: PrepFormValues) => {
    const target = editTarget;
    if (!target) return;
    startTransition(async () => {
      const res = await updatePrepCourse(target.id, values);
      if (res.ok) {
        setEditTarget(null);
        router.refresh();
        // 심사 대상 항목(수강료·일정·시각·정원·난이도·강좌명)이 바뀐 경우에만 승인이 해제된다 — 서버가 알려 준 결과로 문구를 고른다.
        toast.success(res.reReview ? "저장했습니다. 승인이 해제되어 다시 심사에 올라갑니다." : "강좌를 수정했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    setDeleteTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    startTransition(async () => {
      const res = await deletePrepCourse(target.id);
      if (res.ok) {
        if (editTarget?.id === target.id) setEditTarget(null);
        router.refresh();
        toast.success("강좌를 삭제했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    <div>
      <h2 className="text-ink text-lg font-extrabold">프렙 강좌</h2>
      <p className="text-muted-fg mt-1 text-sm">
        월 {PREP_SESSION_COUNT}회 정규 과정을 개설합니다. 기본 수업일은 매주 월~금이고, 필요하면 캘린더에서 일자를 바꿀 수 있어요.
        <br />
        저장한 강좌는 <span className="text-ink font-semibold">관리자 승인</span>을 받아야 개설이 완료됩니다.
      </p>

      {!hasZoomUrl && (
        <div className="border-brand/30 bg-brand/5 text-brand mt-4 rounded-xl border px-4 py-3 text-sm font-semibold">
          Zoom URL이 등록되어 있지 않습니다. 저장은 가능하지만, 승인을 요청하려면 「프로필」 탭에서 Zoom URL을 먼저 등록해 주세요.
        </div>
      )}

      {/* 개설 폼 */}
      <div className="border-rule mt-4 rounded-xl border bg-white p-5">
        <h3 className="text-ink mb-3 text-sm font-extrabold">새 강좌 개설</h3>
        <PrepCourseForm key={createKey} mode="create" pending={pending} onSubmit={submitCreate} />
      </div>

      {/* 개설된 강좌 */}
      <h3 className="text-ink mt-8 text-sm font-extrabold">내 강좌 ({courses.length})</h3>
      <div className="border-rule mt-2 overflow-hidden rounded-xl border bg-white">
        {courses.length === 0 ? (
          <p className="text-muted-fg px-6 py-10 text-center text-sm">개설한 강좌가 없습니다.</p>
        ) : (
          <ul className="list-none">
            {courses.map((c) => (
              <li key={c.id} className="border-rule border-b px-4 py-3.5 last:border-b-0 md:px-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", PREP_STATUS_BADGE[c.status])}>
                      {PREP_STATUS_LABEL[c.status]}
                    </span>
                    <span className="text-ink text-sm font-bold break-words">{c.title}</span>
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {PREP_REQUESTABLE_STATUSES.includes(c.status) && (
                      <button
                        type="button"
                        onClick={() => setReviewTarget(c)}
                        disabled={pending || !!reviewBlockerOf(c)}
                        title={reviewBlockerOf(c) ?? undefined}
                        className="bg-cta hover:bg-cta/90 rounded-md px-3 py-1.5 text-xs font-bold text-white transition-colors disabled:opacity-50">
                        {c.status === "거절" ? "승인 다시 요청" : "승인 요청"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditTarget(c)}
                      disabled={pending}
                      className="border-rule text-muted-fg hover:bg-surface rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60">
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      disabled={pending}
                      className="border-brand/40 text-brand hover:bg-brand/5 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60">
                      삭제
                    </button>
                  </div>
                </div>
                <p className="text-muted-fg mt-0.5 text-xs">
                  {c.sessions.length > 0 && `${fmtDateKo(c.sessions[0].date)} ~ ${fmtDateKo(c.sessions[c.sessions.length - 1].date)} · `}
                  {fmtTime(c.startMin)}~{fmtRoomEnd(c.startMin + c.durationMin)} · {c.sessionCount}회
                </p>
                <p className="text-muted-fg-faint mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="bg-accent-blue-soft text-accent-blue-ink rounded-full px-2 py-0.5 font-bold">{roomLevelLabelKo(c.level)}</span>
                  <span>정원 {c.capacity}명</span>
                  <span>{formatWon(c.priceKrw)}</span>
                  {c.enrolled > 0 && <span className="text-cta font-bold">수강신청 {c.enrolled}명</span>}
                </p>

                {/* 거절 사유는 여기서만 보인다 — 프렌더가 무엇을 고쳐야 할지 아는 유일한 경로. */}
                {c.status === "거절" && c.adminNote?.trim() && (
                  <p className="border-brand/30 bg-brand/5 text-ink mt-2 rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap">
                    <span className="text-brand font-bold">거절 사유</span> · {c.adminNote}
                  </p>
                )}
                {/* 요청을 막는 조건은 버튼 title에도 있지만, 모바일에는 hover가 없어 문구로도 남긴다. */}
                {PREP_REQUESTABLE_STATUSES.includes(c.status) && reviewBlockerOf(c) && (
                  // 버튼이 왜 비활성인지 알려 주는 문구 — 흐린 회색이면 못 보고 "버튼이 안 눌린다"가 된다.
                  <p className="mt-1.5 text-xs font-semibold text-[#B97400]">승인 요청 전: {reviewBlockerOf(c)}</p>
                )}

                {/* 커리큘럼 — 회차가 20개라 기본은 접어 둔다(마이페이지 수강신청 내역과 같은 네이티브 details). */}
                {c.sessions.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-accent-blue-ink cursor-default text-xs font-bold">커리큘럼 {c.sessions.length}회 보기</summary>
                    <ol className="text-muted-fg mt-1.5 list-none space-y-1 text-xs">
                      {c.sessions.map((s, i) => (
                        <li key={s.date} className="flex gap-2">
                          <span className="text-muted-fg-faint w-20 shrink-0">
                            {i + 1}강 {fmtDateShort(s.date)}
                          </span>
                          <span className="text-ink break-words">{s.topic?.trim() || "-"}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 수정 모달 — 강좌마다 초기값이 달라 key로 다시 마운트한다. */}
      <PrepEditModal
        key={editTarget?.id ?? "none"}
        course={editTarget}
        started={!!editTarget && startedOf(editTarget)}
        pending={pending}
        onClose={() => setEditTarget(null)}
        onSubmit={submitEdit}
      />

      {/* 승인 요청 확인 */}
      <AlertDialog open={reviewTarget !== null} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>관리자에게 승인을 요청할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {reviewTarget && (
                <>
                  <span className="text-ink font-semibold">{reviewTarget.title}</span> 강좌가 심사 대기로 올라가고 관리자에게 알림이 갑니다. 심사
                  중에도 내용은 수정할 수 있어요.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReview} variant="brand">
              승인 요청
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>강좌를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="text-ink font-semibold">{deleteTarget.title}</span> 강좌와 {deleteTarget.sessions.length}개 회차가 모두 삭제됩니다.
                  되돌릴 수 없습니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} variant="brand">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
