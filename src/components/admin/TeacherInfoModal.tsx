"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, Printer, X } from "lucide-react";
import { toast } from "sonner";
import AvailabilityGrid from "@/components/teacher/AvailabilityGrid";
import { openTimetablePrint } from "@/lib/timetable-print";
import RateHistoryEditor from "@/components/admin/RateHistoryEditor";
import { updateTeacherCenter } from "@/app/admin/actions";
import { nationalityLabel } from "@/data/nationalities";
import { genderLabelKo } from "@/data/genders";
import { formatPrice, type Rates } from "@/data/currencies";
import { cn } from "@/lib/utils";
import type { RateRow } from "@/lib/rates";
import type { CurrentTeacher } from "@/components/admin/TeacherRequestsManager";

// 아바타 미설정 시 폴백 이니셜(이름 우선, 없으면 이메일 앞글자).
function initials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function TeacherInfoModal({
  teacher,
  centers,
  rows,
  rates,
  onCenterUpdated,
  onClose,
  readOnly = false,
}: {
  teacher: CurrentTeacher | null;
  centers: { id: string; name: string; price: number | null; currency: string | null }[];
  rows: RateRow[]; // 이 강사의 개별 단가 적용일 이력
  rates: Rates;
  onCenterUpdated?: (teacherId: string, centerId: string | null, centerName: string | null) => void;
  onClose: () => void;
  readOnly?: boolean; // 센터 매니저 뷰 — 센터 변경·단가(급여) 편집 숨김(조회 전용)
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // 센터 셀렉트 로컬 상태("none"=소속 없음). 다른 강사 모달 열릴 때 재동기화.
  const [centerSel, setCenterSel] = useState<string>(teacher?.centerId ?? "none");
  const [saving, startSave] = useTransition();

  useEffect(() => {
    setCenterSel(teacher?.centerId ?? "none");
  }, [teacher?.id, teacher?.centerId]);

  // 열림 시: Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  // 중첩 확인 다이얼로그(role=alertdialog)가 열려 있으면 Esc는 그 다이얼로그만 닫도록 모달 닫기를 건너뜀.
  useEffect(() => {
    if (!teacher) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="alertdialog"]')) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [teacher, onClose]);

  if (!teacher) return null;

  const currentSel = teacher.centerId ?? "none";
  const centerDirty = centerSel !== currentSel;

  const saveCenter = () => {
    const t = teacher;
    startSave(async () => {
      const res = await updateTeacherCenter(t.id, centerSel);
      if (res.ok) {
        const centerId = res.centerId ?? null;
        const centerName = centerId ? (centers.find((c) => c.id === centerId)?.name ?? null) : null;
        onCenterUpdated?.(t.id, centerId, centerName);
        toast.success("센터를 변경했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  // 선택된 센터의 회당 단가(개별 단가 이력의 "센터 단가" 폴백 표시용). 미지정/미설정이면 "미설정".
  const selectedCenter = centers.find((c) => c.id === centerSel);
  const centerRateLabel = selectedCenter && selectedCenter.price != null ? formatPrice(selectedCenter.price, selectedCenter.currency) : "미설정";

  const title = teacher.name || teacher.email;

  return (
    <>
      {/* 오버레이 */}
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-rule flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-ink truncate text-lg font-bold">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          <div className="mb-5 flex items-center gap-4">
            {teacher.avatarUrl ? (
              <Image
                src={teacher.avatarUrl}
                alt={`${title} profile photo`}
                width={80}
                height={80}
                className="border-rule size-20 rounded-2xl border object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="border-rule bg-surface text-muted-fg-faint flex size-20 shrink-0 items-center justify-center rounded-2xl border text-2xl font-bold"
              >
                {initials(teacher.name, teacher.email)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-ink truncate text-base font-bold">{teacher.name || teacher.email}</p>
              <p className="text-muted-fg-faint truncate text-xs">{teacher.email}</p>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {(
              [
                ["이메일", teacher.email],
                ["전화", teacher.phone ?? "-"],
                ["국적", nationalityLabel(teacher.nationality)],
                ["성별", genderLabelKo(teacher.gender)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-28 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}

            {/* 센터 — admin은 편집, 센터 매니저(readOnly)는 텍스트 표시 */}
            {readOnly ? (
              <div className="flex gap-2">
                <dt className="text-muted-fg-faint w-28 shrink-0">센터</dt>
                <dd className="text-ink break-words">{selectedCenter?.name ?? "미지정"}</dd>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <dt className="text-muted-fg-faint w-28 shrink-0">센터</dt>
                <dd className="flex flex-1 items-center gap-2">
                  <select
                    value={centerSel}
                    onChange={(e) => setCenterSel(e.target.value)}
                    disabled={saving}
                    className="border-rule text-ink focus-visible:ring-accent-blue/50 h-9 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                  >
                    <option value="none">None</option>
                    {centers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {centerDirty && (
                    <button
                      type="button"
                      onClick={saveCenter}
                      disabled={saving}
                      className={cn(
                        "bg-cta inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-bold text-white transition-colors disabled:opacity-60",
                      )}
                    >
                      {saving && <Loader2 className="size-4 animate-spin" />}
                      {saving ? "저장 중" : "저장"}
                    </button>
                  )}
                </dd>
              </div>
            )}

            {/* 적용 단가 — 개별 단가 적용일 이력(없으면 센터 단가). 센터 매니저에겐 급여라 미노출. */}
            {!readOnly && (
              <div className="flex items-start gap-2">
                <dt className="text-muted-fg-faint w-28 shrink-0 pt-1.5">적용 단가</dt>
                <dd className="min-w-0 flex-1">
                  <RateHistoryEditor scope="teacher" scopeId={teacher.id} rows={rows} rates={rates} allowRevert fallbackLabel={centerRateLabel} />
                </dd>
              </div>
            )}

            {(
              [
                ["학력", teacher.bio ?? "-"],
                ["강의 경력", teacher.experience ?? "-"],
                ["Zoom URL", teacher.zoomUrl ?? "-"],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-28 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-ink text-sm font-bold">주간 가능 시간</p>
              <button
                type="button"
                onClick={() => openTimetablePrint({ teacherName: teacher.name || teacher.email, slots: teacher.slots, bookedSlots: teacher.bookedSlots })}
                className="border-rule text-muted-fg hover:bg-surface inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors"
              >
                <Printer className="size-4" />
                PDF로 내보내기
              </button>
            </div>
            <AvailabilityGrid initialSlots={teacher.slots} bookedSlots={teacher.bookedSlots} readOnly />
          </div>
        </div>

        <div className="border-rule flex justify-end border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </>
  );
}
