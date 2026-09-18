// /admin/rooms 목록(RoomsAdminManager)과 방 상세 모달(AdminRoomDetailModal)이 함께 쓰는 타입·라벨.
// 두 컴포넌트가 서로 import하지 않도록 여기로 뺐다.

export type AdminRoomParticipant = {
  user_id: string;
  user_name: string | null; // 예약 시점 스냅샷
  entered_at: string | null; // 첫 입장 시각(sticky) — 노쇼 판정 기준
  created_at: string; // 예약 시각
};

export type AdminRoom = {
  id: string;
  friender_id: string;
  friender_name: string | null; // 표시 스냅샷(개명하면 stale)
  friender_nickname: string | null;
  friender_phone: string | null; // profiles 최신값(연락용)
  friender_email: string;
  series_id: string | null; // 같은 시리즈로 개설된 회차 묶음(null이면 전환 이전 단발 방)
  title: string; // 시리즈 이름
  description: string | null;
  level: string;
  capacity: number;
  topic: string | null; // 회차 주제(선택)
  session_date: string; // KST YYYY-MM-DD
  start_min: number;
  duration_min: number;
  created_at: string;
  participants: AdminRoomParticipant[]; // 예약 순
};

// 회차(방 행)의 유일한 '상태'는 시간에서 파생된다 — friender_rooms에는 status·is_visible 컬럼이 없다
// (is_visible은 20260820220759에서 제거). 취소 = 하드 삭제뿐.
export type TimeState = "live" | "upcoming" | "past";

// 파생값을 얹은 회차. 노쇼·예약 수는 now에 따라 변하므로 렌더마다 다시 만든다.
export type RoomRow = AdminRoom & { state: TimeState; reserved: number; noShows: number; startMs: number; endMs: number };

// 시리즈(=프렌더가 개설한 '방') 상태 — 회차 상태에서 파생.
// live: 입장 시간대 회차가 있음 / open: 아직 남은 회차가 있음 / ended: 모든 회차 종료.
export type SeriesState = "live" | "open" | "ended";

// 목록의 한 행 = 시리즈 하나(프렌더 방 관리 /friender/rooms와 같은 묶음).
export type SeriesRow = {
  key: string; // seriesKeyOf — series_id ?? 단발 방의 id
  last: RoomRow; // 대표 회차(마지막) — 공통값(이름·소개·난이도·정원)은 이 회차 기준
  sessions: RoomRow[]; // 일시 오름차순
  next: RoomRow | null; // 진행 중이거나 다음에 열릴 회차
  weekdays: string;
  timeLabel: string; // 회차 시각이 모두 같을 때만 "14:00~14:40", 아니면 "회차별 시각 상이"
  remaining: number; // 끝나지 않은 회차 수
  reserved: number; // 끝나지 않은 회차의 예약 합(노쇼 제외)
  totalParticipants: number; // 전 회차 예약 행 수(삭제 안내용)
  noShows: number;
  state: SeriesState;
  createdAt: string; // 최초 개설 시각
};

export const STATE_LABEL: Record<TimeState, string> = { live: "진행 중", upcoming: "예정", past: "지난" };
export const SERIES_STATE_LABEL: Record<SeriesState, string> = { live: "진행 중", open: "운영 중", ended: "종료" };
// 라이브 초록은 대응 토큰이 없어 프렌딩 홈(/)과 같은 arbitrary hex 예외를 쓴다.
export const STATE_BADGE: Record<TimeState, string> = {
  live: "bg-[#eafff1] text-[#22c55e]",
  upcoming: "bg-accent-blue-soft text-accent-blue-ink",
  past: "bg-rule text-muted-fg",
};
export const SERIES_STATE_BADGE: Record<SeriesState, string> = { live: STATE_BADGE.live, open: STATE_BADGE.upcoming, ended: STATE_BADGE.past };

// "2026.09.19 ~ 10.16" — 같은 해면 끝 날짜의 연도를 생략한다.
export function periodLabel(first: string, last: string): string {
  const f = first.replace(/-/g, ".");
  if (first === last) return f;
  return `${f} ~ ${first.slice(0, 4) === last.slice(0, 4) ? last.slice(5).replace("-", ".") : last.replace(/-/g, ".")}`;
}
