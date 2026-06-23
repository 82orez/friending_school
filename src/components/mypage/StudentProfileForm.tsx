"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateStudentProfile, type StudentActionState } from "@/app/mypage/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import PhoneVerifyField from "@/components/mypage/PhoneVerifyField";

// 보기 모드(disabled)에서 값이 흐려지지 않도록 텍스트를 진하게.
const VIEW_TEXT = "disabled:opacity-100 disabled:text-ink";

export default function StudentProfileForm({
  initialLastName,
  initialFirstName,
  initialPhone,
  initialPhoneVerified,
}: {
  initialLastName: string;
  initialFirstName: string;
  initialPhone: string;
  initialPhoneVerified: boolean;
}) {
  const [state, formAction, pending] = useActionState<StudentActionState, FormData>(updateStudentProfile, {});
  const [lastName, setLastName] = useState(initialLastName);
  const [firstName, setFirstName] = useState(initialFirstName);
  // 전화번호 인증 여부를 끌어올려 저장 버튼 활성/비활성에 사용(미인증이면 저장 차단).
  const [phoneVerified, setPhoneVerified] = useState(initialPhoneVerified && !!initialPhone);

  // 보기/편집 모드 — 편집 모드에서만 이름 필드 수정 가능(실수 저장 방지).
  const [editing, setEditing] = useState(false);
  // 편집 진입 시점 스냅샷(Cancel 시 복원).
  const snapshotRef = useRef({ lastName, firstName });

  const startEditing = () => {
    snapshotRef.current = { lastName, firstName };
    setEditing(true);
  };

  const cancelEditing = () => {
    const s = snapshotRef.current;
    setLastName(s.lastName);
    setFirstName(s.firstName);
    setEditing(false);
  };

  // 액션 결과 → 토스트. 초기 {} 상태는 ok/error 모두 falsy라 마운트 시 토스트 없음.
  useEffect(() => {
    if (state.ok) {
      toast.success("저장되었습니다.");
      setEditing(false); // 저장 성공 → 보기 모드로
    } else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <div className="border-rule mt-2 grid gap-5 border-t pt-5">
      {/* 이름 폼(성/이름) — 전화번호 인증과 독립 제출. 제출 버튼은 form 속성으로 연결해 카드 맨 아래에 배치. */}
      <form id="student-profile-form" action={formAction} className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="student-last-name">
            성 <span className="text-brand">*</span>
          </Label>
          <Input
            id="student-last-name"
            name="last_name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="홍"
            maxLength={40}
            required
            disabled={!editing}
            className={VIEW_TEXT}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="student-first-name">
            이름 <span className="text-brand">*</span>
          </Label>
          <Input
            id="student-first-name"
            name="first_name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="길동"
            maxLength={40}
            required
            disabled={!editing}
            className={VIEW_TEXT}
          />
        </div>
      </form>

      {/* 전화번호 SMS 인증 — 자체 보기/편집 상태머신이라 이름 편집 모드와 독립. */}
      <PhoneVerifyField initialPhone={initialPhone} initialVerified={initialPhoneVerified} onVerifiedChange={setPhoneVerified} />

      {/* 버튼 — 카드 맨 아래 오른쪽. 보기 모드=수정 / 편집 모드=취소+저장. */}
      <div className="flex justify-end gap-3">
        {editing ? (
          <>
            <Button type="button" variant="outline" onClick={cancelEditing} disabled={pending}>
              취소
            </Button>
            <Button
              type="submit"
              form="student-profile-form"
              variant="brand"
              disabled={pending || !phoneVerified}
              className={cn(pending && "opacity-90")}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  저장 중
                </>
              ) : (
                "저장"
              )}
            </Button>
          </>
        ) : (
          <Button type="button" variant="brand" onClick={startEditing}>
            <Pencil className="size-4" aria-hidden />
            수정
          </Button>
        )}
      </div>
    </div>
  );
}
