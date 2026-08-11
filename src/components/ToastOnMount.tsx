"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

// 마운트 시 성공 토스트 1회 발화 후 URL에서 신호용 쿼리 파라미터를 제거(렌더 결과 없음).
//
// 왜 필요한가: 지원서 제출처럼 **성공하면 폼 컴포넌트가 언마운트되는** 화면에서는
// 폼 내부의 `useEffect([state])` 토스트가 실행되지 못한다(상태 업데이트와 RSC 재렌더가
// 같은 transition에서 함께 커밋되며 폼이 사라짐). 그래서 서버 액션이 `?<queryKey>=1`로
// 리다이렉트하고, 살아남는 페이지 쪽에서 이 컴포넌트로 토스트를 띄운다.
//
// StrictMode 이중 실행은 ref 가드로 방지(NoticeViewCounter 패턴), 파라미터 제거는
// SuccessBanner와 동일하게 router.replace — 새로고침 시 토스트가 다시 뜨지 않도록.
export default function ToastOnMount({ message, queryKey }: { message: string; queryKey: string }) {
  const doneRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    toast.success(message);

    const params = new URLSearchParams(searchParams.toString());
    params.delete(queryKey);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
    // 마운트 1회만 — searchParams/router 변화로 재실행되지 않도록 의존성 비움.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
