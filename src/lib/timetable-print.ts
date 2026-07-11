// 강사 주간 가능 시간(availability)을 A4 세로 한 페이지 인쇄용 HTML로 렌더 → 전용 창에서 window.print().
// 브라우저 "다른 이름으로 PDF 저장"으로 PDF화(새 의존성 없음). 그리드 상수는 @/lib/availability 단일 소스 재사용.
import { DAY_LABELS, DISPLAY_DAYS, ROW_MINS, fmtTime, slotKey, type BookedSlot, type Slot } from "@/lib/availability";

type CellState = "confirmed" | "pending" | "available" | null;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// 슬롯 키 → 상태 맵. 예약(confirmed>pending)이 가용보다 우선(AvailabilityGrid와 동일 규칙).
function buildStateMap(slots: Slot[], bookedSlots: BookedSlot[]): Map<string, CellState> {
  const m = new Map<string, CellState>();
  for (const s of slots) m.set(slotKey(s.day, s.min), "available");
  for (const b of bookedSlots) {
    const k = slotKey(b.day, b.min);
    if (m.get(k) === "confirmed") continue; // confirmed 우선
    m.set(k, b.tier);
  }
  return m;
}

const CELL_BG: Record<Exclude<CellState, null>, string> = {
  available: "#cfe0ff", // 연한 파랑
  confirmed: "#1E7E34", // 초록
  pending: "#8a6fdd", // 보라
};

export function buildTimetablePrintHtml({
  teacherName,
  slots,
  bookedSlots = [],
}: {
  teacherName: string;
  slots: Slot[];
  bookedSlots?: BookedSlot[];
}): string {
  const state = buildStateMap(slots, bookedSlots);
  const hasBooked = bookedSlots.length > 0;
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const headerCells = DISPLAY_DAYS.map((_, i) => `<th class="day">${DAY_LABELS[i]}</th>`).join("");

  const bodyRows = ROW_MINS.map((min) => {
    const onHour = min % 60 === 0;
    const cells = DISPLAY_DAYS.map((day) => {
      const st = state.get(slotKey(day, min));
      const bg = st ? ` style="background:${CELL_BG[st]}"` : "";
      return `<td class="cell${st ? " filled" : ""}"${bg}></td>`;
    }).join("");
    return `<tr class="${onHour ? "on-hour" : ""}"><th class="time">${fmtTime(min)}</th>${cells}</tr>`;
  }).join("");

  const legend = hasBooked
    ? `<div class="legend">
        <span><i style="background:${CELL_BG.available}"></i>가능</span>
        <span><i style="background:${CELL_BG.confirmed}"></i>예약 확정</span>
        <span><i style="background:${CELL_BG.pending}"></i>결제 대기</span>
      </div>`
    : `<div class="legend"><span><i style="background:${CELL_BG.available}"></i>가능 시간</span></div>`;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(teacherName)} 주간 가능 시간표</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Pretendard", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1a1a1a; }
  .head { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 6mm; }
  .head h1 { font-size: 16pt; margin: 0; }
  .head .sub { font-size: 9pt; color: #666; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.time-col { width: 14mm; }
  th, td { border: 0.3pt solid #ddd; }
  thead th.day { font-size: 9pt; font-weight: 700; color: #444; padding: 1.6mm 0; text-align: center; background: #f4f4f4; }
  thead th.time, tbody th.time { width: 14mm; }
  tbody th.time { font-size: 7pt; color: #999; font-weight: 500; text-align: right; padding-right: 1.2mm; }
  tr.on-hour th.time { color: #444; font-weight: 700; }
  tr.on-hour td, tr.on-hour th { border-top: 0.6pt solid #bbb; }
  td.cell { height: 6.3mm; }
  .legend { margin-top: 5mm; display: flex; gap: 6mm; font-size: 8.5pt; color: #444; }
  .legend span { display: inline-flex; align-items: center; gap: 1.6mm; }
  .legend i { display: inline-block; width: 3.2mm; height: 3.2mm; border-radius: 0.6mm; border: 0.3pt solid rgba(0,0,0,.15); }
</style>
</head>
<body>
  <div class="head">
    <h1>${escapeHtml(teacherName)} — 주간 가능 시간표</h1>
    <div class="sub">생성일 ${dateStr}</div>
  </div>
  <table>
    <colgroup><col class="time-col" />${DISPLAY_DAYS.map(() => "<col />").join("")}</colgroup>
    <thead><tr><th class="time"></th>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  ${legend}
</body>
</html>`;
}

// 전용 창을 열어 시간표를 인쇄. 버튼 클릭 동기 흐름이라 팝업 차단 회피 불필요.
export function openTimetablePrint(args: { teacherName: string; slots: Slot[]; bookedSlots?: BookedSlot[] }): void {
  const html = buildTimetablePrintHtml(args);
  const win = window.open("", "_blank");
  if (!win) return; // 팝업 차단 시 무음(호출 측 토스트로 안내 가능)
  win.document.open();
  win.document.write(html);
  win.document.close();
  let printed = false;
  const triggerPrint = () => {
    if (printed) return; // onload·폴백 중복 호출 방지
    printed = true;
    win.focus();
    win.print();
  };
  // 문서 렌더 후 인쇄. onload 우선, 폴백 setTimeout.
  if (win.document.readyState === "complete") triggerPrint();
  else {
    win.onload = triggerPrint;
    setTimeout(triggerPrint, 500);
  }
}
