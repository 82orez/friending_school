"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CheckCircle2, ChevronLeft, Loader2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { centerReassignClass } from "@/app/center/actions";
import { dowOf, fmtTime, formatDateKo, lessonEndMin, summarizeSlots, teacherHasAllSlots, type Slot } from "@/lib/availability";
import { nationalityLabel } from "@/data/nationalities";
import { genderLabelKo } from "@/data/genders";
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

export type CenterTeacher = {
  id: string;
  name: string;
  nationality: string | null;
  gender: string | null;
  avatarUrl: string | null;
  slots: Slot[];
};

export type CenterClass = {
  id: string;
  teacherId: string;
  courseTitle: string;
  studentName: string;
  sessionNo: number;
  sessionDate: string; // YYYY-MM-DD
  startMin: number;
  endMin: number;
};

// 회차의 요일·시간 → 요청 슬롯(30분 단위) 파생. 후보 강사 가용 필터용.
function classSlots(c: CenterClass): Slot[] {
  const day = dowOf(c.sessionDate);
  const out: Slot[] = [];
  for (let min = c.startMin; min < c.endMin; min += 30) out.push({ day, min });
  return out;
}

function timeLabel(c: CenterClass): string {
  return `${fmtTime(c.startMin)}~${fmtTime(lessonEndMin(c.endMin))}`;
}

export default function CenterDashboard({
  centerNames,
  teachers,
  classes,
}: {
  centerNames: string[];
  teachers: CenterTeacher[];
  classes: CenterClass[];
}) {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<CenterClass | null>(null);

  const classesByTeacher = useMemo(() => {
    const m = new Map<string, CenterClass[]>();
    for (const c of classes) {
      const list = m.get(c.teacherId) ?? [];
      list.push(c);
      m.set(c.teacherId, list);
    }
    m.forEach((list) => list.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.startMin - b.startMin));
    return m;
  }, [classes]);

  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId) ?? null;

  return (
    <div className="space-y-4">
      <div className="text-muted-fg-faint text-xs font-semibold">담당 센터: {centerNames.join(" · ") || "-"}</div>

      {!selectedTeacher ? (
        <TeacherList teachers={teachers} countOf={(id) => classesByTeacher.get(id)?.length ?? 0} onSelect={setSelectedTeacherId} />
      ) : (
        <TeacherClasses
          teacher={selectedTeacher}
          classes={classesByTeacher.get(selectedTeacher.id) ?? []}
          onBack={() => setSelectedTeacherId(null)}
          onReassign={setReassignTarget}
        />
      )}

      {reassignTarget && (
        <ReassignModal
          cls={reassignTarget}
          teachers={teachers}
          onClose={() => setReassignTarget(null)}
        />
      )}
    </div>
  );
}

function TeacherList({
  teachers,
  countOf,
  onSelect,
}: {
  teachers: CenterTeacher[];
  countOf: (id: string) => number;
  onSelect: (id: string) => void;
}) {
  if (teachers.length === 0) return <p className="text-muted-fg-faint py-10 text-center text-sm">소속 센터에 등록된 강사가 없습니다.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {teachers.map((t) => {
        const count = countOf(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className="border-rule hover:border-rule-faint flex items-center gap-3 rounded-xl border bg-white p-4 text-left transition-colors"
          >
            {t.avatarUrl ? (
              <Image src={t.avatarUrl} alt="" width={44} height={44} className="size-11 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="bg-surface text-muted-fg-faint flex size-11 shrink-0 items-center justify-center rounded-lg text-base font-bold">
                {t.name.charAt(0)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-ink truncate text-sm font-bold">{t.name}</p>
              <p className="text-muted-fg-faint truncate text-xs">
                {nationalityLabel(t.nationality)} · {genderLabelKo(t.gender)}
              </p>
            </div>
            <span className="text-muted-fg shrink-0 text-xs font-semibold">예정 {count}건</span>
          </button>
        );
      })}
    </div>
  );
}

function TeacherClasses({
  teacher,
  classes,
  onBack,
  onReassign,
}: {
  teacher: CenterTeacher;
  classes: CenterClass[];
  onBack: () => void;
  onReassign: (c: CenterClass) => void;
}) {
  return (
    <div>
      <button type="button" onClick={onBack} className="text-accent-blue-ink mb-3 inline-flex items-center gap-1 text-sm font-semibold">
        <ChevronLeft className="size-4" /> 강사 목록으로
      </button>
      <div className="mb-3 flex items-center gap-2">
        <Users className="text-accent-blue-ink size-4" aria-hidden />
        <h2 className="text-ink text-base font-bold">{teacher.name} · 예정 수업</h2>
      </div>
      {classes.length === 0 ? (
        <p className="text-muted-fg-faint py-10 text-center text-sm">예정된 수업이 없습니다.</p>
      ) : (
        <ul className="divide-rule border-rule divide-y rounded-xl border bg-white">
          {classes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-ink text-sm font-semibold">
                  {formatDateKo(c.sessionDate)} · {timeLabel(c)}
                </p>
                <p className="text-muted-fg-faint truncate text-xs">
                  {c.courseTitle} · {c.studentName} · {c.sessionNo}회차
                </p>
              </div>
              <button
                type="button"
                onClick={() => onReassign(c)}
                className="border-cta text-cta hover:bg-cta/5 shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors"
              >
                강사 대체
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReassignModal({ cls, teachers, onClose }: { cls: CenterClass; teachers: CenterTeacher[]; onClose: () => void }) {
  const router = useRouter();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // 같은 센터 강사 중 이 회차 요일·시간에 가용한 강사만(현재 강사 제외).
  const candidates = useMemo(() => {
    const req = classSlots(cls);
    return teachers.filter((t) => t.id !== cls.teacherId && teacherHasAllSlots(t.slots, req));
  }, [cls, teachers]);
  const picked = candidates.find((t) => t.id === pickedId) ?? null;

  const submit = () => {
    if (!picked) return;
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await centerReassignClass(cls.id, picked.id);
      if (res.ok) {
        toast.success(`${picked.name} 강사로 대체했어요. 학생·강사에게 안내가 발송됩니다.`);
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "강사 대체 중 문제가 발생했어요.");
      }
    });
  };

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="강사 대체"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-rule flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <h2 className="text-ink text-base font-bold">강사 대체</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-muted-fg-faint hover:text-ink rounded transition-colors">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-auto px-5 py-4">
          <div className="bg-surface border-rule rounded-lg border px-3 py-2.5 text-sm">
            <p className="text-ink font-semibold">
              {formatDateKo(cls.sessionDate)} · {timeLabel(cls)}
            </p>
            <p className="text-muted-fg-faint mt-0.5 text-xs">
              {cls.courseTitle} · {cls.studentName} · {cls.sessionNo}회차
            </p>
          </div>

          <div>
            <p className="text-muted-fg-faint mb-2 text-xs font-semibold">대체 강사 (같은 센터 · 이 시간 가용)</p>
            {candidates.length === 0 ? (
              <p className="text-muted-fg-faint py-4 text-center text-sm">이 시간에 가능한 같은 센터 강사가 없어요.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {candidates.map((t) => {
                  const on = pickedId === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setPickedId(t.id)}
                        aria-pressed={on}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                          on ? "border-cta bg-cta/5" : "border-rule hover:border-rule-faint bg-white",
                        )}
                      >
                        {t.avatarUrl ? (
                          <Image src={t.avatarUrl} alt="" width={36} height={36} className="size-9 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="bg-surface text-muted-fg-faint flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
                            {t.name.charAt(0)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-ink truncate text-sm font-bold">{t.name}</p>
                            {on && <CheckCircle2 className="text-cta size-4 shrink-0" aria-hidden />}
                          </div>
                          <p className="text-muted-fg-faint truncate text-xs">{summarizeSlots(t.slots) || "가용시간 없음"}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-5 py-3.5">
          <button type="button" onClick={onClose} className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors">
            닫기
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!picked || pending}
            className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            대체하기
          </button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>강사를 대체할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatDateKo(cls.sessionDate)} {timeLabel(cls)} 수업의 담당 강사를 {picked?.name} 강사로 변경합니다. 학생과 관련 강사에게 안내가
              발송됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={submit} className="bg-cta border-transparent text-white hover:opacity-90">
              대체하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
