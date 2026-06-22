"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateStudentProfile, type StudentActionState } from "@/app/mypage/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function StudentProfileForm({
  initialLastName,
  initialFirstName,
  initialPhone,
}: {
  initialLastName: string;
  initialFirstName: string;
  initialPhone: string;
}) {
  const [state, formAction, pending] = useActionState<StudentActionState, FormData>(updateStudentProfile, {});
  const [lastName, setLastName] = useState(initialLastName);
  const [firstName, setFirstName] = useState(initialFirstName);
  const [phone, setPhone] = useState(initialPhone);

  // 액션 결과 → 토스트. 초기 {} 상태는 ok/error 모두 falsy라 마운트 시 토스트 없음.
  useEffect(() => {
    if (state.ok) toast.success("저장되었습니다.");
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="border-rule mt-2 grid gap-4 border-t pt-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="student-last-name">성</Label>
          <Input id="student-last-name" name="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="예: 홍" maxLength={40} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="student-first-name">이름</Label>
          <Input
            id="student-first-name"
            name="first_name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="예: 길동"
            maxLength={40}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="student-phone">
          전화번호 <span className="text-muted-fg-faint font-normal">(선택)</span>
        </Label>
        <Input id="student-phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="예: 010-1234-5678" maxLength={30} />
      </div>
      <div>
        <Button type="submit" variant="brand" disabled={pending}>
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
    </form>
  );
}
