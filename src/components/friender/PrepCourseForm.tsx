"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ko as koLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { buildWeekdaySessions, fmtDateKo, fmtDateShort, formatWon, kstToday, toLocalDate } from "@/lib/prep";
import {
  type PrepStatus,
  PREP_DEFAULT_CAPACITY,
  PREP_DEFAULT_DURATION,
  PREP_DURATIONS,
  PREP_DEFAULT_PRICE_KRW,
  PREP_MAX_CAPACITY,
  PREP_MAX_PRICE_KRW,
  PREP_MIN_CAPACITY,
  PREP_MIN_PRICE_KRW,
  PREP_SESSION_COUNT,
  PREP_TOPIC_MAX,
} from "@/data/prep";
import { ROOM_LEVELS, DEFAULT_ROOM_LEVEL, roomLevelLabelKo } from "@/data/room-levels";
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
  status: PrepStatus; // 개설 심사 상태 — docs/prep.md의 상태 기계
  adminNote: string | null; // 거절 사유
  sessions: { date: string; topic: string | null }[]; // 날짜 오름차순
};

// 서버 액션(createPrepCourse/updatePrepCourse)이 받는 모양 그대로.
export type PrepFormValues = {
  title: string;
  description: string;
  level: string;
  capacity: number;
  priceKrw: number;
  startMin: number;
  durationMin: number;
  sessions: { date: string; topic: string }[];
};

// 시작 시각 — 연습방과 같은 규칙(10분 단위, 시·분 분리, 기본값 없음).
const START_STEP = 10;
const START_HOURS: number[] = [];
for (let h = 0; h < 24; h++) START_HOURS.push(h);
const START_MINUTES: number[] = [];
for (let m = 0; m < 60; m += START_STEP) START_MINUTES.push(m);

const pad2 = (n: number): string => String(n).padStart(2, "0");

// ⚠️ Calendar(react-day-picker)는 로컬 타임존 Date를 준다 — toISOString을 쓰면 KST에서 하루 밀린다.
//    로컬 연·월·일을 직접 조립한다(반대 방향은 공용 toLocalDate).
const toKey = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const emptyTopics = (): string[] => Array.from({ length: PREP_SESSION_COUNT }, () => "");

type Fields = {
  title: string;
  description: string;
  level: string;
  capacity: string;
  priceKrw: string;
  startHour: number | null;
  startMinute: number | null;
  durationMin: number;
  startDate: string;
};

const startMinOf = (f: Fields): number | null => (f.startHour === null || f.startMinute === null ? null : f.startHour * 60 + f.startMinute);

// 초기값 — 개설은 빈 폼, 수정은 강좌 값에서 출발한다.
const fieldsOf = (c: PrepCourse | null): Fields =>
  c
    ? {
        title: c.title,
        description: c.description ?? "",
        level: c.level,
        capacity: String(c.capacity),
        priceKrw: String(c.priceKrw),
        startHour: Math.floor(c.startMin / 60),
        startMinute: c.startMin % 60,
        durationMin: c.durationMin,
        startDate: c.sessions[0]?.date ?? "",
      }
    : {
        title: "",
        description: "",
        level: DEFAULT_ROOM_LEVEL,
        capacity: String(PREP_DEFAULT_CAPACITY),
        priceKrw: String(PREP_DEFAULT_PRICE_KRW),
        startHour: null,
        startMinute: null,
        durationMin: PREP_DEFAULT_DURATION,
        startDate: "",
      };

const datesOf = (c: PrepCourse | null): string[] => (c ? c.sessions.map((s) => s.date) : []);
// 주제는 회차 번호에 붙으므로 인덱스로만 매칭하고, 길이는 항상 PREP_SESSION_COUNT로 고정한다.
const topicsOf = (c: PrepCourse | null): string[] => emptyTopics().map((t, i) => c?.sessions[i]?.topic?.trim() || t);

// dirty 판정 — 값 비교라 "고쳤다가 되돌린" 경우는 dirty로 보지 않는다(수정 모달 닫기 가드용).
const snapshotOf = (f: Fields, dates: string[], topics: string[]): string => JSON.stringify([f, dates, topics]);

type Props = {
  mode: "create" | "edit";
  initial?: PrepCourse | null;
  /** 이미 시작된 '승인' 강좌 — 일정(일자)·시각을 잠근다(서버도 같은 판정으로 기존 값을 유지한다). */
  scheduleLocked?: boolean;
  pending: boolean;
  onSubmit: (values: PrepFormValues) => void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** 모달 안에서 쓸 때 확인 다이얼로그를 패널(z-120) 위로 올린다. */
  confirmClassName?: string;
};

export default function PrepCourseForm({
  mode,
  initial = null,
  scheduleLocked = false,
  pending,
  onSubmit,
  onCancel,
  onDirtyChange,
  confirmClassName,
}: Props) {
  const [form, setForm] = useState<Fields>(() => fieldsOf(initial));
  const [dates, setDates] = useState<string[]>(() => datesOf(initial)); // 회차 일자(YYYY-MM-DD, 오름차순)
  // ⚠️ 주제는 날짜가 아니라 '회차 번호'에 붙는다 — 캘린더에서 일자를 바꿔도 1강 주제는 1강에 남는다.
  const [topics, setTopics] = useState<string[]>(() => topicsOf(initial));
  const [bulk, setBulk] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const today = useMemo(() => kstToday(), []);
  const set = (patch: Partial<Fields>) => setForm((f) => ({ ...f, ...patch }));

  const initialSnapshot = useMemo(() => snapshotOf(fieldsOf(initial), datesOf(initial), topicsOf(initial)), [initial]);
  const dirty = snapshotOf(form, dates, topics) !== initialSnapshot;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // 시작일을 고르면 그날부터 평일로 20회를 자동으로 채운다(이후 캘린더에서 개별 조정).
  const pickStartDate = (value: string) => {
    set({ startDate: value });
    setDates(value ? buildWeekdaySessions(value, PREP_SESSION_COUNT) : []);
  };

  const selectedDates = useMemo(() => dates.map(toLocalDate), [dates]);
  const startMin = startMinOf(form);
  const filledTopics = useMemo(() => topics.filter((t) => t.trim()).length, [topics]);
  // form.priceKrw는 숫자만 담는다(표시할 때만 콤마를 붙인다). 빈칸은 미입력으로 보고 제출을 막는다.
  const priceKrw = Number(form.priceKrw);
  const priceValid = form.priceKrw !== "" && Number.isInteger(priceKrw) && priceKrw >= PREP_MIN_PRICE_KRW && priceKrw <= PREP_MAX_PRICE_KRW;

  // 심사 중·승인된 강좌만 커리큘럼 완결을 요구한다. 초안·거절은 주제를 나눠 채울 수 있다(서버 규칙과 짝).
  const status: PrepStatus | null = initial?.status ?? null;
  const topicsRequired = status === "신청" || status === "승인";
  const canSubmit =
    !!form.title.trim() &&
    startMin !== null &&
    priceValid &&
    dates.length === PREP_SESSION_COUNT &&
    (!topicsRequired || filledTopics === PREP_SESSION_COUNT) &&
    !pending;

  // 승인된 강좌에서 **심사 대상 항목**이 실제로 바뀌었는지 — 바뀐 경우에만 승인이 해제된다(서버 updatePrepCourse와 같은 규칙).
  // 소개·회차 주제는 자유 수정이라 여기 없다.
  const materialChanged =
    !!initial &&
    (form.title.trim() !== initial.title ||
      form.level !== initial.level ||
      Number(form.capacity) !== initial.capacity ||
      Number(form.priceKrw) !== initial.priceKrw ||
      startMin !== initial.startMin ||
      form.durationMin !== initial.durationMin ||
      dates.join(",") !== initial.sessions.map((s) => s.date).join(","));
  const willRevoke = status === "승인" && materialChanged;

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

  const confirmSubmit = () => {
    setConfirmOpen(false); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    if (!canSubmit || startMin === null) return;
    onSubmit({
      title: form.title,
      description: form.description,
      level: form.level,
      capacity: Number(form.capacity),
      priceKrw: Number(form.priceKrw),
      startMin,
      durationMin: form.durationMin,
      sessions: dates.map((date, i) => ({ date, topic: topics[i] ?? "" })),
    });
  };

  const editing = mode === "edit";
  const selectClass = "border-rule focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none disabled:opacity-60";
  // ⚠️ Zoom URL 미등록은 저장을 막지 않는다 — 초안을 먼저 써 두고 나중에 등록할 수 있다(승인 요청에서 막힌다).
  const disabled = pending;

  // 저장 버튼 문구 — '작성중'/신규는 임시저장, 이미 요청·승인·거절된 강좌는 수정 저장.
  const saveLabel = status === null || status === "작성중" ? "임시저장" : "수정 저장";

  return (
    <>
      {status === "거절" && initial?.adminNote?.trim() && (
        <div className="border-brand/30 bg-brand/5 mb-4 rounded-xl border px-4 py-3">
          <p className="text-brand text-sm font-bold">승인되지 않았습니다</p>
          <p className="text-ink mt-1 text-sm whitespace-pre-wrap">{initial.adminNote}</p>
          <p className="text-muted-fg-faint mt-1 text-xs">내용을 수정한 뒤 목록에서 「승인 다시 요청」을 눌러 주세요.</p>
        </div>
      )}
      {/* 승인된 강좌 — 무엇을 자유롭게 고칠 수 있는지 먼저 알려 주고, 실제로 심사 대상을 건드렸을 때만 경고한다. */}
      {status === "승인" && (
        <div className="border-rule bg-surface mb-4 rounded-xl border px-4 py-3 text-sm">
          <p className="font-semibold">
            승인된 강좌입니다. <span className="text-muted-fg font-normal">강좌 소개와 회차 주제는 자유롭게 수정할 수 있어요.</span>
          </p>
          <p className={cn("mt-1 text-xs", willRevoke ? "text-brand font-bold" : "text-muted-fg-faint")}>
            {willRevoke
              ? "심사 대상 항목이 바뀌었습니다 — 저장하면 승인이 해제되고 다시 심사를 받습니다."
              : "수강료·수업 일자·시각·정원·난이도·강좌명을 바꾸면 다시 심사를 받습니다."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              disabled={disabled || scheduleLocked}
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
              disabled={disabled || scheduleLocked}
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
            disabled={disabled || scheduleLocked}
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

        <label className="flex flex-col gap-1">
          <span className="text-muted-fg-faint text-xs font-semibold">
            수강료 (원) <span className="text-brand">*</span>
          </span>
          {/* 천 단위 구분점을 보여주려면 type="number"로는 안 된다(콤마를 못 담는다) →
              text + inputMode="numeric"으로 두고 상태는 숫자만, 화면에는 포맷해서 보여준다. */}
          <Input
            type="text"
            inputMode="numeric"
            value={form.priceKrw === "" ? "" : Number(form.priceKrw).toLocaleString("ko-KR")}
            disabled={disabled}
            onChange={(e) => set({ priceKrw: e.target.value.replace(/\D/g, "").slice(0, 9) })}
            placeholder="20,000"
            className="h-10"
          />
          <span className="text-muted-fg-faint text-xs">월 {PREP_SESSION_COUNT}회 기준</span>
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
            disabled={disabled || scheduleLocked}
            onChange={(e) => pickStartDate(e.target.value)}
            className={selectClass}
          />
          <span className="text-muted-fg-faint text-xs">
            {scheduleLocked
              ? "이미 시작된 강좌라 일정과 시각은 바꿀 수 없습니다."
              : `시작일을 고르면 평일 기준으로 ${PREP_SESSION_COUNT}회가 자동으로 채워집니다.`}
          </span>
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
          <p className="text-muted-fg-faint mt-0.5 text-xs">
            {scheduleLocked
              ? "이미 시작된 강좌라 일자는 고정입니다."
              : `날짜를 눌러 빼거나 더할 수 있어요. ${PREP_SESSION_COUNT}회를 맞춰야 저장됩니다.`}
          </p>

          <Calendar
            mode="multiple"
            selected={selectedDates}
            onSelect={scheduleLocked ? undefined : onSelectDates}
            defaultMonth={selectedDates[0]}
            disabled={scheduleLocked ? true : { before: toLocalDate(today) }}
            locale={koLocale}
            weekStartsOn={0}
            showOutsideDays={false}
            formatters={{ formatWeekdayName: (d: Date) => d.toLocaleDateString("ko-KR", { weekday: "short" }) }}
            modifiers={{ sunday: { dayOfWeek: [0] }, saturday: { dayOfWeek: [6] } }}
            modifiersClassNames={{ sunday: "!text-brand", saturday: "!text-accent-blue-ink" }}
            className="mt-2"
          />

          <p className="text-muted-fg mt-2 text-xs">
            {fmtDateKo(dates[0])} ~ {fmtDateKo(dates[dates.length - 1])}
          </p>
        </div>
      )}

      {/* 회차별 주제 — 20개 모두 필수. 주제는 회차 번호에 붙으므로 날짜를 바꿔도 그대로 남는다. */}
      {dates.length > 0 && (
        <div className="border-rule mt-4 rounded-xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink text-sm font-bold">회차별 주제</p>
            {/* 초안에서는 미완이 정상이라 빨강으로 경고하지 않는다(심사 요청 때 채우면 된다). */}
            <p
              className={cn("text-sm font-bold", filledTopics === PREP_SESSION_COUNT ? "text-cta" : topicsRequired ? "text-brand" : "text-muted-fg")}>
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
          수강료 <span className="text-ink font-bold">{priceValid ? formatWon(priceKrw) : "-"}</span>
          <span className="text-muted-fg-faint font-normal"> (월 {PREP_SESSION_COUNT}회)</span>
        </p>
        {onCancel && (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            취소
          </Button>
        )}
        <Button type="button" variant="brand" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
          {pending && <Loader2 className="animate-spin" />}
          {saveLabel}
        </Button>
      </div>
      {/* 저장과 심사 요청은 분리돼 있다 — 요청 버튼은 목록 행에 있다(PrepManager). */}
      {(status === null || status === "작성중") && (
        <p className="text-muted-fg-faint mt-2 text-right text-xs">저장한 뒤 목록에서 「승인 요청」을 눌러야 심사가 시작됩니다.</p>
      )}

      {/* 개설·수정 확인 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className={confirmClassName}>
          <AlertDialogHeader>
            <AlertDialogTitle>{willRevoke ? "수정하면 승인이 해제됩니다" : "이 내용으로 저장할까요?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {willRevoke
                ? "심사 대상 항목이 바뀌어, 저장하면 상태가 「심사 중」으로 돌아가고 관리자에게 다시 심사 요청이 갑니다."
                : status === "승인"
                  ? "소개·회차 주제만 바뀝니다. 승인은 그대로 유지됩니다."
                  : status === "신청"
                    ? "심사 중인 강좌입니다. 저장해도 상태는 그대로 「심사 중」으로 남습니다."
                    : scheduleLocked
                      ? "이미 시작된 강좌라 일정과 시각은 그대로 유지되고, 나머지 내용만 바뀝니다."
                      : editing
                        ? "수업 일자와 주제가 입력한 대로 교체됩니다. 저장만으로는 심사가 시작되지 않습니다."
                        : "임시저장됩니다. 목록에서 「승인 요청」을 눌러야 심사가 시작됩니다."}
            </AlertDialogDescription>
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
                ["수강료", priceValid ? formatWon(priceKrw) : "-"],
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
            <AlertDialogAction onClick={confirmSubmit} variant="brand">
              {saveLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
