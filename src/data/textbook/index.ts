import { COOKING_COURSE } from "./cooking";

export type TextbookEntry = {
  course: string;
  title: string;
  href: string;
};

// 새 교재를 추가할 때는 (1) src/data/textbook/<course>.ts 생성,
// (2) content/textbook/<course>/ 디렉터리에 unit HTML 파일 추가,
// (3) 아래 배열에 한 줄 추가하면 Navbar 모바일 메뉴에 자동 노출됩니다.
export const TEXTBOOKS: TextbookEntry[] = [
  { course: COOKING_COURSE, title: "워홀 실전영어 (요리편)", href: "/textbook/cooking" },
];
