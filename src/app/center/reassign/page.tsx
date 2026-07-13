import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireCenterManager } from "@/lib/center-manager";
import { todayKst } from "@/lib/booking";
import { type Slot } from "@/lib/availability";
import CenterDashboard, { type CenterTeacher, type CenterClass } from "@/components/center/CenterDashboard";

export default async function CenterReassignPage() {
  const mgr = await requireCenterManager();
  if (!mgr) redirect("/");

  const admin = createAdminClient();

  // 소속 센터 강사 — 가드 통과 후 service_role(매니저는 admin 아니라 타 profiles를 RLS로 못 읽음).
  const { data: profRows } = await admin
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, nationality, gender")
    .eq("role", "teacher")
    .in("center_id", mgr.centerIds);
  const teacherRows = (profRows ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    nationality: string | null;
    gender: string | null;
  }[];
  const teacherIds = teacherRows.map((t) => t.id);

  // 강사별 주간 가용(후보 필터용) + 예정 수업.
  const slotsByTeacher = new Map<string, Slot[]>();
  const classes: CenterClass[] = [];
  if (teacherIds.length > 0) {
    const { data: slotRows } = await admin.from("teacher_availability").select("teacher_id, day_of_week, start_min").in("teacher_id", teacherIds);
    for (const s of (slotRows ?? []) as { teacher_id: string; day_of_week: number; start_min: number }[]) {
      const list = slotsByTeacher.get(s.teacher_id) ?? [];
      list.push({ day: s.day_of_week, min: s.start_min });
      slotsByTeacher.set(s.teacher_id, list);
    }

    // 예정 수업(미래) — 오늘(KST) 이후 날짜의 '예정' 회차만.
    const { data: classRows } = await admin
      .from("classes")
      .select("id, teacher_id, course_title, student_name, session_no, session_date, start_min, end_min")
      .in("teacher_id", teacherIds)
      .eq("status", "예정")
      .gte("session_date", todayKst())
      .order("session_date", { ascending: true })
      .order("start_min", { ascending: true });
    for (const c of (classRows ?? []) as {
      id: string;
      teacher_id: string;
      course_title: string;
      student_name: string | null;
      session_no: number;
      session_date: string;
      start_min: number;
      end_min: number;
    }[]) {
      classes.push({
        id: c.id,
        teacherId: c.teacher_id,
        courseTitle: c.course_title,
        studentName: c.student_name || "학생",
        sessionNo: c.session_no,
        sessionDate: c.session_date,
        startMin: c.start_min,
        endMin: c.end_min,
      });
    }
  }

  const teachers: CenterTeacher[] = teacherRows
    .map((t) => ({
      id: t.id,
      name: [t.first_name, t.last_name].filter(Boolean).join(" ").trim() || "강사",
      nationality: t.nationality,
      gender: t.gender,
      avatarUrl: t.avatar_url,
      slots: slotsByTeacher.get(t.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return <CenterDashboard teachers={teachers} classes={classes} />;
}
