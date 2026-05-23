"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveScrollProgress } from "@/app/textbook/cooking/actions";

type Props = {
  html: string;
  course: string;
  unit: number;
  totalUnits: number;
  initialScrollPercent: number | null;
  isAuthenticated: boolean;
  listHref: string;
  prevHref: string | null;
  nextHref: string | null;
};

const COMPLETED_THRESHOLD = 95;
const SAVE_IDLE_MS = 1000;

export default function TextbookViewer({
  html,
  course,
  unit,
  totalUnits,
  initialScrollPercent,
  isAuthenticated,
  listHref,
  prevHref,
  nextHref,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [scrollRestored, setScrollRestored] = useState(false);
  const lastSentPercentRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prevUnit = unit > 1 ? unit - 1 : null;
  const nextUnit = unit < totalUnits ? unit + 1 : null;

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
    setIframeReady(true);

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

  // 초기 스크롤 위치 복원 (한 번만)
  useEffect(() => {
    if (!iframeReady || scrollRestored) return;
    if (initialScrollPercent == null || initialScrollPercent <= 0) {
      setScrollRestored(true);
      return;
    }
    // iframe 높이 적용 후 한 프레임 대기
    const id = requestAnimationFrame(() => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        window.scrollTo({ top: (initialScrollPercent / 100) * docHeight, behavior: "auto" });
      }
      setScrollRestored(true);
    });
    return () => cancelAnimationFrame(id);
  }, [iframeReady, scrollRestored, initialScrollPercent]);

  // 스크롤 추적 + 디바운스 저장 (로그인 사용자만)
  useEffect(() => {
    if (!isAuthenticated || !iframeReady || !scrollRestored) return;

    const handleScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const percent = Math.round((window.scrollY / docHeight) * 100);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (lastSentPercentRef.current === percent) return;
        lastSentPercentRef.current = percent;
        const completed = percent >= COMPLETED_THRESHOLD;
        saveScrollProgress(course, unit, percent, completed).catch(() => {
          // 네트워크 오류 시 silent — 다음 스크롤에서 재시도됨
        });
      }, SAVE_IDLE_MS);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isAuthenticated, iframeReady, scrollRestored, course, unit]);

  const NavBar = ({ position }: { position: "top" | "bottom" }) => (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[900px] items-center justify-between gap-3 px-4 py-3",
        position === "top" && "sticky top-[72px] z-40 border-b border-rule bg-white/95 backdrop-blur",
      )}>
      <Link
        href={listHref}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none">
        <List className="size-4" aria-hidden />
        <span>목록</span>
      </Link>

      <div className="text-sm font-medium text-muted-fg" aria-label={`Unit ${unit}, 전체 ${totalUnits}개 중`}>
        Unit {unit} / {totalUnits}
      </div>

      <div className="flex items-center gap-2">
        {prevUnit && prevHref ? (
          <Link
            href={prevHref}
            aria-label={`이전 Unit ${prevUnit}`}
            className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none">
            <ChevronLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">이전</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 px-3 py-2 text-sm text-muted-fg-faint">
            <ChevronLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">이전</span>
          </span>
        )}
        {nextUnit && nextHref ? (
          <Link
            href={nextHref}
            aria-label={`다음 Unit ${nextUnit}`}
            className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none">
            <span className="hidden sm:inline">다음</span>
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 px-3 py-2 text-sm text-muted-fg-faint">
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
      <NavBar position="bottom" />
    </div>
  );
}
