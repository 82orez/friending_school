"use client";

import { type CSSProperties, type ReactNode, useActionState, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CheckCircle2, ChevronLeft, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import EnrollScheduleField from "@/components/course/EnrollScheduleField";
import { submitEnrollment, type EnrollTeacherCard } from "@/app/courses/enroll-actions";
import { TOTAL_SESSIONS, lessonEndDate, slotsOverlap, summarizeSlots, teacherHasAllSlots, type Slot } from "@/lib/availability";
import { nationalityLabel } from "@/data/nationalities";
import { genderLabelKo } from "@/data/genders";
import { cn } from "@/lib/utils";

export default function EnrollWizard({
  courseSlug,
  courseTitle,
  courseEnglishTitle,
  coursePrice,
  teachers,
}: {
  courseSlug: string;
  courseTitle: string;
  courseEnglishTitle: string;
  coursePrice: string;
  teachers: EnrollTeacherCard[];
}) {
  const [step, setStep] = useState(1);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [teacherId, setTeacherId] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(submitEnrollment, {} as { error?: string; success?: boolean });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const startDate = date ? format(date, "yyyy-MM-dd") : "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 오늘+3일(D+3)부터 선택 가능. 달력은 이 날짜 이전(오늘~오늘+2일)을 비활성.
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() + 3);
  // 상한: 오늘+14일까지만 선택 가능(2주 이내).
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 14);

  // 선택 슬롯 전부 비는 강사만 라이브 필터(관리자 finder와 동일 패턴, 추가 쿼리 0).
  const matches = useMemo(() => (slots.length === 0 ? [] : teachers.filter((t) => teacherHasAllSlots(t.slots, slots))), [teachers, slots]);
  // 일정 변경으로 선택 강사가 매칭에서 빠지면 자동 무효(다음 버튼 비활성).
  const selectedTeacher = matches.find((t) => t.id === teacherId) ?? null;
  // 선택한 시간이 다른 학생의 진행중 신청('신청'/'결제대기')과 겹치면 경고(하드 차단 아님 — 확인 후 신청 가능).
  const overlapWarning = !!selectedTeacher && slotsOverlap(slots, selectedTeacher.heldSlots);

  // 시작일은 신청한 요일 중 하나여야 함(주간 반복 수업의 첫 수업일). day: 0=일, JS getDay와 동일.
  const allowedDays = useMemo(() => new Set(slots.map((s) => s.day)), [slots]);
  // 1단계로 돌아가 요일을 바꿔 기존 선택일이 허용 요일에서 빠지면 초기화.
  useEffect(() => {
    if (date && !allowedDays.has(date.getDay())) setDate(undefined);
  }, [allowedDays, date]);

  // 종료일 = 시작일부터 주간 일정(선택 요일)대로 진행해 TOTAL_SESSIONS회째 수업이 있는 날.
  // 강사 알림 메일도 같은 lessonEndDate를 써서 학생이 본 값과 일치.
  const endDate = useMemo(() => {
    if (!date || slots.length === 0) return "";
    const last = lessonEndDate(date, slots, TOTAL_SESSIONS);
    return last ? format(last, "yyyy-MM-dd") : "";
  }, [date, slots]);

  // 제출 성공 시 성공 화면.
  if (state.success) {
    return (
      <div className="border-rule mx-auto max-w-[560px] rounded-2xl border bg-white p-8 text-center md:p-10">
        <CheckCircle2 className="text-progress mx-auto mb-4 size-14" aria-hidden />
        <h2 className="text-ink text-xl font-bold">수강신청이 접수되었습니다</h2>
        <p className="text-muted-fg mt-3 text-sm leading-relaxed">
          선택하신 강사님께 신청이 전달되었어요.
          <br />
          강사님이 승인/거절하면 <strong className="text-ink">문자(SMS)</strong>로 결과를 안내드립니다.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/mypage" className={cn("bg-cta rounded-full px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90")}>
            신청 내역 보기
          </Link>
          <Link
            href="/#courses"
            className="border-rule text-ink hover:bg-surface rounded-full border bg-white px-5 py-2.5 text-sm font-bold transition-colors">
            다른 과정 보기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px]">
      {/* 단계 표시 */}
      <ol className="mb-6 flex items-center justify-center gap-2 text-sm font-bold">
        {[
          [1, "일정·강사 선택"],
          [2, "시작일"],
          [3, "확인"],
        ].map(([n, label]) => (
          <li key={n as number} className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full text-xs",
                step >= (n as number) ? "bg-progress text-white" : "bg-rule text-muted-fg",
              )}>
              {n}
            </span>
            <span className={cn(step >= (n as number) ? "text-ink" : "text-muted-fg-faint")}>{label as string}</span>
            {(n as number) < 3 && <span className="text-rule-faint mx-1">—</span>}
          </li>
        ))}
      </ol>

      <div className="border-rule rounded-2xl border bg-white p-5 md:p-7">
        {/* ───── Step 1: 일정 + 강사 (라이브 필터) ───── */}
        {step === 1 && (
          <div>
            <h2 className="text-ink text-lg font-bold">원하는 수업 요일과 시간을 선택하세요</h2>
            <div className="mt-4">
              <EnrollScheduleField onChange={setSlots} />
            </div>

            <div className="border-rule mt-6 border-t pt-6">
              <div className="flex items-center gap-2">
                <h3 className="text-ink text-base font-bold">가능한 강사</h3>
                {slots.length > 0 && matches.length > 0 && <span className="text-muted-fg-faint text-sm">{matches.length}명</span>}
              </div>

              <div className="mt-3">
                {slots.length === 0 ? (
                  <p className="text-muted-fg py-8 text-center text-sm">원하는 요일과 시간을 선택하시면 수업 가능한 강사가 표시됩니다.</p>
                ) : matches.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-muted-fg text-sm">선택한 시간에 가능한 강사가 없어요.</p>
                    <p className="text-muted-fg-faint mt-1 text-sm">요일·시간을 조정해 보세요.</p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {matches.map((t) => {
                      const on = teacherId === t.id;
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => setTeacherId(t.id)}
                            aria-pressed={on}
                            className={cn(
                              "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-colors",
                              on ? "border-progress bg-progress/5" : "border-rule hover:border-rule-faint bg-white",
                            )}>
                            {t.avatarUrl ? (
                              <Image src={t.avatarUrl} alt="" width={56} height={56} className="size-14 shrink-0 rounded-xl object-cover" />
                            ) : (
                              <span className="bg-surface text-muted-fg-faint flex size-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold">
                                {t.name.charAt(0)}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-ink font-bold">{t.name}</p>
                                {on && <CheckCircle2 className="text-progress size-4" aria-hidden />}
                              </div>
                              <p className="text-muted-fg mt-0.5 text-sm">
                                {nationalityLabel(t.nationality)} · {genderLabelKo(t.gender)}
                              </p>
                              {t.bio && <p className="text-muted-fg-faint mt-1 line-clamp-2 text-sm">{t.bio}</p>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="button" variant="brand" disabled={!selectedTeacher} onClick={() => setStep(2)}>
                다음
              </Button>
            </div>
          </div>
        )}

        {/* ───── Step 2: 시작일 선택 ───── */}
        {step === 2 && (
          <div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-muted-fg hover:text-ink inline-flex items-center gap-1 text-sm font-medium">
              <ChevronLeft className="size-4" aria-hidden /> 일정·강사 다시 선택
            </button>
            <h2 className="text-ink mt-3 text-lg font-bold">수업 시작일을 선택하세요</h2>
            {selectedTeacher && (
              <p className="text-muted-fg mt-1 text-sm">
                {selectedTeacher.name} 강사님 · {summarizeSlots(slots)}
              </p>
            )}

            <div className="mt-4 flex justify-center">
              <div className="border-rule rounded-xl border p-3">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  locale={ko}
                  disabled={[{ before: minDate }, { after: maxDate }, (d: Date) => !allowedDays.has(d.getDay())]}
                  className="text-base [--cell-size:--spacing(11)]"
                  style={{ "--cell-size": "2.75rem" } as CSSProperties}
                  classNames={{
                    today: "rounded-(--cell-radius) bg-accent-blue/10 text-accent-blue-ink font-bold ring-1 ring-accent-blue ring-inset !opacity-100",
                  }}
                />
              </div>
            </div>
            {startDate && (
              <p className="text-muted-fg mt-2 text-center text-sm">
                시작일: <span className="text-ink font-medium">{startDate}</span>
              </p>
            )}

            <div className="mt-6 flex justify-end">
              <Button type="button" variant="brand" disabled={!startDate} onClick={() => setStep(3)}>
                다음
              </Button>
            </div>
          </div>
        )}

        {/* ───── Step 3: 확인 ───── */}
        {step === 3 && (
          <div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-muted-fg hover:text-ink inline-flex items-center gap-1 text-sm font-medium">
              <ChevronLeft className="size-4" aria-hidden /> 시작일 다시 선택
            </button>
            <h2 className="text-ink mt-3 text-lg font-bold">신청 내용을 확인하세요</h2>

            <dl className="bg-surface border-rule mt-4 rounded-xl border px-4 py-2">
              {([
                [
                  "과정",
                  <>
                    {courseTitle}
                    <span className="text-muted-fg-faint mt-0.5 block text-xs font-normal">{courseEnglishTitle}</span>
                  </>,
                ],
                ["강사", selectedTeacher?.name ?? "-"],
                ["수업 일정", summarizeSlots(slots)],
                ["시작일", startDate],
                ["종료일", endDate],
                ["수업 횟수", `총 ${TOTAL_SESSIONS}회`],
                ["결제 금액", coursePrice],
              ] as [string, ReactNode][]).map(([label, value]) => (
                <div key={label} className="border-rule flex justify-between gap-4 border-b py-3 last:border-b-0">
                  <dt className="text-muted-fg shrink-0 text-sm">{label}</dt>
                  <dd className="text-ink text-right text-sm font-medium break-words">{value}</dd>
                </div>
              ))}
            </dl>

            {overlapWarning && (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-[#FFF7E6] px-3.5 py-3 text-sm font-medium text-[#B97400]">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>이 시간대에 다른 학생이 먼저 수강신청을 한 상태입니다. 해당 수강신청이 확정되면 이번 수강신청은 취소될 수 있습니다.</span>
              </p>
            )}

            {state.error && (
              <p role="alert" className="text-brand mt-4 text-sm font-medium">
                {state.error}
              </p>
            )}

            {/* 실제 제출 폼(hidden 필드) */}
            <form ref={formRef} action={formAction} className="mt-6">
              <input type="hidden" name="courseSlug" value={courseSlug} />
              <input type="hidden" name="teacherId" value={teacherId ?? ""} />
              <input type="hidden" name="startDate" value={startDate} />
              <input type="hidden" name="slots" value={JSON.stringify(slots)} />
              <div className="flex justify-end">
                <Button type="button" variant="brand" disabled={pending} onClick={() => setConfirmOpen(true)}>
                  {pending ? (
                    <>
                      <Loader2 className="animate-spin" />
                      신청 중
                    </>
                  ) : (
                    "수강 신청하기"
                  )}
                </Button>
              </div>
            </form>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>이대로 수강신청할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {overlapWarning
                      ? "이 시간대에 다른 학생이 먼저 수강신청을 한 상태입니다. 해당 수강신청이 확정되면 이번 수강신청은 취소될 수 있습니다. 수강 신청하시겠습니까?"
                      : `${selectedTeacher?.name} 강사님께 ${courseTitle} 신청이 전달됩니다. 결과는 문자로 안내드려요.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setConfirmOpen(false);
                      formRef.current?.requestSubmit();
                    }}>
                    신청하기
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  );
}
