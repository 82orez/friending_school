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

  // RLS friender_room_reviews_select_own_friender가 본인이 받은 것만 통과시킨다.
  const { data } = await supabase
    .from("friender_room_reviews")
    .select("id, rating, comment, user_name, room_title, session_date, created_at")
    .order("created_at", { ascending: false });

  return <FrienderReviews reviews={(data ?? []) as ReceivedReview[]} />;
}
