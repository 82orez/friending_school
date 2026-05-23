import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import TextbookViewer from "@/components/textbook/TextbookViewer";
import { COOKING_COURSE, COOKING_TOTAL_UNITS, getCookingUnit } from "@/data/textbook/cooking";

type Params = { unit: string };

export async function generateStaticParams() {
  return Array.from({ length: COOKING_TOTAL_UNITS }, (_, i) => ({ unit: String(i + 1) }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { unit: unitParam } = await params;
  const unitNum = Number(unitParam);
  const unit = Number.isInteger(unitNum) ? getCookingUnit(unitNum) : undefined;
  if (!unit) return { title: "교재를 찾을 수 없습니다 — 프렌딩 스쿨" };
  return {
    title: `Unit ${unit.unit} · ${unit.titleKr} — 워홀 실전영어 (요리편)`,
    description: unit.situation,
  };
}

export default async function CookingUnitPage({ params }: { params: Promise<Params> }) {
  const { unit: unitParam } = await params;
  const unitNum = Number(unitParam);
  if (!Number.isInteger(unitNum)) notFound();

  const unit = getCookingUnit(unitNum);
  if (!unit) notFound();

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Unit 2~24는 로그인 필수
  if (unit.unit > 1 && !user) {
    redirect(`/login?next=/textbook/cooking/${unit.unit}`);
  }

  const filePath = path.join(process.cwd(), "content", "textbook", "cooking", unit.htmlFile);
  const html = await fs.readFile(filePath, "utf-8");

  let initialScrollPercent: number | null = null;
  if (user) {
    const { data } = await supabase
      .from("reading_progress")
      .select("scroll_percent")
      .eq("user_id", user.id)
      .eq("course", COOKING_COURSE)
      .eq("unit", unit.unit)
      .maybeSingle();
    if (data) initialScrollPercent = data.scroll_percent ?? 0;
  }

  return (
    <TextbookViewer
      html={html}
      course={COOKING_COURSE}
      unit={unit.unit}
      totalUnits={COOKING_TOTAL_UNITS}
      initialScrollPercent={initialScrollPercent}
      isAuthenticated={!!user}
      listHref="/textbook/cooking"
      prevHref={unit.unit > 1 ? `/textbook/cooking/${unit.unit - 1}` : null}
      nextHref={unit.unit < COOKING_TOTAL_UNITS ? `/textbook/cooking/${unit.unit + 1}` : null}
    />
  );
}
