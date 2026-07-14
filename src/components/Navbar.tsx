"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { logout } from "@/app/(auth)/logout/actions";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { TEXTBOOKS } from "@/data/textbook";

type NavbarUser = { email?: string | null } | null;

// 커리큘럼(과정) 링크 — Phase 2 과정 상세페이지(/courses/<slug>) placeholder.
const COURSES = [
  { slug: "workhol", label: "워홀 생존영어" },
  { slug: "kitchen", label: "셰프 영어" },
  { slug: "grammar1", label: "회화 기초문법 1" },
  { slug: "grammar2", label: "회화 기초문법 2" },
  { slug: "cosmetic", label: "뷰티 수출영어" },
];

export default function Navbar({
  user: initialUser,
  isAdmin = false,
  isTeacher = false,
  isCenterManager = false,
}: {
  user: NavbarUser;
  isAdmin?: boolean;
  isTeacher?: boolean;
  isCenterManager?: boolean;
}) {
  const [user, setUser] = useState<NavbarUser>(initialUser);
  const [menuOpen, setMenuOpen] = useState(false);
  const [curriculumOpen, setCurriculumOpen] = useState(false);
  const [textbookOpen, setTextbookOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const prevMenuOpen = useRef(false);

  const closeMenu = () => setMenuOpen(false);
  const toggleMenu = () => setMenuOpen((prev) => !prev);

  // 슬라이드 메뉴가 닫힐 때 하위 아코디언도 초기화 (다시 열 때 접힌 상태로 시작)
  useEffect(() => {
    if (!menuOpen) {
      setCurriculumOpen(false);
      setTextbookOpen(false);
    }
  }, [menuOpen]);

  // SSR로 받은 user prop이 갱신되면(로그인 후 revalidatePath로 layout 재실행) state 동기화.
  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  // 다른 탭에서의 로그인/로그아웃, 토큰 갱신, bfcache 복원 등 SSR 재실행 없이 발생하는
  // auth 상태 변화에 반응. layout-only revalidate가 닿지 않는 케이스를 보완.
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { email: session.user.email } : null);
    });

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      supabase.auth.getUser().then(({ data }) => {
        setUser(data.user ? { email: data.user.email } : null);
      });
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen && !prevMenuOpen.current) {
      closeButtonRef.current?.focus();
    } else if (!menuOpen && prevMenuOpen.current) {
      triggerRef.current?.focus();
    }
    prevMenuOpen.current = menuOpen;
  }, [menuOpen]);

  return (
    <>
      {/* 네비 */}
      <nav className="border-rule sticky top-0 z-[100] flex items-center border-b bg-white px-6 py-3">
        <div className="flex flex-1 items-center justify-start">
          <Link href="/">
            <Image src="/images/logo.png" alt="청년을 세계로 — 프렌딩 스쿨" width={123} height={36} priority className="h-9 w-auto" />
          </Link>
        </div>

        <div className="flex items-center justify-end gap-3">
          {/* 데스크톱 인라인 인증 영역 */}
          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="text-brand hover:text-brand/80 focus-visible:ring-brand/50 rounded text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    관리자
                  </Link>
                )}
                {isTeacher && (
                  <Link
                    href="/teacher"
                    className="text-accent-blue-ink hover:text-accent-blue focus-visible:ring-accent-blue/50 rounded text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    Teacher
                  </Link>
                )}
                {isCenterManager && (
                  <Link
                    href="/center"
                    className="text-cta hover:text-cta/80 focus-visible:ring-accent-blue/50 rounded text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    Center Management
                  </Link>
                )}
                {!isTeacher && !isCenterManager && (
                  <Link
                    href="/mypage"
                    className="text-ink-soft hover:text-accent-blue-ink focus-visible:ring-accent-blue/50 rounded text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    마이페이지
                  </Link>
                )}
                <form action={logout}>
                  <button
                    type="submit"
                    className="border-rule-faint text-ink-soft hover:border-accent-blue hover:text-accent-blue-ink focus-visible:ring-accent-blue/50 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    로그아웃
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-ink-soft hover:text-accent-blue-ink focus-visible:ring-accent-blue/50 rounded text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                  로그인
                </Link>
                <Link
                  href="/signup"
                  className="bg-brand-blue hover:bg-brand-blue/90 focus-visible:ring-brand-blue/50 rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                  회원가입
                </Link>
              </>
            )}
          </div>

          <button
            ref={triggerRef}
            type="button"
            onClick={toggleMenu}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="bg-accent-blue focus-visible:ring-accent-blue/50 flex h-10 w-10 items-center justify-center rounded-full text-xl text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
            ≡
          </button>
        </div>
      </nav>

      {/* 슬라이드 메뉴 배경 오버레이 */}
      <div
        aria-hidden="true"
        onClick={closeMenu}
        className={`fixed inset-0 z-[150] bg-black/40 transition-opacity duration-300 ${
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* 슬라이드 메뉴 */}
      <div
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="메뉴"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        className={`border-rule fixed top-0 z-[200] h-screen w-[280px] border-l bg-white pt-8 transition-[right] duration-300 ease-in-out ${
          menuOpen ? "right-0" : "-right-[300px]"
        }`}>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={closeMenu}
          aria-label="메뉴 닫기"
          className="focus-visible:ring-accent-blue/50 absolute top-4 right-6 rounded border-none bg-transparent text-2xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
          ✕
        </button>
        <ul className="list-none px-6">
          {/* 커리큘럼 아코디언 */}
          <li className="border-rule border-b py-4">
            <button
              type="button"
              onClick={() => setCurriculumOpen((prev) => !prev)}
              aria-expanded={curriculumOpen}
              aria-controls="mobile-curriculum-submenu"
              className="text-ink-soft focus-visible:ring-accent-blue/50 flex w-full items-center justify-between rounded text-[15px] font-bold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
              <span>커리큘럼</span>
              <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200", curriculumOpen && "rotate-180")} />
            </button>
            <div
              id="mobile-curriculum-submenu"
              className={cn(
                "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-in-out",
                curriculumOpen ? "mt-1 grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}>
              <ul className="min-h-0 list-none">
                {COURSES.map((c) => (
                  <li key={c.slug} className="py-2 pl-4">
                    <Link
                      href={`/courses/${c.slug}`}
                      onClick={closeMenu}
                      className="text-muted-fg hover:text-accent-blue-ink focus-visible:ring-accent-blue/50 block rounded text-[14px] no-underline transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>

          {/* 교재 보기 아코디언 */}
          <li className="border-rule border-b py-4">
            <button
              type="button"
              onClick={() => setTextbookOpen((prev) => !prev)}
              aria-expanded={textbookOpen}
              aria-controls="mobile-textbook-submenu"
              className="text-ink-soft focus-visible:ring-accent-blue/50 flex w-full items-center justify-between rounded text-[15px] font-bold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
              <span>교재 보기</span>
              <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200", textbookOpen && "rotate-180")} />
            </button>
            <div
              id="mobile-textbook-submenu"
              className={cn(
                "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-in-out",
                textbookOpen ? "mt-1 grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}>
              <ul className="min-h-0 list-none">
                {TEXTBOOKS.map((book) => (
                  <li key={book.course} className="py-2 pl-4">
                    <Link
                      href={book.href}
                      onClick={closeMenu}
                      className="text-muted-fg hover:text-accent-blue-ink focus-visible:ring-accent-blue/50 block rounded text-[14px] no-underline transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                      {book.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>

          {/* 모바일 인증 섹션 */}
          {user ? (
            <>
              {isAdmin && (
                <li className="border-rule border-b py-4">
                  <Link
                    href="/admin"
                    onClick={closeMenu}
                    className="text-brand focus-visible:ring-brand/50 rounded text-[15px] font-semibold no-underline transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    관리자
                  </Link>
                </li>
              )}
              {isTeacher && (
                <li className="border-rule border-b py-4">
                  <Link
                    href="/teacher"
                    onClick={closeMenu}
                    className="text-accent-blue-ink focus-visible:ring-accent-blue/50 rounded text-[15px] font-semibold no-underline transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    Teacher
                  </Link>
                </li>
              )}
              {isCenterManager && (
                <li className="border-rule border-b py-4">
                  <Link
                    href="/center"
                    onClick={closeMenu}
                    className="text-cta focus-visible:ring-accent-blue/50 rounded text-[15px] font-semibold no-underline transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    Center Management
                  </Link>
                </li>
              )}
              {!isTeacher && !isCenterManager && (
                <li className="border-rule border-b py-4">
                  <Link
                    href="/mypage"
                    onClick={closeMenu}
                    className="text-ink-soft hover:text-accent-blue-ink focus-visible:ring-accent-blue/50 rounded text-[15px] font-medium no-underline transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    마이페이지
                  </Link>
                </li>
              )}
              <li className="border-rule border-b py-4">
                <span className="block truncate text-[13px] text-[#888]" title={user.email ?? undefined}>
                  {user.email}
                </span>
              </li>
              <li className="py-4">
                <form action={logout}>
                  <button
                    type="submit"
                    className="border-rule-faint text-ink-soft hover:border-accent-blue hover:text-accent-blue-ink focus-visible:ring-accent-blue/50 w-full rounded-md border px-4 py-2.5 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                    로그아웃
                  </button>
                </form>
              </li>
            </>
          ) : (
            <>
              <li className="border-rule border-b py-4">
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="text-ink-soft hover:text-accent-blue-ink focus-visible:ring-accent-blue/50 rounded text-[15px] font-medium no-underline transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                  로그인
                </Link>
              </li>
              <li className="py-4">
                <Link
                  href="/signup"
                  onClick={closeMenu}
                  className="bg-brand-blue hover:bg-brand-blue/90 focus-visible:ring-brand-blue/50 block w-full rounded-md px-4 py-2.5 text-center text-[15px] font-semibold text-white no-underline transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
                  회원가입
                </Link>
              </li>
            </>
          )}
        </ul>
      </div>
    </>
  );
}
