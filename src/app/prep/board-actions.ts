"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { PREP_BOARD_COMMENT_MAX, PREP_BOARD_PAGE_SIZE, PREP_BOARD_POST_MAX } from "@/data/prep";

// 샤우팅 강좌 게시판 — 강좌 상세 모달 「게시판」 탭이 부른다.
// 읽기는 공개(RLS prep_board_*_select_public이 '승인' 강좌만 통과시킨다), 쓰기는
// **개설 프렌더 ∥ 유효 신청자(입금대기·수강확정)**만이라 service_role + 여기의 가드가 전담한다.
// ⚠️ revalidatePath를 부르지 않는다 — 게시판 데이터는 어떤 SSR 라우트 props에도 실리지 않고
//    패널이 쓰기 성공 후 loadPrepBoard를 다시 부른다(홈 전체를 재검증할 이유가 없다).

export type BoardComment = { id: string; userId: string; authorName: string; isHost: boolean; body: string; createdAt: string };

export type BoardPost = {
  id: string;
  kind: "공지" | "일반";
  userId: string;
  authorName: string;
  isHost: boolean;
  body: string;
  createdAt: string;
  /** 수정 흔적 표시용 — updated_at !== created_at. */
  edited: boolean;
  comments: BoardComment[];
};

/** 서버가 계산한 쓰기 자격 — 클라가 course.myStatus로 자체 판정하지 않는다. */
export type BoardViewer = { canWrite: boolean; canPostNotice: boolean; reason?: "not_logged_in" | "not_eligible" };

export type LoadBoardResult = {
  ok: boolean;
  notices: BoardPost[];
  posts: BoardPost[];
  /** 다음 페이지 기준 시각(마지막 일반 글의 created_at). 더 없으면 null. */
  nextCursor: string | null;
  viewer: BoardViewer;
  /** 본인 글 판정용 — 표시 레이어일 뿐이고 권한은 서버가 다시 검사한다. */
  myUserId: string | null;
  error?: string;
};

export type BoardResult = { ok: boolean; error?: string };

const EMPTY_VIEWER: BoardViewer = { canWrite: false, canPostNotice: false, reason: "not_logged_in" };
const emptyBoard = (error?: string): LoadBoardResult => ({
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
  prep_board_comments?: CommentRow[] | CommentRow | null;
};
type CommentRow = { id: string; user_id: string; author_name: string | null; is_host: boolean; body: string; created_at: string };

const POST_SELECT =
  "id, kind, user_id, author_name, is_host, body, created_at, updated_at, prep_board_comments(id, user_id, author_name, is_host, body, created_at)";

function toComment(row: CommentRow): BoardComment {
  return { id: row.id, userId: row.user_id, authorName: row.author_name ?? "회원", isHost: row.is_host, body: row.body, createdAt: row.created_at };
}

function toPost(row: PostRow): BoardPost {
  // ⚠️ 임베드 정렬은 PostgREST로 안 된다(admin 회차 목록과 같은 함정) → JS에서 오래된 댓글부터.
  const raw = Array.isArray(row.prep_board_comments) ? row.prep_board_comments : row.prep_board_comments ? [row.prep_board_comments] : [];
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

type WriterRole = "host" | "student" | null;

/**
 * 쓰기 자격 — 개설 프렌더면 "host", 유효 신청(입금대기·수강확정)이면 "student", 아니면 null.
 * ⚠️ 회차 **입장**(enterPrepSession)은 '수강확정'만 허용하는데 게시판은 '입금대기'도 허용한다.
 *    의도된 차이다 — 입장은 돈이 자리를 잡지만, 게시판은 신청 직후의 질문 창구다.
 */
async function writerRole(admin: ReturnType<typeof createAdminClient>, courseId: string, userId: string): Promise<WriterRole> {
  const { data: courseRow } = await admin.from("prep_courses").select("friender_id, status").eq("id", courseId).maybeSingle();
  const course = courseRow as { friender_id: string; status: string } | null;
  if (!course || course.status !== "승인") return null;
  if (course.friender_id === userId) return "host";

  const { data: enroll } = await admin
    .from("prep_enrollments")
    .select("id")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .in("status", ["입금대기", "수강확정"])
    .maybeSingle();
  return enroll ? "student" : null;
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
export async function loadPrepBoard(courseId: string, cursor?: string | null): Promise<LoadBoardResult> {
  const id = String(courseId ?? "").trim();
  if (!id) return emptyBoard("잘못된 요청입니다.");

  const { supabase, user } = await currentUser();

  // ⚠️ 공지와 일반 글을 나눠 읽는다 — 한 쿼리로 섞어 뽑고 JS에서 공지를 올리면
  //    2페이지에서 공지가 뒤늦게 올라온다.
  const noticeQuery = supabase
    .from("prep_board_posts")
    .select(POST_SELECT)
    .eq("course_id", id)
    .eq("kind", "공지")
    .order("created_at", { ascending: false });

  let postQuery = supabase
    .from("prep_board_posts")
    .select(POST_SELECT)
    .eq("course_id", id)
    .eq("kind", "일반")
    .order("created_at", { ascending: false })
    .limit(PREP_BOARD_PAGE_SIZE);
  if (cursor) postQuery = postQuery.lt("created_at", cursor);

  const [{ data: noticeRows, error: noticeError }, { data: postRows, error: postError }] = await Promise.all([noticeQuery, postQuery]);
  if (noticeError || postError) return emptyBoard("게시판을 불러오지 못했습니다.");

  const notices = ((noticeRows ?? []) as PostRow[]).map(toPost);
  const posts = ((postRows ?? []) as PostRow[]).map(toPost);

  let viewer: BoardViewer = EMPTY_VIEWER;
  if (user) {
    const role = await writerRole(createAdminClient(), id, user.id);
    viewer = role ? { canWrite: true, canPostNotice: role === "host" } : { canWrite: false, canPostNotice: false, reason: "not_eligible" };
  }

  return {
    ok: true,
    notices,
    posts,
    nextCursor: posts.length === PREP_BOARD_PAGE_SIZE ? posts[posts.length - 1].createdAt : null,
    viewer,
    myUserId: user?.id ?? null,
  };
}

export async function createPrepBoardPost(courseId: string, kind: "공지" | "일반", body: string): Promise<BoardResult> {
  const id = String(courseId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const { user } = await currentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!rateLimit(`prep-board-post:${user.id}`, 20, 10 * 60_000).allowed) {
    return { ok: false, error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." };
  }

  const text = normalizeBody(body, PREP_BOARD_POST_MAX);
  if (!text) return { ok: false, error: "내용을 입력해 주세요." };

  const admin = createAdminClient();
  const role = await writerRole(admin, id, user.id);
  if (!role) return { ok: false, error: "수강 신청하신 분과 개설 프렌더만 글을 쓸 수 있어요." };
  if (kind === "공지" && role !== "host") return { ok: false, error: "공지는 강좌를 개설한 프렌더만 쓸 수 있어요." };

  const authorName = await authorSnapshot(admin, user.id, user.email ?? "");
  const { error } = await admin.from("prep_board_posts").insert({
    course_id: id,
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
export async function updatePrepBoardPost(postId: string, body: string): Promise<BoardResult> {
  const id = String(postId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const { user } = await currentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const text = normalizeBody(body, PREP_BOARD_POST_MAX);
  if (!text) return { ok: false, error: "내용을 입력해 주세요." };

  const { data, error } = await createAdminClient().from("prep_board_posts").update({ body: text }).eq("id", id).eq("user_id", user.id).select("id");
  if (error) return { ok: false, error: "수정하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  if (!data || data.length === 0) return { ok: false, error: "본인이 쓴 글만 수정할 수 있어요." };
  return { ok: true };
}

/** 삭제는 작성자 본인 ∥ 개설 프렌더(모더레이션). 댓글은 FK cascade로 함께 지워진다. */
export async function deletePrepBoardPost(postId: string): Promise<BoardResult> {
  const id = String(postId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const { user } = await currentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { data: postRow } = await admin.from("prep_board_posts").select("user_id, course_id").eq("id", id).maybeSingle();
  const post = postRow as { user_id: string; course_id: string } | null;
  if (!post) return { ok: false, error: "이미 삭제된 글이에요." };

  if (post.user_id !== user.id && !(await isCourseHost(admin, post.course_id, user.id))) {
    return { ok: false, error: "본인이 쓴 글이나 내 강좌의 글만 삭제할 수 있어요." };
  }

  const { error } = await admin.from("prep_board_posts").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  return { ok: true };
}

export async function createPrepBoardComment(postId: string, body: string): Promise<BoardResult> {
  const id = String(postId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const { user } = await currentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!rateLimit(`prep-board-comment:${user.id}`, 30, 10 * 60_000).allowed) {
    return { ok: false, error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." };
  }

  const text = normalizeBody(body, PREP_BOARD_COMMENT_MAX);
  if (!text) return { ok: false, error: "내용을 입력해 주세요." };

  const admin = createAdminClient();
  const { data: postRow } = await admin.from("prep_board_posts").select("course_id").eq("id", id).maybeSingle();
  const post = postRow as { course_id: string } | null;
  if (!post) return { ok: false, error: "이미 삭제된 글이에요." };

  const role = await writerRole(admin, post.course_id, user.id);
  if (!role) return { ok: false, error: "수강 신청하신 분과 개설 프렌더만 댓글을 쓸 수 있어요." };

  const authorName = await authorSnapshot(admin, user.id, user.email ?? "");
  const { error } = await admin.from("prep_board_comments").insert({
    post_id: id,
    user_id: user.id,
    author_name: authorName,
    is_host: role === "host",
    body: text,
  });
  if (error) return { ok: false, error: "등록하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  return { ok: true };
}

export async function deletePrepBoardComment(commentId: string): Promise<BoardResult> {
  const id = String(commentId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const { user } = await currentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { data: commentRow } = await admin.from("prep_board_comments").select("user_id, post_id").eq("id", id).maybeSingle();
  const comment = commentRow as { user_id: string; post_id: string } | null;
  if (!comment) return { ok: false, error: "이미 삭제된 댓글이에요." };

  if (comment.user_id !== user.id) {
    const { data: postRow } = await admin.from("prep_board_posts").select("course_id").eq("id", comment.post_id).maybeSingle();
    const post = postRow as { course_id: string } | null;
    if (!post || !(await isCourseHost(admin, post.course_id, user.id))) {
      return { ok: false, error: "본인이 쓴 댓글이나 내 강좌의 댓글만 삭제할 수 있어요." };
    }
  }

  const { error } = await admin.from("prep_board_comments").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  return { ok: true };
}

// 삭제 가드용 — 자격(writerRole)과 달리 강좌 상태는 보지 않는다.
// 승인이 풀린 강좌에서도 개설 프렌더는 자기 게시판을 정리할 수 있어야 한다.
async function isCourseHost(admin: ReturnType<typeof createAdminClient>, courseId: string, userId: string): Promise<boolean> {
  const { data } = await admin.from("prep_courses").select("friender_id").eq("id", courseId).maybeSingle();
  return (data as { friender_id: string } | null)?.friender_id === userId;
}
