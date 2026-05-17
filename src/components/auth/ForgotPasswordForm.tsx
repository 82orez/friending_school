"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { forgotPassword, type ForgotPasswordState } from "@/app/forgot-password/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(forgotPassword, null);
  const [email, setEmail] = useState("");

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-2xl font-extrabold">비밀번호 찾기</CardTitle>
        <CardDescription>가입하신 이메일로 재설정 링크를 보내드립니다.</CardDescription>
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
              className="h-10"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          {state?.success && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
              {state.success}
            </p>
          )}

          <Button type="submit" disabled={pending} className="mt-2 h-11 bg-[#ff4757] text-base font-bold text-white hover:bg-[#ff4757]/90">
            {pending && <Loader2 className="animate-spin" />}
            {pending ? "발송 중" : "재설정 링크 받기"}
          </Button>

          <p className="mt-2 text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-semibold text-[#ff4757] hover:underline">
              로그인 페이지로 돌아가기
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
