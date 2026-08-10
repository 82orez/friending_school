import Link from "next/link";
import { cookies } from "next/headers";
import { Mail, MapPin, Phone, Play } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { kstShortDate } from "@/lib/kst";

type FooterNotice = { id: string; title: string; published_at: string; is_pinned: boolean };

export default async function Footer() {
  // 공지 최근 3건 — RLS(notices_select_public)가 노출·게시일 필터를 강제하므로 세션 client로 조회.
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("notices")
    .select("id, title, published_at, is_pinned")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(3);
  const notices = (data ?? []) as FooterNotice[];

  return (
    <footer id="contact" className="bg-ink text-white">
      <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-10">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Company */}
          <div>
            <h3 className="mb-4 text-lg font-bold text-white">(주)프렌딩</h3>
            <ul className="space-y-2 text-sm text-[#888]">
              <li className="flex items-center gap-2">
                <Play className="size-3 shrink-0 fill-current" />
                <span>대표 : 박민규</span>
              </li>
              <li className="flex items-center gap-2">
                <Play className="size-3 shrink-0 fill-current" />
                <span>사업자등록 : 548-86-01562</span>
              </li>
              <li className="flex items-center gap-2">
                <Play className="size-3 shrink-0 fill-current" />
                <span>통신판매업 : 20109-서울성동-0580호</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <span>경기도 용인시 기흥구 동백5로 17, 805호의 13호(중동)</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="size-4 shrink-0" />
                <span>Phone: 1668-4540</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="size-4 shrink-0" />
                <span>Email: sean.friending@email.com</span>
              </li>
            </ul>
          </div>

          {/* 공지 사항 — min-w-0: 그리드 아이템 기본 min-width:auto를 풀어야 긴 제목의 truncate가 동작(없으면 칼럼이 늘어나 레이아웃이 넘침) */}
          <div className="min-w-0">
            <h3 className="mb-4 text-lg font-bold text-white">공지 사항</h3>
            {/* 목록의 pr-*: 날짜가 오른쪽 'Other INFO' 칼럼에 붙어 보이지 않도록 여백 확보 */}
            {notices.length === 0 ? (
              <p className="text-sm text-[#888]">등록된 공지 사항이 없습니다.</p>
            ) : (
              <ul className="space-y-2 pr-6 text-sm text-[#888] md:pr-12">
                {notices.map((n) => (
                  <li key={n.id} className="flex items-baseline gap-2">
                    <Link href={`/notices/${n.id}`} className="min-w-0 flex-1 truncate transition-colors hover:text-white">
                      {n.is_pinned && <span className="mr-1 text-[#bbb]">[공지]</span>}
                      {n.title}
                    </Link>
                    <span className="shrink-0 text-xs text-[#666]">{kstShortDate(n.published_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/notices" className="mt-3 inline-block text-[13px] text-[#888] transition-colors hover:text-white">
              전체 보기 →
            </Link>
          </div>

          {/* Other INFO */}
          <div>
            <h3 className="mb-4 text-lg font-bold text-white">Other INFO</h3>
            <ul className="space-y-2 text-sm text-[#888]">
              <li>
                <Link href="/terms" className="transition-colors hover:text-white">
                  회원이용약관
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="transition-colors hover:text-white">
                  개인정보처리방침
                </Link>
              </li>
              <li>
                <Link href="/refund" className="transition-colors hover:text-white">
                  환불 정책
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* 하단 */}
        <div className="mt-8 flex flex-col items-center gap-3 border-t border-white/10 pt-5 text-center md:flex-row md:justify-between md:text-left">
          <p className="text-[13px] text-[#888]">Copyright © 2026 (주)프렌딩, All Rights Reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/friender/apply" className="text-[13px] text-[#888] transition-colors hover:text-white">
              프렌더 지원하기
            </Link>
            <span aria-hidden className="text-[13px] text-[#555]">
              ·
            </span>
            <Link href="/teacher/apply" className="text-[13px] text-[#888] transition-colors hover:text-white">
              Become a Teacher
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
