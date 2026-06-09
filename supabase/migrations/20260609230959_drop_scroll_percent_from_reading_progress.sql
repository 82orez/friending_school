-- 수동 완료 정책 전환: 학습 진행은 사용자가 직접 토글하는 completed 컬럼만 사용.
-- 스크롤 기반 자동 진행률(scroll_percent)은 더 이상 읽거나 쓰지 않으므로 컬럼 제거.
-- (컬럼의 [0,100] CHECK 제약과 DEFAULT 0도 함께 삭제됨)
alter table public.reading_progress
  drop column if exists scroll_percent;
