"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { signup, type SignupState } from "@/app/(auth)/signup/actions";
import { resendConfirmation, type ResendConfirmationResult } from "@/app/(auth)/login/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KakaoButton } from "@/components/auth/KakaoButton";
import { useCapsLockWarning } from "@/hooks/use-caps-lock";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(signup, null);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const passwordCaps = useCapsLockWarning();
  const passwordConfirmCaps = useCapsLockWarning();
  const [resendPending, startResend] = useTransition();
  const [resendResult, setResendResult] = useState<ResendConfirmationResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (cooldownSec === 0) return;
    const id = setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldownSec]);

  const resendDisabled = resendPending || !email || cooldownSec > 0;
  const resendContent =
    cooldownSec > 0 ? (
      `${cooldownSec}초 후 다시 시도 가능`
    ) : resendPending ? (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        재발송 중
      </span>
    ) : (
      "다시 보내기"
    );

  const handleResend = () => {
    setConfirmOpen(false);
    setResendResult(null);
    startResend(async () => {
      const result = await resendConfirmation(email);
      setResendResult(result);
      if (result.success) setCooldownSec(60);
    });
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-2xl font-extrabold">회원가입</CardTitle>
        <CardDescription>이메일 인증 후 바로 시작할 수 있어요</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!state?.error}
              aria-describedby={state?.error ? "signup-error" : undefined}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">비밀번호</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                {...passwordCaps.capsLockHandlers}
                aria-invalid={!!state?.error}
                aria-describedby={
                  ["signup-password-hint", state?.error ? "signup-error" : null, passwordCaps.capsLockOn ? "signup-password-caps" : null]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                className="absolute inset-y-0 right-0 flex items-center rounded pr-3 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/50 focus-visible:outline-none">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p id="signup-password-hint" className="text-xs text-muted-foreground">
              8자 이상 입력해 주세요.
            </p>
            {passwordCaps.capsLockOn && (
              <p id="signup-password-caps" className="flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Caps Lock이 켜져 있습니다.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
            <div className="relative">
              <Input
                id="passwordConfirm"
                name="passwordConfirm"
                type={showPasswordConfirm ? "text" : "password"}
                autoComplete="new-password"
                required
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                {...passwordConfirmCaps.capsLockHandlers}
                aria-invalid={!!state?.error}
                aria-describedby={
                  [state?.error ? "signup-error" : null, passwordConfirmCaps.capsLockOn ? "signup-passwordconfirm-caps" : null]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPasswordConfirm((prev) => !prev)}
                aria-label={showPasswordConfirm ? "비밀번호 숨기기" : "비밀번호 보기"}
                className="absolute inset-y-0 right-0 flex items-center rounded pr-3 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand-blue/50 focus-visible:outline-none">
                {showPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordConfirmCaps.capsLockOn && (
              <p id="signup-passwordconfirm-caps" className="flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Caps Lock이 켜져 있습니다.
              </p>
            )}
          </div>

          {state?.error && (
            <div role="alert" id="signup-error">
              <p className="text-sm text-destructive">{state.error}</p>
              {state.canResend && (
                <p className="mt-2 text-xs text-destructive">
                  메일이 도착하지 않으셨나요?{" "}
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={resendDisabled}
                    className="font-semibold underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-50">
                    {resendContent}
                  </button>
                </p>
              )}
              {resendResult?.success && <p className="mt-2 text-xs text-green-700">{resendResult.success}</p>}
              {resendResult?.error && <p className="mt-2 text-xs text-destructive">{resendResult.error}</p>}
            </div>
          )}
          {state?.success && (
            <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
              <p>{state.success}</p>
              {resendResult?.success && <p className="mt-2 text-xs">{resendResult.success}</p>}
              <p className="mt-2 text-xs">
                메일이 도착하지 않으셨나요?{" "}
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={resendDisabled}
                  className="font-semibold underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-50">
                  {resendContent}
                </button>
              </p>
              {resendResult?.error && <p className="mt-2 text-xs text-destructive">{resendResult.error}</p>}
            </div>
          )}

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>인증 메일을 다시 보내시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>{email}로 인증 메일이 재발송됩니다.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleResend} className={cn(buttonVariants({ variant: "brand-blue" }))}>
                  보내기
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button type="submit" variant="brand-blue" disabled={pending} className="mt-2 h-11 text-base font-bold">
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "처리 중" : "회원가입"}
          </Button>

          <div className="my-1 flex items-center gap-3 text-xs text-muted-fg">
            <div className="bg-rule h-px flex-1" />
            <span>또는</span>
            <div className="bg-rule h-px flex-1" />
          </div>

          <KakaoButton />

          <p className="mt-2 text-center text-sm text-muted-foreground">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="font-semibold text-brand-blue hover:underline">
              로그인
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
