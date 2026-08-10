"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, List, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { setUnitCompleted } from "@/app/textbook/actions";

type Props = {
  html: string;
  course: string;
  unit: number;
  totalUnits: number;
  initialCompleted: boolean;
  isAuthenticated: boolean;
  listHref: string;
  prevHref: string | null;
  nextHref: string | null;
};

export default function TextbookViewer({ html, course, unit, totalUnits, initialCompleted, isAuthenticated, listHref, prevHref, nextHref }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [completed, setCompleted] = useState(initialCompleted);
  const [isSaving, startSaving] = useTransition();

  const resizeIframe = useCallback(() => {
    const iframe = iframeRef.current;
    const body = iframe?.contentDocument?.body;
    if (!iframe || !body) return;
    const html = iframe.contentDocument?.documentElement;
    const height = Math.max(body.scrollHeight, html?.scrollHeight ?? 0);
    iframe.style.height = `${height}px`;
  }, []);

  // iframe 로드 + ResizeObserver로 동적 높이 추적
  const handleLoad = useCallback(() => {
    resizeIframe();

    const body = iframeRef.current?.contentDocument?.body;
    if (!body || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => resizeIframe());
    observer.observe(body);
    // 이미지 등 늦은 로드 대응 — 0.5s, 1.5s 후 한 번 더 재측정
    const t1 = setTimeout(resizeIframe, 500);
    const t2 = setTimeout(resizeIframe, 1500);
    (iframeRef.current as any).__cleanup = () => {
      observer.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [resizeIframe]);

  useEffect(() => {
    return () => {
      const cleanup = (iframeRef.current as any)?.__cleanup;
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  // 수동 완료 토글: 낙관적 업데이트 후 서버 저장, 실패 시 롤백.
  const toggleCompleted = useCallback(() => {
    const next = !completed;
    setCompleted(next);
    startSaving(() => {
      setUnitCompleted(course, unit, next).catch(() => setCompleted(!next));
    });
  }, [completed, course, unit]);

  const CompletionToggle = () => {
    if (!isAuthenticated) return null;
    return (
      <div className="mx-auto flex w-full max-w-[900px] flex-col items-center gap-3 px-4 py-6">
        {completed ? (
          <>
            {/* 상태 표시 — 클릭 불가, 완료 상태만 나타냄 */}
            <span className="bg-progress inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white">
              <CheckCircle2 className="size-4" aria-hidden />
              학습 완료됨
            </span>
            {/* 취소 버튼 — 별도 동작 */}
            <button
              type="button"
              onClick={toggleCompleted}
              disabled={isSaving}
              className="focus-visible:ring-brand/50 text-muted-fg hover:text-ink inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60">
              {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}
              완료 취소하기
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={toggleCompleted}
            disabled={isSaving}
            className="border-rule text-ink-soft hover:border-progress focus-visible:ring-brand/50 inline-flex items-center gap-2 rounded-full border bg-white px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60">
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Circle className="size-4" aria-hidden />}
            학습 완료로 표시
          </button>
        )}
      </div>
    );
  };

  const NavBar = ({ position }: { position: "top" | "bottom" }) => (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[900px] items-center justify-between gap-3 px-4 py-3",
        position === "top" && "border-rule sticky top-[72px] z-40 border-b bg-white/95 backdrop-blur",
      )}>
      <Link
        href={listHref}
        className="text-ink-soft hover:bg-surface focus-visible:ring-brand/50 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none">
        <List className="size-4" aria-hidden />
        <span>목록</span>
      </Link>

      <div className="text-muted-fg text-sm font-medium" aria-label={`Unit ${unit}, 전체 ${totalUnits}개 중`}>
        Unit {unit} / {totalUnits}
      </div>

      <div className="flex items-center gap-2">
        {prevHref ? (
          <Link
            href={prevHref}
            aria-label="이전 Unit"
            className="text-ink-soft hover:bg-surface focus-visible:ring-brand/50 inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none">
            <ChevronLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">이전</span>
          </Link>
        ) : (
          <span className="text-muted-fg-faint inline-flex items-center gap-1 px-3 py-2 text-sm">
            <ChevronLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">이전</span>
          </span>
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            aria-label="다음 Unit"
            className="text-ink-soft hover:bg-surface focus-visible:ring-brand/50 inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none">
            <span className="hidden sm:inline">다음</span>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className="text-muted-fg-faint inline-flex items-center gap-1 px-3 py-2 text-sm">
            <span className="hidden sm:inline">다음</span>
            <ChevronRight className="size-4" aria-hidden />
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-[#f5f5f5]">
      <NavBar position="top" />
      <iframe
        ref={iframeRef}
        srcDoc={html}
        title={`교재 본문 — Unit ${unit}`}
        onLoad={handleLoad}
        scrolling="no"
        className="block w-full border-0"
        style={{ height: "100vh" }}
      />
      <CompletionToggle />
      <NavBar position="bottom" />
    </div>
  );
}
