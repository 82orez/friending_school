// timestamptz(ISO) → KST 표시 문자열. 순수 산술 변환(UTC+9)이라 **서버·클라 결과가 항상 동일**.
// ⚠️ toLocaleString("ko-KR", …)은 Node와 브라우저의 로케일 데이터 차이로 "오전"/"AM"이 갈려
// 하이드레이션 불일치를 일으키므로 표시용 포맷에는 쓰지 않는다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const p2 = (n: number) => String(n).padStart(2, "0");

// KST 기준 날짜 파츠(UTC getter로 읽어야 로컬 타임존 영향 없음).
function kstParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mi: d.getUTCMinutes() };
}

// "2026.07.19"
export function kstDateText(iso: string): string {
  const { y, m, d } = kstParts(iso);
  return `${y}.${p2(m)}.${p2(d)}`;
}

// "2026.07.19 10:43" (24시간제)
export function kstDateTimeText(iso: string): string {
  const { y, m, d, hh, mi } = kstParts(iso);
  return `${y}.${p2(m)}.${p2(d)} ${p2(hh)}:${p2(mi)}`;
}

// "7.19" (Footer 등 좁은 영역용)
export function kstShortDate(iso: string): string {
  const { m, d } = kstParts(iso);
  return `${m}.${d}`;
}
