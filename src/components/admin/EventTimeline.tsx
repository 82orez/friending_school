"use client";

// 과정(enrollment) 라이프사이클 이벤트 타임라인(admin 읽기 전용).
// 서버가 enrollment_events를 created_at desc로 조회해 prop으로 전달. 최신이 위.

export type AdminEvent = {
  id: string;
  class_id: string | null;
  event_type: string;
  actor_role: string | null;
  actor_name: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

// 이벤트 타입 → 한국어 라벨 + 배지 색(무채색 기반, 성격별 강조).
const EVENT_META: Record<string, { label: string; cls: string }> = {
  enrollment_created: { label: "수강신청 생성", cls: "bg-accent-blue-soft text-accent-blue-ink" },
  enrollment_approved: { label: "강사 승인", cls: "bg-emerald-100 text-emerald-700" },
  enrollment_rejected: { label: "강사 거절", cls: "bg-brand/10 text-brand" },
  payment_confirmed: { label: "결제 확인", cls: "bg-cta/10 text-cta" },
  enrollment_cancelled: { label: "수강신청 취소", cls: "bg-brand/10 text-brand" },
  class_postponed: { label: "수업 연기", cls: "bg-amber-100 text-amber-700" },
  class_cancelled: { label: "수업 취소", cls: "bg-brand/10 text-brand" },
  class_reassigned: { label: "강사 대체", cls: "bg-accent-blue-soft text-accent-blue-ink" },
  remaining_rescheduled: { label: "남은 일정 일괄 변경", cls: "bg-accent-blue-soft text-accent-blue-ink" },
  remaining_reassigned: { label: "남은 수업 전체 강사 대체", cls: "bg-accent-blue-soft text-accent-blue-ink" },
  conducted_overridden: { label: "진행 여부 보정", cls: "bg-rule/60 text-muted-fg" },
};

const ROLE_LABEL: Record<string, string> = { student: "학생", teacher: "강사", admin: "관리자", system: "시스템" };

// timestamptz(ISO) → KST 'YYYY-MM-DD HH:mm'.
function fmtKst(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const teacherName = (v: unknown): string | null => (v && typeof v === "object" ? str((v as { name?: unknown }).name) : null);

// 이벤트별 detail 요약 문구.
function summarize(e: AdminEvent): string {
  const d = e.detail ?? {};
  switch (e.event_type) {
    case "enrollment_created":
      return d.isTest ? `테스트 · ${num(d.totalSessions) ?? "-"}회 · 시작 ${str(d.startDate) ?? "-"}` : `시작 ${str(d.startDate) ?? "-"}`;
    case "enrollment_approved":
      return "신청 → 결제대기";
    case "enrollment_rejected":
      return str(d.reason) ? `사유: ${str(d.reason)}` : "";
    case "payment_confirmed":
      return `${num(d.sessionsGenerated) ?? "-"}회 클래스 생성`;
    case "enrollment_cancelled":
      return str(d.reason) ? `사유: ${str(d.reason)}` : str(d.fromStatus) ? `이전 상태: ${str(d.fromStatus)}` : "";
    case "class_postponed": {
      const parts = [];
      if (num(d.sessionNo) !== null) parts.push(`${num(d.sessionNo)}회차`);
      if (str(d.sessionDate)) parts.push(str(d.sessionDate)!);
      if (str(d.makeupDate)) parts.push(`보강 ${str(d.makeupDate)}`);
      return parts.join(" · ");
    }
    case "class_cancelled": {
      const parts = [];
      if (num(d.sessionNo) !== null) parts.push(`${num(d.sessionNo)}회차`);
      if (str(d.sessionDate)) parts.push(str(d.sessionDate)!);
      return `${parts.join(" · ")} (보강 없음)`;
    }
    case "class_reassigned": {
      const from = teacherName(d.oldTeacher) ?? "-";
      const to = teacherName(d.newTeacher) ?? "-";
      const when = str(d.sessionDate) ? ` · ${str(d.sessionDate)}` : "";
      return `${from} → ${to}${when}`;
    }
    case "remaining_rescheduled":
      return `${str(d.effectiveDate) ?? "-"}부터 ${num(d.affectedCount) ?? "-"}건 재배치`;
    case "remaining_reassigned": {
      const from = teacherName(d.oldTeacher) ?? "-";
      const to = teacherName(d.newTeacher) ?? "-";
      return `${from} → ${to} · ${str(d.effectiveDate) ?? "-"}부터 ${num(d.affectedCount) ?? "-"}건`;
    }
    case "conducted_overridden": {
      const ov = d.override;
      const label = ov === true ? "진행됨" : ov === false ? "미진행" : "자동 판정";
      const sess = num(d.sessionNo) !== null ? `${num(d.sessionNo)}회차 · ` : "";
      return `${sess}${label}(으)로 지정`;
    }
    default:
      return "";
  }
}

export default function EventTimeline({ events }: { events: AdminEvent[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-ink text-lg font-bold">변경 이력</h2>
      <p className="text-muted-fg-faint mt-1 text-xs">이 과정에서 발생한 생성·승인·결제·연기·강사 대체·일정 변경 등의 이벤트입니다(최신순).</p>

      {events.length === 0 ? (
        <p className="text-muted-fg mt-4 text-sm">기록된 이벤트가 없습니다.</p>
      ) : (
        <ul className="border-rule mt-4 divide-y divide-rule overflow-hidden rounded-xl border bg-white">
          {events.map((e) => {
            const meta = EVENT_META[e.event_type] ?? { label: e.event_type, cls: "bg-rule/60 text-muted-fg" };
            const detail = summarize(e);
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span className="text-muted-fg-faint w-[8.5rem] shrink-0 text-xs tabular-nums">{fmtKst(e.created_at)}</span>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.cls}`}>{meta.label}</span>
                {detail && <span className="text-ink min-w-0 flex-1 truncate text-sm">{detail}</span>}
                <span className="text-muted-fg-faint ml-auto shrink-0 text-xs">
                  {ROLE_LABEL[e.actor_role ?? ""] ?? e.actor_role ?? "-"}
                  {e.actor_name ? ` · ${e.actor_name}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
