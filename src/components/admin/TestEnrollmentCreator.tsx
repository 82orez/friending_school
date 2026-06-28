"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createTestEnrollment } from "@/app/admin/actions";
import EnrollScheduleField from "@/components/course/EnrollScheduleField";
import { type Slot } from "@/lib/availability";

type TeacherOpt = { id: string; name: string };
type CourseOpt = { slug: string; title: string };

// 오늘(KST) YYYY-MM-DD — date input 기본값.
function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function TestEnrollmentCreator({
  teachers,
  courses,
  defaultStudentEmail,
}: {
  teachers: TeacherOpt[];
  courses: CourseOpt[];
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
        <CreatorModal teachers={teachers} courses={courses} defaultStudentEmail={defaultStudentEmail} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function CreatorModal({
  teachers,
  courses,
  defaultStudentEmail,
  onClose,
}: {
  teachers: TeacherOpt[];
  courses: CourseOpt[];
  defaultStudentEmail: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [studentEmail, setStudentEmail] = useState(defaultStudentEmail);
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? "");
  const [course, setCourse] = useState(courses[0]?.slug ?? "");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [startDate, setStartDate] = useState(todayKst());
  const [sessions, setSessions] = useState(3);
  const [pending, startTransition] = useTransition();

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
    if (!teacherId) {
      toast.error("강사를 선택해 주세요.");
      return;
    }
    if (slots.length === 0) {
      toast.error("수업 일정을 선택해 주세요.");
      return;
    }
    startTransition(async () => {
      const res = await createTestEnrollment({ studentEmail: studentEmail.trim() || undefined, teacherId, course, slots, startDate, sessions });
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
            <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">학생 이메일 (비우면 본인 계정)</span>
            <input
              type="email"
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              placeholder="student@example.com"
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="block flex-1">
              <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">강사</span>
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
              >
                {teachers.length === 0 && <option value="">(강사 없음 — 먼저 시드 필요)</option>}
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block flex-1">
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
              </select>
            </label>
          </div>

          <div>
            <span className="text-muted-fg-faint mb-1 block text-xs font-semibold">수업 일정 (주간 반복)</span>
            <EnrollScheduleField onChange={setSlots} />
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
