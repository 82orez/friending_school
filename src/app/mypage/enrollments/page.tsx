import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { type Slot } from "@/lib/availability";
import { getCourse } from "@/data/courses";
import StudentEnrollments, { type StudentEnrollment } from "@/components/mypage/StudentEnrollments";

type EnrollmentRow = {
  id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  start_date: string;
  slots: Slot[];
  status: "신청" | "승인" | "결제대기" | "결제완료" | "거절" | "취소";
  teacher_note: string | null;
  created_at: string;
};

export default async function MyPageEnrollments() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/enrollments");

  const { data } = await supabase
    .from("enrollments")
    .select("id, course, course_title, teacher_name, start_date, slots, status, teacher_note, created_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });
  const enrollments: StudentEnrollment[] = ((data ?? []) as EnrollmentRow[]).map((e) => ({
    id: e.id,
    courseTitle: e.course_title,
    // 결제 금액 = 과정 고정가(슬러그로 live 해석, 미해석 레거시는 빈 값).
    priceLabel: getCourse(e.course)?.price ?? "",
    teacherName: e.teacher_name,
    startDate: e.start_date,
    slots: Array.isArray(e.slots) ? e.slots : [],
    status: e.status,
    teacherNote: e.teacher_note,
    createdAt: e.created_at,
  }));

  return <StudentEnrollments enrollments={enrollments} />;
}
