import Link from "next/link";
import { cookies } from "next/headers";
import { CheckCircle2, Lock } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { SectionCard } from "@/components/SectionCard";
import { cn } from "@/lib/utils";
import { COOKING_COURSE, COOKING_TOTAL_UNITS, COOKING_UNITS } from "@/data/textbook/cooking";

export const metadata = {
  title: "워홀 실전영어 (요리편) — 프렌딩 스쿨",
  description: "프렌딩 스쿨 워홀 실전영어 시리즈 — Jun의 호주 워킹홀리데이 24개 Unit 전자책.",
};

type ProgressRow = {
  unit: number;
  scroll_percent: number;
  completed: boolean;
};

export default async function CookingTextbookPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let progressByUnit: Map<number, ProgressRow> = new Map();
  if (user) {
    const { data } = await supabase
      .from("reading_progress")
      .select("unit, scroll_percent, completed")
      .eq("user_id", user.id)
      .eq("course", COOKING_COURSE);
    if (data) {
      progressByUnit = new Map(data.map((row) => [row.unit, row as ProgressRow]));
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-10 md:py-14">
      <header className="mb-8 md:mb-12">
        <p className="mb-2 text-sm font-semibold tracking-[0.1em] text-brand uppercase">FRIENDING · WORKING HOLIDAY ENGLISH</p>
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">워홀 실전영어 · 요리편</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-fg md:text-lg">
          준(Jun)의 호주 워킹홀리데이 24개 Unit. 매일 한 Unit씩 호주 현지 표현을 익혀보세요.
          {!user && <span className="mt-1 block text-sm text-muted-fg-faint">Unit 1은 무료 미리보기, 나머지는 로그인 후 열람할 수 있습니다.</span>}
        </p>
      </header>

      <ul className="grid list-none grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {COOKING_UNITS.map((u) => {
          const progress = progressByUnit.get(u.unit);
          const isLocked = !user && u.unit > 1;
          const isCompleted = progress?.completed ?? false;
          const percent = Math.max(0, Math.min(100, progress?.scroll_percent ?? 0));
          const href = isLocked ? `/login?next=/textbook/cooking/${u.unit}` : `/textbook/cooking/${u.unit}`;

          return (
            <li key={u.unit}>
              <Link
                href={href}
                aria-label={`Unit ${u.unit} ${u.title} — ${u.titleKr}${isLocked ? " (로그인 필요)" : ""}`}
                className={cn(
                  "block h-full rounded-xl transition-shadow focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none",
                  isLocked ? "opacity-80" : "hover:shadow-md",
                )}>
                <SectionCard variant="outline" className="flex h-full flex-col gap-3 rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex size-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                        {u.unit}
                      </span>
                      <span className="text-xs font-semibold tracking-wider text-muted-fg-faint uppercase">Unit {u.unit}</span>
                    </span>
                    {isCompleted ? (
                      <CheckCircle2 className="size-5 text-brand" aria-label="읽음" />
                    ) : isLocked ? (
                      <Lock className="size-4 text-muted-fg-faint" aria-label="로그인 필요" />
                    ) : null}
                  </div>

                  <div>
                    <h2 className="text-lg leading-snug font-bold text-ink">{u.title}</h2>
                    <p className="mt-1 text-sm text-muted-fg">{u.titleKr}</p>
                  </div>

                  <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-muted-fg">{u.situation}</p>

                  {user && (
                    <div className="mt-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule" aria-hidden>
                        <div className="h-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-fg-faint">
                        {isCompleted ? "완료" : percent > 0 ? `${percent}% 진행` : "시작 전"}
                      </p>
                    </div>
                  )}

                  {isLocked && <p className="mt-1 text-xs font-medium text-muted-fg">로그인 후 열람</p>}
                </SectionCard>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-10 text-center text-xs text-muted-fg-faint">
        총 {COOKING_TOTAL_UNITS}개 Unit · © FRIENDING WORKING HOLIDAY ENGLISH SERIES
      </p>
    </main>
  );
}
