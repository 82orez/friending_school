"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { login, resendConfirmation, type LoginState, type ResendConfirmationResult } from "@/app/(auth)/login/actions";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KakaoButton } from "@/components/auth/KakaoButton";
import { useCapsLockWarning } from "@/hooks/use-caps-lock";

export default function LoginForm({ next = "/" }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resendPending, startResend] = useTransition();
  const [resendResult, setResendResult] = useState<ResendConfirmationResult | null>(null);
  const { capsLockOn, capsLockHandlers } = useCapsLockWarning();
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
      "인증 메일 다시 보내기"
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
        <CardTitle className="text-2xl font-extrabold">로그인</CardTitle>
        <CardDescription>이메일과 비밀번호로 로그인하세요</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {/* 로그인 후 돌아갈 경로. 서버 액션이 safeNextPath로 재검증한다. */}
          <input type="hidden" name="next" value={next} />
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
              aria-describedby={state?.error ? "login-error" : undefined}
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                {...capsLockHandlers}
                aria-invalid={!!state?.error}
                aria-describedby={
                  [state?.error ? "login-error" : null, capsLockOn ? "login-caps-warning" : null].filter(Boolean).join(" ") || undefined
                }
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center rounded pr-3 focus-visible:ring-2 focus-visible:ring-[#ff4757]/50 focus-visible:outline-none">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {capsLockOn && (
              <p id="login-caps-warning" className="flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Caps Lock이 켜져 있습니다.
              </p>
            )}
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-muted-foreground text-sm hover:text-[#ff4757] hover:underline">
                비밀번호를 잊으셨나요?
              </Link>
            </div>
          </div>

          {state?.error && (
            <div className="flex flex-col gap-2">
              <p id="login-error" className="text-destructive text-sm" role="alert">
                {state.error}
              </p>
              {state.canResend && (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={resendDisabled}
                  className="self-start text-sm font-medium text-[#ff4757] hover:underline disabled:cursor-not-allowed disabled:opacity-50">
                  {resendContent}
                </button>
              )}
            </div>
          )}
          {resendResult?.error && (
            <p className="text-destructive text-sm" role="alert">
              {resendResult.error}
            </p>
          )}
          {resendResult?.success && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
              {resendResult.success}
            </p>
          )}

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>인증 메일을 다시 보내시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>{email}로 인증 메일이 재발송됩니다.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleResend}>보내기</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button type="submit" variant="brand" disabled={pending} className="mt-2 h-11 text-base font-bold">
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "로그인 중" : "로그인"}
          </Button>

          <div className="text-muted-fg my-1 flex items-center gap-3 text-xs">
            <div className="bg-rule h-px flex-1" />
            <span>또는</span>
            <div className="bg-rule h-px flex-1" />
          </div>

          <KakaoButton next={next} />

          <p className="text-muted-foreground mt-2 text-center text-sm">
            계정이 없으신가요?{" "}
            <Link href="/signup" className="font-semibold text-[#ff4757] hover:underline">
              회원가입
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
