import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { cn } from "@/lib/utils";
import StudentProfileForm from "@/components/mypage/StudentProfileForm";

export const metadata: Metadata = { title: "마이페이지 — 프렌딩 스쿨" };

type ApplicationRow = {
  id: string;
  course_title: string;
  option: string | null;
  name: string;
  email: string | null;
  phone: string;
  memo: string | null;
  status: "신청" | "확인" | "완료" | "취소";
  created_at: string;
};

const STATUS_BADGE: Record<ApplicationRow["status"], string> = {
  신청: "bg-accent-blue-soft text-accent-blue-ink",
  확인: "bg-[#FFF7E6] text-[#B97400]",
  완료: "bg-[#E1F5EE] text-[#0F6E56]",
  취소: "bg-rule text-muted-fg",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export default async function MyPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage");

  const { data } = await supabase
    .from("applications")
    .select("id, course_title, option, name, email, phone, memo, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const applications = (data ?? []) as ApplicationRow[];

  const { data: profile } = await supabase.from("profiles").select("first_name, last_name, phone, phone_verified_at").eq("id", user.id).maybeSingle();

  // 한국 관례: 성+이름 붙임(홍+길동=홍길동).
  const fullName = `${profile?.last_name ?? ""}${profile?.first_name ?? ""}`.trim();
  const displayName = fullName || applications[0]?.name || user.email?.split("@")[0] || "회원";
  const joinedAt = user.created_at ? formatDate(user.created_at) : "-";

  return (
    <div className="bg-surface min-h-screen">
      {/* 라벨 바 */}
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">MY PAGE</span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        {/* 웰컴 배너 */}
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL+</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">안녕하세요, {displayName}님! 👋</p>
          <p className="mt-1 text-sm opacity-90">프렌딩 스쿨과 함께해 주셔서 감사합니다.</p>
        </div>

        {/* 회원정보 (아코디언) */}
        <details className="border-rule group mb-5 overflow-hidden rounded-2xl border bg-white" open>
          <summary className="flex cursor-pointer items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
            <span className="text-ink flex items-center gap-2 text-base font-bold">
              <span aria-hidden>👤</span> 회원정보
            </span>
            <ChevronDown aria-hidden className="text-muted-fg-faint size-5 transition-transform group-open:rotate-180" />
          </summary>
          <dl className="border-rule border-t px-6 py-2">
            <div className="border-rule flex items-center justify-between border-b py-3 last:border-b-0">
              <dt className="text-muted-fg text-sm">이메일</dt>
              <dd className="text-ink text-sm font-medium">{user.email}</dd>
            </div>
            <div className="border-rule flex items-center justify-between border-b py-3 last:border-b-0">
              <dt className="text-muted-fg text-sm">가입일</dt>
              <dd className="text-ink text-sm font-medium">{joinedAt}</dd>
            </div>
          </dl>
          <div className="px-6 pb-6">
            <StudentProfileForm
              initialLastName={profile?.last_name ?? ""}
              initialFirstName={profile?.first_name ?? ""}
              initialPhone={profile?.phone ?? ""}
              initialPhoneVerified={!!profile?.phone_verified_at}
            />
          </div>
        </details>

        {/* 신청 내역 */}
        <section className="border-rule overflow-hidden rounded-2xl border bg-white">
          <div className="border-rule flex items-center gap-2 border-b px-6 py-5">
            <span aria-hidden>📋</span>
            <h2 className="text-ink text-base font-bold">신청 내역</h2>
            <span className="text-muted-fg-faint ml-auto text-sm">{applications.length}건</span>
          </div>

          {applications.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-muted-fg text-sm">아직 신청 내역이 없어요.</p>
              <Link
                href="/#courses"
                className="bg-cta mt-4 inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
              >
                과정 둘러보기
              </Link>
            </div>
          ) : (
            <ul className="list-none">
              {applications.map((a) => (
                <li key={a.id} className="border-rule border-b last:border-b-0">
                  <details className="group">
                    <summary className="flex cursor-pointer items-center gap-3 px-6 py-4 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0 flex-1">
                        <p className="text-ink truncate text-[15px] font-bold">{a.course_title}</p>
                        {a.option && <p className="text-muted-fg mt-0.5 truncate text-sm">{a.option}</p>}
                        <p className="text-muted-fg-faint mt-0.5 text-xs">신청일 {formatDate(a.created_at)}</p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[a.status])}>{a.status}</span>
                      <ChevronDown aria-hidden className="text-muted-fg-faint size-4 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <dl className="bg-surface border-rule mx-6 mb-4 rounded-xl border px-4 py-2">
                      {[
                        ["이름", a.name],
                        ["이메일", a.email ?? "-"],
                        ["전화번호", a.phone],
                        ["메모", a.memo ?? "-"],
                      ].map(([label, value]) => (
                        <div key={label} className="border-rule flex justify-between gap-4 border-b py-2.5 last:border-b-0">
                          <dt className="text-muted-fg shrink-0 text-sm">{label}</dt>
                          <dd className="text-ink text-right text-sm font-medium break-words">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
