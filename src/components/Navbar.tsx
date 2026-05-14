"use client";

import { useState } from "react";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);
  const toggleMenu = () => setMenuOpen((prev) => !prev);

  return (
    <>
      {/* 네비 */}
      <nav className="sticky top-0 z-[100] flex items-center justify-between border-b border-[#eee] bg-white px-6 py-4">
        <div className="flex items-center">
          <img src="/images/friending_school_logo.png" alt="프렌딩 스쿨 로고" width={40} height={40} className="h-10 w-auto" />
        </div>
        <div className="hidden flex-1 text-center text-3xl font-bold md:block">프렌딩 스쿨</div>
        <button
          type="button"
          onClick={toggleMenu}
          aria-label="메뉴 열기"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[#ff4757] text-xl text-white">
          ≡
        </button>
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
        </ul>
      </div>
    </>
  );
}
