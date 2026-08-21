import StarRating from "@/components/StarRating";
import { formatDateKo } from "@/lib/availability";
import { kstDateText } from "@/lib/kst";

// 프렌더가 받은 후기(읽기 전용). 작성자는 회원 본인이고 열람은 프렌더 본인 + 관리자만이다.
// 방이 삭제돼도 스냅샷(room_title·session_date·user_name)으로 목록이 유지된다.
export type ReceivedReview = {
  id: string;
  rating: number;
  comment: string | null;
  user_name: string | null;
  room_title: string | null;
  session_date: string | null;
  created_at: string;
};

export default function FrienderReviews({ reviews }: { reviews: ReceivedReview[] }) {
  const average = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  return (
    <div>
      <h2 className="text-ink text-lg font-extrabold">받은 후기</h2>
      <p className="text-muted-fg mt-1 text-sm">대화에 참여한 회원이 남긴 평가입니다. 회원 목록에는 공개되지 않습니다.</p>

      {reviews.length === 0 ? (
        <div className="border-rule mt-4 rounded-xl border bg-white px-6 py-16 text-center">
          <p className="text-ink text-sm font-bold">아직 받은 후기가 없습니다.</p>
          <p className="text-muted-fg mt-1 text-sm">대화가 끝나면 참여한 회원이 후기를 남길 수 있어요.</p>
        </div>
      ) : (
        <>
          <div className="border-rule mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-white px-5 py-4">
            <p className="text-ink text-2xl font-extrabold">{average.toFixed(1)}</p>
            <StarRating value={Math.round(average)} />
            <p className="text-muted-fg text-sm font-semibold">후기 {reviews.length}개</p>
          </div>

          <ul className="border-rule mt-3 list-none overflow-hidden rounded-xl border bg-white">
            {reviews.map((r) => (
              <li key={r.id} className="border-rule border-b px-4 py-4 last:border-b-0 md:px-6">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StarRating value={r.rating} size="sm" />
                  <span className="text-ink text-sm font-bold">{r.user_name?.trim() || "회원"}님</span>
                  <span className="text-muted-fg-faint text-xs">{kstDateText(r.created_at)}</span>
                </div>
                <p className="text-muted-fg mt-1 text-xs">
                  {r.room_title?.trim() || "삭제된 방"}
                  {r.session_date && ` · ${formatDateKo(r.session_date)}`}
                </p>
                {r.comment?.trim() && <p className="text-ink mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
