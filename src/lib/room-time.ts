import { kstDateMinToMs } from "@/lib/classtime";
import { fmtTime } from "@/lib/availability";

// 연습방 시간 구간 판정 — 서버 액션(개설/수정 가드)과 클라 폼(사전 경고)이 같은 규칙을 쓰도록
// 한 곳에 모은다. server-only 아님(클라/서버 공용).

export type RoomSlot = { sessionDate: string; startMin: number; durationMin: number };

// [시작, 종료) 절대 시각(ms).
// ⚠️ session_date + start_min만으로 비교하면 자정을 넘기는 방(23:30 + 120분 → 익일 01:30)을 놓친다.
//    kstDateMinToMs가 1440 초과를 정상 처리하므로 반드시 절대 ms로 환산해 비교할 것.
export function roomRangeMs(r: RoomSlot): [number, number] {
  const start = kstDateMinToMs(r.sessionDate, r.startMin);
  return [start, kstDateMinToMs(r.sessionDate, r.startMin + r.durationMin)];
}

// 반개구간 교차 — 맞닿는 구간(앞 방 종료 === 뒤 방 시작)은 겹침이 아니다.
// 예: 08:00~08:40 다음 08:40~09:20은 정상 개설 가능.
export function roomsOverlap(a: RoomSlot, b: RoomSlot): boolean {
  const [aStart, aEnd] = roomRangeMs(a);
  const [bStart, bEnd] = roomRangeMs(b);
  return aStart < bEnd && bStart < aEnd;
}

// 종료 시각 표시 — 자정을 넘기면(23:30 + 120분 → 1530) 24h로 되감고 '(익일)'을 덧붙인다.
// ⚠️ fmtTime 자체는 1440 초과를 25:30처럼 흘려보내는 게 정상 동작이라 건드리지 않는다
//    (강의실·정산 등 소비처가 많다) — 방 표기에서만 이 함수로 감싼다.
// 저장 값·경과 판정(kstDateMinToMs)은 원본 분값 그대로가 맞다.
export function fmtRoomEnd(endMin: number): string {
  return endMin >= 24 * 60 ? `${fmtTime(endMin - 24 * 60)} (익일)` : fmtTime(endMin);
}

// 노쇼 유예 — 시작 후 이 시간까지 입장하지 않으면 자리를 정원 카운트에서 되돌린다.
// ⚠️ 같은 값이 join_friender_room RPC(마이그레이션 20260821013406)에도 하드코딩돼 있다.
//    RPC는 클라가 직접 호출할 수 있어 자급해야 하므로 불가피 — 바꿀 땐 두 곳을 함께 고칠 것.
export const NO_SHOW_GRACE_MIN = 10;
export const NO_SHOW_GRACE_MS = NO_SHOW_GRACE_MIN * 60_000;

// 이 참가자가 아직 자리를 잡고 있는가 — 입장했거나(entered_at은 sticky) 아직 유예 안이면 true.
// roomStartMs는 호출부가 kstDateMinToMs(session_date, start_min)로 만들어 넘긴다
// (페이지마다 방 필드가 snake/camel로 달라 원시 ms를 받는 편이 깔끔하다).
export function seatHeld(enteredAt: string | null | undefined, roomStartMs: number, now: number): boolean {
  return !!enteredAt || now < roomStartMs + NO_SHOW_GRACE_MS;
}

// 유예가 지났는데 미입장 = 노쇼(자리 반환됨). 행 자체는 남기므로 늦은 입장은 계속 가능하다.
export function isNoShow(enteredAt: string | null | undefined, roomStartMs: number, now: number): boolean {
  return !seatHeld(enteredAt, roomStartMs, now);
}
