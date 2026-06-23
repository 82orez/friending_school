"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sendPhoneOtp, verifyPhoneOtp } from "@/app/mypage/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhone, isValidKoreanMobile, normalizePhone } from "@/lib/phone";

const RESEND_COOLDOWN = 60;

export default function PhoneVerifyField({ initialPhone, initialVerified }: { initialPhone: string; initialVerified: boolean }) {
  const router = useRouter();
  const [verified, setVerified] = useState(initialVerified && !!initialPhone);
  const [editing, setEditing] = useState(false); // 번호 변경/최초 입력 모드
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 재전송 쿨다운 카운트다운.
  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cooldown]);

  const phoneValid = isValidKoreanMobile(normalizePhone(phone));

  const handleSend = () => {
    startTransition(async () => {
      const res = await sendPhoneOtp(phone);
      if (res.ok) {
        setCodeSent(true);
        setCooldown(RESEND_COOLDOWN);
        toast.success("인증번호를 전송했어요. 문자를 확인해 주세요.");
      } else {
        toast.error(res.error ?? "발송에 실패했어요.");
      }
    });
  };

  const handleVerify = () => {
    startTransition(async () => {
      const res = await verifyPhoneOtp(phone, code);
      if (res.ok) {
        setVerified(true);
        setEditing(false);
        setCodeSent(false);
        setCode("");
        toast.success("전화번호가 인증되었어요.");
        router.refresh();
      } else {
        toast.error(res.error ?? "인증에 실패했어요.");
      }
    });
  };

  const startEdit = () => {
    setEditing(true);
    setCodeSent(false);
    setCode("");
  };

  // 인증 완료 + 편집 아님 → 배지 표시.
  if (verified && !editing) {
    return (
      <div className="grid gap-1.5">
        <Label>전화번호</Label>
        <div className="flex items-center gap-3">
          <span className="text-ink text-sm font-medium">{formatPhone(phone)}</span>
          <span className="text-progress inline-flex items-center gap-1 text-xs font-bold">
            <CheckCircle2 className="size-4" /> 인증됨
          </span>
          <button type="button" onClick={startEdit} className="border-rule text-muted-fg ml-auto rounded border px-2.5 py-1 text-xs">
            번호 변경
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="student-phone">전화번호</Label>
        <div className="flex gap-2">
          <Input
            id="student-phone"
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setCodeSent(false);
            }}
            placeholder="예: 010-1234-5678"
            maxLength={20}
            className="flex-1"
          />
          <Button type="button" variant="brand" disabled={pending || !phoneValid || cooldown > 0} onClick={handleSend} className="shrink-0">
            {pending && !codeSent ? (
              <>
                <Loader2 className="animate-spin" />
                전송 중
              </>
            ) : cooldown > 0 ? (
              `재전송 ${cooldown}초`
            ) : codeSent ? (
              "재전송"
            ) : (
              "인증번호 받기"
            )}
          </Button>
        </div>
      </div>

      {codeSent && (
        <div className="grid gap-1.5">
          <Label htmlFor="student-otp">인증번호</Label>
          <div className="flex gap-2">
            <Input
              id="student-otp"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6자리 숫자"
              maxLength={6}
              className="flex-1"
            />
            <Button type="button" variant="brand" disabled={pending || code.length !== 6} onClick={handleVerify} className="shrink-0">
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  확인 중
                </>
              ) : (
                "확인"
              )}
            </Button>
          </div>
          <p className="text-muted-fg-faint text-xs">인증번호는 3분간 유효합니다.</p>
        </div>
      )}

      {verified && editing && (
        <button type="button" onClick={() => setEditing(false)} className="text-muted-fg justify-self-start text-xs underline">
          변경 취소
        </button>
      )}
    </div>
  );
}
