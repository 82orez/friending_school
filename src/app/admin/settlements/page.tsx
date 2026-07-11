import { createAdminClient } from "@/utils/supabase/admin";
import SettlementsManager, { type SettlementRow } from "@/components/admin/SettlementsManager";
import { FOREIGN_CURRENCIES, normalizeCurrency, ratesFromSettings } from "@/data/currencies";
import { effectiveRate, type RateRow } from "@/lib/rates";

// 강사 정산 리포트(읽기 전용). conducted_at이 찍힌(실제 진행된) 수업만 집계하고,
// 단가는 rate_schedules 적용일 이력을 수업 날짜(session_date) 기준으로 역산한다
// (강사 개별 단가 > 소속 센터 단가, price=null 행=센터 복귀). centers/profiles 컬럼은 현재값 캐시라 미참조.
// 성능: conducted 수업 전량을 로드해 클라에서 기간·분류 집계 — 중규모까지 적정.
// 대규모 시 월 파라미터로 조회 범위를 좁히는 것이 scale path.
export default async function AdminSettlementsPage() {
  const admin = createAdminClient();

  // conducted 수업(취소 제외 방어, 보강 포함). CLASS_SELECT는 teacher_id 미포함이라 전용 select.
  const { data: clsData } = await admin
    .from("classes")
    .select(
      "id, teacher_id, teacher_name, student_name, student_english_name, course, course_title, session_date, start_min, is_makeup, conducted_at, conducted_override",
    )
    .or("conducted_override.eq.true,and(conducted_override.is.null,conducted_at.not.is.null)")
    .neq("status", "취소")
    .order("session_date", { ascending: true });
  const classes = (clsData ?? []) as {
    id: string;
    teacher_id: string;
    teacher_name: string | null;
    student_name: string | null;
    student_english_name: string | null;
    course: string;
    course_title: string;
    session_date: string;
    start_min: number;
    is_makeup: boolean;
  }[];

  // 강사 프로필(현재 소속 센터·이름) — 단가는 이력에서 역산, center_id는 어떤 센터 이력을 볼지 결정.
  const teacherIds = Array.from(new Set(classes.map((c) => c.teacher_id)));
  const profileById = new Map<string, { first_name: string | null; last_name: string | null; center_id: string | null }>();
  if (teacherIds.length > 0) {
    const { data: profData } = await admin.from("profiles").select("id, first_name, last_name, center_id").in("id", teacherIds);
    for (const p of (profData ?? []) as { id: string; first_name: string | null; last_name: string | null; center_id: string | null }[]) {
      profileById.set(p.id, { first_name: p.first_name, last_name: p.last_name, center_id: p.center_id });
    }
  }

  // 센터 이름/매니저(표시용). 단가는 rate_schedules에서.
  const { data: centerData } = await admin.from("centers").select("id, name, manager_name");
  const centerById = new Map<string, { name: string; manager: string | null }>();
  for (const c of (centerData ?? []) as { id: string; name: string; manager_name: string | null }[]) {
    centerById.set(c.id, { name: c.name, manager: c.manager_name });
  }

  // 단가 적용일 이력 전량(정산 역산 소스).
  const { data: rsData } = await admin.from("rate_schedules").select("id, scope, scope_id, price_per_session, currency, effective_from, note");
  const rateSchedules: RateRow[] = (
    (rsData ?? []) as {
      id: string;
      scope: "center" | "teacher";
      scope_id: string;
      price_per_session: number | string | null;
      currency: string | null;
      effective_from: string;
      note: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    scope: r.scope,
    scopeId: r.scope_id,
    price: r.price_per_session == null ? null : Number(r.price_per_session), // numeric은 문자열로 올 수 있음
    currency: r.currency,
    effectiveFrom: r.effective_from,
    note: r.note,
  }));

  const { data: rateRows } = await admin
    .from("settings")
    .select("key, value")
    .in(
      "key",
      FOREIGN_CURRENCIES.map((f) => f.settingKey),
    );
  const rates = ratesFromSettings(rateRows as { key: string; value: string | null }[] | null);

  const rows: SettlementRow[] = classes.map((c) => {
    const prof = profileById.get(c.teacher_id);
    const fullName = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim();
    const teacherName = fullName || c.teacher_name || "강사";
    const center = prof?.center_id ? centerById.get(prof.center_id) : undefined;
    // 수업 날짜 기준 유효 단가 역산(강사 개별 > 센터, price=null=센터 복귀).
    const { price, currency, isCustom } = effectiveRate(rateSchedules, c.teacher_id, prof?.center_id ?? null, c.session_date);
    return {
      id: c.id,
      teacherId: c.teacher_id,
      teacherName,
      centerId: prof?.center_id ?? null,
      centerName: center?.name ?? null,
      centerManager: center?.manager ?? null,
      course: c.course,
      courseTitle: c.course_title,
      sessionDate: c.session_date,
      startMin: c.start_min,
      studentName: c.student_name,
      studentEnglishName: c.student_english_name,
      isMakeup: c.is_makeup,
      pricePerSession: price,
      currency: price == null ? null : normalizeCurrency(currency),
      isCustomRate: isCustom,
    };
  });

  return <SettlementsManager rows={rows} rates={rates} />;
}
