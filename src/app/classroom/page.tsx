import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";
import { getCourse } from "@/data/courses";
import { kstDateMinToMs } from "@/lib/classtime";
import ClassroomList, { type ClassItem } from "@/components/classroom/ClassroomList";

export const metadata: Metadata = { title: "내 강의실 — 프렌딩 스쿨" };

type ClassRow = {
  id: string;
  course: string;
  course_title: string;
  teacher_name: string | null;
  student_name: string | null;
  student_english_name: string | null;
  session_no: number;
  session_date: string;
  start_min: number;
  end_min: number;
};

export default async function ClassroomPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/classroom");

  const role = await getUserRole(supabase, user.id);
  const isTeacher = role === "teacher";

  const { data } = await supabase
    .from("classes")
    .select("id, course, course_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min")
    .eq(isTeacher ? "teacher_id" : "student_id", user.id)
    .order("session_date", { ascending: true })
    .order("start_min", { ascending: true });

  const classes: ClassItem[] = ((data ?? []) as ClassRow[]).map((c) => ({
    id: c.id,
    // 강사 화면은 영문 과정명(강사 대시보드 관례), 학생 화면은 한글 스냅샷.
    courseTitle: isTeacher ? (getCourse(c.course)?.englishTitle ?? c.course_title) : c.course_title,
    // 학생 뷰=강사명, 강사 뷰=학생명(영문 있으면 영문(한글)).
    counterpart: isTeacher ? c.student_english_name || c.student_name || "학생" : c.teacher_name || "강사",
    sessionNo: c.session_no,
    sessionDate: c.session_date,
    startMin: c.start_min,
    endMin: c.end_min,
    startMs: kstDateMinToMs(c.session_date, c.start_min),
    endMs: kstDateMinToMs(c.session_date, c.end_min),
  }));

  return (
    <div className="bg-surface min-h-screen">
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">
          {isTeacher ? "My Classroom" : "내 강의실"}
        </span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">{isTeacher ? "Your teaching schedule" : "내 수업 일정"}</p>
          <p className="mt-1 text-sm opacity-90">
            {isTeacher ? "You can enter from 15 minutes before each class starts." : "수업 시작 15분 전부터 입장할 수 있어요."}
          </p>
        </div>

        <ClassroomList classes={classes} isTeacher={isTeacher} />
      </div>
    </div>
  );
}
