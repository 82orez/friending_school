"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { getOrigin } from "@/lib/origin";
import {
  sendTeacherApprovalNotification,
  sendTeacherRejectionNotification,
  sendClassCancellationToTeacher,
  sendCourseReassignToNewTeacher,
  sendCourseReassignToOldTeacher,
} from "@/lib/mailer";
import { FOREIGN_CURRENCIES, normalizeCurrency } from "@/data/currencies";
import { getCourse } from "@/data/courses";
import { COURSE_PRICE_KRW } from "@/data/pricing";
import { sendSms } from "@/lib/sms";
import {
  enumerateLessonSessions,
  isValidSlot,
  teacherHasAllSlots,
  fmtTime,
  summarizeSlots,
  lessonEndMin,
  SLOT_MIN,
  LESSON_MIN,
  type Slot,
} from "@/lib/availability";
import { kstDateMinToMs } from "@/lib/classtime";
import { todayKst } from "@/lib/booking";
import { createMakeupClass, weekdayOf, addDaysStr, type ClassForMakeup } from "@/lib/makeup";
import { resolveCenterId } from "@/lib/center";
import { logEnrollmentEvent } from "@/lib/events";
import { finalizeEnrollmentPayment, refundEnrollmentPayment } from "@/lib/payment";
import { cancelPortonePayment } from "@/lib/portone";
import { reassignClassCore } from "@/lib/reassign";
import { loadSettlementRows } from "@/lib/settlements";
import { fxRateAt, type FxRow } from "@/lib/fx";

export type ActionResult = { ok: boolean; error?: string };

// 모든 admin 액션의 진입 가드 — 세션 클라이언트로 admin 확인 후에만 service_role 쓰기 허용.
// 성공 시 admin user id 반환(감사 로그 actor_id용), 실패 시 null. 호출부 `if (!(await requireAdmin()))`는
// null=falsy / uuid=truthy로 동작 불변(requireTeacher와 동일 규약).
async function requireAdmin(): Promise<string | null> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return (await isAdmin(supabase, user.id)) ? user.id : null;
}

/* ===== 유튜브 관리 ===== */

export async function addYoutubeVideo(input: { tag: string; url: string; title: string; description: string }): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const url = input.url?.trim();
  const title = input.title?.trim();
  if (!url || !title) return { ok: false, error: "제목과 URL은 필수입니다." };

  const admin = createAdminClient();
  // 새 영상은 맨 뒤로 (현재 최대 sort_order + 1)
  const { data: maxRow } = await admin.from("youtube_videos").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const { error } = await admin.from("youtube_videos").insert({
    tag: input.tag?.trim() || "",
    url,
    title,
    description: input.description?.trim() || "",
    sort_order: nextOrder,
  });
  if (error) return { ok: false, error: "등록 중 오류가 발생했습니다." };

  revalidatePath("/admin/youtube");
  revalidatePath("/");
  return { ok: true };
}

export async function updateYoutubeVideo(id: string, input: { tag: string; url: string; title: string; description: string }): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const url = input.url?.trim();
  const title = input.title?.trim();
  if (!id || !url || !title) return { ok: false, error: "제목과 URL은 필수입니다." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("youtube_videos")
    .update({ tag: input.tag?.trim() || "", url, title, description: input.description?.trim() || "" })
    .eq("id", id);
  if (error) return { ok: false, error: "수정 중 오류가 발생했습니다." };

  revalidatePath("/admin/youtube");
  revalidatePath("/");
  return { ok: true };
}

export async function setYoutubeVisibility(id: string, isVisible: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("youtube_videos").update({ is_visible: isVisible }).eq("id", id);
  if (error) return { ok: false, error: "변경 중 오류가 발생했습니다." };

  revalidatePath("/admin/youtube");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteYoutubeVideo(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("youtube_videos").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제 중 오류가 발생했습니다." };

  revalidatePath("/admin/youtube");
  revalidatePath("/");
  return { ok: true };
}

/* ===== 센터 관리 ===== */

// 센터 추가/수정/삭제 시 드롭다운·표시가 쓰이는 경로를 함께 갱신.
function revalidateCenterConsumers() {
  revalidatePath("/admin/centers");
  revalidatePath("/teacher/apply");
  revalidatePath("/teacher", "layout");
  revalidatePath("/admin/teacher-requests");
}

/* ===== 외화 환율 적용일 이력(exchange_rate_schedules) ===== */

// FX 환율 정규화: 빈 값/비숫자/≤0 → null. numeric(12,4) → 소수 넷째자리까지 반올림.
function normalizeFxRate(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10000) / 10000;
}

// 통화의 오늘 기준 유효 환율을 settings.<settingKey> 캐시에 동기화 → 기존 현재값 소비처(ratesFromSettings) 무변경 동작.
async function syncFxCache(admin: ReturnType<typeof createAdminClient>, currency: string) {
  const foreign = FOREIGN_CURRENCIES.find((f) => f.code === currency);
  if (!foreign) return;
  const { data } = await admin
    .from("exchange_rate_schedules")
    .select("rate_to_krw, effective_from")
    .eq("currency", currency)
    .lte("effective_from", todayKst())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rate = data?.rate_to_krw == null ? 0 : Number(data.rate_to_krw);
  await admin.from("settings").upsert({ key: foreign.settingKey, value: String(rate) }, { onConflict: "key" });
}

// 환율 변경은 정산·매출·이익·센터 카드에 영향.
function revalidateFxConsumers() {
  revalidatePath("/admin/centers");
  revalidatePath("/admin/settlements");
  revalidatePath("/admin/revenue");
  revalidatePath("/admin/profit");
  revalidatePath("/center/settlements");
}

// 환율 이력 행 추가.
export async function addExchangeRateSchedule(currency: string, rateRaw: string, effectiveFrom: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const foreign = FOREIGN_CURRENCIES.find((f) => f.code === currency);
  if (!foreign || !EFFECTIVE_DATE_RE.test(effectiveFrom)) return { ok: false, error: "잘못된 요청입니다." };
  const rate = normalizeFxRate(rateRaw);
  if (rate == null) return { ok: false, error: "유효한 환율을 입력하세요." };

  const admin = createAdminClient();
  const { error } = await admin.from("exchange_rate_schedules").upsert(
    { currency, rate_to_krw: rate, effective_from: effectiveFrom },
    { onConflict: "currency,effective_from" }, // 같은 적용일이면 덮어쓰기
  );
  if (error) return { ok: false, error: "환율 추가 중 오류가 발생했습니다." };

  await syncFxCache(admin, currency);
  revalidateFxConsumers();
  return { ok: true };
}

// 환율 이력 행 수정(환율·적용일).
export async function updateExchangeRateSchedule(id: string, rateRaw: string, effectiveFrom: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id || !EFFECTIVE_DATE_RE.test(effectiveFrom)) return { ok: false, error: "잘못된 요청입니다." };
  const rate = normalizeFxRate(rateRaw);
  if (rate == null) return { ok: false, error: "유효한 환율을 입력하세요." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("exchange_rate_schedules").select("currency").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "환율 이력을 찾을 수 없습니다." };
  const currency = (existing as { currency: string }).currency;

  const { error } = await admin.from("exchange_rate_schedules").update({ rate_to_krw: rate, effective_from: effectiveFrom }).eq("id", id);
  if (error) return { ok: false, error: "환율 수정 중 오류가 발생했습니다." };

  await syncFxCache(admin, currency);
  revalidateFxConsumers();
  return { ok: true };
}

// 환율 이력 행 삭제.
export async function deleteExchangeRateSchedule(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("exchange_rate_schedules").select("currency").eq("id", id).maybeSingle();
  if (!existing) return { ok: true }; // 이미 없음
  const currency = (existing as { currency: string }).currency;

  const { error } = await admin.from("exchange_rate_schedules").delete().eq("id", id);
  if (error) return { ok: false, error: "환율 삭제 중 오류가 발생했습니다." };

  await syncFxCache(admin, currency);
  revalidateFxConsumers();
  return { ok: true };
}

/* ===== 월간 강사 정산 확정(teacher_settlements) ===== */

const PERIOD_MONTH_RE = /^\d{4}-\d{2}$/;
type AdjustmentInput = { label: string; amount: number | string; currency: string };

// 'YYYY-MM' → 그 달의 시작·말일('YYYY-MM-DD').
function monthBounds(periodMonth: string): { start: string; end: string } {
  const [y, m] = periodMonth.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // 다음 달 0일 = 말일
  return { start: `${periodMonth}-01`, end };
}

// 환율 이력 로드(조정 항목 KRW 환산용).
async function loadFxRows(admin: ReturnType<typeof createAdminClient>): Promise<FxRow[]> {
  const { data } = await admin.from("exchange_rate_schedules").select("id, currency, rate_to_krw, effective_from, note");
  return ((data ?? []) as { id: string; currency: string; rate_to_krw: number | string; effective_from: string; note: string | null }[]).map((r) => ({
    id: r.id,
    currency: r.currency,
    rate: Number(r.rate_to_krw),
    effectiveFrom: r.effective_from,
    note: r.note,
  }));
}

// 그 강사·월의 기본 정산액 서버 재계산(진행 수업 수·통화별 native 합·원화 합).
async function computeMonthlyBase(admin: ReturnType<typeof createAdminClient>, teacherId: string, periodMonth: string) {
  const { start, end } = monthBounds(periodMonth);
  const { rows } = await loadSettlementRows(admin, [teacherId]);
  const inMonth = rows.filter((r) => r.sessionDate >= start && r.sessionDate <= end);
  const baseNative: Record<string, number> = {};
  let baseKrw = 0;
  for (const r of inMonth) {
    if (r.pricePerSession != null && r.currency) {
      baseNative[r.currency] = (baseNative[r.currency] ?? 0) + r.pricePerSession;
      baseKrw += r.krwPerSession ?? 0;
    }
  }
  // 지급 통화 = 원화 환산액이 가장 큰 통화(단일이면 그 통화, 없으면 null).
  const currency = Object.keys(baseNative).sort((a, b) => (baseNative[b] ?? 0) - (baseNative[a] ?? 0))[0] ?? null;
  return { sessionsCount: inMonth.length, baseNative, baseKrw: Math.round(baseKrw), currency, baseAmount: currency ? baseNative[currency] : null };
}

// 조정 항목 정규화 + 확정 시점 환율로 KRW 스냅샷.
function normalizeAdjustments(adjustments: AdjustmentInput[], fxRows: FxRow[], asOfDate: string) {
  const out: { label: string; amount: number; currency: string; krw: number }[] = [];
  for (const a of adjustments ?? []) {
    const label = (a.label ?? "").trim();
    const amount = Number(a.amount);
    if (!label || !Number.isFinite(amount) || amount === 0) continue;
    const currency = normalizeCurrency(a.currency);
    const krw = currency === "KRW" ? Math.round(amount) : Math.round(amount * fxRateAt(fxRows, currency, asOfDate));
    out.push({ label: label.slice(0, 60), amount, currency, krw });
  }
  return out;
}

function normalizeKrwOverride(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// 월간 정산 확정(스냅샷). 마감 월(월말 < 오늘)만 허용. 재확정 시 스냅샷 갱신.
export async function confirmMonthlySettlement(
  teacherId: string,
  periodMonth: string,
  input: { adjustments: AdjustmentInput[]; totalKrwOverride?: number | string | null; note?: string | null },
): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  if (!teacherId || !PERIOD_MONTH_RE.test(periodMonth)) return { ok: false, error: "잘못된 요청입니다." };
  const { end } = monthBounds(periodMonth);
  if (!(end < todayKst())) return { ok: false, error: "마감된 지난 달만 확정할 수 있습니다." };

  const admin = createAdminClient();
  const base = await computeMonthlyBase(admin, teacherId, periodMonth);
  const fxRows = await loadFxRows(admin);
  const adjustments = normalizeAdjustments(input.adjustments, fxRows, end);
  const adjKrw = adjustments.reduce((s, a) => s + a.krw, 0);
  const override = normalizeKrwOverride(input.totalKrwOverride);
  const totalKrw = override ?? base.baseKrw + adjKrw;

  const { error } = await admin.from("teacher_settlements").upsert(
    {
      teacher_id: teacherId,
      period_month: periodMonth,
      sessions_count: base.sessionsCount,
      currency: base.currency,
      base_amount: base.baseAmount,
      base_krw: base.baseKrw,
      base_native: base.baseNative,
      adjustments,
      total_krw: totalKrw,
      status: "확정",
      note: normalizeText(input.note),
      confirmed_by: adminId,
      confirmed_at: new Date().toISOString(),
      paid_at: null,
    },
    { onConflict: "teacher_id,period_month" },
  );
  if (error) return { ok: false, error: "정산 확정 중 오류가 발생했습니다." };

  revalidatePath("/admin/settlements");
  return { ok: true };
}

// 확정 레코드의 조정/실지급액/메모 수정(재계산 없이). 지급완료 상태는 잠금.
export async function updateMonthlySettlement(
  id: string,
  input: { adjustments: AdjustmentInput[]; totalKrwOverride?: number | string | null; note?: string | null },
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("teacher_settlements").select("status, base_krw, period_month").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "정산 내역을 찾을 수 없습니다." };
  const row = existing as { status: string; base_krw: number; period_month: string };
  if (row.status !== "확정") return { ok: false, error: "지급완료 상태는 수정할 수 없습니다. 먼저 되돌려 주세요." };

  const { end } = monthBounds(row.period_month);
  const fxRows = await loadFxRows(admin);
  const adjustments = normalizeAdjustments(input.adjustments, fxRows, end);
  const adjKrw = adjustments.reduce((s, a) => s + a.krw, 0);
  const override = normalizeKrwOverride(input.totalKrwOverride);
  const totalKrw = override ?? Number(row.base_krw) + adjKrw;

  const { error } = await admin
    .from("teacher_settlements")
    .update({ adjustments, total_krw: totalKrw, note: normalizeText(input.note) })
    .eq("id", id)
    .eq("status", "확정");
  if (error) return { ok: false, error: "정산 수정 중 오류가 발생했습니다." };

  revalidatePath("/admin/settlements");
  return { ok: true };
}

// 지급완료 처리(송금일 기록). 확정 상태만.
export async function markSettlementPaid(id: string, paidAt: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id || !EFFECTIVE_DATE_RE.test(paidAt)) return { ok: false, error: "송금일을 입력하세요." };

  const admin = createAdminClient();
  const { error } = await admin.from("teacher_settlements").update({ status: "지급완료", paid_at: paidAt }).eq("id", id).eq("status", "확정");
  if (error) return { ok: false, error: "지급 완료 처리 중 오류가 발생했습니다." };

  revalidatePath("/admin/settlements");
  return { ok: true };
}

// 지급완료 → 확정으로 되돌리기(수정 재개).
export async function reopenSettlement(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("teacher_settlements").update({ status: "확정", paid_at: null }).eq("id", id);
  if (error) return { ok: false, error: "되돌리기 중 오류가 발생했습니다." };

  revalidatePath("/admin/settlements");
  return { ok: true };
}

// 확정 취소(레코드 삭제). 미확정 상태로 되돌림.
export async function unconfirmMonthlySettlement(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("teacher_settlements").delete().eq("id", id);
  if (error) return { ok: false, error: "확정 취소 중 오류가 발생했습니다." };

  revalidatePath("/admin/settlements");
  return { ok: true };
}

// 단가 입력 정규화: 빈 값/비숫자/음수 → null. USD는 소수 첫째자리까지, 그 외 통화는 정수로 내림.
function normalizePrice(raw: number | string | null | undefined, currency?: string | null): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return normalizeCurrency(currency) === "USD" ? Math.round(n * 10) / 10 : Math.floor(n);
}

// 매니저 이름 등 선택 텍스트 필드 정규화: trim 후 빈 값 → null.
function normalizeText(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  return t ? t : null;
}

export async function addCenter(
  name: string,
  price?: number | string | null,
  currency?: string | null,
  managerName?: string | null,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const clean = name?.trim();
  if (!clean) return { ok: false, error: "센터 이름은 필수입니다." };

  const admin = createAdminClient();
  // 새 센터는 목록 끝으로 (sort_order 자동 증가).
  const { data: maxRow } = await admin.from("centers").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

  const priceNum = normalizePrice(price, currency);
  const cur = normalizeCurrency(currency);
  const { data: inserted, error } = await admin
    .from("centers")
    .insert({ name: clean, sort_order: nextOrder, price_per_session: priceNum, price_currency: cur, manager_name: normalizeText(managerName) })
    .select("id")
    .single();
  if (error || !inserted) return { ok: false, error: "등록 중 오류가 발생했습니다." };

  // 초기 단가가 있으면 이력에도 (effective_from=오늘) 1행 기록 → 정산 역산의 시작점.
  if (priceNum != null) {
    await admin
      .from("rate_schedules")
      .insert({ scope: "center", scope_id: (inserted as { id: string }).id, price_per_session: priceNum, currency: cur, effective_from: todayKst() });
  }

  revalidateCenterConsumers();
  return { ok: true };
}

// 센터 이름·매니저만 수정. 단가·통화는 rate_schedules 이력 편집(RateHistoryEditor)으로 관리.
export async function updateCenter(id: string, name: string, managerName?: string | null, managerId?: string | null): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const clean = name?.trim();
  if (!id || !clean) return { ok: false, error: "센터 이름은 필수입니다." };

  const admin = createAdminClient();

  // 매니저 계정 검증 — 지정 시 실제 존재하는 사용자여야 함(빈/null=지정 해제).
  const mid = String(managerId ?? "").trim() || null;
  if (mid) {
    const { data: u } = await admin.auth.admin.getUserById(mid);
    if (!u?.user) return { ok: false, error: "매니저 계정을 찾을 수 없습니다." };
  }

  const { error } = await admin
    .from("centers")
    .update({ name: clean, manager_name: normalizeText(managerName), manager_id: mid })
    .eq("id", id);
  if (error) return { ok: false, error: "수정 중 오류가 발생했습니다." };

  revalidateCenterConsumers();
  return { ok: true };
}

export async function deleteCenter(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  // FK on delete set null이라 참조 중인 강사 신청서·프로필은 자동으로 center_id가 비워짐("None").
  const admin = createAdminClient();
  const { error } = await admin.from("centers").delete().eq("id", id);
  if (error) return { ok: false, error: "삭제 중 오류가 발생했습니다." };

  revalidateCenterConsumers();
  return { ok: true };
}

// 강사 상세 모달에서 소속 센터 변경. centerRaw="none"=소속 없음, 그 외는 uuid 존재 검증(resolveCenterId).
// 센터는 정산 단가 기준이라 정산 화면도 함께 갱신. 반환 centerId로 클라가 표시명 낙관적 갱신.
export async function updateTeacherCenter(userId: string, centerRaw: string): Promise<ActionResult & { centerId?: string | null }> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!userId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!prof || (prof as { role?: string }).role !== "teacher") return { ok: false, error: "강사를 찾을 수 없습니다." };

  const centerId = centerRaw === "none" ? null : await resolveCenterId(admin, centerRaw);
  if (centerRaw !== "none" && !centerId) return { ok: false, error: "유효하지 않은 센터입니다." };

  const { error } = await admin.from("profiles").update({ center_id: centerId }).eq("id", userId);
  if (error) return { ok: false, error: "센터 변경 중 오류가 발생했습니다." };

  revalidatePath("/admin/teacher-requests");
  revalidatePath("/teacher", "layout");
  revalidatePath("/admin/settlements");
  return { ok: true, centerId };
}

/* ===== 정산 단가 적용일 이력(rate_schedules) ===== */

const EFFECTIVE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// scope_id의 오늘 기준 유효 단가로 캐시 컬럼(centers/profiles) 동기화. 미래 적용일 행은 오늘 기준 제외돼 반영 안 됨.
async function syncRateCache(admin: ReturnType<typeof createAdminClient>, scope: "center" | "teacher", scopeId: string) {
  const { data } = await admin
    .from("rate_schedules")
    .select("price_per_session, currency, effective_from")
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .lte("effective_from", todayKst())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const price = data?.price_per_session == null ? null : Number(data.price_per_session);
  const currency = price == null ? null : (data?.currency ?? null);
  if (scope === "center") {
    await admin
      .from("centers")
      .update({ price_per_session: price, price_currency: currency ?? "KRW" })
      .eq("id", scopeId);
  } else {
    await admin.from("profiles").update({ custom_price_per_session: price, custom_price_currency: currency }).eq("id", scopeId);
  }
}

// 대상(센터/강사) 존재·역할 검증.
async function validateRateScope(admin: ReturnType<typeof createAdminClient>, scope: "center" | "teacher", scopeId: string): Promise<string | null> {
  if (scope === "center") {
    const { data } = await admin.from("centers").select("id").eq("id", scopeId).maybeSingle();
    return data ? null : "센터를 찾을 수 없습니다.";
  }
  const { data } = await admin.from("profiles").select("role").eq("id", scopeId).maybeSingle();
  return data && (data as { role?: string }).role === "teacher" ? null : "강사를 찾을 수 없습니다.";
}

function revalidateRateConsumers() {
  revalidatePath("/admin/centers");
  revalidatePath("/admin/settlements");
  revalidatePath("/admin/teacher-requests");
}

// 단가 이력 행 추가. center scope는 price 필수, teacher scope는 빈 price=null=그 날짜부터 센터 단가 사용.
export async function addRateSchedule(
  scope: "center" | "teacher",
  scopeId: string,
  priceRaw: string,
  currencyRaw: string,
  effectiveFrom: string,
  note: string,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if ((scope !== "center" && scope !== "teacher") || !scopeId || !EFFECTIVE_DATE_RE.test(effectiveFrom))
    return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const invalid = await validateRateScope(admin, scope, scopeId);
  if (invalid) return { ok: false, error: invalid };

  const currency = normalizeCurrency(currencyRaw);
  const price = normalizePrice(priceRaw, currency);
  if (scope === "center" && price == null) return { ok: false, error: "단가를 입력하세요." };

  const { error } = await admin.from("rate_schedules").insert({
    scope,
    scope_id: scopeId,
    price_per_session: price,
    currency: price == null ? null : currency,
    effective_from: effectiveFrom,
    note: normalizeText(note),
  });
  if (error) return { ok: false, error: "단가 추가 중 오류가 발생했습니다." };

  await syncRateCache(admin, scope, scopeId);
  revalidateRateConsumers();
  return { ok: true };
}

// 단가 이력 행 수정.
export async function updateRateSchedule(
  id: string,
  priceRaw: string,
  currencyRaw: string,
  effectiveFrom: string,
  note: string,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id || !EFFECTIVE_DATE_RE.test(effectiveFrom)) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("rate_schedules").select("scope, scope_id").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "이력을 찾을 수 없습니다." };
  const row = existing as { scope: "center" | "teacher"; scope_id: string };

  const currency = normalizeCurrency(currencyRaw);
  const price = normalizePrice(priceRaw, currency);
  if (row.scope === "center" && price == null) return { ok: false, error: "단가를 입력하세요." };

  const { error } = await admin
    .from("rate_schedules")
    .update({ price_per_session: price, currency: price == null ? null : currency, effective_from: effectiveFrom, note: normalizeText(note) })
    .eq("id", id);
  if (error) return { ok: false, error: "단가 수정 중 오류가 발생했습니다." };

  await syncRateCache(admin, row.scope, row.scope_id);
  revalidateRateConsumers();
  return { ok: true };
}

// 단가 이력 행 삭제.
export async function deleteRateSchedule(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("rate_schedules").select("scope, scope_id").eq("id", id).maybeSingle();
  if (!existing) return { ok: true }; // 이미 없음
  const row = existing as { scope: "center" | "teacher"; scope_id: string };

  const { error } = await admin.from("rate_schedules").delete().eq("id", id);
  if (error) return { ok: false, error: "단가 삭제 중 오류가 발생했습니다." };

  await syncRateCache(admin, row.scope, row.scope_id);
  revalidateRateConsumers();
  return { ok: true };
}

/* ===== 강사 삭제 ===== */

// 강사 계정 전체 삭제 (teacher-requests "현재 강사" 목록에서 호출). 되돌리기(→student)는 데이터가 지저분해져 폐지.
// auth 계정 삭제 → FK cascade로 profiles·teacher_applications·teacher_availability·reading_progress 일괄 제거.
// applications(상담신청)은 on delete set null이라 익명 리드로 보존. 아바타 Storage 파일은 cascade 비대상이라 명시 정리.
export async function deleteTeacher(userId: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!userId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();

  // admin 계정 삭제 방지 (방어).
  const { data: current } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if ((current as { role?: string } | null)?.role === "admin") {
    return { ok: false, error: "관리자 계정은 삭제할 수 없습니다." };
  }

  // 아바타 Storage 정리 (best-effort) — cascade 비대상이라 명시 삭제.
  try {
    const { data: files } = await admin.storage.from("avatars").list(userId);
    const paths = (files ?? []).map((f) => `${userId}/${f.name}`);
    if (paths.length > 0) await admin.storage.from("avatars").remove(paths);
  } catch (err) {
    console.error("[deleteTeacher] 아바타 정리 실패:", err);
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: "강사 삭제 중 오류가 발생했습니다." };

  revalidatePath("/admin/teacher-requests");
  revalidatePath("/teacher", "layout");
  return { ok: true };
}

/* ===== 수강신청 관리 ===== */

// 관리자 강제 취소 — 상태 '신청'/'승인'/'결제대기'일 때만. 성공 시 학생에게 SMS 통보(best-effort).
// 슬롯은 동적 차감이라('승인'·'결제대기'가 강사 가용 소비) 취소 즉시 자동 해제.
export async function adminCancelEnrollment(id: string, note: string): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const enrollmentId = String(id ?? "").trim();
  const reason = String(note ?? "").trim();
  if (!enrollmentId) return { ok: false, error: "잘못된 요청입니다." };
  if (!reason) return { ok: false, error: "취소 사유를 입력해 주세요." };

  const admin = createAdminClient();
  const { data: enr } = await admin
    .from("enrollments")
    .select("status, student_phone, course, course_title, student_name, teacher_name")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enr) return { ok: false, error: "신청을 찾을 수 없습니다." };
  if (enr.status !== "신청" && enr.status !== "승인" && enr.status !== "결제대기") return { ok: false, error: "취소할 수 없는 상태입니다." };

  const { data, error } = await admin
    .from("enrollments")
    .update({ status: "취소", teacher_note: `[관리자] ${reason}`.slice(0, 1000) })
    .eq("id", enrollmentId)
    .in("status", ["신청", "승인", "결제대기"])
    .select("id");
  if (error) return { ok: false, error: "취소 처리 중 오류가 발생했습니다." };
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 신청입니다." };

  // 학생 결과 SMS (best-effort).
  if (enr.student_phone) {
    try {
      await sendSms(enr.student_phone, `[프렌딩 스쿨] 수강신청이 취소되었습니다. ${enr.course_title}. 사유: ${reason}`);
    } catch (err) {
      console.error("[adminCancelEnrollment] SMS 발송 실패:", err);
    }
  }

  await logEnrollmentEvent(admin, {
    enrollmentId,
    eventType: "enrollment_cancelled",
    actorId: adminId,
    actorRole: "admin",
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: enr.teacher_name,
    detail: { reason, fromStatus: enr.status },
  });

  revalidatePath("/admin/enrollments");
  revalidatePath("/admin/classes");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

// 날짜(로컬 Date) → 'YYYY-MM-DD'. enroll-actions의 종료일 포맷과 동일.
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 입금 확인(무통장 1단계) — 상태 '결제대기'일 때만 '결제완료'로 전환. 성공 시 클래스 생성 + 학생에게 SMS 통보(best-effort).
// 회사 계좌 입금이라 확인 주체는 admin. 결제 확정 코어는 `finalizeEnrollmentPayment`(src/lib/payment.ts)로 공유
// (학생 PortOne 카드 결제 confirmPortonePayment와 동일 로직 재사용). 향후 PG 웹훅도 이 코어를 호출.
export async function confirmPayment(id: string, opts?: { amount?: number; note?: string }): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const enrollmentId = String(id ?? "").trim();
  if (!enrollmentId) return { ok: false, error: "잘못된 요청입니다." };

  // 유효가격 = enrollment.price_krw ?? 전역 고정가. 실입금액 캡의 상한.
  const admin = createAdminClient();
  const { data: enr } = await admin.from("enrollments").select("price_krw").eq("id", enrollmentId).maybeSingle();
  const effectivePrice = enr?.price_krw ?? COURSE_PRICE_KRW;

  // 실입금액(무통장) — 미지정=정가, 지정 시 1~정가 범위(정가 초과 방지, 할인만 허용).
  let amount: number | undefined;
  if (opts?.amount != null) {
    amount = Math.floor(Number(opts.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > effectivePrice) return { ok: false, error: "입금액이 올바르지 않습니다." };
  }
  const note = (opts?.note ?? "").trim().slice(0, 500) || undefined;

  return finalizeEnrollmentPayment(enrollmentId, { id: adminId, role: "admin" }, { amount, note });
}

// 무통장 결제 실입금액·메모 사후 재조정(확정 후 정정) — 매출(payments.amount/note)에 직접 반영.
// 카드(PG authoritative)·환불된 결제는 거부. 재조정 이력은 감사 로그(payment_adjusted)로 남긴다.
export async function adjustBankPayment(paymentId: string, opts: { amount: number; note?: string }): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const pid = String(paymentId ?? "").trim();
  if (!pid) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: pay } = await admin
    .from("payments")
    .select("payment_id, enrollment_id, method, status, amount, note")
    .eq("payment_id", pid)
    .maybeSingle();
  if (!pay) return { ok: false, error: "결제 기록을 찾을 수 없습니다." };
  // 무통장만 수정 가능(카드는 PG 금액 authoritative).
  if (pay.method !== "bank_transfer" && !String(pay.payment_id).startsWith("bank-"))
    return { ok: false, error: "카드 결제는 금액을 수정할 수 없습니다." };
  // 환불/부분환불 건은 정산 정합성 위해 차단.
  if (pay.status !== "paid") return { ok: false, error: "환불된 결제는 수정할 수 없습니다." };

  // enrollment 스냅샷 — 유효가격(정가) 캡 + 감사 로그(best-effort) 공용 조회.
  const { data: enr } = pay.enrollment_id
    ? await admin.from("enrollments").select("course, course_title, student_name, teacher_name, price_krw").eq("id", pay.enrollment_id).maybeSingle()
    : { data: null };
  const effectivePrice = enr?.price_krw ?? COURSE_PRICE_KRW; // 실입금액 캡 상한

  const amount = Math.floor(Number(opts.amount));
  if (!Number.isFinite(amount) || amount < 1 || amount > effectivePrice) return { ok: false, error: "입금액이 올바르지 않습니다." };
  const note = (opts.note ?? "").trim().slice(0, 500) || null;

  const { error } = await admin.from("payments").update({ amount, note }).eq("payment_id", pid);
  if (error) return { ok: false, error: "결제 수정 중 오류가 발생했습니다." };

  await logEnrollmentEvent(admin, {
    enrollmentId: pay.enrollment_id,
    eventType: "payment_adjusted",
    actorId: adminId,
    actorRole: "admin",
    course: enr?.course,
    courseTitle: enr?.course_title,
    studentName: enr?.student_name,
    teacherName: enr?.teacher_name,
    detail: { oldAmount: pay.amount, newAmount: amount, oldNote: pay.note ?? null, newNote: note },
  });

  revalidatePath("/admin/enrollments");
  revalidatePath("/admin/revenue");
  return { ok: true }; // 클라는 전송한 amount/note로 낙관 갱신
}

// 환불(전액/부분) — 결제완료 enrollment의 카드 결제를 PortOne 취소 후 DB 동기화(수강 취소 + 미래 수업 취소).
export async function refundPayment(enrollmentId: string, opts: { reason: string; amount?: number }): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const id = String(enrollmentId ?? "").trim();
  const reason = String(opts?.reason ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (!reason) return { ok: false, error: "환불 사유를 입력해 주세요." };

  const admin = createAdminClient();
  const { data: payments } = await admin
    .from("payments")
    .select("payment_id, enrollment_id, amount, cancelled_amount, status, method")
    .eq("enrollment_id", id)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1);
  const payment = payments?.[0];
  if (!payment) return { ok: false, error: "환불할 결제 내역이 없습니다." };

  const remaining = (payment.amount ?? 0) - (payment.cancelled_amount ?? 0);
  const refundAmount = typeof opts.amount === "number" && opts.amount > 0 ? Math.floor(opts.amount) : remaining;
  if (refundAmount <= 0 || refundAmount > remaining) return { ok: false, error: "환불 금액이 올바르지 않습니다." };

  // 무통장 입금은 PG 취소 불가(실제 환불=계좌 수동 송금) → PortOne 취소 건너뛰고 DB 동기화만.
  const isBank = payment.method === "bank_transfer" || payment.payment_id?.startsWith("bank-");
  if (!isBank) {
    // PortOne 취소(부분이면 amount 지정, 잔액 전부면 미지정=잔액 전액 취소).
    const cancel = await cancelPortonePayment(payment.payment_id, { reason, amount: refundAmount < remaining ? refundAmount : undefined });
    if (!cancel.ok) return { ok: false, error: cancel.error ?? "환불 처리에 실패했습니다." };
  }

  const totalCancelled = (payment.cancelled_amount ?? 0) + refundAmount;
  return refundEnrollmentPayment(admin, {
    payment: { payment_id: payment.payment_id, enrollment_id: payment.enrollment_id, amount: payment.amount },
    totalCancelledAmount: totalCancelled,
    reason,
    actor: { id: adminId, role: "admin" },
  });
}

/* ===== 화상수업(클래스) 관리 ===== */

// admin이 조회·관리하는 클래스 행에 필요한 필드(액션 내부 로드용).
const CLASS_MANAGE_SELECT =
  "id, enrollment_id, student_id, teacher_id, original_teacher_id, course, course_title, teacher_name, student_name, student_english_name, session_no, session_date, start_min, end_min, status, is_makeup, conducted_at, conducted_override";

// 수업 진행 여부 수동 보정(admin) — 종료된 수업만. override: true=강제 진행됨 / false=강제 미진행 / null=자동 판정 복귀.
// conducted_at(자동 신호)은 건드리지 않고 conducted_override로 위에 얹는다. 유효값=override ?? (conducted_at!=null).
export async function adminSetClassConducted(classId: string, override: boolean | null): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const id = String(classId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (override !== true && override !== false && override !== null) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: cls } = await admin
    .from("classes")
    .select("id, enrollment_id, course, course_title, student_name, teacher_name, session_no, session_date, start_min, end_min, status")
    .eq("id", id)
    .maybeSingle();
  if (!cls) return { ok: false, error: "수업을 찾을 수 없습니다." };
  if (cls.status === "취소") return { ok: false, error: "취소된 수업은 진행 여부를 지정할 수 없습니다." };
  if (Date.now() < kstDateMinToMs(cls.session_date, lessonEndMin(cls.end_min))) {
    return { ok: false, error: "수업이 종료된 후에만 진행 여부를 지정할 수 있습니다." };
  }

  const { error: updErr } = await admin.from("classes").update({ conducted_override: override }).eq("id", id);
  if (updErr) return { ok: false, error: "진행 여부 저장 중 오류가 발생했습니다." };

  await logEnrollmentEvent(admin, {
    enrollmentId: cls.enrollment_id,
    classId: cls.id,
    eventType: "conducted_overridden",
    actorId: adminId,
    actorRole: "admin",
    course: cls.course,
    courseTitle: cls.course_title,
    studentName: cls.student_name,
    teacherName: cls.teacher_name,
    detail: { sessionNo: cls.session_no, sessionDate: cls.session_date, override },
  });

  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${cls.enrollment_id}`);
  revalidatePath("/admin/settlements");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

// 개별 수업 강제 취소/연기(admin) — 상태 '예정'만. 사유별 분기:
//   'student' 수강생 요구 연기(보강 O, 남은 연기 차감), 'company' 회사 사유 연기(보강 O, 차감 없음), 'cancel' 수업 취소(보강 X).
// 학생 취소와 달리 6회 한도·시작 1시간 컷오프 미적용(admin 재량 — 차감은 cancel_reason='student' 집계로 자연 반영). 강사 알림 이메일 best-effort.
export async function adminCancelClass(classId: string, reason: "student" | "company" | "cancel"): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const id = String(classId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (reason !== "student" && reason !== "company" && reason !== "cancel") return { ok: false, error: "잘못된 요청입니다." };
  const generateMakeup = reason !== "cancel";

  const admin = createAdminClient();
  const { data: cls } = await admin.from("classes").select(CLASS_MANAGE_SELECT).eq("id", id).maybeSingle();
  if (!cls) return { ok: false, error: "수업을 찾을 수 없습니다." };
  if (cls.status !== "예정") return { ok: false, error: "예정 상태의 수업만 취소할 수 있습니다." };
  // 유효 진행여부='진행됨'이면 거부(종료-미진행은 통과, 미래 예정은 conducted 없어 통과).
  if ((cls.conducted_override ?? !!cls.conducted_at) === true) return { ok: false, error: "진행 완료된 수업은 연기·취소할 수 없습니다." };

  const { data: updated, error: updErr } = await admin
    .from("classes")
    .update({ status: "취소", cancel_reason: reason })
    .eq("id", id)
    .eq("status", "예정")
    .select("id");
  if (updErr) return { ok: false, error: "취소 처리 중 오류가 발생했습니다." };
  if (!updated || updated.length === 0) return { ok: false, error: "이미 처리된 수업입니다." };

  // 보강 자동 생성(연기 모드만, best-effort).
  let makeupDate: string | undefined;
  if (generateMakeup) makeupDate = await createMakeupClass(admin, cls as ClassForMakeup);

  // 강사 알림 이메일(best-effort) — 학생 취소와 동일 메일러.
  try {
    const { data: teacherUser } = await admin.auth.admin.getUserById(cls.teacher_id);
    const teacherEmail = teacherUser?.user?.email;
    if (teacherEmail) {
      const lessonEnd = cls.end_min - (SLOT_MIN - LESSON_MIN);
      await sendClassCancellationToTeacher([teacherEmail], {
        studentName: cls.student_english_name || cls.student_name || "Student",
        courseTitle: cls.course_title,
        sessionDate: cls.session_date,
        sessionTime: `${fmtTime(cls.start_min)}~${fmtTime(lessonEnd)}`,
        makeupDate,
      });
    }
  } catch (err) {
    console.error("[adminCancelClass] 강사 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId: cls.enrollment_id,
    classId: cls.id,
    eventType: reason === "cancel" ? "class_cancelled" : "class_postponed",
    actorId: adminId,
    actorRole: "admin",
    course: cls.course,
    courseTitle: cls.course_title,
    studentName: cls.student_name,
    teacherName: cls.teacher_name,
    detail: { reason, sessionNo: cls.session_no, sessionDate: cls.session_date, makeupDate: makeupDate ?? null },
  });

  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${cls.enrollment_id}`);
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

// 개별 수업 강사 강제 대체(admin) — 상태 '예정'만. 강사 사정으로 특정 회차를 다른 강사로 교체.
// 검증·SMS·메일·감사로그는 공유 코어(reassignClassCore)에 위임(센터 매니저와 동일 로직, 제약 없음).
export async function adminReassignClass(classId: string, newTeacherId: string): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  return reassignClassCore(createAdminClient(), { classId, newTeacherId, actor: { id: adminId, role: "admin" } });
}

// 남은 수업 전체 주간 일정 일괄 변경(admin) — 담당 강사 유지, 요일·시간만.
// 남은='예정'이고 레슨 종료 시각이 아직 안 지난 미래 클래스. 과거·완료·취소는 그대로.
// 남은 회차를 session_no 오름차순으로 enumerateLessonSessions(effectiveDate,newSlots,remaining)에 1:1 remap(행 id·회차 유지).
export async function adminRescheduleRemaining(enrollmentId: string, slots: Slot[], effectiveDate: string): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const id = String(enrollmentId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  // 입력 검증 — 새 슬롯 정규화(중복 제거) + 적용 시작일.
  const seen = new Set<string>();
  const newSlots: Slot[] = (Array.isArray(slots) ? slots : []).filter(isValidSlot).reduce<Slot[]>((acc, s) => {
    const day = Number(s.day);
    const min = Number(s.min);
    const key = `${day}-${min}`;
    if (!seen.has(key)) {
      seen.add(key);
      acc.push({ day, min });
    }
    return acc;
  }, []);
  if (newSlots.length === 0) return { ok: false, error: "새 수업 요일과 시간을 선택해 주세요." };
  if (newSlots.length > 7 * 36) return { ok: false, error: "선택한 시간이 너무 많습니다." };
  const effective = String(effectiveDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effective)) return { ok: false, error: "적용 시작일을 선택해 주세요." };
  // 적용 시작일은 내일 이후만 — 오늘 배치 시 과거 시각·같은 날 중복 등 혼선 방지.
  if (effective <= todayKst()) return { ok: false, error: "적용 시작일은 내일 이후여야 합니다." };
  // 상한: 오늘부터 일주일 이내 — 남은 일정을 과도하게 먼 미래로 미는 실수 방지.
  if (effective > addDaysStr(todayKst(), 7)) return { ok: false, error: "적용 시작일은 오늘부터 일주일 이내여야 합니다." };

  const admin = createAdminClient();
  const { data: enr } = await admin
    .from("enrollments")
    .select("id, teacher_id, student_id, status, course, course_title, student_name, teacher_name, slots")
    .eq("id", id)
    .maybeSingle();
  if (!enr) return { ok: false, error: "수강신청을 찾을 수 없습니다." };
  const oldSlots = enr.slots;

  // 남은(미래 '예정') 클래스 — session_no 오름차순.
  const { data: clsRows } = await admin
    .from("classes")
    .select("id, session_no, session_date, start_min, end_min, status")
    .eq("enrollment_id", id)
    .eq("status", "예정")
    .order("session_no", { ascending: true });
  const now = Date.now();
  const remaining = ((clsRows ?? []) as { id: string; session_no: number; session_date: string; start_min: number; end_min: number }[]).filter(
    (c) => kstDateMinToMs(c.session_date, lessonEndMin(c.end_min)) >= now,
  );
  if (remaining.length === 0) return { ok: false, error: "변경할 남은 수업이 없습니다." };

  // 강사 주간 가용 검증 — 새 슬롯 전체가 강사 가용 안에 있어야 함.
  const { data: slotRows } = await admin.from("teacher_availability").select("day_of_week, start_min").eq("teacher_id", enr.teacher_id);
  const teacherSlots: Slot[] = (slotRows ?? []).map((r: { day_of_week: number; start_min: number }) => ({ day: r.day_of_week, min: r.start_min }));
  if (!teacherHasAllSlots(teacherSlots, newSlots)) {
    return { ok: false, error: "강사의 주간 가용시간이 아닙니다. 다른 요일·시간을 선택해 주세요." };
  }

  // 새 날짜/시간 열거 — remaining.length개.
  const [ey, em, ed] = effective.split("-").map(Number);
  const sessions = enumerateLessonSessions(new Date(ey, em - 1, ed), newSlots, remaining.length);
  if (sessions.length !== remaining.length) return { ok: false, error: "새 일정을 계산할 수 없습니다. 다른 요일·시간을 선택해 주세요." };

  // 충돌 검증 — 이 강사·학생의 '다른' enrollment의 '예정' 클래스와 시간 겹침 차단.
  const { data: otherRows } = await admin
    .from("classes")
    .select("teacher_id, student_id, session_date, start_min, end_min, status")
    .in("status", ["예정"])
    .neq("enrollment_id", id);
  const others = ((otherRows ?? []) as { teacher_id: string; student_id: string; session_date: string; start_min: number; end_min: number }[]).filter(
    (o) => o.teacher_id === enr.teacher_id || o.student_id === enr.student_id,
  );
  for (const s of sessions) {
    const dateStr = toDateStr(s.date);
    const clash = others.find((o) => o.session_date === dateStr && s.startMin < o.end_min && o.start_min < s.endMin);
    if (clash) return { ok: false, error: `${dateStr} ${fmtTime(s.startMin)}에 강사 또는 학생의 다른 수업이 있습니다. 다른 일정을 선택해 주세요.` };
  }

  // 적용 — 남은 클래스[i] ↔ sessions[i] remap(회차·id 유지).
  const results = await Promise.all(
    remaining.map((c, i) =>
      admin
        .from("classes")
        .update({ session_date: toDateStr(sessions[i].date), start_min: sessions[i].startMin, end_min: sessions[i].endMin })
        .eq("id", c.id)
        .eq("status", "예정")
        .select("id"),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false, error: "일정 변경 처리 중 일부 오류가 발생했습니다. 목록을 새로고침해 확인해 주세요." };

  // 향후 주간 패턴 반영(가용 차감·요약·종료일 폴백).
  await admin.from("enrollments").update({ slots: newSlots }).eq("id", id);

  await logEnrollmentEvent(admin, {
    enrollmentId: id,
    eventType: "remaining_rescheduled",
    actorId: adminId,
    actorRole: "admin",
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: enr.teacher_name,
    detail: { effectiveDate: effective, affectedCount: remaining.length, oldSlots, newSlots },
  });

  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${id}`);
  revalidatePath("/admin/enrollments");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

// 남은 수업 전체 담당 강사 대체(admin) — 강사 중도 하차 시. 담당 강사 교체 + enrollment 이관.
// 남은='예정'이고 레슨 종료 시각이 아직 안 지난 미래 클래스. 과거·완료·취소는 원 강사로 보존.
// effectiveDate(선택): 비면 날짜 유지·강사만 교체. 지정(D+1~D+7)하면 그 날부터 기존 주간 패턴으로 재배치.
// 단일 대타(adminReassignClass)와 달리 enrollment.teacher_id도 새 강사로 이관(가용 차감·대시보드 정합).
export async function adminReassignRemaining(enrollmentId: string, newTeacherId: string, effectiveDate?: string): Promise<ActionResult> {
  const adminId = await requireAdmin();
  if (!adminId) return { ok: false, error: "권한이 없습니다." };
  const id = String(enrollmentId ?? "").trim();
  const teacherId = String(newTeacherId ?? "").trim();
  if (!id || !teacherId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: enr } = await admin
    .from("enrollments")
    .select("id, teacher_id, teacher_name, student_id, student_phone, course, course_title, course_english_title, student_name, student_english_name, slots")
    .eq("id", id)
    .maybeSingle();
  if (!enr) return { ok: false, error: "수강신청을 찾을 수 없습니다." };
  if (enr.teacher_id === teacherId) return { ok: false, error: "현재 강사와 다른 강사를 선택해 주세요." };

  // 새 강사 검증 — role='teacher' + 표시명.
  const { data: prof } = await admin.from("profiles").select("first_name, last_name, role").eq("id", teacherId).maybeSingle();
  if (!prof || prof.role !== "teacher") return { ok: false, error: "유효한 강사가 아닙니다." };
  const newName = [prof.first_name, prof.last_name].filter(Boolean).join(" ").trim() || "강사";

  // 남은(미래 '예정') 클래스 — session_no 오름차순.
  const { data: clsRows } = await admin
    .from("classes")
    .select("id, session_no, session_date, start_min, end_min, status")
    .eq("enrollment_id", id)
    .eq("status", "예정")
    .order("session_no", { ascending: true });
  const now = Date.now();
  const remaining = ((clsRows ?? []) as { id: string; session_no: number; session_date: string; start_min: number; end_min: number }[]).filter(
    (c) => kstDateMinToMs(c.session_date, lessonEndMin(c.end_min)) >= now,
  );
  if (remaining.length === 0) return { ok: false, error: "변경할 남은 수업이 없습니다." };

  // 적용 시작일(필수) — 그 날부터 기존 주간 패턴으로 재배치. D+1~D+7.
  const effective = String(effectiveDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effective)) return { ok: false, error: "적용 시작일을 선택해 주세요." };
  if (effective <= todayKst()) return { ok: false, error: "적용 시작일은 내일 이후여야 합니다." };
  if (effective > addDaysStr(todayKst(), 7)) return { ok: false, error: "적용 시작일은 오늘부터 일주일 이내여야 합니다." };

  // 주간 패턴 — enrollment.slots 정규화. 비어 있으면(레거시) 남은 클래스 실제 요일·시각으로 폴백.
  const wseen = new Set<string>();
  const weekly: Slot[] = ((enr.slots as Slot[]) ?? []).filter(isValidSlot).reduce<Slot[]>((acc, s) => {
    const day = Number(s.day);
    const min = Number(s.min);
    const key = `${day}-${min}`;
    if (!wseen.has(key)) {
      wseen.add(key);
      acc.push({ day, min });
    }
    return acc;
  }, []);
  if (weekly.length === 0) {
    for (const c of remaining) {
      const day = weekdayOf(c.session_date);
      for (let min = c.start_min; min < c.end_min; min += 30) {
        const key = `${day}-${min}`;
        if (!wseen.has(key)) {
          wseen.add(key);
          weekly.push({ day, min });
        }
      }
    }
  }
  if (weekly.length === 0) return { ok: false, error: "재배치할 주간 일정을 확인할 수 없습니다." };
  const scheduleSlots = weekly;

  // 새 강사 주간 가용 검증 — 남은 수업 전체가 새 강사 가용시간 안에 있어야 함.
  const { data: slotRows } = await admin.from("teacher_availability").select("day_of_week, start_min").eq("teacher_id", teacherId);
  const teacherSlots: Slot[] = (slotRows ?? []).map((r: { day_of_week: number; start_min: number }) => ({ day: r.day_of_week, min: r.start_min }));
  if (!teacherHasAllSlots(teacherSlots, scheduleSlots)) {
    return { ok: false, error: "선택한 강사의 주간 가용시간이 아닙니다. 다른 강사를 선택해 주세요." };
  }

  // 타깃 날짜/시간 — 시작일부터 주간 패턴으로 재배치(회차·id 유지).
  const [ey, em, ed] = effective.split("-").map(Number);
  const sessions = enumerateLessonSessions(new Date(ey, em - 1, ed), weekly, remaining.length);
  if (sessions.length !== remaining.length) return { ok: false, error: "새 일정을 계산할 수 없습니다. 다른 시작일을 선택해 주세요." };
  const targets = remaining.map((c, i) => ({
    id: c.id,
    date: toDateStr(sessions[i].date),
    startMin: sessions[i].startMin,
    endMin: sessions[i].endMin,
  }));

  // 충돌 검증 — 새 강사 또는 학생의 '다른' enrollment '예정' 클래스와 타깃 날짜·시간이 겹치면 차단(날짜 이동 시 학생 충돌도 재검증).
  const { data: otherRows } = await admin
    .from("classes")
    .select("teacher_id, student_id, enrollment_id, session_date, start_min, end_min, status")
    .eq("status", "예정")
    .neq("enrollment_id", id);
  const others = ((otherRows ?? []) as { teacher_id: string; student_id: string; session_date: string; start_min: number; end_min: number }[]).filter(
    (o) => o.teacher_id === teacherId || o.student_id === enr.student_id,
  );
  for (const t of targets) {
    const clash = others.find((o) => o.session_date === t.date && t.startMin < o.end_min && o.start_min < t.endMin);
    if (clash) {
      return {
        ok: false,
        error: `${t.date} ${fmtTime(t.startMin)}에 선택한 강사 또는 학생의 다른 예정 수업이 있습니다. 다른 강사·시작일을 선택해 주세요.`,
      };
    }
  }

  const oldTeacherId = enr.teacher_id;
  // 적용 — 담당 강사 교체 + 타깃 날짜/시간(원자 가드). 날짜 유지 경로는 기존값과 동일해 무해.
  const reassignedAt = new Date().toISOString();
  const results = await Promise.all(
    targets.map((t) =>
      admin
        .from("classes")
        .update({
          teacher_id: teacherId,
          teacher_name: newName,
          session_date: t.date,
          start_min: t.startMin,
          end_min: t.endMin,
          teacher_reassigned_at: reassignedAt,
        })
        .eq("id", t.id)
        .eq("status", "예정")
        .select("id"),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false, error: "강사 변경 처리 중 일부 오류가 발생했습니다. 목록을 새로고침해 확인해 주세요." };

  // enrollment 이관 — 가용 차감·강사 대시보드·강의실 노출 정합. slots(주간 패턴)는 불변.
  await admin.from("enrollments").update({ teacher_id: teacherId, teacher_name: newName }).eq("id", id);

  const schedule = summarizeSlots(scheduleSlots, false, " / ");
  const nextDate = targets[0].date;

  // 학생 결과 SMS (best-effort).
  try {
    if (enr.student_phone) {
      await sendSms(
        enr.student_phone,
        `[프렌딩 스쿨] ${enr.course_title} 과정의 담당 강사가 ${newName} 강사로 변경되었습니다. 남은 ${remaining.length}회 수업이 ${nextDate}부터 새 일정으로 재배치되었습니다. 자세한 내용은 마이페이지(내 강의실)에서 확인하세요.`,
      );
    }
  } catch (err) {
    console.error("[adminReassignRemaining] 학생 SMS 발송 실패:", err);
  }

  // 강사 알림 메일 (best-effort) — 새 강사(배정)·기존 강사(이관).
  try {
    const origin = getOrigin(await headers());
    const base = {
      studentName: enr.student_english_name || enr.student_name || "Student",
      courseTitle: getCourse(enr.course)?.englishTitle || enr.course_english_title || enr.course_title,
      schedule,
      remainingCount: remaining.length,
      nextDate,
      oldTeacherName: enr.teacher_name ?? undefined,
      newTeacherName: newName,
      teacherUrl: `${origin}/teacher`,
    };
    const { data: newUser } = await admin.auth.admin.getUserById(teacherId);
    const newEmail = newUser?.user?.email;
    if (newEmail) await sendCourseReassignToNewTeacher([newEmail], base);
    const { data: oldUser } = await admin.auth.admin.getUserById(oldTeacherId);
    const oldEmail = oldUser?.user?.email;
    if (oldEmail) await sendCourseReassignToOldTeacher([oldEmail], base);
  } catch (err) {
    console.error("[adminReassignRemaining] 강사 알림 발송 실패:", err);
  }

  await logEnrollmentEvent(admin, {
    enrollmentId: id,
    eventType: "remaining_reassigned",
    actorId: adminId,
    actorRole: "admin",
    course: enr.course,
    courseTitle: enr.course_title,
    studentName: enr.student_name,
    teacherName: newName,
    detail: {
      effectiveDate: effective,
      affectedCount: remaining.length,
      nextDate,
      oldTeacher: { id: oldTeacherId, name: enr.teacher_name },
      newTeacher: { id: teacherId, name: newName },
    },
  });

  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${id}`);
  revalidatePath("/admin/enrollments");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

/* ===== 테스트 수강신청(개발용) ===== */

// 이메일 → user id (페이지네이션). 못 찾으면 null.
async function findUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) return null;
    const users = data.users as Array<{ id: string; email?: string | null }>;
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < 1000) break;
  }
  return null;
}

// 관리자 전용 테스트 수강신청 생성 — 실 동선과 동일하게 '신청' 상태로 들어가되, 시작일 D+3/D+14·폰·영문 가드를 우회하고
// 수업 횟수를 자유 입력(total_sessions). is_test=true로 표시. 이후 승인/결제확인은 일반 흐름과 동일.
export async function createTestEnrollment(input: {
  studentEmail?: string;
  teacherId: string;
  course: string;
  courseTitle?: string;
  courseEnglishTitle?: string;
  priceKrw?: number;
  slots: Slot[];
  startDate: string;
  sessions: number;
}): Promise<ActionResult> {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(supabase, user.id))) return { ok: false, error: "권한이 없습니다." };

  // 등록 과정이면 레지스트리 값, 아니면 관리자가 직접 입력한 과정명(테스트용 임의 강좌).
  // 강사 화면/이메일은 영문, 학생 화면은 한글이라 한글·영문 과정명을 모두 스냅샷.
  const known = getCourse(input.course);
  let courseSlug: string;
  let courseTitle: string;
  let courseEnglishTitle: string;
  if (known) {
    courseSlug = known.slug;
    courseTitle = known.title;
    courseEnglishTitle = known.englishTitle;
  } else {
    courseTitle = String(input.courseTitle ?? "")
      .trim()
      .slice(0, 100);
    courseEnglishTitle = String(input.courseEnglishTitle ?? "")
      .trim()
      .slice(0, 100);
    if (!courseTitle) return { ok: false, error: "과정명을 입력해 주세요." };
    if (!courseEnglishTitle) return { ok: false, error: "영문 과정명을 입력해 주세요." };
    courseSlug = "custom"; // 센티넬 — getCourse는 undefined → 다운스트림 폴백으로 course_title/english 표시
  }
  const teacherId = String(input.teacherId ?? "").trim();
  if (!teacherId) return { ok: false, error: "강사를 선택해 주세요." };
  const slots: Slot[] = (Array.isArray(input.slots) ? input.slots : []).filter(isValidSlot).map((s) => ({ day: Number(s.day), min: Number(s.min) }));
  if (slots.length === 0) return { ok: false, error: "수업 일정을 선택해 주세요." };
  const startDate = String(input.startDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, error: "시작일 형식이 올바르지 않습니다." };
  const sessions = Number(input.sessions);
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 60) return { ok: false, error: "수업 횟수는 1~60 사이여야 합니다." };
  // 수강료 — 미지정/빈값이면 null(전역 고정가 폴백), 지정 시 1~1억원 정수.
  let priceKrw: number | null = null;
  if (input.priceKrw != null && String(input.priceKrw) !== "") {
    priceKrw = Math.floor(Number(input.priceKrw));
    if (!Number.isFinite(priceKrw) || priceKrw < 1 || priceKrw > 100_000_000) return { ok: false, error: "수강료는 1~100,000,000원 사이여야 합니다." };
  }

  const admin = createAdminClient();

  // 강사 검증 + 이름 스냅샷.
  const { data: teacher } = await admin.from("profiles").select("id, role, first_name, last_name").eq("id", teacherId).maybeSingle();
  if (!teacher || teacher.role !== "teacher") return { ok: false, error: "선택한 강사를 찾을 수 없습니다." };
  const teacherName = [teacher.first_name, teacher.last_name].filter(Boolean).join(" ").trim() || "강사";

  // 학생 resolve — 이메일 지정 시 그 계정, 아니면 호출 admin 본인.
  let studentId = user.id;
  const email = String(input.studentEmail ?? "")
    .trim()
    .toLowerCase();
  if (email) {
    const found = await findUserIdByEmail(admin, email);
    if (!found) return { ok: false, error: "학생 이메일에 해당하는 계정을 찾을 수 없습니다." };
    studentId = found;
  }

  // 학생 스냅샷(없어도 허용 — 테스트 우회). 한국 관례 성+이름 붙임.
  const { data: student } = await admin.from("profiles").select("first_name, last_name, english_name, phone").eq("id", studentId).maybeSingle();
  const studentName = student ? [student.last_name, student.first_name].filter(Boolean).join("").trim() || null : null;

  const { data: inserted, error: insErr } = await admin
    .from("enrollments")
    .insert({
      student_id: studentId,
      teacher_id: teacherId,
      course: courseSlug,
      course_title: courseTitle,
      course_english_title: courseEnglishTitle,
      price_krw: priceKrw,
      start_date: startDate,
      slots,
      teacher_name: teacherName,
      student_name: studentName,
      student_english_name: student?.english_name ?? null,
      student_phone: student?.phone ?? null,
      total_sessions: sessions,
      is_test: true,
    })
    .select("id")
    .maybeSingle();
  if (insErr) return { ok: false, error: "테스트 수강신청 생성 중 오류가 발생했습니다." };

  await logEnrollmentEvent(admin, {
    enrollmentId: inserted?.id ?? null,
    eventType: "enrollment_created",
    actorId: user.id,
    actorRole: "admin",
    course: courseSlug,
    courseTitle: courseTitle,
    studentName,
    teacherName,
    detail: { isTest: true, totalSessions: sessions, startDate, slots },
  });

  revalidatePath("/admin/enrollments");
  return { ok: true };
}

// 테스트 수강신청 삭제(정리용) — is_test=true인 행만 하드 삭제(FK cascade로 classes 동반 제거).
export async function deleteTestEnrollment(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  const enrollmentId = String(id ?? "").trim();
  if (!enrollmentId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: enr } = await admin.from("enrollments").select("id, is_test").eq("id", enrollmentId).maybeSingle();
  if (!enr) return { ok: false, error: "수강신청을 찾을 수 없습니다." };
  if (!enr.is_test) return { ok: false, error: "테스트 수강신청만 삭제할 수 있습니다." };

  const { error } = await admin.from("enrollments").delete().eq("id", enrollmentId).eq("is_test", true);
  if (error) return { ok: false, error: "삭제 중 오류가 발생했습니다." };

  revalidatePath("/admin/enrollments");
  revalidatePath("/admin/classes");
  revalidatePath("/teacher", "layout");
  revalidatePath("/mypage", "layout");
  return { ok: true };
}

/* ===== 강사 지원 관리 ===== */

// 지원자 이메일 + 이름 조회 (알림 메일용). 실패 시 null.
async function getApplicantContact(admin: ReturnType<typeof createAdminClient>, appId: string): Promise<{ email: string; name: string } | null> {
  const { data: app } = await admin.from("teacher_applications").select("user_id, name").eq("id", appId).maybeSingle();
  const row = app as { user_id: string; name: string } | null;
  if (!row) return null;
  const { data: userRes } = await admin.auth.admin.getUserById(row.user_id);
  const email = userRes?.user?.email;
  if (!email) return null;
  return { email, name: row.name ?? "" };
}

// 강사 지원 승인 → RPC로 role 부여 + 프로필 채움 + 상태 '승인'을 원자적으로 처리(상태 가드 포함).
export async function approveTeacherApplication(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: result, error } = await admin.rpc("approve_teacher_application", { p_app_id: id });
  if (error) return { ok: false, error: "승인 처리 중 오류가 발생했습니다." };
  switch (result) {
    case "ok":
      break;
    case "not_found":
      return { ok: false, error: "지원 내역을 찾을 수 없습니다." };
    case "not_pending":
      return { ok: false, error: "이미 처리된 지원입니다. 목록을 새로고침해 주세요." };
    case "is_admin":
      return { ok: false, error: "관리자 계정은 강사로 전환할 수 없습니다." };
    default:
      return { ok: false, error: "승인 처리 중 오류가 발생했습니다." };
  }

  // 지원자 승인 알림 메일 (best-effort) — 실패해도 승인은 유효.
  try {
    const contact = await getApplicantContact(admin, id);
    if (contact) {
      const origin = getOrigin(await headers());
      await sendTeacherApprovalNotification([contact.email], { name: contact.name, teacherUrl: `${origin}/teacher` });
    }
  } catch (err) {
    console.error("[approveTeacherApplication] 승인 알림 발송 실패:", err);
  }

  revalidatePath("/admin/teacher-requests");
  revalidatePath("/teacher", "layout");
  return { ok: true };
}

// 강사 지원 거절 (상태 '거절' + 관리자 메모). 상태 가드: '신청'만 거절 가능. role 변경 없음.
export async function rejectTeacherApplication(id: string, adminNote: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "권한이 없습니다." };
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("teacher_applications")
    .update({ status: "거절", admin_note: adminNote || null })
    .eq("id", id)
    .eq("status", "신청")
    .select("id");
  if (error) return { ok: false, error: "저장 중 오류가 발생했습니다." };
  if (!data || data.length === 0) return { ok: false, error: "이미 처리된 지원입니다. 목록을 새로고침해 주세요." };

  // 지원자 거절 알림 메일 (best-effort) — 실패해도 거절은 유효.
  try {
    const contact = await getApplicantContact(admin, id);
    if (contact) {
      const origin = getOrigin(await headers());
      await sendTeacherRejectionNotification([contact.email], { name: contact.name, reason: adminNote || "", applyUrl: `${origin}/teacher/apply` });
    }
  } catch (err) {
    console.error("[rejectTeacherApplication] 거절 알림 발송 실패:", err);
  }

  revalidatePath("/admin/teacher-requests");
  return { ok: true };
}
