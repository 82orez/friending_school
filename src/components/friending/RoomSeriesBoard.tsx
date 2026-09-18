"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { kstDateTimeText } from "@/lib/kst";
import { ROOM_BOARD_COMMENT_MAX, ROOM_BOARD_POST_MAX } from "@/data/room-series";
import {
  createRoomBoardComment,
  createRoomBoardPost,
  deleteRoomBoardComment,
  deleteRoomBoardPost,
  loadRoomBoard,
  updateRoomBoardPost,
  type RoomBoardPost,
  type RoomBoardResult,
  type RoomBoardViewer,
} from "@/app/friending/board-actions";
import { Textarea } from "@/components/ui/textarea";
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

/**
 * 연습방 게시판 — 상세 모달 「게시판」 탭의 본문. 샤우팅 `PrepCourseBoard`의 이식본이다.
 * 읽기는 누구나, 쓰기는 **개설 프렌더 ∥ 로그인한 사용자 전부**(샤우팅은 유효 신청자만 — 무료·무심사
 * 연습방이라 예약 전에 물어볼 창구가 필요해서 연 것. 자격 판정은 **서버가 내려 준 `viewer`만 믿는다**).
 * ⚠️ 모달의 "서버 액션은 부르지 않는다" 규약(예약·취소는 FriendingRooms 소유)의 **예외**다.
 *    게시판은 그 pending·확인 다이얼로그 상태와 겹치지 않는 자기 완결형 하위 트리다.
 * ⚠️ 마운트가 곧 로드다 — 모달은 `tab === "board"`일 때만 이 컴포넌트를 렌더한다(「전체」 탭 제외).
 */
export default function RoomSeriesBoard({ seriesKey, isLoggedIn }: { seriesKey: string; isLoggedIn: boolean }) {
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<RoomBoardPost[]>([]);
  const [posts, setPosts] = useState<RoomBoardPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [viewer, setViewer] = useState<RoomBoardViewer>({ canWrite: false, canPostNotice: false });
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"공지" | "일반">("일반");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ type: "post" | "comment"; id: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    const res = await loadRoomBoard(seriesKey);
    if (!res.ok) {
      toast.error(res.error ?? "게시판을 불러오지 못했습니다.");
      return;
    }
    setNotices(res.notices);
    setPosts(res.posts);
    setCursor(res.nextCursor);
    setViewer(res.viewer);
    setMyUserId(res.myUserId);
  }, [seriesKey]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadRoomBoard(seriesKey)
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setNotices(res.notices);
          setPosts(res.posts);
          setCursor(res.nextCursor);
          setViewer(res.viewer);
          setMyUserId(res.myUserId);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [seriesKey]);

  // 쓰기 액션 공통 — 성공하면 목록을 다시 읽는다(⚠️ router.refresh()는 부르지 않는다: 홈 전체를 다시 그릴 이유가 없다).
  const run = (fn: () => Promise<RoomBoardResult>, success: string, after?: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "처리하지 못했습니다.");
        return;
      }
      after?.();
      await reload();
      toast.success(success);
    });
  };

  const loadMore = () => {
    if (!cursor) return;
    startTransition(async () => {
      const res = await loadRoomBoard(seriesKey, cursor);
      if (!res.ok) {
        toast.error(res.error ?? "게시판을 불러오지 못했습니다.");
        return;
      }
      setPosts((prev) => [...prev, ...res.posts]);
      setCursor(res.nextCursor);
    });
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    setDeleteTarget(null); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!target) return;
    if (target.type === "post") run(() => deleteRoomBoardPost(target.id), "글을 삭제했습니다.");
    else run(() => deleteRoomBoardComment(target.id), "댓글을 삭제했습니다.");
  };

  const all = [...notices, ...posts];

  return (
    <section className="bg-surface rounded-xl p-4">
      <h3 className="text-ink mb-2 text-[13px] font-extrabold">게시판</h3>

      {loading ? (
        <p className="text-muted-fg-faint flex items-center gap-1.5 py-4 text-[13px]">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </p>
      ) : (
        <>
          {/* 작성 자격 안내 — 자격이 없을 때만. 연습방은 로그인만 하면 쓸 수 있어 사실상 비로그인 안내뿐이고,
              not_eligible은 시리즈가 통째로 사라진 경우 정도다. */}
          {!viewer.canWrite && (
            <p className="border-rule text-muted-fg mb-3 rounded-lg border bg-white px-3 py-2.5 text-[13px] leading-relaxed">
              {isLoggedIn || viewer.reason === "not_eligible" ? (
                "지금은 글을 쓸 수 없어요. 목록을 새로고침해 주세요."
              ) : (
                <>
                  <Link href="/login" className="text-accent-blue-ink font-bold underline underline-offset-2">
                    로그인
                  </Link>
                  하시면 글을 남길 수 있어요.
                </>
              )}
            </p>
          )}

          {viewer.canWrite && (
            <div className="border-rule mb-3 rounded-lg border bg-white p-3">
              {/* 공지 토글은 개설 프렌더에게만 — 서버도 같은 조건으로 다시 검사한다. */}
              {viewer.canPostNotice && (
                <div className="mb-2 flex gap-1.5">
                  {(["일반", "공지"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11.5px] font-bold transition-colors",
                        kind === k ? "bg-ink text-white" : "bg-surface text-muted-fg hover:text-ink",
                      )}>
                      {k}
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={ROOM_BOARD_POST_MAX}
                rows={3}
                placeholder="궁금한 점이나 나누고 싶은 이야기를 남겨 주세요."
                className="text-[13px]"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-muted-fg-faint text-xs">
                  {body.length}/{ROOM_BOARD_POST_MAX}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    run(
                      () => createRoomBoardPost(seriesKey, kind, body),
                      "글을 등록했습니다.",
                      () => setBody(""),
                    )
                  }
                  disabled={pending || !body.trim()}
                  className="bg-cta hover:bg-cta/90 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                  {pending && <Loader2 className="size-3.5 animate-spin" />}
                  등록
                </button>
              </div>
            </div>
          )}

          {all.length === 0 ? (
            <p className="text-muted-fg-faint text-[13px] leading-relaxed">아직 글이 없어요. 첫 글을 남겨 보세요.</p>
          ) : (
            <ul className="flex list-none flex-col gap-2.5">
              {all.map((post) => (
                <li
                  key={post.id}
                  className={cn("rounded-lg border p-3", post.kind === "공지" ? "border-brand/20 bg-brand/5" : "border-rule bg-white")}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {post.kind === "공지" && (
                      <span className="bg-brand shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white">공지</span>
                    )}
                    <span className="text-ink text-[13px] font-extrabold">{post.authorName}</span>
                    {post.isHost && (
                      <span
                        title="프렌더"
                        aria-hidden
                        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-[50%_50%_50%_3px] bg-[#DC52B8] text-[8px] font-bold text-white">
                        F
                      </span>
                    )}
                    <span className="text-muted-fg-faint text-xs">
                      {kstDateTimeText(post.createdAt)}
                      {post.edited && " · 수정됨"}
                    </span>
                  </div>

                  {editingId === post.id ? (
                    <div className="mt-2">
                      <Textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        maxLength={ROOM_BOARD_POST_MAX}
                        rows={3}
                        className="text-[13px]"
                      />
                      <div className="mt-1.5 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={pending}
                          className="text-muted-fg hover:text-ink text-xs font-bold disabled:opacity-60">
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () => updateRoomBoardPost(post.id, editBody),
                              "글을 수정했습니다.",
                              () => setEditingId(null),
                            )
                          }
                          disabled={pending || !editBody.trim()}
                          className="text-accent-blue-ink text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50">
                          저장
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-ink mt-1.5 text-[13px] leading-relaxed break-words whitespace-pre-wrap">{post.body}</p>
                  )}

                  {/* 수정은 본인만, 삭제는 본인 ∥ 개설 프렌더(모더레이션). 서버가 같은 규칙으로 다시 검사한다.
                      ⚠️ 호스트 판정에 canPostNotice를 쓴다 — 공지 권한 = 개설 프렌더라 같은 값이다. */}
                  {editingId !== post.id && (myUserId === post.userId || viewer.canPostNotice) && (
                    <div className="mt-1.5 flex gap-3">
                      {myUserId === post.userId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(post.id);
                            setEditBody(post.body);
                          }}
                          disabled={pending}
                          className="text-muted-fg hover:text-ink text-xs font-bold disabled:opacity-60">
                          수정
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ type: "post", id: post.id })}
                        disabled={pending}
                        aria-haspopup="dialog"
                        className="text-muted-fg hover:text-brand text-xs font-bold disabled:opacity-60">
                        삭제
                      </button>
                    </div>
                  )}

                  {(post.comments.length > 0 || viewer.canWrite) && (
                    <div className="border-rule mt-2.5 border-l pl-3">
                      <ul className="flex list-none flex-col gap-1.5">
                        {post.comments.map((comment) => (
                          <li key={comment.id} className="text-[12.5px]">
                            <span className="text-ink font-bold">{comment.authorName}</span>
                            {comment.isHost && <span className="font-bold text-[#DC52B8]"> · 프렌더</span>}
                            <span className="text-muted-fg-faint"> · {kstDateTimeText(comment.createdAt)}</span>
                            {(myUserId === comment.userId || viewer.canPostNotice) && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ type: "comment", id: comment.id })}
                                disabled={pending}
                                aria-haspopup="dialog"
                                className="text-muted-fg-faint hover:text-brand ml-1.5 font-bold disabled:opacity-60">
                                삭제
                              </button>
                            )}
                            <p className="text-ink mt-0.5 leading-relaxed break-words whitespace-pre-wrap">{comment.body}</p>
                          </li>
                        ))}
                      </ul>

                      {viewer.canWrite && (
                        <div className="mt-2 flex gap-1.5">
                          <input
                            type="text"
                            value={commentDrafts[post.id] ?? ""}
                            onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                            maxLength={ROOM_BOARD_COMMENT_MAX}
                            placeholder="댓글 남기기"
                            className="border-rule text-ink placeholder:text-muted-fg-faint min-w-0 flex-1 rounded-md border bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#6b8ff0]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              run(
                                () => createRoomBoardComment(post.id, commentDrafts[post.id] ?? ""),
                                "댓글을 등록했습니다.",
                                () => setCommentDrafts((prev) => ({ ...prev, [post.id]: "" })),
                              )
                            }
                            disabled={pending || !(commentDrafts[post.id] ?? "").trim()}
                            className="border-rule text-muted-fg hover:bg-surface hover:text-ink shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                            댓글
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {cursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={pending}
              className="border-rule text-muted-fg hover:bg-surface hover:text-ink mt-2.5 w-full rounded-full border py-2 text-[13px] font-bold transition-colors disabled:opacity-60">
              더보기
            </button>
          )}
        </>
      )}

      {/* 삭제 확인 — 모달 위에 뜨므로 z-[130](모달 패널은 z-[120]). 모달의 Esc 핸들러는 alertdialog에 양보한다.
          ⚠️ 빠뜨리면 다이얼로그가 패널 **뒤에** 떠서 아무 일도 안 일어나는 것처럼 보인다(EnterZoomButton에서 겪음). */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.type === "comment" ? "댓글을 삭제할까요?" : "글을 삭제할까요?"}</AlertDialogTitle>
            <AlertDialogDescription>
              삭제하면 되돌릴 수 없습니다.
              {deleteTarget?.type === "post" && " 이 글에 달린 댓글도 함께 사라집니다."}
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
    </section>
  );
}
