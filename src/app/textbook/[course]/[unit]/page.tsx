import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import TextbookViewer from "@/components/textbook/TextbookViewer";
import { TEXTBOOK_REGISTRY, getAdjacentUnits, getTextbook, getTextbookUnit } from "@/data/textbook";

type Params = { course: string; unit: string };

export function generateStaticParams() {
  return TEXTBOOK_REGISTRY.flatMap((t) => t.units.map((u) => ({ course: t.course, unit: String(u.unit) })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { course, unit: unitParam } = await params;
  const unitNum = Number(unitParam);
  const textbook = getTextbook(course);
  const unit = Number.isInteger(unitNum) ? getTextbookUnit(course, unitNum) : undefined;
  if (!textbook || !unit) return { title: "교재를 찾을 수 없습니다 — 프렌딩 스쿨" };
  return {
    title: `Unit ${unit.unit} · ${unit.titleKr} — ${textbook.title}`,
    description: unit.situation || unit.titleKr,
  };
}

export default async function TextbookUnitPage({ params }: { params: Promise<Params> }) {
  const { course, unit: unitParam } = await params;
  const unitNum = Number(unitParam);
  if (!Number.isInteger(unitNum)) notFound();

  const textbook = getTextbook(course);
  const unit = textbook ? getTextbookUnit(course, unitNum) : undefined;
  if (!textbook || !unit) notFound();

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 무료 미리보기 unit 외에는 로그인 필수
  if (!textbook.freeUnits.includes(unit.unit) && !user) {
    redirect(`/login?next=/textbook/${course}/${unit.unit}`);
  }

  const filePath = path.join(process.cwd(), "content", "textbook", course, unit.htmlFile);
  let html = await fs.readFile(filePath, "utf-8");

  // 문장별 음성 버튼(__AUDIO_BASE__ 토큰)을 Supabase Storage 공개 URL로 치환.
  // 토큰 미포함 교재 HTML에는 무영향. iframe srcDoc은 상대 URL을 부모 라우트 기준으로
  // 해석하므로 절대 URL이 필요. (현재 workhol 교재만 토큰 포함)
  const audioBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/textbook-audio/`;
  html = html.replaceAll("__AUDIO_BASE__", audioBase);

  let initialCompleted = false;
  if (user) {
    const { data } = await supabase
      .from("reading_progress")
      .select("completed")
      .eq("user_id", user.id)
      .eq("course", course)
      .eq("unit", unit.unit)
      .maybeSingle();
    if (data) initialCompleted = data.completed ?? false;
  }

  const { prev, next } = getAdjacentUnits(course, unit.unit);

  return (
    <TextbookViewer
      html={html}
      course={course}
      unit={unit.unit}
      totalUnits={Math.max(...textbook.units.map((u) => u.unit))}
      initialCompleted={initialCompleted}
      isAuthenticated={!!user}
      listHref={`/textbook/${course}`}
      prevHref={prev != null ? `/textbook/${course}/${prev}` : null}
      nextHref={next != null ? `/textbook/${course}/${next}` : null}
    />
  );
}
