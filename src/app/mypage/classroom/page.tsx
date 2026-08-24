import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { loadClasses } from "@/lib/classroom";
import { loadPrepSessionsForStudent } from "@/lib/prep-session";
import ClassroomList from "@/components/classroom/ClassroomList";
import PrepCourseSection from "@/components/classroom/PrepCourseSection";

// 「내 강의실」 = 수업을 실제로 진행하는 곳. 정규 과정과 프렙을 **섹션으로 구분해** 함께 놓는다.
// ⚠️ 입장 동선은 과정 종류와 무관하게 항상 여기 하나여야 한다 — 정규 과정이 「수강신청 내역」(결제)과
//    「내 강의실」(수업)로 갈려 있는 것과 대응한다. 「프렙 수강」 탭은 신청·입금 내역 전용이다.
export default async function MyPageClassroom() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/classroom");

  const classes = await loadClasses(supabase, user.id, false);
  // '수강확정' 강좌만 담겨 온다(자격 확인은 로더가 한다).
  const prepCourses = Object.values(await loadPrepSessionsForStudent(user.id)).filter((c) => c.sessions.length > 0);

  // 프렙이 없으면 오늘까지의 화면을 그대로 유지한다 — 대다수 회원에게 래퍼·제목이 붙지 않도록.
  // (둘 다 없을 때도 이 경로로 가서 ClassroomList의 기존 빈 상태 문구 하나만 보인다.)
  if (prepCourses.length === 0) return <ClassroomList classes={classes} isTeacher={false} />;

  // 프렙이 있을 때만 섹션 제목을 붙인다. 내용이 없는 섹션은 렌더하지 않는다.
  const showHeadings = classes.length > 0;
  return (
    <div className="space-y-8">
      {classes.length > 0 && (
        <section>
          {showHeadings && <h2 className="text-ink mb-3 text-sm font-extrabold">정규 과정</h2>}
          <ClassroomList classes={classes} isTeacher={false} />
        </section>
      )}
      <section>
        {showHeadings && <h2 className="text-ink mb-3 text-sm font-extrabold">프렙 강좌</h2>}
        <PrepCourseSection courses={prepCourses} />
      </section>
    </div>
  );
}
