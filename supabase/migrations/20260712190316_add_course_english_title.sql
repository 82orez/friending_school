-- 커스텀(테스트) 과정의 영문 과정명 스냅샷. 등록 과정은 getCourse(course).englishTitle로 해석하므로 null 허용.
-- 강사 화면/이메일 표시 폴백: getCourse(course)?.englishTitle ?? course_english_title ?? course_title.
alter table public.enrollments add column if not exists course_english_title text;
alter table public.classes add column if not exists course_english_title text;
