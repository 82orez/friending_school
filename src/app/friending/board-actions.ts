"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { ROOM_BOARD_COMMENT_MAX, ROOM_BOARD_PAGE_SIZE, ROOM_BOARD_POST_MAX } from "@/data/room-series";

// 프렌더 무료 연습방 게시판 — 연습방 상세 모달 「게시판」 탭이 부른다.
// 샤우팅 게시판(src/app/prep/board-actions.ts)의 이식본이고, **쓰기 자격 하나만 다르다**:
// 샤우팅은 "개설 프렌더 ∥ 유효 신청자"인데 여기는 **"개설 프렌더 ∥ 로그인한 사용자 전부"** 다
// (writerRole 주석 참조). 나머지 규약 — 공지 분리 페이징, 서버가 내려 주는 viewer, 수정은 본인만·
// 삭제는 본인∥호스트, 작성자 표시명 스냅샷 — 은 그대로다.
//
// ⚠️ revalidatePath를 부르지 않는다 — 게시판 데이터는 어떤 SSR 라우트 props에도 실리지 않고
//    패널이 쓰기 성공 후 loadRoomBoard를 다시 부른다(홈 전체를 재검증할 이유가 없다).

export type RoomBoardComment = { id: string; userId: string; authorName: string; isHost: boolean; body: string; createdAt: string };

export type RoomBoardPost = {
  id: string;
  kind: "공지" | "일반";
  userId: string;
  authorName: string;
  isHost: boolean;
  body: string;
  createdAt: string;
  /** 수정 흔적 표시용 — updated_at !== created_at. */
  edited: boolean;
  comments: RoomBoardComment[];
};

/** 서버가 계산한 쓰기 자격 — 클라가 자체 판정하지 않는다. */
export type RoomBoardViewer = { canWrite: boolean; canPostNotice: boolean; reason?: "not_logged_in" | "not_eligible" };

export type LoadRoomBoardResult = {
  ok: boolean;
  notices: RoomBoardPost[];
  posts: RoomBoardPost[];
  /** 다음 페이지 기준 시각(마지막 일반 글의 created_at). 더 없으면 null. */
  nextCursor: string | null;
  viewer: RoomBoardViewer;
  /** 본인 글 판정용 — 표시 레이어일 뿐이고 권한은 서버가 다시 검사한다. */
  myUserId: string | null;
  error?: string;
};

export type RoomBoardResult = { ok: boolean; error?: string };

const EMPTY_VIEWER: RoomBoardViewer = { canWrite: false, canPostNotice: false, reason: "not_logged_in" };
const emptyBoard = (error?: string): LoadRoomBoardResult => ({
  ok: !error,
  notices: [],
  posts: [],
  nextCursor: null,
  viewer: EMPTY_VIEWER,
  myUserId: null,
  error,
});

type PostRow = {
  id: string;
  kind: "공지" | "일반";
  user_id: string;
  author_name: string | null;
  is_host: boolean;
  body: string;
  created_at: string;
  updated_at: string;
  friender_room_board_comments?: CommentRow[] | CommentRow | null;
};
type CommentRow = { id: string; user_id: string; author_name: string | null; is_host: boolean; body: string; created_at: string };

const POST_SELECT =
  "id, kind, user_id, author_name, is_host, body, created_at, updated_at, friender_room_board_comments(id, user_id, author_name, is_host, body, created_at)";

// ⚠️ 시리즈 키는 PostgREST의 .or() 필터 문자열에 그대로 들어간다 → 형식을 먼저 검증해 필터 주입을 막는다
//    (room-actions.ts의 isUuid와 같은 이유·같은 규칙).
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function toComment(row: CommentRow): RoomBoardComment {
  return { id: row.id, userId: row.user_id, authorName: row.author_name ?? "회원", isHost: row.is_host, body: row.body, createdAt: row.created_at };
}

function toPost(row: PostRow): RoomBoardPost {
  // ⚠️ 임베드 정렬은 PostgREST로 안 된다 → JS에서 오래된 댓글부터.
  const raw = Array.isArray(row.friender_room_board_comments)
    ? row.friender_room_board_comments
    : row.friender_room_board_comments
      ? [row.friender_room_board_comments]
      : [];
  return {
    id: row.id,
    kind: row.kind,
    userId: row.user_id,
    authorName: row.author_name ?? "회원",
    isHost: row.is_host,
    body: row.body,
    createdAt: row.created_at,
    edited: row.updated_at !== row.created_at,
    comments: raw.sort((a, b) => a.created_at.localeCompare(b.created_at)).map(toComment),
  };
}

/**
 * 시리즈 개설자 — 그 키의 방이 하나도 없으면 null(= 시리즈 없음).
 * ⚠️ 전환 이전 단발 방은 series_id가 null이라 자기 id가 곧 키다(seriesKeyOf와 같은 규칙).
 */
async function seriesHostId(admin: ReturnType<typeof createAdminClient>, seriesKey: string): Promise<string | null> {
  const { data } = await admin
    .from("friender_rooms")
    .select("friender_id")
    .or(`series_id.eq.${seriesKey},and(id.eq.${seriesKey},series_id.is.null)`)
    .limit(1)
    .maybeSingle();
  return (data as { friender_id: string } | null)?.friender_id ?? null;
}

type WriterRole = "host" | "member" | null;

/**
 * 쓰기 자격 — 개설 프렌더면 "host", 그 밖의 **로그인한 사용자는 전부** "member".
 * ⚠️ 샤우팅(prep의 writerRole)과 **의도적으로 다르다**: 거긴 유효 신청(입금대기·수강확정)을 요구하는데
 *    연습방은 무료·무심사라 참여 장벽이 없고, **예약하기 전에 물어볼 창구**가 필요하다(제품 결정).
 *    대신 공지는 host만이고, 로그인만으로 열려 있으므로 rate limit이 사실상 유일한 방어선이다.
 */
async function writerRole(admin: ReturnType<typeof createAdminClient>, seriesKey: string, userId: string): Promise<WriterRole> {
  const hostId = await seriesHostId(admin, seriesKey);
  if (!hostId) return null; // 시리즈가 통째로 삭제된 경우
  return hostId === userId ? "host" : "member";
}

// 작성자 표시명 스냅샷 — 닉네임 > 성+이름 > 이메일 앞부분(joinRoom과 같은 우선순위).
// ⚠️ 타인 profiles는 RLS로 못 읽으므로 화면은 이 스냅샷만 본다.
async function authorSnapshot(admin: ReturnType<typeof createAdminClient>, userId: string, email: string): Promise<string> {
  const { data } = await admin.from("profiles").select("first_name, last_name, nickname").eq("id", userId).maybeSingle();
  const p = (data ?? {}) as { first_name?: string | null; last_name?: string | null; nickname?: string | null };
  return p.nickname?.trim() || `${p.last_name ?? ""}${p.first_name ?? ""}`.trim() || email.split("@")[0] || "회원";
}

function normalizeBody(input: string, max: number): string {
  return String(input ?? "")
    .trim()
    .slice(0, max);
}

async function currentUser() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** 목록 — 비로그인도 부를 수 있다. 공지는 전량, 일반 글은 커서 페이징. */
export async function loadRoomBoard(seriesKey: string, cursor?: string | null): Promise<LoadRoomBoardResult> {
  const key = String(seriesKey ?? "").trim();
  if (!key || !isUuid(key)) return emptyBoard("잘못된 요청입니다.");

  const { supabase, user } = await currentUser();

  // ⚠️ 공지와 일반 글을 나눠 읽는다 — 한 쿼리로 섞어 뽑고 JS에서 공지를 올리면
  //    2페이지에서 공지가 뒤늦게 올라온다.
  const noticeQuery = supabase
    .from("friender_room_board_posts")
    .select(POST_SELECT)
    .eq("series_key", key)
    .eq("kind", "공지")
    .order("created_at", { ascending: false });

  let postQuery = supabase
    .from("friender_room_board_posts")
    .select(POST_SELECT)
    .eq("series_key", key)
    .eq("kind", "일반")
    .order("created_at", { ascending: false })
    .limit(ROOM_BOARD_PAGE_SIZE);
  if (cursor) postQuery = postQuery.lt("created_at", cursor);

  const [{ data: noticeRows, error: noticeError }, { data: postRows, error: postError }] = await Promise.all([noticeQuery, postQuery]);
  if (noticeError || postError) return emptyBoard("게시판을 불러오지 못했습니다.");

  const notices = ((noticeRows ?? []) as PostRow[]).map(toPost);
  const posts = ((postRows ?? []) as PostRow[]).map(toPost);

  let viewer: RoomBoardViewer = EMPTY_VIEWER;
  if (user) {
    const role = await writerRole(createAdminClient(), key, user.id);
    viewer = role ? { canWrite: true, canPostNotice: role === "host" } : { canWrite: false, canPostNotice: false, reason: "not_eligible" };
  }

  return {
    ok: true,
    notices,
    posts,
    nextCursor: posts.length === ROOM_BOARD_PAGE_SIZE ? posts[posts.length - 1].createdAt : null,
    viewer,
    myUserId: user?.id ?? null,
  };
}

export async function createRoomBoardPost(seriesKey: string, kind: "공지" | "일반", body: string): Promise<RoomBoardResult> {
  const key = String(seriesKey ?? "").trim();
  if (!key || !isUuid(key)) return { ok: false, error: "잘못된 요청입니다." };

  const { user } = await currentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!rateLimit(`room-board-post:${user.id}`, 20, 10 * 60_000).allowed) {
    return { ok: false, error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." };
  }

  const text = normalizeBody(body, ROOM_BOARD_POST_MAX);
  if (!text) return { ok: false, error: "내용을 입력해 주세요." };

  const admin = createAdminClient();
  const role = await writerRole(admin, key, user.id);
  if (!role) return { ok: false, error: "연습방을 찾을 수 없어요. 목록을 새로고침해 주세요." };
  if (kind === "공지" && role !== "host") return { ok: false, error: "공지는 방을 개설한 프렌더만 쓸 수 있어요." };

  const authorName = await authorSnapshot(admin, user.id, user.email ?? "");
  const { error } = await admin.from("friender_room_board_posts").insert({
    series_key: key,
    user_id: user.id,
    author_name: authorName,
    is_host: role === "host",
    kind: kind === "공지" ? "공지" : "일반",
    body: text,
  });
  if (error) return { ok: false, error: "등록하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  return { ok: true };
}

/** 수정은 작성자 본인만 — 호스트도 남의 글은 삭제만 할 수 있다(모더레이션과 대필은 다르다). */
export async function updateRoomBoardPost(postId: string, body: string): Promise<RoomBoardResult> {
  const id = String(postId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const { user } = await currentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const text = normalizeBody(body, ROOM_BOARD_POST_MAX);
  if (!text) return { ok: false, error: "내용을 입력해 주세요." };

  const { data, error } = await createAdminClient()
    .from("friender_room_board_posts")
    .update({ body: text })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return { ok: false, error: "수정하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  if (!data || data.length === 0) return { ok: false, error: "본인이 쓴 글만 수정할 수 있어요." };
  return { ok: true };
}

/** 삭제는 작성자 본인 ∥ 개설 프렌더(모더레이션). 댓글은 FK cascade로 함께 지워진다. */
export async function deleteRoomBoardPost(postId: string): Promise<RoomBoardResult> {
  const id = String(postId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const { user } = await currentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { data: postRow } = await admin.from("friender_room_board_posts").select("user_id, series_key").eq("id", id).maybeSingle();
  const post = postRow as { user_id: string; series_key: string } | null;
  if (!post) return { ok: false, error: "이미 삭제된 글이에요." };

  if (post.user_id !== user.id && (await seriesHostId(admin, post.series_key)) !== user.id) {
    return { ok: false, error: "본인이 쓴 글이나 내 연습방의 글만 삭제할 수 있어요." };
  }

  const { error } = await admin.from("friender_room_board_posts").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  return { ok: true };
}

export async function createRoomBoardComment(postId: string, body: string): Promise<RoomBoardResult> {
  const id = String(postId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const { user } = await currentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!rateLimit(`room-board-comment:${user.id}`, 30, 10 * 60_000).allowed) {
    return { ok: false, error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." };
  }

  const text = normalizeBody(body, ROOM_BOARD_COMMENT_MAX);
  if (!text) return { ok: false, error: "내용을 입력해 주세요." };

  const admin = createAdminClient();
  const { data: postRow } = await admin.from("friender_room_board_posts").select("series_key").eq("id", id).maybeSingle();
  const post = postRow as { series_key: string } | null;
  if (!post) return { ok: false, error: "이미 삭제된 글이에요." };

  const role = await writerRole(admin, post.series_key, user.id);
  if (!role) return { ok: false, error: "연습방을 찾을 수 없어요. 목록을 새로고침해 주세요." };

  const authorName = await authorSnapshot(admin, user.id, user.email ?? "");
  const { error } = await admin.from("friender_room_board_comments").insert({
    post_id: id,
    user_id: user.id,
    author_name: authorName,
    is_host: role === "host",
    body: text,
  });
  if (error) return { ok: false, error: "등록하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  return { ok: true };
}

export async function deleteRoomBoardComment(commentId: string): Promise<RoomBoardResult> {
  const id = String(commentId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const { user } = await currentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { data: commentRow } = await admin.from("friender_room_board_comments").select("user_id, post_id").eq("id", id).maybeSingle();
  const comment = commentRow as { user_id: string; post_id: string } | null;
  if (!comment) return { ok: false, error: "이미 삭제된 댓글이에요." };

  if (comment.user_id !== user.id) {
    const { data: postRow } = await admin.from("friender_room_board_posts").select("series_key").eq("id", comment.post_id).maybeSingle();
    const post = postRow as { series_key: string } | null;
    if (!post || (await seriesHostId(admin, post.series_key)) !== user.id) {
      return { ok: false, error: "본인이 쓴 댓글이나 내 연습방의 댓글만 삭제할 수 있어요." };
    }
  }

  const { error } = await admin.from("friender_room_board_comments").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  return { ok: true };
}
