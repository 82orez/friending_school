import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { loadClasses } from "@/lib/classroom";
import { loadPrepSessionsForStudent } from "@/lib/prep-session";
import ClassroomList from "@/components/classroom/ClassroomList";

// 「내 강의실」 = 수업을 실제로 진행하는 곳. 정규 과정과 프렙을 한 화면에서 카드 → 상세로 진입한다.
// ⚠️ 입장 동선은 과정 종류와 무관하게 여기 하나여야 한다 — 정규 과정이 「수강신청 내역」(결제)과
//    「내 강의실」(수업)로 갈려 있는 것과 대응한다. 신청·입금 기록은 「수강신청 내역」 탭이 두 과정을 함께 담는다.
// 섹션 구분·선택 상태는 전부 ClassroomList가 소유한다(형제로 두면 정규 상세 아래 프렙 카드가 남는다).
export default async function MyPageClassroom() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/classroom");

  const classes = await loadClasses(supabase, user.id, false);
  // '수강확정' 강좌만 담겨 온다(자격 확인은 로더가 한다).
  const prepCourses = Object.values(await loadPrepSessionsForStudent(user.id)).filter((c) => c.sessions.length > 0);

  return <ClassroomList classes={classes} isTeacher={false} prepCourses={prepCourses} />;
}
