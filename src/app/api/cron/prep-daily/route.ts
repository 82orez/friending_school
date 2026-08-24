import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getOrigin } from "@/lib/origin";
import { todayKst } from "@/lib/booking";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo } from "@/lib/prep";
import { sendPrepSessionReminder } from "@/lib/mailer";

// 오늘 프렙 수업 안내 메일 — Vercel Cron이 하루 1회 호출한다(vercel.json의 crons).
// ⚠️ 이 저장소의 유일한 크론이다. 노쇼 판정처럼 "조회 시점 계산"으로 대체할 수 없는 유일한 기능이라
//    (메일은 누가 화면을 열지 않아도 나가야 한다) 크론을 도입했다.
//
// 인증: Vercel Cron은 요청에 `Authorization: Bearer $CRON_SECRET`을 붙인다.
// ⚠️ CRON_SECRET이 없으면 **아무나 호출해 메일을 대량 발송**할 수 있으므로 미설정 시에도 거부한다.
export const dynamic = "force-dynamic";

type SessionRow = {
  id: string;
  course_id: string;
  session_no: number;
  session_date: string;
  topic: string | null;
};

export async function GET() {
  const headerList = await headers();

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET 미설정 — 요청을 거부한다(무인증 대량 발송 방지).");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (headerList.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = todayKst();

  // 아직 안내를 보내지 않은 오늘 회차만. reminder_sent_at이 멱등 키라 재시도해도 두 번 가지 않는다.
  const { data: rows } = await admin
    .from("prep_sessions")
    .select("id, course_id, session_no, session_date, topic")
    .eq("session_date", today)
    .is("reminder_sent_at", null);
  const sessions = (rows ?? []) as SessionRow[];
  if (sessions.length === 0) return NextResponse.json({ ok: true, sessions: 0, sent: 0 });

  const courseIds = Array.from(new Set(sessions.map((s) => s.course_id)));

  // '승인' 강좌만 — 심사가 풀린 강좌는 수업이 열리지 않는다.
  const { data: courseRows } = await admin
    .from("prep_courses")
    .select("id, title, start_min, duration_min, session_count")
    .in("id", courseIds)
    .eq("status", "승인");
  const courses = new Map(
    ((courseRows ?? []) as { id: string; title: string; start_min: number; duration_min: number; session_count: number }[]).map((c) => [c.id, c]),
  );

  // 수강확정 수강생만.
  const { data: enrollRows } = await admin
    .from("prep_enrollments")
    .select("course_id, user_id")
    .in("course_id", Array.from(courses.keys()))
    .eq("status", "수강확정");
  const studentsByCourse = new Map<string, string[]>();
  for (const e of (enrollRows ?? []) as { course_id: string; user_id: string }[]) {
    studentsByCourse.set(e.course_id, [...(studentsByCourse.get(e.course_id) ?? []), e.user_id]);
  }

  // 이메일은 profiles에 없어 auth 쪽에서 가져온다(admin 화면들과 같은 방식).
  const emailById = new Map<string, string>();
  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of usersData?.users ?? []) if (u.email) emailById.set(u.id, u.email);

  const enterUrl = `${getOrigin(headerList)}/mypage/prep`;
  let sent = 0;

  for (const s of sessions) {
    const course = courses.get(s.course_id);
    if (!course) continue; // 승인이 아닌 강좌 — 보내지 않고 reminder_sent_at도 남기지 않는다
    const students = studentsByCourse.get(s.course_id) ?? [];

    const when = `${fmtDateKo(s.session_date)} ${fmtTime(course.start_min)}~${fmtRoomEnd(course.start_min + course.duration_min)}`;
    for (const userId of students) {
      const email = emailById.get(userId);
      if (!email) continue;
      // sendPrepSessionReminder는 내부에서 throw하지 않지만, 한 명이 막혀도 나머지가 나가야 한다.
      try {
        await sendPrepSessionReminder(email, {
          courseTitle: course.title,
          sessionNo: s.session_no,
          total: course.session_count,
          when,
          topic: s.topic,
          enterUrl,
        });
        sent += 1;
      } catch (err) {
        console.error("[cron] 프렙 안내 메일 실패:", err);
      }
    }

    // 수강생이 0명이어도 처리 완료로 남긴다 — 다음 실행에서 다시 훑을 이유가 없다.
    await admin.from("prep_sessions").update({ reminder_sent_at: new Date().toISOString() }).eq("id", s.id);
  }

  return NextResponse.json({ ok: true, sessions: sessions.length, sent });
}
