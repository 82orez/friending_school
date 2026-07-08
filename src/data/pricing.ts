import { formatPrice } from "./currencies";
import { TOTAL_SESSIONS } from "@/lib/availability";

// 과정 수강료 단일 소스 — 현재 전 과정 공통(₩240,000 / 24회).
// 과정별 차등이 생기면 COURSE_PRICE_KRW를 Record<CourseSlug, number>로 확장하고 라벨도 슬러그별로 파생.
export const COURSE_PRICE_KRW = 100; // ⚠️ 테스트 단계 임시 금액(원). 운영 전환 시 240000으로 복원. PortOne 등 PG에 그대로 전달 가능.
export const COURSE_PRICE_LABEL = formatPrice(COURSE_PRICE_KRW, "KRW"); // "₩240,000"
export const COURSE_PER_LABEL = `/ ${TOTAL_SESSIONS}회`; // "/ 24회"
