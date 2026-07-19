import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { kstDateText } from "@/lib/kst";

export const metadata: Metadata = { title: "공지 사항 — 프렌딩 스쿨" };

const PAGE_SIZE = 20;

type NoticeRow = { id: string; title: string; published_at: string; is_pinned: boolean; view_count: number };

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;

  // RLS(notices_select_public)가 노출 ON + 게시일 도래분만 반환.
  const supabase = createClient(await cookies());
  const { data, count } = await supabase
    .from("notices")
    .select("id, title, published_at, is_pinned, view_count", { count: "exact" })
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  const notices = (data ?? []) as NoticeRow[];
  const hasNext = (count ?? 0) > from + notices.length;

  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-[880px] px-5 py-12 md:py-16">
        <h1 className="text-ink text-2xl font-bold md:text-3xl">공지 사항</h1>
        <p className="text-muted-fg mt-2 text-sm">프렌딩 스쿨의 새로운 소식과 안내를 확인하세요.</p>

        {notices.length === 0 ? (
          <p className="text-muted-fg border-rule mt-8 rounded-xl border bg-white px-6 py-16 text-center text-sm">등록된 공지 사항이 없습니다.</p>
        ) : (
          <ul className="border-rule mt-8 overflow-hidden rounded-xl border bg-white">
            {notices.map((n) => (
              <li key={n.id} className="border-rule border-b last:border-b-0">
                <Link href={`/notices/${n.id}`} className="hover:bg-surface flex items-center gap-3 px-5 py-4 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate font-medium">
                      {n.is_pinned && <span className="bg-cta/10 text-cta mr-1.5 rounded-full px-2 py-0.5 text-xs font-bold">공지</span>}
                      {n.title}
                    </p>
                  </div>
                  <span className="text-muted-fg-faint shrink-0 text-xs">{kstDateText(n.published_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* 페이지네이션 */}
        {(page > 1 || hasNext) && (
          <div className="mt-6 flex items-center justify-center gap-3">
            {page > 1 ? (
              <Link href={`/notices?page=${page - 1}`} className="border-rule text-muted-fg hover:text-ink rounded-md border bg-white px-4 py-2 text-sm font-medium">
                이전
              </Link>
            ) : null}
            <span className="text-muted-fg-faint text-sm">{page}</span>
            {hasNext ? (
              <Link href={`/notices?page=${page + 1}`} className="border-rule text-muted-fg hover:text-ink rounded-md border bg-white px-4 py-2 text-sm font-medium">
                다음
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
