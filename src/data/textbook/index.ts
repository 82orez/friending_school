import { BOOKS } from "@/data/landing";
import { WORKHOL_COURSE, WORKHOL_UNITS } from "./workhol";

// 전자책 레지스트리. 새 교재 추가: (1) content/textbook/<course>/unit-NN.html,
// (2) 아래 TEXTBOOK_REGISTRY에 항목 추가(units는 BOOKS에서 파생하거나 직접 작성).
// 라우트(/textbook/[course], /textbook/[course]/[unit])·Navbar·진행률 저장이 모두 레지스트리 기반.

export type TextbookUnit = {
  unit: number;
  title: string;
  titleKr: string;
  situation: string;
  htmlFile: string;
};

export type Textbook = {
  course: string; // reading_progress.course 와 1:1, URL segment
  title: string; // Navbar "교재 보기" · 목록 헤더
  subtitle: string; // 목록 페이지 설명
  eyebrow: string; // 목록 상단 라벨(대문자)
  freeUnits: number[]; // 로그인 없이 열람 가능한 unit 번호(무료 미리보기)
  units: TextbookUnit[];
};

// landing.ts BOOKS(셀프디벨롭 데이터)에서 전자책 유닛 메타 파생 — 데이터 중복 방지.
function unitsFromBook(bookKey: string): TextbookUnit[] {
  const book = BOOKS.find((b) => b.key === bookKey);
  if (!book) return [];
  return [...book.units, ...book.extra].map((u) => {
    const n = parseInt(u.n.replace(/\D/g, ""), 10); // "Unit 01" → 1, "Unit 25" → 25
    return {
      unit: n,
      title: u.t,
      titleKr: u.sub ?? u.t,
      situation: u.situation ?? u.sub ?? "",
      htmlFile: `unit-${String(n).padStart(2, "0")}.html`,
    };
  });
}

export const TEXTBOOK_REGISTRY: Textbook[] = [
  {
    course: WORKHOL_COURSE, // "workhol" — 워홀 콘텐츠(폴더 content/textbook/workhol)
    title: "워홀 생존영어 - 현지에서 쓰는 실전 영어",
    subtitle: "준(Jun)의 호주 워킹홀리데이 24개 Unit. 매일 한 Unit씩 호주 현지 표현을 익혀보세요.",
    eyebrow: "FRIENDING · WORKING HOLIDAY ENGLISH",
    freeUnits: [1],
    units: WORKHOL_UNITS,
  },
  {
    course: "kitchen",
    title: "셰프 영어 — 식당 · 카페 · 주방 현장 실전",
    subtitle: "미장플라스부터 러시아워 소통까지, 주방에서 바로 통하는 실전 표현 24개 Unit.",
    eyebrow: "FRIENDING · KITCHEN ENGLISH",
    freeUnits: [1],
    units: unitsFromBook("kitchen"),
  },
  {
    course: "grammar1",
    title: "회화 공식영어 1 — 기초부터 탄탄하게",
    subtitle: "Be동사부터 전치사까지, 회화의 뼈대를 세우는 24개 Unit.",
    eyebrow: "FRIENDING · BASIC GRAMMAR 1",
    freeUnits: [1],
    units: unitsFromBook("basic1"),
  },
  {
    course: "grammar2",
    title: "회화 공식영어 2 — 실전 회화 완성",
    subtitle: "비교급부터 가정법까지, 실전 회화를 완성하는 Unit 25–48.",
    eyebrow: "FRIENDING · BASIC GRAMMAR 2",
    freeUnits: [25],
    units: unitsFromBook("basic2"), // 25–48
  },
  {
    course: "cosmetic",
    title: "뷰티 영어 — 글로벌 비즈니스 실전",
    subtitle: "바이어 미팅부터 협상·이메일·계약까지, K-뷰티 수출 영어 24개 Unit.",
    eyebrow: "FRIENDING · COSMETIC EXPORT ENGLISH",
    freeUnits: [1],
    units: unitsFromBook("cosmetic"),
  },
];

export function getTextbook(course: string): Textbook | undefined {
  return TEXTBOOK_REGISTRY.find((t) => t.course === course);
}

export function getTextbookUnit(course: string, unit: number): TextbookUnit | undefined {
  return getTextbook(course)?.units.find((u) => u.unit === unit);
}

/** 교재 내 유닛 순서 기준 이전/다음 유닛 번호(없으면 null). */
export function getAdjacentUnits(course: string, unit: number): { prev: number | null; next: number | null } {
  const tb = getTextbook(course);
  if (!tb) return { prev: null, next: null };
  const idx = tb.units.findIndex((u) => u.unit === unit);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? tb.units[idx - 1].unit : null,
    next: idx < tb.units.length - 1 ? tb.units[idx + 1].unit : null,
  };
}

// Navbar "교재 보기" 서브메뉴용 (course, title, href).
export type TextbookEntry = { course: string; title: string; href: string };
export const TEXTBOOKS: TextbookEntry[] = TEXTBOOK_REGISTRY.map((t) => ({
  course: t.course,
  title: t.title,
  href: `/textbook/${t.course}`,
}));
