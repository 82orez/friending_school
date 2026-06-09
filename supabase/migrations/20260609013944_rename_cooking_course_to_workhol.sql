-- 전자책 course 키 'cooking' → 'workhol' 리네임 (폴더 content/textbook/cooking → workhol).
-- reading_progress.course 는 PK(user_id, course, unit)의 일부이므로 기존 진행률 row를 보존하려면
-- 값을 갱신해야 한다. URL 세그먼트와 레지스트리(course)도 'workhol' 로 통일됨.
update public.reading_progress
set course = 'workhol'
where course = 'cooking';
