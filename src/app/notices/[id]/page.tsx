import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import NoticeViewCounter from "@/components/notices/NoticeViewCounter";
import { kstDateText } from "@/lib/kst";

type NoticeDetail = { id: string; title: string; body: string; published_at: string; is_pinned: boolean; view_count: number };

// 비공개·예약 게시분은 RLS가 걸러 null → 상세도 404.
async function loadNotice(id: string): Promise<NoticeDetail | null> {
  const supabase = createClient(await cookies());
  const { data } = await supabase.from("notices").select("id, title, body, published_at, is_pinned, view_count").eq("id", id).maybeSingle();
  return (data as NoticeDetail) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const notice = await loadNotice(id);
  return { title: notice ? `${notice.title} — 프렌딩 스쿨` : "공지 사항 — 프렌딩 스쿨" };
}

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notice = await loadNotice(id);
  if (!notice) notFound();

  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-[880px] px-5 py-12 md:py-16">
        <Link href="/notices" className="text-muted-fg hover:text-ink text-sm font-medium transition-colors">
          ← 공지 사항
        </Link>

        <article className="border-rule mt-4 rounded-xl border bg-white px-6 py-8 md:px-8">
          <h1 className="text-ink text-xl font-bold md:text-2xl">
            {notice.is_pinned && <span className="bg-cta/10 text-cta mr-2 rounded-full px-2 py-0.5 align-middle text-xs font-bold">공지</span>}
            {notice.title}
          </h1>
          <p className="text-muted-fg-faint border-rule mt-3 border-b pb-4 text-xs">
            {kstDateText(notice.published_at)} · 조회 {notice.view_count.toLocaleString()}
          </p>
          <div className="text-ink-soft mt-6 leading-relaxed whitespace-pre-wrap">{notice.body}</div>
        </article>

        <div className="mt-6 flex justify-center">
          <Link
            href="/notices"
            className="border-rule text-muted-fg hover:text-ink rounded-md border bg-white px-5 py-2.5 text-sm font-medium transition-colors">
            목록으로
          </Link>
        </div>
      </div>

      {/* 조회수는 렌더 중 뮤테이션 대신 클라이언트 마운트 시 1회 기록. */}
      <NoticeViewCounter id={notice.id} />
    </div>
  );
}
