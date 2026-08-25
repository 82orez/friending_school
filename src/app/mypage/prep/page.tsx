import { redirect } from "next/navigation";

// 「프렙 수강」 탭은 「수강신청 내역」(/mypage/enrollments)으로 통합됐다 —
// 회차 입장이 「내 강의실」로 옮겨간 뒤 이 탭에 남은 건 신청·입금 기록뿐이라 같은 일을 하는 탭이 둘이었다.
// ⚠️ 라우트는 리다이렉트로 남긴다: 북마크·기존 링크가 404가 되지 않도록.
export default function MyPagePrepRedirect() {
  redirect("/mypage/enrollments");
}
