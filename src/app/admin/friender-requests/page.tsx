import { createAdminClient } from "@/utils/supabase/admin";
import FrienderRequestsManager, {
  type FrienderApplication,
  type CurrentFriender,
  type FrienderReviewSummary,
} from "@/components/admin/FrienderRequestsManager";

// 미처리(신청) → 거절 → 승인 순으로 노출(같은 그룹 내에서는 최신순 유지).
const STATUS_ORDER: Record<string, number> = { 신청: 0, 거절: 1, 승인: 2 };

export default async function AdminFrienderRequestsPage() {
  const admin = createAdminClient();

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? "(이메일 없음)"]));

  const { data: appsData } = await admin
    .from("friender_applications")
    .select("id, user_id, name, nickname, phone, nationality, gender, intro, zoom_url, avatar_url, status, admin_note, created_at")
    .order("created_at", { ascending: false });

  const applications: FrienderApplication[] = ((appsData ?? []) as Omit<FrienderApplication, "email">[])
    .map((a) => ({ ...a, email: emailById.get(a.user_id) ?? "(이메일 없음)" }))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  // 프렌더 계열 전체(일반 + Plus) — 등급 변경은 목록 행에서 처리한다.
  const { data: frienderProfiles } = await admin
    .from("profiles")
    .select("id, role, first_name, last_name, nickname, avatar_url, zoom_url, bio, phone, nationality, gender")
    .in("role", ["friender", "friender_plus"]);

  // 받은 후기 — 프렌더별 평균·건수 + 모달용 최근 목록(RLS 정책이 없어 service_role만 읽는다).
  const { data: reviewRows } = await admin
    .from("friender_room_reviews")
    .select("friender_id, rating, comment, user_name, room_title, session_date, created_at")
    .order("created_at", { ascending: false });
  const reviewsByFriender = new Map<string, FrienderReviewSummary["recent"]>();
  const ratingSum = new Map<string, { sum: number; count: number }>();
  for (const rv of (reviewRows ?? []) as (FrienderReviewSummary["recent"][number] & { friender_id: string })[]) {
    const agg = ratingSum.get(rv.friender_id) ?? { sum: 0, count: 0 };
    ratingSum.set(rv.friender_id, { sum: agg.sum + rv.rating, count: agg.count + 1 });
    const list = reviewsByFriender.get(rv.friender_id) ?? [];
    if (list.length < 5) list.push(rv); // 최근 5건만(created_at desc 정렬 그대로)
    reviewsByFriender.set(rv.friender_id, list);
  }

  const currentFrienders: CurrentFriender[] = (
    (frienderProfiles ?? []) as {
      id: string;
      role: "friender" | "friender_plus";
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      avatar_url: string | null;
      zoom_url: string | null;
      bio: string | null;
      phone: string | null;
      nationality: string | null;
      gender: string | null;
    }[]
  ).map((p) => ({
    id: p.id,
    role: p.role,
    email: emailById.get(p.id) ?? "(이메일 없음)",
    // 한국 관례상 성+이름을 공백 없이 붙임(신청 액션의 name 조합과 동일 규칙).
    name: `${p.last_name ?? ""}${p.first_name ?? ""}`,
    nickname: p.nickname,
    phone: p.phone,
    nationality: p.nationality,
    gender: p.gender,
    bio: p.bio,
    zoomUrl: p.zoom_url,
    avatarUrl: p.avatar_url,
    reviewCount: ratingSum.get(p.id)?.count ?? 0,
    reviewAverage: ratingSum.get(p.id) ? ratingSum.get(p.id)!.sum / ratingSum.get(p.id)!.count : 0,
    recentReviews: reviewsByFriender.get(p.id) ?? [],
  }));

  return <FrienderRequestsManager applications={applications} currentFrienders={currentFrienders} />;
}
