import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { nationalityLabel } from "@/data/nationalities";
import { genderLabelKo } from "@/data/genders";
import FrienderApplicationForm from "@/components/friender/FrienderApplicationForm";
import ToastOnMount from "@/components/ToastOnMount";

export const metadata: Metadata = { title: "프렌더 지원 — 프렌딩 스쿨" };

type FrienderApplicationRow = {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  phone: string;
  nationality: string | null;
  gender: string | null;
  intro: string;
  zoom_url: string;
  avatar_url: string | null;
  status: "신청" | "승인" | "거절";
  admin_note: string | null;
  created_at: string;
};

const FRIENDER_STATUS_BADGE: Record<FrienderApplicationRow["status"], string> = {
  신청: "bg-[#FFF7E6] text-[#B97400]",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  거절: "bg-brand/10 text-brand",
};

const FRIENDER_STATUS_LABEL: Record<FrienderApplicationRow["status"], string> = {
  신청: "심사 중",
  승인: "승인됨",
  거절: "거절됨",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export default async function FrienderApplyPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  // 제출 성공 신호 — 액션이 ?submitted=1로 리다이렉트하면 토스트를 띄운다(아래 ToastOnMount).
  const { submitted } = await searchParams;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/friender/apply");

  const role = await getUserRole(supabase, user.id);
  // role은 단일값이라 중복 신분 불가 — 이미 권한이 있는 계정은 각자 위치로.
  if (role === "friender") redirect("/friender");
  if (role === "teacher") redirect("/teacher");
  if (role === "admin") redirect("/");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("first_name, last_name, nickname, phone, phone_verified_at, nationality, gender, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const profile =
    (profileData as {
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      phone: string | null;
      phone_verified_at: string | null;
      nationality: string | null;
      gender: string | null;
      avatar_url: string | null;
    } | null) ?? null;

  // 본인 최신 지원 1건 조회.
  const { data: faData } = await supabase
    .from("friender_applications")
    .select("id, name, first_name, last_name, nickname, phone, nationality, gender, intro, zoom_url, avatar_url, status, admin_note, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const frienderApp = (faData as FrienderApplicationRow | null) ?? null;

  return (
    <div className="bg-surface min-h-screen">
      {submitted === "1" && <ToastOnMount queryKey="submitted" message="프렌더 신청이 접수되었습니다. 심사 결과는 문자로 안내드립니다." />}

      {/* 라벨 바 */}
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">프렌더 지원</span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        {/* 웰컴 배너 */}
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL · FRIENDER</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">프렌더로 함께해요 🤝</p>
          <p className="mt-1 text-sm opacity-90">아래 정보를 작성해 신청해 주세요. 관리자 승인 후 프렌더 페이지가 열립니다.</p>
        </div>

        <section className="border-rule overflow-hidden rounded-2xl border bg-white">
          <div className="border-rule flex items-center gap-2 border-b px-6 py-5">
            <span aria-hidden>🤝</span>
            <h2 className="text-ink text-base font-bold">프렌더 신청서</h2>
            {frienderApp && (
              <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold", FRIENDER_STATUS_BADGE[frienderApp.status])}>
                {FRIENDER_STATUS_LABEL[frienderApp.status]}
              </span>
            )}
          </div>

          <div className="px-6 py-6">
            {frienderApp?.status === "신청" ? (
              <div>
                <p className="text-muted-fg text-sm">프렌더 신청이 접수되어 심사 중입니다. 결과는 이 페이지에서 확인하실 수 있습니다.</p>
                <dl className="bg-surface border-rule mt-4 rounded-xl border px-4 py-2 text-sm">
                  {[
                    ["성", frienderApp.last_name ?? "-"],
                    ["이름", frienderApp.first_name ?? "-"],
                    ["닉네임", frienderApp.nickname ?? "-"],
                    ["전화번호", formatPhone(frienderApp.phone)],
                    ["국적", nationalityLabel(frienderApp.nationality)],
                    ["성별", genderLabelKo(frienderApp.gender)],
                    ["자기소개", frienderApp.intro],
                    ["Zoom URL", frienderApp.zoom_url],
                    ["신청 일시", formatDate(frienderApp.created_at)],
                  ].map(([label, value]) => (
                    // 짧은 값·문단형 모두 동일 레이아웃: 라벨 고정 폭 좌측 열 + 값 좌측 정렬(제출 전 확인 다이얼로그와 일치).
                    <div key={label} className="border-rule flex gap-4 border-b py-2.5 last:border-b-0">
                      <dt className="text-muted-fg w-28 shrink-0 text-sm sm:w-36">{label}</dt>
                      <dd className="text-ink min-w-0 flex-1 text-left text-sm font-medium break-words whitespace-pre-wrap">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <>
                {frienderApp?.status === "거절" && (
                  <div className="border-brand/30 bg-brand/5 mb-5 rounded-lg border px-4 py-3">
                    <p className="text-brand text-sm font-bold">이전 신청이 승인되지 않았습니다.</p>
                    {frienderApp.admin_note && <p className="text-ink mt-1 text-sm whitespace-pre-wrap">사유: {frienderApp.admin_note}</p>}
                    <p className="text-muted-fg mt-1 text-xs">내용을 수정해 다시 신청하실 수 있습니다.</p>
                  </div>
                )}
                <p className="text-muted-fg mb-4 text-sm">
                  프렌딩 스쿨에서 프렌더로 활동하고 싶으시다면 아래 정보를 작성해 신청해 주세요. 관리자 승인 후 프렌더 페이지가 열립니다.
                </p>
                {/* 거절 후 재신청이면 이전 신청서 값으로 프리필(폼 초기화 방지), 첫 신청이면 프로필 값. */}
                <FrienderApplicationForm
                  userId={user.id}
                  initialFirstName={frienderApp?.first_name ?? profile?.first_name ?? ""}
                  initialLastName={frienderApp?.last_name ?? profile?.last_name ?? ""}
                  initialNickname={frienderApp?.nickname ?? profile?.nickname ?? ""}
                  initialPhone={profile?.phone ?? ""}
                  initialPhoneVerified={!!profile?.phone_verified_at}
                  initialNationality={frienderApp?.nationality ?? profile?.nationality ?? ""}
                  initialGender={frienderApp?.gender ?? profile?.gender ?? ""}
                  initialAvatarUrl={frienderApp?.avatar_url ?? profile?.avatar_url ?? ""}
                  initialIntro={frienderApp?.intro ?? ""}
                  initialZoomUrl={frienderApp?.zoom_url ?? ""}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
