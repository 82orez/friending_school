"use client";

import { useRef } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// 보기 모드(disabled)에서 값이 흐려지지 않도록 텍스트를 진하게.
const VIEW_TEXT = "disabled:opacity-100 disabled:text-ink";

const DAUM_POSTCODE_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

// 다음 우편번호 스크립트 on-demand 로드(1회). window.daum.Postcode 존재 시 즉시 resolve.
function loadDaumPostcode(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && (window as any).daum?.Postcode) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${DAUM_POSTCODE_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("script error")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = DAUM_POSTCODE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script error"));
    document.body.appendChild(script);
  });
}

export type AddressValue = { postcode: string; address: string; addressDetail: string };

export default function AddressField({
  value,
  onChange,
  disabled,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  disabled?: boolean;
}) {
  const detailRef = useRef<HTMLInputElement>(null);

  const openSearch = async () => {
    try {
      await loadDaumPostcode();
      new (window as any).daum.Postcode({
        oncomplete: (data: any) => {
          onChange({
            postcode: data.zonecode ?? "",
            address: data.roadAddress || data.jibunAddress || "",
            addressDetail: value.addressDetail,
          });
          // 기본주소 선택 후 상세주소로 포커스 이동.
          detailRef.current?.focus();
        },
      }).open();
    } catch {
      toast.error("주소 검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <div className="grid gap-3">
      <Label>
        주소 <span className="text-muted-fg-faint font-normal">(선택)</span>
      </Label>

      <div className="flex gap-2">
        <Input
          name="postcode"
          value={value.postcode}
          readOnly
          placeholder="우편번호"
          maxLength={10}
          disabled={disabled}
          className={cn("w-32", VIEW_TEXT)}
        />
        <Button type="button" variant="outline" onClick={openSearch} disabled={disabled} className="shrink-0">
          <Search className="size-4" aria-hidden />
          주소 검색
        </Button>
      </div>

      <Input
        name="address"
        value={value.address}
        readOnly
        placeholder="기본주소 (주소 검색으로 입력)"
        maxLength={200}
        disabled={disabled}
        className={VIEW_TEXT}
      />

      <Input
        ref={detailRef}
        name="address_detail"
        value={value.addressDetail}
        onChange={(e) => onChange({ ...value, addressDetail: e.target.value })}
        placeholder="상세주소 (동·호수 등)"
        maxLength={200}
        disabled={disabled}
        className={VIEW_TEXT}
      />
    </div>
  );
}
