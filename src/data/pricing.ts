import { formatPrice } from "./currencies";
import { TOTAL_SESSIONS } from "@/lib/availability";

// 과정 수강료 단일 소스 — 현재 전 과정 공통(정가 ₩240,000 → 할인가 ₩210,000 / 24회).
// 과정별 차등이 생기면 COURSE_PRICE_KRW를 Record<CourseSlug, number>로 확장하고 라벨도 슬러그별로 파생.
//
// ⚠️ 결제·검증 경로(PortOne 금액 대조·무통장 입금 캡·매출·시뮬레이션)는 **COURSE_PRICE_KRW만** 참조한다.
//    COURSE_LIST_PRICE_KRW는 취소선 표시용 정가일 뿐이라 결제 로직에서 쓰면 과청구가 된다.
export const COURSE_PRICE_KRW = 210000; // 실제 청구가(원). 전 과정 공통 고정가. PortOne 등 PG에 그대로 전달 가능.
export const COURSE_LIST_PRICE_KRW = 240000; // 정가(표시 전용) — 할인 종료 시 COURSE_PRICE_KRW와 같게 두면 할인 UI가 자동으로 사라진다.

export const COURSE_DISCOUNT_KRW = Math.max(0, COURSE_LIST_PRICE_KRW - COURSE_PRICE_KRW);
export const HAS_COURSE_DISCOUNT = COURSE_DISCOUNT_KRW > 0; // 리본·취소선 노출 스위치

export const COURSE_PRICE_LABEL = formatPrice(COURSE_PRICE_KRW, "KRW"); // "₩210,000"
export const COURSE_LIST_PRICE_LABEL = formatPrice(COURSE_LIST_PRICE_KRW, "KRW"); // "₩240,000"
export const COURSE_PER_LABEL = `/ ${TOTAL_SESSIONS}회`; // "/ 24회"

// 할인 배지 문구 — 금액에서 파생(할인폭을 바꾸면 문구도 따라간다). 만원 단위로 떨어지면 "3만원", 아니면 원 단위 표기.
export const COURSE_DISCOUNT_LABEL =
  COURSE_DISCOUNT_KRW % 10000 === 0 ? `${COURSE_DISCOUNT_KRW / 10000}만원 할인` : `${formatPrice(COURSE_DISCOUNT_KRW, "KRW")} 할인`;
