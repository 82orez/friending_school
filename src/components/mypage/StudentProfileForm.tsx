"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateStudentProfile, type StudentActionState } from "@/app/mypage/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PhoneVerifyField from "@/components/mypage/PhoneVerifyField";

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

  // 액션 결과 → 토스트. 초기 {} 상태는 ok/error 모두 falsy라 마운트 시 토스트 없음.
  useEffect(() => {
    if (state.ok) toast.success("저장되었습니다.");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <div className="border-rule mt-2 grid gap-5 border-t pt-5">
      {/* 이름 폼(성/이름) — 전화번호 인증과 독립 제출. 제출 버튼은 form 속성으로 연결해 카드 맨 아래에 배치. */}
      <form id="student-profile-form" action={formAction} className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="student-last-name">성</Label>
          <Input
            id="student-last-name"
            name="last_name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="홍"
            maxLength={40}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="student-first-name">이름</Label>
          <Input
            id="student-first-name"
            name="first_name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="길동"
            maxLength={40}
          />
        </div>
      </form>

      {/* 전화번호 SMS 인증 */}
      <PhoneVerifyField initialPhone={initialPhone} initialVerified={initialPhoneVerified} />

      {/* 저장 버튼 — 카드 맨 아래 오른쪽 */}
      <div className="flex justify-end">
        <Button type="submit" form="student-profile-form" variant="brand" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              저장 중
            </>
          ) : (
            "저장"
          )}
        </Button>
      </div>
    </div>
  );
}
