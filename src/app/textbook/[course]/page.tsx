import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { SectionCard } from "@/components/SectionCard";
import { cn } from "@/lib/utils";
import { TEXTBOOK_REGISTRY, getTextbook } from "@/data/textbook";

type Params = { course: string };

export function generateStaticParams() {
  return TEXTBOOK_REGISTRY.map((t) => ({ course: t.course }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { course } = await params;
  const textbook = getTextbook(course);
  if (!textbook) return { title: "교재를 찾을 수 없습니다 — 프렌딩 스쿨" };
  return { title: `${textbook.title} — 프렌딩 스쿨`, description: textbook.subtitle };
}

type ProgressRow = { unit: number; completed: boolean };

export default async function TextbookListPage({ params }: { params: Promise<Params> }) {
  const { course } = await params;
  const textbook = getTextbook(course);
  if (!textbook) notFound();

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let progressByUnit: Map<number, ProgressRow> = new Map();
  if (user) {
    const { data } = await supabase
      .from("reading_progress")
      .select("unit, completed")
      .eq("user_id", user.id)
      .eq("course", course);
    if (data) progressByUnit = new Map(data.map((row) => [row.unit, row as ProgressRow]));
  }

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-10 md:py-14">
      <header className="mb-8 md:mb-12">
        <p className="text-brand mb-2 text-sm font-semibold tracking-[0.1em] uppercase">{textbook.eyebrow}</p>
        <h1 className="text-ink text-3xl font-extrabold md:text-4xl">{textbook.title}</h1>
        <p className="text-muted-fg mt-3 text-base leading-relaxed md:text-lg">
          {textbook.subtitle}
          {!user && <span className="text-muted-fg-faint mt-1 block text-sm">무료 미리보기 Unit 외에는 로그인 후 열람할 수 있습니다.</span>}
        </p>
      </header>

      <ul className="grid list-none grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {textbook.units.map((u) => {
          const progress = progressByUnit.get(u.unit);
          const isLocked = !user && !textbook.freeUnits.includes(u.unit);
          const isCompleted = progress?.completed ?? false;
          const href = isLocked ? `/login?next=/textbook/${course}/${u.unit}` : `/textbook/${course}/${u.unit}`;

          return (
            <li key={u.unit}>
              <Link
                href={href}
                aria-label={`Unit ${u.unit} ${u.title} — ${u.titleKr}${isLocked ? " (로그인 필요)" : ""}`}
                className={cn(
                  "focus-visible:ring-brand/50 block h-full rounded-xl transition-shadow focus-visible:ring-2 focus-visible:outline-none",
                  isLocked ? "opacity-80" : "hover:shadow-md",
                )}>
                <SectionCard variant="outline" className="flex h-full flex-col gap-3 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="bg-brand inline-flex size-7 items-center justify-center rounded-full text-xs font-bold text-white">{u.unit}</span>
                      <span className="text-muted-fg-faint text-xs font-semibold tracking-wider uppercase">Unit {u.unit}</span>
                    </span>
                    {isCompleted ? (
                      <CheckCircle2 className="text-brand size-5" aria-label="읽음" />
                    ) : isLocked ? (
                      <Lock className="text-muted-fg-faint size-4" aria-label="로그인 필요" />
                    ) : null}
                  </div>

                  <div>
                    <h2 className="text-ink text-lg leading-snug font-bold">{u.title}</h2>
                    <p className="text-muted-fg mt-1 text-sm">{u.titleKr}</p>
                  </div>

                  {u.situation && <p className="text-muted-fg line-clamp-3 flex-1 text-sm leading-relaxed">{u.situation}</p>}

                  {user && (
                    <p className={cn("mt-auto text-xs font-medium", isCompleted ? "text-brand" : "text-muted-fg-faint")}>
                      {isCompleted ? "학습 완료됨" : "시작 전"}
                    </p>
                  )}

                  {isLocked && <p className="text-muted-fg mt-1 text-xs font-medium">로그인 후 열람</p>}
                </SectionCard>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-fg-faint mt-10 text-center text-xs">총 {textbook.units.length}개 Unit · © FRIENDING ENGLISH SERIES</p>
    </main>
  );
}
