"use client";

import { Fragment, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { fmtTime, formatDateKo } from "@/lib/availability";
import { fmtRoomEnd, seatHeld } from "@/lib/room-time";
import { kstDateMinToMs } from "@/lib/classtime";
import { frienderLabel } from "@/lib/prep";
import { formatPhone } from "@/lib/phone";
import { kstDateText, kstDateTimeText, kstTimeText } from "@/lib/kst";
import { roomLevelLabelKo } from "@/data/room-levels";
import { cn } from "@/lib/utils";
import type { AdminRoom } from "@/components/admin/RoomsAdminManager";

// 연습방 상세(읽기 전용). PrepCourseInfoModal의 패널 스켈레톤을 이식했다.
// ⚠️ 참가자 명단은 앱 전체에서 이 화면에만 노출된다 — friender_room_participants의 RLS는 _select_own뿐이라
//    개설 프렌더조차 자기 방 참가자를 읽지 못하고, 다른 화면은 전부 카운트만 보여준다.
//    보호는 RLS가 아니라 requireAdmin() + admin layout의 role 가드가 담당한다.
// now는 부모의 1분 틱 값을 받는다(노쇼 판정이 목록 카운트와 같은 시각을 쓰도록).
export default function AdminRoomDetailModal({
  room,
  now,
  onDelete,
  onClose,
}: {
  room: AdminRoom | null;
  now: number;
  // 삭제 자체는 부모가 소유한다(확인 AlertDialog·액션 호출) — 모달은 표시와 콜백만(프렙 UI 규약).
  onDelete: () => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 열림 시: Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  // 중첩 확인 다이얼로그(role=alertdialog)가 열려 있으면 Esc는 그쪽만 닫도록 양보한다.
  useEffect(() => {
    if (!room) return;
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
  }, [room, onClose]);

  if (!room) return null;

  const startMs = kstDateMinToMs(room.session_date, room.start_min);
  const held = room.participants.filter((p) => seatHeld(p.entered_at, startMs, now)).length;

  const rows: [string, string][] = [
    ["프렌더", frienderLabel(room.friender_name, room.friender_nickname)],
    ["연락처", room.friender_phone ? formatPhone(room.friender_phone) : "-"],
    ["이메일", room.friender_email || "-"],
    ["일자", formatDateKo(room.session_date)],
    // ⚠️ 종료 시각은 fmtRoomEnd로 — 자정을 넘기는 방(23:30 + 120분)이 25:30으로 새는 것을 막는다.
    ["시각", `${fmtTime(room.start_min)}~${fmtRoomEnd(room.start_min + room.duration_min)} (${room.duration_min}분)`],
    ["난이도", roomLevelLabelKo(room.level)],
    ["제한 인원", `${room.capacity}명`],
    ["개설 일시", kstDateTimeText(room.created_at)],
    ["방 소개", room.description?.trim() || "-"],
  ];

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="연습방 상세"
        className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4">
        <div className="border-rule my-auto w-[min(92vw,720px)] rounded-2xl border bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-ink text-lg font-extrabold">{room.title}</h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="text-muted-fg hover:bg-surface shrink-0 rounded-md p-1.5 transition-colors">
              <X aria-hidden className="size-4" />
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-muted-fg-faint font-semibold">{label}</dt>
                <dd className="text-ink whitespace-pre-wrap">{value}</dd>
              </Fragment>
            ))}
          </dl>

          <h3 className="text-ink mt-6 text-sm font-extrabold">
            예약자 {room.participants.length}명{" "}
            <span className="text-muted-fg-faint font-semibold">
              · 자리 유지 {held}/{room.capacity} · 미입장 {room.participants.length - held}
            </span>
          </h3>
          {room.participants.length === 0 ? (
            <p className="text-muted-fg border-rule mt-2 rounded-lg border px-4 py-6 text-center text-sm">아직 예약이 없습니다.</p>
          ) : (
            <ul className="border-rule mt-2 list-none rounded-lg border">
              {room.participants.map((p) => {
                // 3상태: 입장(entered_at sticky) / 대기(아직 유예 안) / 미입장(유예 경과 — 자리 반환됨).
                // ⚠️ 참가 행은 지우지 않으므로 '미입장'이어도 늦은 입장은 계속 가능하다.
                const entered = !!p.entered_at;
                const holding = seatHeld(p.entered_at, startMs, now);
                return (
                  <li key={p.user_id} className="border-rule flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
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
          )}

          <div className="border-rule mt-6 flex justify-end gap-2 border-t pt-4">
            <button
              type="button"
              onClick={onDelete}
              className="border-brand/40 text-brand hover:bg-brand/5 rounded-md border px-3 py-2 text-sm font-bold transition-colors">
              방 삭제
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
