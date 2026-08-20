"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { nationalityLabel } from "@/data/nationalities";
import { genderLabelKo } from "@/data/genders";
import { formatPhone } from "@/lib/phone";
import { TIER_LABEL, type CurrentFriender } from "@/components/admin/FrienderRequestsManager";

// 아바타 미설정 시 폴백 이니셜(이름 우선, 없으면 이메일 앞글자).
function initials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

// 프렌더 상세 정보(읽기 전용). TeacherInfoModal의 커스텀 패널 스켈레톤을 복제하되
// 센터/단가/가용 시간/PDF 출력 등 강사 전용 요소는 전부 제외.
export default function FrienderInfoModal({ friender, onClose }: { friender: CurrentFriender | null; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 열림 시: Esc 닫기 + body scroll lock + 닫기 버튼 포커스.
  // 중첩 확인 다이얼로그(role=alertdialog)가 열려 있으면 Esc는 그 다이얼로그만 닫도록 건너뜀.
  useEffect(() => {
    if (!friender) return;
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
  }, [friender, onClose]);

  if (!friender) return null;

  const title = friender.name || friender.email;

  return (
    <>
      {/* 오버레이 */}
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-ink truncate text-lg font-bold">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-auto px-6 py-5">
          <div className="mb-5 flex items-center gap-4">
            {friender.avatarUrl ? (
              <Image
                src={friender.avatarUrl}
                alt={`${title} 프로필 사진`}
                width={80}
                height={80}
                className="border-rule size-20 rounded-2xl border object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="border-rule bg-surface text-muted-fg-faint flex size-20 shrink-0 items-center justify-center rounded-2xl border text-2xl font-bold">
                {initials(friender.name, friender.email)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-ink truncate text-base font-bold">{title}</p>
              <p className="text-muted-fg-faint truncate text-xs">{friender.email}</p>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {(
              [
                ["이메일", friender.email],
                ["등급", TIER_LABEL[friender.role]],
                ["닉네임", friender.nickname || "-"],
                ["전화", friender.phone ? formatPhone(friender.phone) : "-"],
                ["국적", nationalityLabel(friender.nationality)],
                ["성별", genderLabelKo(friender.gender)],
                ["자기소개", friender.bio || "-"],
                ["Zoom URL", friender.zoomUrl || "-"],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-28 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="border-rule flex justify-end border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors">
            닫기
          </button>
        </div>
      </div>
    </>
  );
}
