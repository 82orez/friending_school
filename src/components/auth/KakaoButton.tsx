"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { signInWithKakao } from "@/app/(auth)/oauth/actions";
import { Button } from "@/components/ui/button";

export function KakaoButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="kakao"
      disabled={pending}
      onClick={() => startTransition(() => signInWithKakao())}
      className="h-11 text-base font-bold">
      {pending ? (
        <>
          <Loader2 className="animate-spin" />
          이동 중
        </>
      ) : (
        <>
          <KakaoIcon className="h-4 w-4" />
          카카오로 시작하기
        </>
      )}
    </Button>
  );
}

function KakaoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.86 5.32 4.66 6.76L5.5 21.5c-.08.3.24.54.5.36L10.5 19c.5.06 1 .1 1.5.1 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
    </svg>
  );
}
