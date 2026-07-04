import { createAdminClient } from "@/utils/supabase/admin";
import SettlementsManager, { type SettlementRow } from "@/components/admin/SettlementsManager";
import { FOREIGN_CURRENCIES, normalizeCurrency, ratesFromSettings } from "@/data/currencies";

// 강사 정산 리포트(읽기 전용). conducted_at이 찍힌(실제 진행된) 수업만 집계하고,
// 단가는 강사의 "현재" 소속 센터(profiles.center_id → centers.price_per_session)로 역산한다.
// classes에는 center/price 스냅샷이 없으므로 현재 소속 센터 기준(소급 변동 수용).
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

  // 강사 프로필(현재 소속 센터·이름).
  const teacherIds = Array.from(new Set(classes.map((c) => c.teacher_id)));
  const profileById = new Map<string, { first_name: string | null; last_name: string | null; center_id: string | null }>();
  if (teacherIds.length > 0) {
    const { data: profData } = await admin.from("profiles").select("id, first_name, last_name, center_id").in("id", teacherIds);
    for (const p of (profData ?? []) as { id: string; first_name: string | null; last_name: string | null; center_id: string | null }[]) {
      profileById.set(p.id, { first_name: p.first_name, last_name: p.last_name, center_id: p.center_id });
    }
  }

  // 센터 단가/통화/매니저 + 페소 환율.
  const { data: centerData } = await admin.from("centers").select("id, name, price_per_session, price_currency, manager_name");
  const centerById = new Map<string, { name: string; price: number | null; currency: string | null; manager: string | null }>();
  for (const c of (centerData ?? []) as {
    id: string;
    name: string;
    price_per_session: number | null;
    price_currency: string | null;
    manager_name: string | null;
  }[]) {
    // numeric 컬럼은 문자열로 올 수 있어 price를 숫자로 강제(null 보존).
    centerById.set(c.id, { name: c.name, price: c.price_per_session == null ? null : Number(c.price_per_session), currency: c.price_currency, manager: c.manager_name });
  }
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
    const priced = center && center.price != null;
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
      pricePerSession: priced ? center!.price! : null,
      currency: priced ? normalizeCurrency(center!.currency) : null,
    };
  });

  return <SettlementsManager rows={rows} rates={rates} />;
}
