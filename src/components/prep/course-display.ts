// 샤우팅 강좌 카드·상세 모달의 공용 타입과 표시 헬퍼.
// ⚠️ 배너(PrepEnrollBanner)와 상세 모달(PrepCourseDetailModal)이 같은 문구를 써야 해서 한 곳에 모았다 —
//    한쪽에만 있으면 "카드에 쓰인 금액과 모달의 금액이 다르다" 류의 어긋남이 난다.

import { PREP_MAX_CAPACITY } from "@/data/prep";
import { fmtDateKo, formatWon, weekdayOf } from "@/lib/prep";

// 신청 가능한(승인 + **남은 회차가 있는**) 샤우팅 강좌. 홈 page.tsx가 공개 RLS로 읽어 내려준다.
// ⚠️ 시작된 강좌도 남은 회차만큼 신청을 받는다(중도 신청) → 표시 금액은 정가가 아니라 `chargeKrw`다.
export type OpenPrepCourse = {
  id: string;
  /** 개설 프렌더 — hosts 맵(아바타·소개)의 조회 키. */
  frienderId: string;
  title: string;
  description: string | null;
  /** hosts 조회가 비었을 때 쓰는 이름 스냅샷(공개 화면이라 닉네임 우선). */
  frienderName: string;
  level: string;
  capacity: number;
  startMin: number;
  durationMin: number;
  priceKrw: number;
  sessionCount: number;
  /** 커리큘럼 탭용 회차 — 회차 번호 오름차순. topic은 비어 있을 수 있다. */
  sessions: { no: number; date: string; topic: string | null }[];
  firstDate: string;
  lastDate: string;
  /** 지금 신청하면 듣게 되는 회차 수. 시작 전 강좌는 sessionCount와 같다. */
  remainingCount: number;
  /** 내 첫 수강 회차가 될 날짜. */
  remainingFirstDate: string;
  /** 실제 청구액(잔여 비례). 잔여 = 전체이면 priceKrw 원값. */
  chargeKrw: number;
  enrolled: number;
  /** 내 신청 상태 — 없으면 미신청. */
  myStatus: "입금대기" | "수강확정" | null;
};

export const seatLabel = (c: OpenPrepCourse): string =>
  // 정원 상한(1000)은 사실상 '제한 없음'이라 N/1000으로 보여 주면 이상하다.
  c.capacity >= PREP_MAX_CAPACITY ? `${c.enrolled}명 신청` : `${c.enrolled}/${c.capacity}명`;

// 이미 시작해 일부 회차가 지나간 강좌 — 기간·수강료를 '잔여' 기준으로 바꿔 보여 준다.
export const isOngoing = (c: OpenPrepCourse): boolean => c.remainingCount < c.sessionCount;

// 기간은 **내가 듣게 될 구간**을 먼저 보여 준다. 전체 일정은 회차 수와 함께 괄호로 남긴다
// (진행 중 강좌에서 강좌 시작일을 앞세우면 "이미 지난 날짜부터 결제하는" 것처럼 읽힌다).
export const periodLabel = (c: OpenPrepCourse): string =>
  isOngoing(c)
    ? `${fmtDateKo(c.remainingFirstDate)} ~ ${fmtDateKo(c.lastDate)} (남은 ${c.remainingCount}회)`
    : `${fmtDateKo(c.firstDate)} ~ ${fmtDateKo(c.lastDate)} (${c.sessionCount}회)`;

// 진행 중이면 청구액이 정가가 아니므로 근거(전체 N회 M원 중 잔여 K회)를 함께 적는다.
export const priceLabel = (c: OpenPrepCourse): string =>
  isOngoing(c)
    ? `${formatWon(c.chargeKrw)} (전체 ${c.sessionCount}회 ${formatWon(c.priceKrw)} 중 남은 ${c.remainingCount}회)`
    : formatWon(c.priceKrw);

// 회차 날짜에서 실제 수업 요일을 뽑아 "월·화·수·목·금"으로. 강좌마다 요일 컬럼이 따로 없고
// 회차 일자가 진실이라 여기서 파생한다(⚠️ weekdayOf는 Date.UTC 산술이라 TZ에 안전).
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
export const weekdaysLabel = (dates: string[]): string => {
  const seen = new Set(dates.map((d) => weekdayOf(d)));
  // 월요일부터 일요일 순으로 읽히도록 정렬(getUTCDay는 0=일).
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order
    .filter((d) => seen.has(d))
    .map((d) => WEEKDAY_KO[d])
    .join("·");
};

// 아바타 그라디언트 — 프렌딩 카드(FriendingRooms)와 같은 프리셋·같은 해시 방식.
// 프렌더 id로 고정 배정해 카드와 모달에서 같은 색이 나온다.
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#3ecfb2,#6366f1)",
  "linear-gradient(135deg,#6366f1,#a855f7)",
  "linear-gradient(135deg,#f43f8e,#f97316)",
  "linear-gradient(135deg,#22c55e,#3ecfb2)",
];
export const gradientOf = (id: string): string => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
};
