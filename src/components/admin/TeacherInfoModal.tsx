"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import AvailabilityGrid from "@/components/teacher/AvailabilityGrid";
import { updateTeacherCenter, updateTeacherRate } from "@/app/admin/actions";
import { nationalityLabel } from "@/data/nationalities";
import { genderLabelKo } from "@/data/genders";
import { CURRENCIES } from "@/data/currencies";
import { cn } from "@/lib/utils";
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
  onCenterUpdated,
  onCustomRateUpdated,
  onClose,
}: {
  teacher: CurrentTeacher | null;
  centers: { id: string; name: string }[];
  onCenterUpdated: (teacherId: string, centerId: string | null, centerName: string | null) => void;
  onCustomRateUpdated: (teacherId: string, customPrice: number | null, customCurrency: string | null) => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // 센터 셀렉트 로컬 상태("none"=소속 없음). 다른 강사 모달 열릴 때 재동기화.
  const [centerSel, setCenterSel] = useState<string>(teacher?.centerId ?? "none");
  const [saving, startSave] = useTransition();
  // 개별 단가 로컬 상태(빈 금액=센터 단가 사용). 다른 강사 모달 열릴 때 재동기화.
  const [priceInput, setPriceInput] = useState<string>(teacher?.customPrice != null ? String(teacher.customPrice) : "");
  const [currencySel, setCurrencySel] = useState<string>(teacher?.customCurrency ?? "KRW");
  const [savingRate, startSaveRate] = useTransition();

  useEffect(() => {
    setCenterSel(teacher?.centerId ?? "none");
  }, [teacher?.id, teacher?.centerId]);

  useEffect(() => {
    setPriceInput(teacher?.customPrice != null ? String(teacher.customPrice) : "");
    setCurrencySel(teacher?.customCurrency ?? "KRW");
  }, [teacher?.id, teacher?.customPrice, teacher?.customCurrency]);

  // 열림 시: Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  useEffect(() => {
    if (!teacher) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
        onCenterUpdated(t.id, centerId, centerName);
        toast.success("센터를 변경했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const initPrice = teacher.customPrice != null ? String(teacher.customPrice) : "";
  const initCurrency = teacher.customCurrency ?? "KRW";
  const rateDirty = priceInput.trim() !== initPrice || (priceInput.trim() !== "" && currencySel !== initCurrency);

  const saveRate = () => {
    const t = teacher;
    startSaveRate(async () => {
      const res = await updateTeacherRate(t.id, priceInput, currencySel);
      if (res.ok) {
        onCustomRateUpdated(t.id, res.price ?? null, res.currency ?? null);
        toast.success(res.price == null ? "개별 단가를 해제했습니다." : "개별 단가를 설정했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

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

            {/* 센터 — 편집 가능 */}
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

            {/* 개별 단가 — 편집 가능(비우면 센터 단가 적용) */}
            <div className="flex items-start gap-2">
              <dt className="text-muted-fg-faint w-28 shrink-0 pt-2">개별 단가</dt>
              <dd className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <select
                    value={currencySel}
                    onChange={(e) => setCurrencySel(e.target.value)}
                    disabled={savingRate}
                    aria-label="개별 단가 통화"
                    className="border-rule text-ink focus-visible:ring-accent-blue/50 h-9 shrink-0 rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} {c.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    disabled={savingRate}
                    placeholder="센터 단가 사용"
                    aria-label="개별 단가 금액"
                    className="border-rule text-ink focus-visible:ring-accent-blue/50 h-9 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                  />
                  {rateDirty && (
                    <button
                      type="button"
                      onClick={saveRate}
                      disabled={savingRate}
                      className="bg-cta inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-bold text-white transition-colors disabled:opacity-60"
                    >
                      {savingRate && <Loader2 className="size-4 animate-spin" />}
                      {savingRate ? "저장 중" : "저장"}
                    </button>
                  )}
                </div>
                <p className="text-muted-fg-faint mt-1 text-xs">비우면 소속 센터 단가가 적용됩니다.</p>
              </dd>
            </div>

            {(
              [
                ["자기소개(Bio)", teacher.bio ?? "-"],
                ["경력", teacher.experience ?? "-"],
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
            <p className="text-ink mb-2 text-sm font-bold">주간 가능 시간</p>
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
