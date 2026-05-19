"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

type SuccessBannerProps = {
  message: string;
  queryKey: "reset" | "verified" | "signup";
  durationMs?: number;
};

export default function SuccessBanner({ message, queryKey, durationMs = 5000 }: SuccessBannerProps) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setVisible(false);
      const params = new URLSearchParams(searchParams.toString());
      params.delete(queryKey);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete(queryKey);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  if (!visible) return null;

  return (
    <div role="status" className="relative bg-green-50 px-10 py-3 text-center text-sm font-medium text-green-700">
      {message}
      <button
        type="button"
        onClick={dismiss}
        aria-label="알림 닫기"
        className="absolute top-1/2 right-4 -translate-y-1/2 rounded text-green-700/70 hover:text-green-700 focus-visible:ring-2 focus-visible:ring-green-700/40 focus-visible:outline-none">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
