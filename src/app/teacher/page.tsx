import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";
import { getCourse } from "@/data/courses";
import TeacherProfileForm, { type TeacherProfile } from "@/components/teacher/TeacherProfileForm";
import AvailabilityModal from "@/components/teacher/AvailabilityModal";
import { deriveBookedSlots } from "@/lib/availability";
import { loadClasses } from "@/lib/classroom";
import TeacherEnrollments, { type TeacherEnrollment } from "@/components/teacher/TeacherEnrollments";
import ClassroomList from "@/components/classroom/ClassroomList";

export const metadata: Metadata = { title: "Teacher — Friending School", robots: { index: false } };

export default async function TeacherPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teacher");

  const role = await getUserRole(supabase, user.id);
  if (role !== "teacher" && role !== "admin") redirect("/");

  const { data } = await supabase
    .from("profiles")
    .select("first_name, last_name, avatar_url, zoom_url, bio, experience, phone, nationality, gender, center_id")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (data ?? {}) as Partial<TeacherProfile>;
  const initial: TeacherProfile = {
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    avatar_url: profile.avatar_url ?? "",
    zoom_url: profile.zoom_url ?? "",
    bio: profile.bio ?? "",
    experience: profile.experience ?? "",
    phone: profile.phone ?? "",
    nationality: profile.nationality ?? "",
    gender: profile.gender ?? "",
    center_id: profile.center_id ?? "",
  };

  // 센터 드롭다운 목록.
  const { data: centersData } = await supabase.from("centers").select("id, name").order("sort_order", { ascending: true });
  const centers = (centersData ?? []) as { id: string; name: string }[];

  const { data: availRows } = await supabase.from("teacher_availability").select("day_of_week, start_min").eq("teacher_id", user.id);
  const initialSlots = (availRows ?? []).map((r) => ({ day: r.day_of_week, min: r.start_min }));

  // 본인에게 온 수강신청(신청 우선 정렬) — RLS enrollments_select_own_teacher로 본인 것만.
  const { data: enrollRows } = await supabase
    .from("enrollments")
    .select("id, student_name, student_english_name, course, course_title, start_date, slots, status, teacher_note, created_at")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });
  const enrollments: TeacherEnrollment[] = (enrollRows ?? [])
    .map((r) => ({
      id: r.id,
      studentName: r.student_name ?? "학생",
      studentEnglishName: r.student_english_name ?? "",
      // 강사 UI는 영문 — 저장된 슬러그로 영문 과정명 live 해석(미해석 레거시 슬러그는 한글 course_title 폴백).
      courseTitle: getCourse(r.course)?.englishTitle ?? r.course_title,
      startDate: r.start_date,
      slots: Array.isArray(r.slots) ? r.slots : [],
      status: r.status,
      teacherNote: r.teacher_note,
      createdAt: r.created_at,
    }))
    // 신청(대기) 먼저, 그다음 최신순.
    .sort((a, b) => (a.status === "신청" ? 0 : 1) - (b.status === "신청" ? 0 : 1));

  // 가용 그리드 오버레이용 예약 슬롯 — 승인 후 전부(확정=승인/결제완료, 결제대기=pending; confirmed 우선).
  const bookedSlots = deriveBookedSlots(enrollRows ?? []);

  // 내 강의실(확정된 수업 클래스) — 결제완료 시 생성된 클래스.
  const classes = await loadClasses(supabase, user.id, true);

  // 친근한 호칭은 이름(first) 우선, 없으면 이메일 로컬파트.
  const displayName = initial.first_name || user.email?.split("@")[0] || "Teacher";

  return (
    <div className="bg-surface min-h-screen">
      {/* 라벨 바 */}
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">TEACHER</span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        {/* 웰컴 배너 */}
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL · TEACHER</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">Manage your teacher profile, {displayName}. 🎓</p>
          <p className="mt-1 text-sm opacity-90">Adding a profile photo and bio helps build trust with your students.</p>
        </div>

        <TeacherProfileForm userId={user.id} email={user.email ?? ""} initial={initial} centers={centers} />

        {/* 주간 가능 시간 — 요약 카드 + 모달 편집 */}
        <AvailabilityModal initialSlots={initialSlots} bookedSlots={bookedSlots} />

        {/* 수강신청 관리 — 승인/거절 */}
        <TeacherEnrollments enrollments={enrollments} />

        {/* 내 강의실 — 확정된 수업 일정 */}
        <section className="mt-8">
          <h2 className="text-ink mb-4 text-lg font-bold">My Classroom</h2>
          <ClassroomList classes={classes} isTeacher />
        </section>
      </div>
    </div>
  );
}
