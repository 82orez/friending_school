"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { logout } from "@/app/logout/actions";
import { createClient } from "@/utils/supabase/client";

type NavbarUser = { email?: string | null } | null;

export default function Navbar({ user: initialUser }: { user: NavbarUser }) {
  const [user, setUser] = useState<NavbarUser>(initialUser);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);
  const toggleMenu = () => setMenuOpen((prev) => !prev);

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

  return (
    <>
      {/* 네비 */}
      <nav className="sticky top-0 z-[100] flex items-center border-b border-[#eee] bg-white px-6 py-4">
        <div className="flex flex-1 items-center justify-start">
          <Link href="/">
            <img src="/images/friending_school_logo.png" alt="프렌딩 스쿨 로고" width={40} height={40} className="h-10 w-auto" />
          </Link>
        </div>
        <div className="hidden flex-1 justify-center text-3xl font-bold md:flex">
          <Link href="/">프렌딩 스쿨</Link>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          {/* 데스크톱 인라인 인증 영역 */}
          <div className="hidden items-center gap-3 md:flex">
            {user ? (
              <>
                <span className="max-w-[180px] truncate text-sm text-[#666]" title={user.email ?? undefined}>
                  {user.email}
                </span>
                <form action={logout}>
                  <button
                    type="submit"
                    className="cursor-pointer rounded-full border border-[#ddd] px-3 py-1.5 text-sm font-medium text-[#333] transition-colors hover:border-[#ff4757] hover:text-[#ff4757]">
                    로그아웃
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-[#333] transition-colors hover:text-[#ff4757]">
                  로그인
                </Link>
                <Link
                  href="/signup"
                  className="rounded-full bg-[#ff4757] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#ff4757]/90">
                  회원가입
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={toggleMenu}
            aria-label="메뉴 열기"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[#ff4757] text-xl text-white">
            ≡
          </button>
        </div>
      </nav>

      {/* 슬라이드 메뉴 */}
      <div
        className={`fixed top-0 z-[200] h-screen w-[280px] border-l border-[#eee] bg-white pt-8 transition-[right] duration-300 ease-in-out ${
          menuOpen ? "right-0" : "-right-[300px]"
        }`}>
        <button
          type="button"
          onClick={closeMenu}
          aria-label="메뉴 닫기"
          className="absolute top-4 right-6 cursor-pointer border-none bg-transparent text-2xl">
          ✕
        </button>
        <ul className="list-none px-6">
          <li className="border-b border-[#eee] py-4">
            <a href="#curriculum" onClick={closeMenu} className="text-[15px] font-medium text-[#333] no-underline">
              커리큘럼
            </a>
          </li>
          <li className="border-b border-[#eee] py-4">
            <a href="#apply" onClick={closeMenu} className="text-[15px] font-medium text-[#333] no-underline">
              신청방법
            </a>
          </li>

          {/* 모바일 인증 섹션 */}
          {user ? (
            <>
              <li className="border-b border-[#eee] py-4">
                <span className="block truncate text-[13px] text-[#888]" title={user.email ?? undefined}>
                  {user.email}
                </span>
              </li>
              <li className="py-4">
                <form action={logout}>
                  <button
                    type="submit"
                    className="w-full cursor-pointer rounded-md border border-[#ddd] px-4 py-2.5 text-[15px] font-medium text-[#333] transition-colors hover:border-[#ff4757] hover:text-[#ff4757]">
                    로그아웃
                  </button>
                </form>
              </li>
            </>
          ) : (
            <>
              <li className="border-b border-[#eee] py-4">
                <Link href="/login" onClick={closeMenu} className="text-[15px] font-medium text-[#333] no-underline">
                  로그인
                </Link>
              </li>
              <li className="py-4">
                <Link
                  href="/signup"
                  onClick={closeMenu}
                  className="block w-full rounded-md bg-[#ff4757] px-4 py-2.5 text-center text-[15px] font-semibold text-white no-underline transition-colors hover:bg-[#ff4757]/90">
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
