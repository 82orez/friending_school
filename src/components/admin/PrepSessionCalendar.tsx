"use client";

import { ko as koLocale } from "date-fns/locale";
import { toLocalDate } from "@/lib/prep";
import { Calendar } from "@/components/ui/calendar";

/**
 * 프렙 회차 일자를 보여주는 **읽기 전용 캘린더**. 심사 목록 행과 강좌 상세 모달이 공용한다.
 *
 * 프렌더 개설 폼(`PrepCourseForm`)의 캘린더와 **같은 props로 그린다** — 같은 일정이 두 화면에서 다르게 보이면 안 된다.
 * ⚠️ 읽기 전용은 `disabled`가 아니라 감싼 div의 `inert`+`pointer-events-none`으로 만든다:
 *    `disabled`를 주면 캘린더 전체가 opacity-50으로 흐려져 프렌더 화면과 인상이 달라진다.
 *    클릭·포커스가 아예 안 들어오므로 selected 내부 상태도 바뀔 수 없다(월 이동도 막히지만 아래 monthsSpanned로 덮는다).
 */
export default function PrepSessionCalendar({ dates, className }: { dates: string[]; className?: string }) {
  if (dates.length === 0) return null;

  // ⚠️ 문자열을 new Date로 파싱하면 UTC라 KST에서 하루 앞 칸이 칠해진다 → toLocalDate 필수.
  const sessionDates = dates.map(toLocalDate);
  const first = sessionDates[0];
  const last = sessionDates[sessionDates.length - 1];
  // 수업일이 있는 달만 그린다 — 20 평일은 최대 27일 span이라 1~2개월이고, 그 사이 달은 반드시 수업이 있다.
  const monthsSpanned = last.getFullYear() * 12 + last.getMonth() - (first.getFullYear() * 12 + first.getMonth()) + 1;

  return (
    <div inert className={`pointer-events-none ${className ?? ""}`}>
      <Calendar
        mode="multiple"
        selected={sessionDates}
        defaultMonth={first}
        numberOfMonths={monthsSpanned}
        locale={koLocale}
        weekStartsOn={0}
        showOutsideDays={false}
        formatters={{ formatWeekdayName: (d: Date) => d.toLocaleDateString("ko-KR", { weekday: "short" }) }}
        modifiers={{ sunday: { dayOfWeek: [0] }, saturday: { dayOfWeek: [6] } }}
        modifiersClassNames={{ sunday: "!text-brand", saturday: "!text-accent-blue-ink" }}
        className="mt-2"
      />
    </div>
  );
}
