"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { centerReassignClass } from "@/app/center/actions";
import { dowOf, fmtTime, formatDateKo, lessonEndMin, summarizeSlots, teacherHasAllSlots, type Slot } from "@/lib/availability";
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

// 센터 매니저 개별 회차 강사 대체 피커 — 같은 센터·그 시간 가용 강사만 후보. centerReassignClass 호출.
export default function ReassignModal({ cls, teachers, onClose }: { cls: CenterClass; teachers: CenterTeacher[]; onClose: () => void }) {
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
