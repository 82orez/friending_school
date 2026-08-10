"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { AdminCenter, CenterUserOption } from "@/components/admin/CentersManager";
import RateHistoryEditor from "@/components/admin/RateHistoryEditor";
import type { Rates } from "@/data/currencies";
import type { RateRow } from "@/lib/rates";

const NONE = "__none__"; // 매니저 계정 미지정 sentinel

// 센터 상세 편집 모달. TeacherInfoModal의 a11y 패턴(오버레이/패널/Esc/scroll lock) 미러.
export default function CenterDetailModal({
  center,
  rows,
  onClose,
  onSave,
  pending,
  rates,
  users,
}: {
  center: AdminCenter | null;
  rows: RateRow[];
  onClose: () => void;
  onSave: (name: string, managerName: string, managerId: string | null) => void;
  pending: boolean;
  rates: Rates;
  users: CenterUserOption[];
}) {
  const [name, setName] = useState("");
  const [manager, setManager] = useState("");
  const [managerId, setManagerId] = useState<string>(NONE);

  // 모달 대상이 바뀔 때 입력값 초기화.
  useEffect(() => {
    if (!center) return;
    setName(center.name);
    setManager(center.manager_name ?? "");
    setManagerId(center.manager_id ?? NONE);
  }, [center]);

  // 열림 시: Esc 닫기 + body scroll lock.
  useEffect(() => {
    if (!center) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [center, onClose]);

  if (!center) return null;

  return (
    <>
      {/* 오버레이 */}
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-[110] bg-black/40" />

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="센터 상세"
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-rule flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-ink text-lg font-bold">센터 상세</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-auto px-6 py-5">
          <div>
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">센터명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">센터 매니저 (표시 이름)</label>
            <input
              type="text"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              placeholder="예: 홍길동 (선택)"
              maxLength={100}
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">매니저 계정 (센터 관리 권한)</label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none">
              <option value={NONE}>지정 안 함</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
            <p className="text-muted-fg-faint mt-1 text-xs">지정한 회원은 소속 센터 강사 조회·개별 회차 강사 대체 권한을 갖습니다.</p>
          </div>
          <div>
            <label className="text-muted-fg-faint mb-2 block text-xs font-semibold">회당 단가 (변경 이력)</label>
            <RateHistoryEditor scope="center" scopeId={center.id} rows={rows} rates={rates} allowRevert={false} />
          </div>
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors">
            취소
          </button>
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() => onSave(name, manager, managerId === NONE ? null : managerId)}
            className="bg-cta inline-flex items-center gap-1.5 rounded-md px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            이름·매니저 저장
          </button>
        </div>
      </div>
    </>
  );
}
