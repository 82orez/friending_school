import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import FrienderReviews, { type ReceivedReview } from "@/components/friender/FrienderReviews";

export default async function FrienderReviewsPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/friender/reviews");

  // ⚠️ 소유권은 쿼리에서 강제한다 — RLS에 기대면 안 된다.
  //    이 테이블에는 SELECT 정책이 둘(작성자 `_select_own`, 프렌더 `_select_own_friender`)이고 permissive 정책은 OR로 합쳐진다.
  //    필터가 없으면 **프렌더가 남의 방에 쓴 자기 후기**까지 '받은 후기'로 섞여 들어와 평균 별점이 오염된다
  //    (프렌더도 일반 회원 동선을 그대로 쓰므로 실제로 생기는 상황이다).
  const { data } = await supabase
    .from("friender_room_reviews")
    .select("id, rating, comment, user_name, room_title, session_date, created_at")
    .eq("friender_id", user.id)
    .order("created_at", { ascending: false });

  return <FrienderReviews reviews={(data ?? []) as ReceivedReview[]} />;
}
