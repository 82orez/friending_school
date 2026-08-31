import { createAdminClient } from "@/utils/supabase/admin";
import TeacherRequestsManager, {
  type TeacherApplication,
  type CurrentTeacher,
  type TeacherClassItem,
  type TeacherCoverItem,
} from "@/components/admin/TeacherRequestsManager";
import { buildCoverSessions, teacherClassesOrFilter, TEACHER_CLASS_SELECT, type TeacherClassRow } from "@/lib/teacher-directory";
import { deriveBookedSlots, lessonEndMin, TOTAL_SESSIONS, type BookedSlot } from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";
import { ACTIVE_BOOKING_STATUSES, loadEndedEnrollmentIds } from "@/lib/booking";
import { FOREIGN_CURRENCIES, ratesFromSettings } from "@/data/currencies";
import type { RateRow } from "@/lib/rates";

const STATUS_ORDER: Record<string, number> = { 신청: 0, 거절: 1, 승인: 2 };

export default async function AdminTeacherRequestsPage() {
  const admin = createAdminClient();

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? "(이메일 없음)"]));

  // 센터 id→이름 매핑(신청서·프로필의 center_id 표시용) + 강사 센터 변경 셀렉트/단가 표시용 목록.
  const { data: centersData } = await admin
    .from("centers")
    .select("id, name, price_per_session, price_currency")
    .order("sort_order", { ascending: true });
  // numeric 단가는 문자열로 올 수 있어 숫자로 강제(null 보존).
  const centers = (
    (centersData ?? []) as { id: string; name: string; price_per_session: number | string | null; price_currency: string | null }[]
  ).map((c) => ({ id: c.id, name: c.name, price: c.price_per_session == null ? null : Number(c.price_per_session), currency: c.price_currency }));
  const centerNameById = new Map(centers.map((c) => [c.id, c.name]));

  const { data: appsData } = await admin
    .from("teacher_applications")
    .select("id, user_id, name, phone, nationality, gender, center_id, bio, experience, zoom_url, avatar_url, status, admin_note, created_at")
    .order("created_at", { ascending: false });

  const applications: TeacherApplication[] = (
    (appsData ?? []) as (Omit<TeacherApplication, "email" | "center_name"> & { center_id: string | null })[]
  )
    .map((a) => ({
      ...a,
      email: emailById.get(a.user_id) ?? "(이메일 없음)",
      center_name: a.center_id ? (centerNameById.get(a.center_id) ?? null) : null,
    }))
    // 신청(미처리) → 거절 → 승인 순, 같은 그룹 내 최신순(원본이 created desc)
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const { data: teacherProfiles } = await admin
    .from("profiles")
    .select(
      "id, first_name, last_name, avatar_url, zoom_url, bio, experience, phone, nationality, gender, center_id, custom_price_per_session, custom_price_currency",
    )
    .eq("role", "teacher");

  // 현재 강사 가용 시간 일괄 조회 후 teacher_id별 그룹핑.
  const teacherIds = (teacherProfiles ?? []).map((t: { id: string }) => t.id);
  const slotsByTeacher = new Map<string, { day: number; min: number }[]>();
  if (teacherIds.length > 0) {
    const { data: slotRows } = await admin.from("teacher_availability").select("teacher_id, day_of_week, start_min").in("teacher_id", teacherIds);
    for (const r of slotRows ?? []) {
      const list = slotsByTeacher.get(r.teacher_id) ?? [];
      list.push({ day: r.day_of_week, min: r.start_min });
      slotsByTeacher.set(r.teacher_id, list);
    }
  }

  // 현재 강사별 예약(가용 그리드 오버레이용) + 진행 중인 수업 목록 — 진행중 전부(신청/승인/결제대기/결제완료) 조회 후 강사별 파생.
  // ⚠️ 한 쿼리를 두 용도로 쓴다: 그리드 오버레이는 '신청'까지 점유로 봐야 강사 화면과 일치하고(ACTIVE_BOOKING_STATUSES),
  //    「수업 보기」 목록은 아직 승인도 안 된 신청을 수업으로 세면 안 되므로 아래에서 '신청'을 걸러낸다.
  const bookedByTeacher = new Map<string, BookedSlot[]>();
  const classesByTeacher = new Map<string, TeacherClassItem[]>();
  const coverByTeacher = new Map<string, TeacherCoverItem[]>();
  if (teacherIds.length > 0) {
    const { data: enrollRows } = await admin
      .from("enrollments")
      .select("id, teacher_id, course, course_title, slots, status, start_date, total_sessions, student_name, student_english_name")
      .in("teacher_id", teacherIds)
      .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[]);
    // 종료된 '결제완료'(남은 예정 수업 없음)는 그리드 오버레이·수업 목록에서 제외.
    const ended = await loadEndedEnrollmentIds(admin, teacherIds);
    const rowsByTeacher = new Map<string, NonNullable<typeof enrollRows>>();
    for (const r of enrollRows ?? []) {
      if (r.status === "결제완료" && ended.has(r.id)) continue;
      const list = rowsByTeacher.get(r.teacher_id) ?? [];
      list.push(r);
      rowsByTeacher.set(r.teacher_id, list);
    }
    rowsByTeacher.forEach((rows, tid) => bookedByTeacher.set(tid, deriveBookedSlots(rows)));

    // 강사별 classes 집계(진행률·다음 수업일). 승인/결제대기 enrollment는 아직 classes 없음.
    const { data: clsRows } = await admin.from("classes").select(TEACHER_CLASS_SELECT).or(teacherClassesOrFilter(teacherIds));
    const classRows = (clsRows ?? []) as TeacherClassRow[];
    const now = Date.now();
    const aggByEnrollment = new Map<string, { total: number; done: number; nextDate: string | null; nextMin: number | null }>();
    for (const c of classRows) {
      const a = aggByEnrollment.get(c.enrollment_id) ?? { total: 0, done: 0, nextDate: null, nextMin: null };
      if (c.status !== "취소") {
        if (!c.is_makeup) a.total += 1; // 계획 회차(보강 제외)
        const endMs = kstDateMinToMs(c.session_date, lessonEndMin(c.end_min));
        if (endMs < now) {
          a.done += 1;
        } else if (a.nextDate === null || c.session_date < a.nextDate || (c.session_date === a.nextDate && c.start_min < (a.nextMin ?? Infinity))) {
          a.nextDate = c.session_date;
          a.nextMin = c.start_min;
        }
      }
      aggByEnrollment.set(c.enrollment_id, a);
    }

    // 대체 회차(대타/넘긴 회차) — 전체 강사가 스코프라 이름은 프로필 맵으로 충분.
    const nameById = new Map(
      ((teacherProfiles ?? []) as { id: string; first_name: string | null; last_name: string | null }[]).map((p) => [
        p.id,
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim(),
      ]),
    );
    buildCoverSessions(classRows, teacherIds, nameById).forEach((v, k) => coverByTeacher.set(k, v));

    rowsByTeacher.forEach((rows, tid) => {
      // '신청'은 그리드 점유 표시 전용 — 아직 강사 승인 전이라 「수업 보기」 목록에는 넣지 않는다.
      const items: TeacherClassItem[] = rows
        .filter((r) => r.status !== "신청")
        .map((r) => {
          const agg = aggByEnrollment.get(r.id);
          return {
            enrollmentId: r.id,
            course: r.course,
            courseTitle: r.course_title,
            studentName: r.student_name,
            studentEnglishName: r.student_english_name,
            status: r.status,
            slots: (r.slots ?? []) as { day: number; min: number }[],
            startDate: r.start_date,
            totalSessions: r.total_sessions ?? TOTAL_SESSIONS,
            total: agg?.total ?? 0,
            done: agg?.done ?? 0,
            nextDate: agg?.nextDate ?? null,
            nextMin: agg?.nextMin ?? null,
          };
        });
      // 다음 수업일 오름차순(없으면 뒤), 그다음 시작일.
      items.sort((a, b) => {
        const an = a.nextDate ?? "9999-99-99";
        const bn = b.nextDate ?? "9999-99-99";
        if (an !== bn) return an < bn ? -1 : 1;
        return (a.startDate ?? "").localeCompare(b.startDate ?? "");
      });
      classesByTeacher.set(tid, items);
    });
  }

  const currentTeachers: CurrentTeacher[] = (
    (teacherProfiles ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
      zoom_url: string | null;
      bio: string | null;
      experience: string | null;
      phone: string | null;
      nationality: string | null;
      gender: string | null;
      center_id: string | null;
      custom_price_per_session: number | string | null;
      custom_price_currency: string | null;
    }[]
  ).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? "(이메일 없음)",
    name: [p.first_name, p.last_name].filter(Boolean).join(" "),
    phone: p.phone,
    nationality: p.nationality,
    gender: p.gender,
    centerId: p.center_id,
    centerName: p.center_id ? (centerNameById.get(p.center_id) ?? null) : null,
    customPrice: p.custom_price_per_session == null ? null : Number(p.custom_price_per_session),
    customCurrency: p.custom_price_currency,
    bio: p.bio,
    experience: p.experience,
    zoomUrl: p.zoom_url,
    avatarUrl: p.avatar_url,
    slots: slotsByTeacher.get(p.id) ?? [],
    bookedSlots: bookedByTeacher.get(p.id) ?? [],
    classes: classesByTeacher.get(p.id) ?? [],
    coverSessions: coverByTeacher.get(p.id) ?? [],
  }));

  // 강사별 단가 적용일 이력(TeacherInfoModal 편집기용) + 외화 환율.
  const schedulesByTeacher: Record<string, RateRow[]> = {};
  if (teacherIds.length > 0) {
    const { data: rsData } = await admin
      .from("rate_schedules")
      .select("id, scope, scope_id, price_per_session, currency, effective_from, note")
      .eq("scope", "teacher")
      .in("scope_id", teacherIds);
    for (const r of (rsData ?? []) as {
      id: string;
      scope: "center" | "teacher";
      scope_id: string;
      price_per_session: number | string | null;
      currency: string | null;
      effective_from: string;
      note: string | null;
    }[]) {
      (schedulesByTeacher[r.scope_id] ??= []).push({
        id: r.id,
        scope: r.scope,
        scopeId: r.scope_id,
        price: r.price_per_session == null ? null : Number(r.price_per_session),
        currency: r.currency,
        effectiveFrom: r.effective_from,
        note: r.note,
      });
    }
  }

  const { data: rateSettingRows } = await admin
    .from("settings")
    .select("key, value")
    .in(
      "key",
      FOREIGN_CURRENCIES.map((f) => f.settingKey),
    );
  const rates = ratesFromSettings(rateSettingRows as { key: string; value: string | null }[] | null);

  return (
    <TeacherRequestsManager
      applications={applications}
      currentTeachers={currentTeachers}
      centers={centers}
      rates={rates}
      schedulesByTeacher={schedulesByTeacher}
    />
  );
}
