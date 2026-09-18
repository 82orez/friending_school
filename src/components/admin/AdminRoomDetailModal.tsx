"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, Trash2, X } from "lucide-react";
import { fmtTime, formatDateKo } from "@/lib/availability";
import { fmtRoomEnd, seatHeld } from "@/lib/room-time";
import { frienderLabel } from "@/lib/prep";
import { formatPhone } from "@/lib/phone";
import { kstDateText, kstDateTimeText, kstTimeText } from "@/lib/kst";
import { roomLevelLabelKo } from "@/data/room-levels";
import { cn } from "@/lib/utils";
import {
  SERIES_STATE_BADGE,
  SERIES_STATE_LABEL,
  STATE_BADGE,
  STATE_LABEL,
  periodLabel,
  type RoomRow,
  type SeriesRow,
} from "@/components/admin/rooms-admin-shared";

// 연습방(시리즈) 상세. 목록은 최소 정보만 두고 방 정보·회차·예약자 명단은 전부 여기서 본다.
// PrepCourseInfoModal의 패널 스켈레톤을 이식했다.
// ⚠️ 참가자 명단은 앱 전체에서 이 화면에만 노출된다 — friender_room_participants의 RLS는 _select_own뿐이라
//    개설 프렌더조차 자기 방 참가자를 읽지 못하고, 다른 화면은 전부 카운트만 보여준다.
//    보호는 RLS가 아니라 requireAdmin() + admin layout의 role 가드가 담당한다.
// now는 부모의 1분 틱 값을 받는다(노쇼 판정이 목록 카운트와 같은 시각을 쓰도록).
export default function AdminRoomDetailModal({
  series,
  now,
  busy,
  onDeleteSession,
  onDeleteSeries,
  onClose,
}: {
  series: SeriesRow | null;
  now: number;
  busy: boolean;
  // 삭제 자체는 부모가 소유한다(확인 AlertDialog·액션 호출) — 모달은 표시와 콜백만(프렙 UI 규약).
  onDeleteSession: (r: RoomRow) => void;
  onDeleteSeries: () => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // 명단을 펼친 회차 — 기본은 진행 중/다음 회차 하나. 다른 방을 열면 다시 초기화한다.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const seriesKey = series?.key ?? null;
  const nextId = series?.next?.id ?? null;
  useEffect(() => {
    setOpenIds(new Set(nextId ? [nextId] : []));
    // 회차 삭제로 next가 바뀌어도 사용자가 펼친 상태는 유지 — 방이 바뀔 때만 초기화한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey]);

  const open = !!series;
  // 열림 시: Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  // 중첩 확인 다이얼로그(role=alertdialog)가 열려 있으면 Esc는 그쪽만 닫도록 양보한다.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!series) return null;
  const { last, sessions, next } = series;

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const rows: [string, string][] = [
    ["프렌더", frienderLabel(last.friender_name, last.friender_nickname)],
    ["연락처", last.friender_phone ? formatPhone(last.friender_phone) : "-"],
    ["이메일", last.friender_email || "-"],
    ["난이도", roomLevelLabelKo(last.level)],
    ["제한 인원", `${last.capacity}명`],
    ["요일·시각", `${series.weekdays} · ${series.timeLabel}`],
    ["기간", `${periodLabel(sessions[0].session_date, last.session_date)} (총 ${sessions.length}회 · 남은 ${series.remaining}회)`],
    ["다음 회차", next ? `${formatDateKo(next.session_date)} ${fmtTime(next.start_min)}` : "-"],
    ["남은 회차 예약", `${series.reserved}건`],
    ["미입장", `${series.noShows}건`],
    ["개설 일시", kstDateTimeText(series.createdAt)],
    ["방 소개", last.description?.trim() || "-"],
  ];

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="연습방 상세"
        className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4">
        <div className="border-rule my-auto w-[min(92vw,860px)] rounded-2xl border bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-ink text-lg font-extrabold">{last.title}</h2>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", SERIES_STATE_BADGE[series.state])}>
                {SERIES_STATE_LABEL[series.state]}
              </span>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="text-muted-fg hover:bg-surface shrink-0 rounded-md p-1.5 transition-colors">
              <X aria-hidden className="size-4" />
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-muted-fg-faint font-semibold">{label}</dt>
                {/* 난이도만 빨강(text-brand) — 앱 전체의 난이도 표시가 같은 색이다. */}
                <dd className={cn("whitespace-pre-wrap", label === "난이도" ? "text-brand font-bold" : "text-ink")}>{value}</dd>
              </Fragment>
            ))}
          </dl>

          <h3 className="text-ink mt-6 text-sm font-extrabold">회차 {sessions.length}개</h3>
          <ul className="border-rule mt-2 list-none rounded-lg border">
            {sessions.map((r, i) => {
              const expanded = openIds.has(r.id);
              return (
                <li key={r.id} className="border-rule border-b last:border-b-0">
                  <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5", r.state === "past" && "opacity-60")}>
                    <span className="text-muted-fg-faint w-6 shrink-0 text-xs">{i + 1}</span>
                    <span className="text-ink shrink-0 text-sm font-semibold">
                      {formatDateKo(r.session_date)} {/* ⚠️ 종료 시각은 fmtRoomEnd로 — 자정 넘김 방이 25:30으로 새는 것을 막는다. */}
                      <span className="text-muted-fg-faint text-xs font-normal">
                        {fmtTime(r.start_min)}~{fmtRoomEnd(r.start_min + r.duration_min)}
                      </span>
                    </span>
                    <span className="text-muted-fg min-w-0 flex-1 truncate text-sm">{r.topic?.trim() || "-"}</span>
                    <span className={cn("shrink-0 text-xs", r.reserved > 0 ? "text-cta font-bold" : "text-muted-fg-faint")}>
                      예약 {r.reserved}/{r.capacity}
                      {r.noShows > 0 && <span className="text-muted-fg-faint font-normal"> · 미입장 {r.noShows}</span>}
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", STATE_BADGE[r.state])}>{STATE_LABEL[r.state]}</span>
                    <button
                      type="button"
                      onClick={() => toggle(r.id)}
                      aria-expanded={expanded}
                      className="border-rule text-muted-fg hover:bg-surface inline-flex shrink-0 items-center gap-0.5 rounded-md border px-2 py-1 text-xs font-bold transition-colors">
                      명단 {r.participants.length}
                      <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSession(r)}
                      disabled={busy}
                      aria-label="회차 삭제"
                      title="회차 삭제"
                      className="border-brand/40 text-brand hover:bg-brand/5 shrink-0 rounded-md border p-1.5 transition-colors disabled:opacity-60">
                      <Trash2 aria-hidden className="size-3.5" />
                    </button>
                  </div>
                  {expanded && <ParticipantList room={r} now={now} />}
                </li>
              );
            })}
          </ul>

          <div className="border-rule mt-6 flex justify-end gap-2 border-t pt-4">
            <button
              type="button"
              onClick={onDeleteSeries}
              disabled={busy}
              className="border-brand/40 text-brand hover:bg-brand/5 rounded-md border px-3 py-2 text-sm font-bold transition-colors disabled:opacity-60">
              방 전체 삭제
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border-rule text-muted-fg hover:bg-surface rounded-md border px-3 py-2 text-sm font-bold transition-colors">
              닫기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ParticipantList({ room, now }: { room: RoomRow; now: number }) {
  if (room.participants.length === 0) {
    return <p className="text-muted-fg bg-surface px-4 py-3 text-center text-xs">아직 예약이 없습니다.</p>;
  }
  return (
    <ul className="bg-surface list-none px-4 py-1">
      {room.participants.map((p) => {
        // 3상태: 입장(entered_at sticky) / 대기(아직 유예 안) / 미입장(유예 경과 — 자리 반환됨).
        // ⚠️ 참가 행은 지우지 않으므로 '미입장'이어도 늦은 입장은 계속 가능하다.
        const entered = !!p.entered_at;
        const holding = seatHeld(p.entered_at, room.startMs, now);
        return (
          <li key={p.user_id} className="border-rule flex items-center gap-3 border-b py-2 pl-9 last:border-b-0">
            <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">{p.user_name?.trim() || "(이름 없음)"}</span>
            <span className="text-muted-fg-faint shrink-0 text-xs">예약 {kstDateText(p.created_at)}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                entered ? "bg-[#eafff1] text-[#22c55e]" : holding ? "bg-accent-blue-soft text-accent-blue-ink" : "bg-rule/60 text-muted-fg",
              )}>
              {entered ? `입장 ${kstTimeText(p.entered_at as string)}` : holding ? "대기" : "미입장"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
