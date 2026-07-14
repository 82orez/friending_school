"use client";

import { createContext, useContext } from "react";

// UI 언어 로케일 — 앱은 i18n 라이브러리 없이 오디언스별 하드코딩이 기본이나,
// admin 대시보드와 컴포넌트를 공유하는 센터 매니저(/center, 외국인)만 영어로 전환하기 위한 최소 컨텍스트.
// provider 없으면 기본 "ko"(admin·학생 등 기존 화면 무변경). /center 레이아웃만 lang="en"으로 감싼다.
export type Lang = "ko" | "en";

const LangContext = createContext<Lang>("ko");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}
