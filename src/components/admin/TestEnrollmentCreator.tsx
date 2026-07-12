"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CheckCircle2, FlaskConical, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createTestEnrollment } from "@/app/admin/actions";
import EnrollScheduleField from "@/components/course/EnrollScheduleField";
import { teacherHasAllSlots, type Slot } from "@/lib/availability";
import { type EnrollTeacherCard } from "@/app/courses/enroll-actions";
import { nationalityLabel } from "@/data/nationalities";
import { genderLabelKo } from "@/data/genders";

type CourseOpt = { slug: string; title: string };
type StudentOpt = { email: string; label: string };

// 오늘(KST) YYYY-MM-DD — date input 기본값.
function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function TestEnrollmentCreator({
  teachers,
  courses,
  students,
  defaultStudentEmail,
}: {
  teachers: EnrollTeacherCard[];
  courses: CourseOpt[];
  students: StudentOpt[];
  defaultStudentEmail: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-rule-faint rounded-xl border border-dashed bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="text-accent-blue-ink size-4" aria-hidden />
          <div>
            <p className="text-ink text-sm font-bold">테스트 수강신청 생성</p>
            <p className="text-muted-fg-faint text-xs">개발용 — 시작일·수업 횟수 자유. 생성 후 승인 → 결제확인으로 실제 흐름과 동일하게 진행됩니다.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-cta inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90"
        >
          ＋ 생성
        </button>
      </div>
      {open && (
        <CreatorModal teachers={teachers} courses={courses} students={students} defaultStudentEmail={defaultStudentEmail} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function CreatorModal({
  teachers,
  courses,
  students,
  defaultStudentEmail,
  onClose,
}: {
  teachers: EnrollTeacherCard[];
  courses: CourseOpt[];
  students: StudentOpt[];
  defaultStudentEmail: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [studentEmail, setStudentEmail] = useState(
    students.some((s) => s.email === defaultStudentEmail) ? defaultStudentEmail : (students[0]?.email ?? ""),
  );
  const [course, setCourse] = useState(courses[0]?.slug ?? "");
  const [customTitle, setCustomTitle] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(todayKst());
  const [sessions, setSessions] = useState(3);
  const [pending, startTransition] = useTransition();

  // 선택 슬롯 전부 비는 강사만 라이브 필터(실제 위저드와 동일 패턴, 추가 쿼리 0).
  const matches = useMemo(() => (slots.length === 0 ? [] : teachers.filter((t) => teacherHasAllSlots(t.slots, slots))), [teachers, slots]);
  // 일정 변경으로 선택 강사가 매칭에서 빠지면 자동 무효.
  const selectedTeacher = matches.find((t) => t.id === teacherId) ?? null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const submit = () => {
    if (slots.length === 0) {
      toast.error("수업 일정을 선택해 주세요.");
      return;
    }
    if (course === "__custom__" && !customTitle.trim()) {
      toast.error("과정명을 입력해 주세요.");
      return;
    }
    if (!selectedTeacher) {
      toast.error("가능한 강사를 선택해 주세요.");
      return;
    }
    startTransition(async () => {
      const res = await createTestEnrollment({
        studentEmail: studentEmail.trim() || undefined,
        teacherId: selectedTeacher.id,
        course,
        courseTitle: course === "__custom__" ? customTitle.trim() : undefined,
        slots,
        startDate,
        sessions,
      });
      if (res.ok) {
        toast.success("테스트 수강신청을 생성했어요. 승인 → 결제확인으로 진행하세요.");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "생성 중 문제가 발생했어요.");
      }
    });
  };

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="테스트 수강신청 생성"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-rule flex items-center justify-between gap-3 border-b px-6 py-4">
          <h2 className="text-ink text-lg font-bold">테스트 수강신청 생성</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-1 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-auto px-6 py-5">
          <label className="block">
            <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">학생 (가입 회원 · 강사·미인증 제외)</span>
            <select
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
            >
              {students.length === 0 && <option value="">선택 가능한 회원이 없습니다</option>}
              {students.map((s) => (
                <option key={s.email} value={s.email}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">과정</span>
            <select
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
            >
              {courses.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.title}
                </option>
              ))}
              <option value="__custom__">직접 입력…</option>
            </select>
          </label>

          {course === "__custom__" && (
            <label className="block">
              <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">과정명 직접 입력</span>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                maxLength={100}
                placeholder="예) 여름특강 회화반"
                className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
            </label>
          )}

          <div>
            <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">수업 일정 (주간 반복)</span>
            <EnrollScheduleField onChange={setSlots} />
          </div>

          {/* 선택한 요일·시간에 가능한 강사 라이브 검색 → 택일 (실제 위저드와 동일). */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-muted-fg-faint text-xs font-semibold">가능한 강사</span>
              {slots.length > 0 && matches.length > 0 && <span className="text-muted-fg-faint text-xs">{matches.length}명</span>}
            </div>
            <div className="mt-2">
              {slots.length === 0 ? (
                <p className="text-muted-fg-faint py-4 text-center text-sm">요일·시간을 선택하면 가능한 강사가 표시됩니다.</p>
              ) : matches.length === 0 ? (
                <p className="text-muted-fg-faint py-4 text-center text-sm">선택한 시간에 가능한 강사가 없어요. 요일·시간을 조정해 주세요.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {matches.map((t) => {
                    const on = selectedTeacher?.id === t.id;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setTeacherId(t.id)}
                          aria-pressed={on}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                            on ? "border-progress bg-progress/5" : "border-rule hover:border-rule-faint bg-white",
                          )}
                        >
                          {t.avatarUrl ? (
                            <Image src={t.avatarUrl} alt="" width={40} height={40} className="size-10 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <span className="bg-surface text-muted-fg-faint flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
                              {t.name.charAt(0)}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-ink truncate text-sm font-bold">{t.name}</p>
                              {on && <CheckCircle2 className="text-progress size-4 shrink-0" aria-hidden />}
                            </div>
                            <p className="text-muted-fg-faint truncate text-xs">
                              {nationalityLabel(t.nationality)} · {genderLabelKo(t.gender)}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="block">
              <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">시작일 (자유)</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-rule-faint focus:border-accent-blue rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="block">
              <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">수업 횟수 (1~60)</span>
              <input
                type="number"
                min={1}
                max={60}
                value={sessions}
                onChange={(e) => setSessions(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                className="border-rule-faint focus:border-accent-blue w-28 rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            생성
          </button>
        </div>
      </div>
    </>
  );
}
