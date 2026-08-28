"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient, getAdminEmails } from "@/utils/supabase/admin";
import { sendPrepCancellationNotification, sendPrepEnrollmentNotification } from "@/lib/mailer";
import { sendSms } from "@/lib/sms";
import { rateLimit } from "@/lib/rate-limit";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, formatWon, isPrepApplyOpen, prepPaymentDeadlineLabel, prepSmsTitle } from "@/lib/prep";
import { roomLevelLabelKo } from "@/data/room-levels";
import { PREP_APPLY_CLOSED_MSG } from "@/data/prep";
import { PAYMENT_BANK } from "@/data/payment";

// 프렙 수강신청 — 일반 회원 동선이라 역할 가드가 없다(로그인만 확인).
// 신청=RPC(정원·중복·시작 여부·전화 인증을 원자적으로 검사), 취소=service_role 상태 변경.

export type PrepEnrollResult = { ok: boolean; error?: string };

// join_prep_course RPC 반환 코드 → 사용자 메시지.
const JOIN_ERROR: Record<string, string> = {
  unauthenticated: "로그인이 필요합니다. 다시 로그인해 주세요.",
  not_found: "강좌를 찾을 수 없어요. 목록을 새로고침해 주세요.",
  not_approved: "지금은 신청할 수 없는 강좌예요. 목록을 새로고침해 주세요.",
  own_course: "내가 개설한 강좌에는 신청할 수 없어요.",
  already: "이미 신청한 강좌예요.",
  ended: "모든 회차가 끝난 강좌예요. 목록을 새로고침해 주세요.",
  // 중도 신청 도입 전(20260826003601 이전) RPC가 돌려주던 코드 — 마이그레이션 적용 전 배포 시차용으로 남겨 둔다.
  started: "이미 시작된 강좌라 신청을 받지 않아요.",
  full: "정원이 모두 찼어요.",
  // 접수 시간창 밖(KST 19:00~익일 08:00). 액션이 먼저 걸러내지만, RPC를 직접 부르는 경로를 위해 매핑을 둔다.
  closed: PREP_APPLY_CLOSED_MSG,
  phone_unverified: "휴대폰 인증이 필요합니다. 마이페이지에서 인증한 뒤 다시 신청해 주세요.",
  profile_incomplete: "성·이름·영어 이름을 먼저 입력해 주세요. 마이페이지에서 등록한 뒤 다시 신청할 수 있어요.",
};

function revalidatePrepEnroll(): void {
  revalidatePath("/");
  revalidatePath("/mypage/enrollments");
  revalidatePath("/admin/prep");
  revalidatePath("/admin/prep-enrollments");
  revalidatePath("/friender", "layout"); // 프렌더 목록의 신청자 수
}

export async function applyPrepCourse(courseId: string): Promise<PrepEnrollResult> {
  const id = String(courseId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // 접수 시간창(KST 08:00~19:00) 밖 — 알림도 나가지 않으므로 rate limit 예산을 쓰기 전에 돌려보낸다.
  // ⚠️ authoritative는 RPC의 같은 검사다(브라우저가 RPC를 직접 부를 수 있다). 여기는 빠른 반려용.
  if (!isPrepApplyOpen()) return { ok: false, error: PREP_APPLY_CLOSED_MSG };

  // 메일·SMS가 딸린 액션이라 연타를 막는다(requestPrepReview와 같은 규칙).
  if (!rateLimit(`prep-apply:${user.id}`, 10, 10 * 60_000).allowed) {
    return { ok: false, error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." };
  }

  // ⚠️ 이름·전화·가격은 **넘기지 않는다** — RPC가 profiles와 강좌 행에서 직접 읽는다.
  //    RPC가 authenticated에 grant돼 브라우저에서 직접 호출할 수 있으므로, 인자로 받으면
  //    전화 인증 게이트가 우회되고 임의 번호가 스냅샷에 심어진다(그 번호로 확정 SMS가 나간다).
  // ⚠️ 본인 세션 client로 호출해야 RPC 안의 auth.uid()가 잡힌다(service_role로 부르면 null).
  const { data, error } = await supabase.rpc("join_prep_course", { p_course_id: id });
  if (error) return { ok: false, error: "신청 처리 중 문제가 발생했습니다." };

  const code = String(data ?? "");
  if (code !== "ok") return { ok: false, error: JOIN_ERROR[code] ?? "신청 처리 중 문제가 발생했습니다." };

  await notifyPrepEnrollment(createAdminClient(), id, user.id, user.email ?? "");

  revalidatePrepEnroll();
  return { ok: true };
}

// 입금 전에는 학생이 직접 취소할 수 있다.
// ⚠️ 삭제가 아니라 상태 변경 — 취소 이력을 남긴다(부분 unique 인덱스가 재신청을 열어 준다).
export async function cancelPrepEnrollment(courseId: string): Promise<PrepEnrollResult> {
  const id = String(courseId ?? "").trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const admin = createAdminClient();
  const { data: cancelled, error } = await admin
    .from("prep_enrollments")
    .update({ status: "취소", cancelled_at: new Date().toISOString() })
    .eq("course_id", id)
    .eq("user_id", user.id)
    .eq("status", "입금대기") // 입금이 확인된 뒤에는 관리자만 처리한다(환불 동선 미구현).
    // 알림에 쓸 값은 **취소된 행에서 바로 받는다** — 다시 읽으면 이미 '취소' 상태라 조건이 꼬이고 왕복도 는다.
    .select("id, student_name, student_phone, session_count, first_session_date, last_session_date, price_krw, created_at, cancelled_at");
  if (error) return { ok: false, error: "취소 처리 중 문제가 발생했습니다." };
  if (!cancelled || cancelled.length === 0) {
    return { ok: false, error: "이미 입금이 확인된 신청은 직접 취소할 수 없어요. 문의해 주세요." };
  }

  await notifyPrepCancellation(admin, id, cancelled[0] as CancelledRow, user.email ?? "");

  revalidatePrepEnroll();
  return { ok: true };
}

// 취소된 신청 행의 스냅샷 — 알림 문구는 전부 여기서 만든다(강좌 원본이 아니라).
type CancelledRow = {
  id: string;
  student_name: string | null;
  student_phone: string | null;
  session_count: number | null;
  first_session_date: string | null;
  last_session_date: string | null;
  price_krw: number | null;
  created_at: string;
  cancelled_at: string | null;
};

// 학생 자가 취소 알림 (best-effort) — 관리자 메일 + 개설 프렌더 SMS. 실패해도 취소는 유효하다.
// ⚠️ 신청 알림과 대칭이다: 안 보내면 관리자는 오지 않을 입금을 기다리고, 프렌더는 정원이
//    비워진 사실을 목록을 새로고침해야만 안다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyPrepCancellation(admin: any, courseId: string, row: CancelledRow, studentEmail: string): Promise<void> {
  try {
    const { data } = await admin.from("prep_courses").select("friender_id, friender_name, title, capacity").eq("id", courseId).maybeSingle();
    if (!data) return;
    const c = data as { friender_id: string; friender_name: string | null; title: string; capacity: number };

    // 취소 후 남은 유효 신청 수 — 관리자·프렌더가 자리 상황을 바로 알 수 있게.
    const { count } = await admin
      .from("prep_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .neq("status", "취소");
    const remaining = count ?? 0;

    const period =
      row.first_session_date && row.last_session_date
        ? `${fmtDateKo(row.first_session_date)} ~ ${fmtDateKo(row.last_session_date)} (${row.session_count ?? 0}회)`
        : "-";

    await sendPrepCancellationNotification(await getAdminEmails(), {
      courseTitle: c.title,
      frienderName: c.friender_name ?? "(이름 없음)",
      studentName: row.student_name ?? "(이름 없음)",
      studentPhone: row.student_phone ?? "",
      studentEmail,
      period,
      priceKrw: row.price_krw ?? 0,
      enrolledCount: remaining,
      capacity: c.capacity,
      appliedAt: row.created_at,
      cancelledAt: row.cancelled_at ?? new Date().toISOString(),
    });

    const { data: fprof } = await admin.from("profiles").select("phone").eq("id", c.friender_id).maybeSingle();
    const fphone = (fprof as { phone?: string | null } | null)?.phone?.trim();
    if (fphone) {
      await sendSms(
        fphone,
        `[프렌딩 스쿨] '${prepSmsTitle(c.title)}' 프렙 강좌의 수강신청 1건이 취소되었습니다. (입금 전 취소 · 남은 신청 ${remaining}/${c.capacity}명)`,
      );
    }
  } catch (err) {
    console.error("[prep] 수강신청 취소 알림 발송 실패:", err);
  }
}

// 신규 신청 알림 (best-effort) — **신청자 SMS(입금 안내)** + 관리자 메일 + 개설 프렌더 SMS.
// 실패해도 신청은 유효하다(화면·마이페이지에 같은 계좌 안내가 남아 있다).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyPrepEnrollment(admin: any, courseId: string, userId: string, studentEmail: string): Promise<void> {
  try {
    // 이름·전화는 RPC가 방금 넣은 스냅샷에서 읽는다(액션이 직접 다루지 않는 이유와 같은 맥락).
    // ⚠️ **기간·금액도 스냅샷에서 읽는다** — 중도 신청이면 강좌 원본의 정가·전체 일정과 다르다.
    const { data: mine } = await admin
      .from("prep_enrollments")
      .select("student_name, student_phone, session_count, first_session_date, last_session_date, price_krw, created_at")
      .eq("course_id", courseId)
      .eq("user_id", userId)
      .neq("status", "취소")
      .maybeSingle();
    const student = (mine ?? {}) as {
      student_name?: string | null;
      student_phone?: string | null;
      session_count?: number | null;
      first_session_date?: string | null;
      last_session_date?: string | null;
      price_krw?: number | null;
      created_at?: string | null;
    };

    const { data } = await admin
      .from("prep_courses")
      .select("friender_id, friender_name, title, level, capacity, price_krw, start_min, duration_min, prep_sessions(session_date)")
      .eq("id", courseId)
      .maybeSingle();
    if (!data) return;
    const c = data as {
      friender_id: string;
      friender_name: string | null;
      title: string;
      level: string;
      capacity: number;
      price_krw: number;
      start_min: number;
      duration_min: number;
      prep_sessions: { session_date: string }[] | null;
    };

    // 기간·금액은 **이 신청자가 산 것** 기준(스냅샷). 스냅샷이 없는 예외 상황에서만 강좌 원본으로 폴백한다.
    const dates = (c.prep_sessions ?? []).map((s) => s.session_date).sort();
    const period =
      student.first_session_date && student.last_session_date
        ? `${fmtDateKo(student.first_session_date)} ~ ${fmtDateKo(student.last_session_date)} (${student.session_count ?? dates.length}회)`
        : dates.length > 0
          ? `${fmtDateKo(dates[0])} ~ ${fmtDateKo(dates[dates.length - 1])} (${dates.length}회)`
          : "-";
    const priceKrw = student.price_krw ?? c.price_krw;

    // ① 신청자 본인 — 무통장 입금 안내. **관리자·프렌더보다 먼저 보낸다**(뒤 조회가 실패해도 이건 나가야 한다).
    // ⚠️ 화면(모달·마이페이지)에도 같은 안내가 있지만, 신청 직후 화면을 닫으면 계좌를 다시 찾아야 했다.
    //    금액은 스냅샷이라 중도 신청자는 잔여 비례액이 그대로 찍힌다.
    const sphone = student.student_phone?.trim();
    if (sphone) {
      await sendSms(
        sphone,
        [
          `[프렌딩 스쿨] '${prepSmsTitle(c.title)}' 프렙 강좌 신청이 접수되었습니다.`,
          `수업 ${period} ${fmtTime(c.start_min)}~${fmtRoomEnd(c.start_min + c.duration_min)}`,
          `입금액 ${formatWon(priceKrw)}`,
          `입금 계좌 ${PAYMENT_BANK.bank} ${PAYMENT_BANK.account} (예금주 ${PAYMENT_BANK.holder})`,
          // 기한 기준은 **신청 행의 created_at**(방금 만든 스냅샷) — 발송 시각이 아니다.
          `입금 기한 ${prepPaymentDeadlineLabel(student.created_at ?? new Date().toISOString())}까지 (미확인 시 신청 자동 취소)`,
          `입금자명은 신청자 성함으로 넣어 주세요. 입금이 확인되면 수강이 확정됩니다.`,
        ].join("\n"),
      );
    }

    const { count } = await admin
      .from("prep_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .neq("status", "취소");

    await sendPrepEnrollmentNotification(await getAdminEmails(), {
      courseTitle: c.title,
      frienderName: c.friender_name ?? "(이름 없음)",
      studentName: student.student_name ?? "(이름 없음)",
      studentPhone: student.student_phone ?? "",
      studentEmail,
      period,
      time: `${fmtTime(c.start_min)}~${fmtRoomEnd(c.start_min + c.duration_min)} (${c.duration_min}분)`,
      level: roomLevelLabelKo(c.level),
      priceKrw,
      enrolledCount: count ?? 1,
      capacity: c.capacity,
      appliedAt: new Date().toISOString(),
    });

    // 개설 프렌더에게도 알린다 — 프렌더 도메인은 메일이 아니라 SMS가 관례.
    const { data: fprof } = await admin.from("profiles").select("phone").eq("id", c.friender_id).maybeSingle();
    const fphone = (fprof as { phone?: string | null } | null)?.phone?.trim();
    if (fphone) {
      await sendSms(
        fphone,
        `[프렌딩 스쿨] '${prepSmsTitle(c.title)}' 프렙 강좌에 새 수강신청이 있습니다. (${count ?? 1}/${c.capacity}명 · ${formatWon(priceKrw)} · 입금 확인 후 확정)`,
      );
    }
  } catch (err) {
    console.error("[prep] 수강신청 알림 발송 실패:", err);
  }
}
