// 학생에게 보이는 수강 상태 — 문구·색의 단일 소스.
//
// ⚠️ DB enum이 둘이라 화면 문구가 DB 값과 다르다:
//    enrollments.status      '신청'·'승인'·'결제대기'·'결제완료'·'거절'·'취소'
//    prep_enrollments.status '입금대기'·'수강확정'·'취소'
//    같은 뜻인데 이름이 갈려 한 화면(「수강신청 내역」)에서 다른 상태처럼 읽혔다 → 표시 계층만 통일한다.
//    예: DB `결제완료`와 `수강확정`이 둘 다 화면에서는 **「수강 확정」**으로 뜬다.
//
// ⚠️ 아래 키는 **표시용이지 DB 값이 아니다** — 서버 비교·쿼리에 쓰지 말 것.
//    (DB enum 이름을 바꾸려면 RPC·웹훅·admin 필터까지 걸리는 마이그레이션이 필요한데 사용자가 얻는 건 없다.)
export type EnrollmentDisplayStatus =
  | "승인대기" // 정규 전용 — enrollments '신청'
  | "승인됨" // 정규 전용
  | "결제대기" // 정규 '결제대기' + 프렙 '입금대기'
  | "수강확정" // 정규 '결제완료' + 프렙 '수강확정'
  | "거절됨" // 정규 전용
  | "취소됨"
  | "환불됨"; // 정규 파생(취소 + payments.status cancelled)

// ⚠️ 정규 전용 단계(승인대기·승인됨·거절됨)는 통일 대상이 아니다 — 프렙엔 강사 매칭·승인 절차가 없어
//    대응 개념이 아예 없다. 통일한 건 **양쪽에 다 있는 의미**(결제대기·수강확정·취소됨)뿐.
export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentDisplayStatus, string> = {
  승인대기: "승인 대기",
  승인됨: "승인됨",
  결제대기: "결제 대기",
  수강확정: "수강 확정",
  거절됨: "거절됨",
  취소됨: "취소됨",
  환불됨: "환불됨",
};

// 확정 초록은 `#E6F4EA`/`#1E7E34` — 프렙이 쓰던 `#E1F5EE`/`#0F6E56`는 `승인됨`이 이미 쓰고 있어 겹친다.
// 대기 보라는 결제 패널의 입금 안내 박스(`#6B4AD4`)와 같은 색이라 시각적으로 이어진다.
export const ENROLLMENT_STATUS_BADGE: Record<EnrollmentDisplayStatus, string> = {
  승인대기: "bg-accent-blue-soft text-accent-blue-ink",
  승인됨: "bg-[#E1F5EE] text-[#0F6E56]",
  결제대기: "bg-[#F3EEFD] text-[#6B4AD4]",
  수강확정: "bg-[#E6F4EA] text-[#1E7E34]",
  거절됨: "bg-brand/10 text-brand",
  취소됨: "bg-rule text-muted-fg",
  환불됨: "bg-[#FFF4E5] text-[#B45309]",
};
