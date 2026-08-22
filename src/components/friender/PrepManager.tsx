"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ko as koLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { buildWeekdaySessions } from "@/lib/prep";
import {
  PREP_DEFAULT_DURATION,
  PREP_DURATIONS,
  PREP_MAX_CAPACITY,
  PREP_MIN_CAPACITY,
  PREP_MONTHLY_PRICE_KRW,
  PREP_SESSION_COUNT,
  PREP_TOPIC_MAX,
} from "@/data/prep";
import { ROOM_LEVELS, DEFAULT_ROOM_LEVEL, roomLevelLabelKo } from "@/data/room-levels";
import { createPrepCourse } from "@/app/friender/prep-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type PrepCourse = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  startMin: number;
  durationMin: number;
  sessionCount: number;
  priceKrw: number;
  sessions: { date: string; topic: string | null }[]; // 날짜 오름차순
};

// 시작 시각 — 연습방과 같은 규칙(10분 단위, 시·분 분리, 기본값 없음).
const START_STEP = 10;
const START_HOURS: number[] = [];
for (let h = 0; h < 24; h++) START_HOURS.push(h);
const START_MINUTES: number[] = [];
for (let m = 0; m < 60; m += START_STEP) START_MINUTES.push(m);

const pad2 = (n: number): string => String(n).padStart(2, "0");

// ⚠️ Calendar(react-day-picker)는 로컬 타임존 Date를 준다 — toISOString을 쓰면 KST에서 하루 밀린다.
//    로컬 연·월·일을 직접 조립하고, 반대 방향도 로컬 자정 Date로 만든다.
const toKey = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toDate = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const kstToday = (): string => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const fmtDateKo = (key: string): string => {
  const [, m, d] = key.split("-").map(Number);
  return `${m}월 ${d}일`;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

// "9/07(월)" — 회차 목록처럼 좁은 자리에서 쓴다.
const fmtDateShort = (key: string): string => {
  const [, m, d] = key.split("-").map(Number);
  return `${m}/${pad2(d)}(${WEEKDAY_KO[toDate(key).getDay()]})`;
};

const emptyTopics = (): string[] => Array.from({ length: PREP_SESSION_COUNT }, () => "");

const won = (n: number): string => `${n.toLocaleString("ko-KR")}원`;

type Fields = {
  title: string;
  description: string;
  level: string;
  capacity: string;
  startHour: number | null;
  startMinute: number | null;
  durationMin: number;
  startDate: string;
};

const emptyForm = (): Fields => ({
  title: "",
  description: "",
  level: DEFAULT_ROOM_LEVEL,
  capacity: "4",
  startHour: null,
  startMinute: null,
  durationMin: PREP_DEFAULT_DURATION,
  startDate: "",
});

const startMinOf = (f: Fields): number | null => (f.startHour === null || f.startMinute === null ? null : f.startHour * 60 + f.startMinute);

export default function PrepManager({ courses, hasZoomUrl }: { courses: PrepCourse[]; hasZoomUrl: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<Fields>(emptyForm);
  const [dates, setDates] = useState<string[]>([]); // 회차 일자(YYYY-MM-DD, 오름차순)
  // ⚠️ 주제는 날짜가 아니라 '회차 번호'에 붙는다 — 캘린더에서 일자를 바꿔도 1강 주제는 1강에 남는다.
  //    그래서 dates와 topics를 인덱스로만 매칭하고, topics 길이는 항상 PREP_SESSION_COUNT로 고정한다.
  const [topics, setTopics] = useState<string[]>(emptyTopics);
  const [bulk, setBulk] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const today = useMemo(() => kstToday(), []);
  const set = (patch: Partial<Fields>) => setForm((f) => ({ ...f, ...patch }));

  // 시작일을 고르면 그날부터 평일로 20회를 자동으로 채운다(이후 캘린더에서 개별 조정).
  const pickStartDate = (value: string) => {
    set({ startDate: value });
    setDates(value ? buildWeekdaySessions(value, PREP_SESSION_COUNT) : []);
  };

  const selectedDates = useMemo(() => dates.map(toDate), [dates]);
  const startMin = startMinOf(form);
  const filledTopics = useMemo(() => topics.filter((t) => t.trim()).length, [topics]);
  const canCreate =
    hasZoomUrl && !!form.title.trim() && startMin !== null && dates.length === PREP_SESSION_COUNT && filledTopics === PREP_SESSION_COUNT && !pending;

  const setTopicAt = (index: number, value: string) => setTopics((prev) => prev.map((t, i) => (i === index ? value : t)));

  // 여러 줄을 한 번에 붙여넣어 앞에서부터 채운다 — 20칸을 매번 타이핑하지 않도록.
  const applyBulk = () => {
    const lines = bulk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, PREP_SESSION_COUNT);
    if (lines.length === 0) return;
    setTopics((prev) => prev.map((t, i) => lines[i] ?? t));
    setBulk("");
    toast.success(`주제 ${lines.length}개를 채웠습니다.`);
  };

  const onSelectDates = (next: Date[] | undefined) => {
    // 과거 날짜는 서버가 어차피 거부하므로 선택 단계에서 걸러 준다.
    const keys = (next ?? []).map(toKey).filter((k) => k > today);
    setDates(Array.from(new Set(keys)).sort());
  };

  const confirmCreate = () => {
    setConfirmOpen(false); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!canCreate || startMin === null) return;
    startTransition(async () => {
      const res = await createPrepCourse({
        title: form.title,
        description: form.description,
        level: form.level,
        capacity: Number(form.capacity),
        startMin,
        durationMin: form.durationMin,
        sessions: dates.map((date, i) => ({ date, topic: topics[i] ?? "" })),
      });
      if (res.ok) {
        setForm(emptyForm());
        setDates([]);
        setTopics(emptyTopics());
        router.refresh();
        toast.success("강좌를 개설했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const selectClass = "border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none disabled:opacity-60";
  const disabled = !hasZoomUrl || pending;

  return (
    <div>
      <h2 className="text-ink text-lg font-extrabold">프렙 강좌</h2>
      <p className="text-muted-fg mt-1 text-sm">
        월 {PREP_SESSION_COUNT}회 정규 과정을 개설합니다. 기본 수업일은 매주 월~금이고, 필요하면 캘린더에서 일자를 바꿀 수 있어요.
      </p>

      {!hasZoomUrl && (
        <div className="border-brand/30 bg-brand/5 text-brand mt-4 rounded-xl border px-4 py-3 text-sm font-semibold">
          Zoom URL이 등록되어 있지 않습니다. 「프로필」 탭에서 Zoom URL을 먼저 등록해 주세요.
        </div>
      )}

      {/* 개설 폼 */}
      <div className="border-rule mt-4 rounded-xl border bg-white p-5">
        <h3 className="text-ink text-sm font-extrabold">새 강좌 개설</h3>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-muted-fg-faint text-xs font-semibold">
              강좌명 <span className="text-brand">*</span>
            </span>
            <Input
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              disabled={disabled}
              maxLength={100}
              placeholder="예) 매일 20분 비즈니스 영어"
              className="h-10"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-muted-fg-faint text-center text-xs font-semibold">
              시작 시각 <span className="text-brand">*</span>
            </span>
            {/* 기본값 없음 — 실제 수업 시각이라 확인 없이 제출되면 안 된다(연습방과 같은 규칙). */}
            <div className="flex items-center gap-1.5">
              <select
                aria-label="시작 시각 (시)"
                value={form.startHour ?? ""}
                disabled={disabled}
                onChange={(e) => set({ startHour: e.target.value === "" ? null : Number(e.target.value) })}
                className={cn(selectClass, "flex-1", form.startHour === null && "text-muted-fg-faint")}>
                <option value="">시</option>
                {START_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {pad2(h)}
                  </option>
                ))}
              </select>
              <span aria-hidden className="text-muted-fg text-sm font-bold">
                :
              </span>
              <select
                aria-label="시작 시각 (분)"
                value={form.startMinute ?? ""}
                disabled={disabled}
                onChange={(e) => set({ startMinute: e.target.value === "" ? null : Number(e.target.value) })}
                className={cn(selectClass, "flex-1", form.startMinute === null && "text-muted-fg-faint")}>
                <option value="">분</option>
                {START_MINUTES.map((m) => (
                  <option key={m} value={m}>
                    {pad2(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-muted-fg-faint text-xs font-semibold">진행 시간</span>
            <select
              value={form.durationMin}
              disabled={disabled}
              onChange={(e) => set({ durationMin: Number(e.target.value) })}
              className={selectClass}>
              {PREP_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}분
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-muted-fg-faint text-xs font-semibold">난이도</span>
            <select value={form.level} disabled={disabled} onChange={(e) => set({ level: e.target.value })} className={selectClass}>
              {ROOM_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.ko}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-muted-fg-faint text-xs font-semibold">
              제한 인원 ({PREP_MIN_CAPACITY}~{PREP_MAX_CAPACITY}명)
            </span>
            <Input
              type="number"
              min={PREP_MIN_CAPACITY}
              max={PREP_MAX_CAPACITY}
              value={form.capacity}
              disabled={disabled}
              onChange={(e) => set({ capacity: e.target.value })}
              className="h-10"
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-muted-fg-faint text-xs font-semibold">강좌 소개 (선택)</span>
            <Textarea
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              disabled={disabled}
              rows={3}
              maxLength={1000}
              placeholder="어떤 강좌인지 소개해 주세요."
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-muted-fg-faint text-xs font-semibold">
              시작일 <span className="text-brand">*</span>
            </span>
            <input
              type="date"
              value={form.startDate}
              min={today}
              disabled={disabled}
              onChange={(e) => pickStartDate(e.target.value)}
              className={selectClass}
            />
            <span className="text-muted-fg-faint text-xs">시작일을 고르면 평일 기준으로 {PREP_SESSION_COUNT}회가 자동으로 채워집니다.</span>
          </label>
        </div>

        {/* 회차 캘린더 — 자동으로 채운 일자를 보여주고, 날짜를 눌러 빼거나 더한다. */}
        {dates.length > 0 && (
          <div className="border-rule mt-4 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink text-sm font-bold">수업 일자</p>
              <p className={cn("text-sm font-bold", dates.length === PREP_SESSION_COUNT ? "text-cta" : "text-brand")}>
                {dates.length}/{PREP_SESSION_COUNT}
              </p>
            </div>
            <p className="text-muted-fg-faint mt-0.5 text-xs">날짜를 눌러 빼거나 더할 수 있어요. {PREP_SESSION_COUNT}회를 맞춰야 개설됩니다.</p>

            <Calendar
              mode="multiple"
              selected={selectedDates}
              onSelect={onSelectDates}
              defaultMonth={selectedDates[0]}
              disabled={{ before: toDate(today) }}
              locale={koLocale}
              weekStartsOn={0}
              showOutsideDays={false}
              formatters={{ formatWeekdayName: (d: Date) => d.toLocaleDateString("ko-KR", { weekday: "short" }) }}
              modifiers={{ sunday: { dayOfWeek: [0] }, saturday: { dayOfWeek: [6] } }}
              modifiersClassNames={{ sunday: "!text-brand", saturday: "!text-accent-blue-ink" }}
              className="mt-2"
            />

            {dates.length > 0 && (
              <p className="text-muted-fg mt-2 text-xs">
                {fmtDateKo(dates[0])} ~ {fmtDateKo(dates[dates.length - 1])}
              </p>
            )}
          </div>
        )}

        {/* 회차별 주제 — 20개 모두 필수. 주제는 회차 번호에 붙으므로 날짜를 바꿔도 그대로 남는다. */}
        {dates.length > 0 && (
          <div className="border-rule mt-4 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink text-sm font-bold">회차별 주제</p>
              <p className={cn("text-sm font-bold", filledTopics === PREP_SESSION_COUNT ? "text-cta" : "text-brand")}>
                {filledTopics}/{PREP_SESSION_COUNT}
              </p>
            </div>

            {/* 일괄 입력 — 20칸을 매번 타이핑하지 않도록 여러 줄을 한 번에 채운다. */}
            <div className="bg-surface mt-2 rounded-lg p-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-muted-fg-faint text-xs font-semibold">한 번에 채우기 (한 줄에 하나씩)</span>
                <Textarea
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  disabled={disabled}
                  rows={3}
                  placeholder={"카페에서 주문하기\n공항 체크인\n호텔 예약하기"}
                />
              </label>
              <div className="mt-2 flex justify-end">
                <Button type="button" variant="outline" size="sm" disabled={disabled || !bulk.trim()} onClick={applyBulk}>
                  채우기
                </Button>
              </div>
            </div>

            <ul className="mt-3 list-none space-y-1.5">
              {topics.map((topic, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-muted-fg-faint w-20 shrink-0 text-xs font-semibold">
                    {i + 1}강 {dates[i] ? fmtDateShort(dates[i]) : "-"}
                  </span>
                  <Input
                    value={topic}
                    onChange={(e) => setTopicAt(i, e.target.value)}
                    disabled={disabled}
                    maxLength={PREP_TOPIC_MAX}
                    placeholder={`${i + 1}강 주제`}
                    className="h-9"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <p className="text-muted-fg mr-auto text-sm font-semibold">
            수강료 <span className="text-ink font-bold">{won(PREP_MONTHLY_PRICE_KRW)}</span>
            <span className="text-muted-fg-faint font-normal"> (월 {PREP_SESSION_COUNT}회 · 관리자 지정)</span>
          </p>
          <Button type="button" variant="brand" disabled={!canCreate} onClick={() => setConfirmOpen(true)}>
            {pending && <Loader2 className="animate-spin" />}강좌 개설하기
          </Button>
        </div>
      </div>

      {/* 개설된 강좌 */}
      <h3 className="text-ink mt-8 text-sm font-extrabold">내 강좌 ({courses.length})</h3>
      <div className="border-rule mt-2 overflow-hidden rounded-xl border bg-white">
        {courses.length === 0 ? (
          <p className="text-muted-fg px-6 py-10 text-center text-sm">개설한 강좌가 없습니다.</p>
        ) : (
          <ul className="list-none">
            {courses.map((c) => (
              <li key={c.id} className="border-rule border-b px-4 py-3.5 last:border-b-0 md:px-6">
                <p className="text-ink text-sm font-bold">{c.title}</p>
                <p className="text-muted-fg mt-0.5 text-xs">
                  {c.sessions.length > 0 && `${fmtDateKo(c.sessions[0].date)} ~ ${fmtDateKo(c.sessions[c.sessions.length - 1].date)} · `}
                  {fmtTime(c.startMin)}~{fmtRoomEnd(c.startMin + c.durationMin)} · {c.sessionCount}회
                </p>
                <p className="text-muted-fg-faint mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="bg-accent-blue-soft text-accent-blue-ink rounded-full px-2 py-0.5 font-bold">{roomLevelLabelKo(c.level)}</span>
                  <span>정원 {c.capacity}명</span>
                  <span>{won(c.priceKrw)}</span>
                </p>

                {/* 커리큘럼 — 회차가 20개라 기본은 접어 둔다(마이페이지 수강신청 내역과 같은 네이티브 details). */}
                {c.sessions.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-accent-blue-ink cursor-default text-xs font-bold">커리큘럼 {c.sessions.length}회 보기</summary>
                    <ol className="text-muted-fg mt-1.5 list-none space-y-1 text-xs">
                      {c.sessions.map((s, i) => (
                        <li key={s.date} className="flex gap-2">
                          <span className="text-muted-fg-faint w-20 shrink-0">
                            {i + 1}강 {fmtDateShort(s.date)}
                          </span>
                          <span className="text-ink break-words">{s.topic?.trim() || "-"}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 개설 확인 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 내용으로 강좌를 개설할까요?</AlertDialogTitle>
            <AlertDialogDescription>개설 후에는 수업 일자와 내용을 바꿀 수 없습니다(수정 기능은 준비 중이에요).</AlertDialogDescription>
          </AlertDialogHeader>

          {/* ⚠️ AlertDialogDescription은 <p>라 dl을 그 안에 넣을 수 없다 — 형제로 배치한다. */}
          <dl className="border-rule mt-1 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 border-t pt-4 text-sm">
            {(
              [
                ["강좌명", form.title.trim()],
                ["기간", dates.length > 0 ? `${fmtDateKo(dates[0])} ~ ${fmtDateKo(dates[dates.length - 1])} (${dates.length}회)` : "-"],
                ["시각", startMin !== null ? `${fmtTime(startMin)}~${fmtRoomEnd(startMin + form.durationMin)} (${form.durationMin}분)` : "-"],
                ["난이도", roomLevelLabelKo(form.level)],
                ["제한 인원", `${form.capacity}명`],
                ["주제", topics[0]?.trim() ? `1강 ${topics[0].trim()} 외 ${PREP_SESSION_COUNT - 1}개` : "-"],
                ["수강료", won(PREP_MONTHLY_PRICE_KRW)],
              ] as const
            ).map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-muted-fg-faint">{label}</dt>
                <dd className="text-ink font-semibold break-words">{value}</dd>
              </Fragment>
            ))}
          </dl>

          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCreate} variant="brand">
              개설하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
