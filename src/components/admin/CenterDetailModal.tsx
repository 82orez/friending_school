"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { AdminCenter } from "@/components/admin/CentersManager";
import { CURRENCIES, DEFAULT_CURRENCY, FOREIGN_CURRENCIES, formatPrice, krwEquivalent, type Rates } from "@/data/currencies";

// 센터 상세 편집 모달. TeacherInfoModal의 a11y 패턴(오버레이/패널/Esc/scroll lock) 미러.
export default function CenterDetailModal({
  center,
  onClose,
  onSave,
  pending,
  rates,
}: {
  center: AdminCenter | null;
  onClose: () => void;
  onSave: (name: string, price: string, currency: string, managerName: string) => void;
  pending: boolean;
  rates: Rates;
}) {
  const [name, setName] = useState("");
  const [manager, setManager] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  // 외화 선택 + 환율 있으면 입력값을 원화로 환산 미리보기.
  const krw = price === "" ? null : krwEquivalent(Number(price), currency, rates);
  const foreign = FOREIGN_CURRENCIES.find((f) => f.code === currency);

  // 모달 대상이 바뀔 때 입력값 초기화.
  useEffect(() => {
    if (!center) return;
    setName(center.name);
    setManager(center.manager_name ?? "");
    setPrice(center.price_per_session == null ? "" : String(center.price_per_session));
    setCurrency(center.price_currency ?? DEFAULT_CURRENCY);
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
        className="fixed top-1/2 left-1/2 z-[120] flex max-h-[90vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="border-rule flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-ink text-lg font-bold">센터 상세</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted-fg-faint hover:text-ink focus-visible:ring-accent-blue/50 ml-3 shrink-0 rounded transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
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
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">센터 매니저</label>
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
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">통화</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">1회당 단가</label>
            <input
              type="number"
              min={0}
              step={currency === "USD" ? 0.1 : 1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="예: 30000"
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
            />
            {krw != null && foreign && (
              <p className="text-muted-fg-faint mt-1 text-xs">
                ≈ {formatPrice(krw, "KRW")} (환율 1{foreign.symbol} = {rates[currency]}₩)
              </p>
            )}
          </div>
        </div>

        <div className="border-rule flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-rule text-muted-fg hover:bg-surface rounded-md border px-4 py-2 text-sm font-bold transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() => onSave(name, price, currency, manager)}
            className="bg-cta inline-flex items-center gap-1.5 rounded-md px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            저장
          </button>
        </div>
      </div>
    </>
  );
}
