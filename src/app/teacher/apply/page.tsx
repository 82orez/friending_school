import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { nationalityLabelEn } from "@/data/nationalities";
import { genderLabelEn } from "@/data/genders";
import TeacherApplicationForm from "@/components/mypage/TeacherApplicationForm";
import ToastOnMount from "@/components/ToastOnMount";

export const metadata: Metadata = { title: "강사 지원 — 프렌딩 스쿨" };

type TeacherApplicationRow = {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  nationality: string | null;
  gender: string | null;
  center_id: string | null;
  bio: string;
  experience: string | null;
  zoom_url: string | null;
  avatar_url: string | null;
  status: "신청" | "승인" | "거절";
  admin_note: string | null;
  created_at: string;
};

const TEACHER_STATUS_BADGE: Record<TeacherApplicationRow["status"], string> = {
  신청: "bg-[#FFF7E6] text-[#B97400]",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  거절: "bg-brand/10 text-brand",
};

const TEACHER_STATUS_LABEL: Record<TeacherApplicationRow["status"], string> = {
  신청: "Under review",
  승인: "Approved",
  거절: "Rejected",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export default async function TeacherApplyPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  // 제출 성공 신호 — 액션이 ?submitted=1로 리다이렉트하면 토스트를 띄운다(아래 ToastOnMount).
  const { submitted } = await searchParams;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teacher/apply");

  const role = await getUserRole(supabase, user.id);
  // 이미 강사/관리자면 지원 불필요 — 각자 페이지로 리다이렉트.
  // role은 단일값이라 프렌더도 강사 지원 불가(승인 시 프렌더 권한을 잃게 됨).
  if (role === "teacher") redirect("/teacher");
  if (role === "admin") redirect("/");
  if (role === "friender") redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, phone, nationality, gender, center_id, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  // 센터 목록(드롭다운·이름 표시).
  const { data: centersData } = await supabase.from("centers").select("id, name").order("sort_order", { ascending: true });
  const centers = (centersData ?? []) as { id: string; name: string }[];
  const centerNameById = new Map(centers.map((c) => [c.id, c.name]));

  // 본인 최신 지원 1건 조회.
  const { data: taData } = await supabase
    .from("teacher_applications")
    .select(
      "id, name, first_name, last_name, phone, nationality, gender, center_id, bio, experience, zoom_url, avatar_url, status, admin_note, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const teacherApp = (taData as TeacherApplicationRow | null) ?? null;

  return (
    <div className="bg-surface min-h-screen">
      {submitted === "1" && <ToastOnMount queryKey="submitted" message="Your teacher application has been submitted. We'll email you the result." />}

      {/* 라벨 바 */}
      <div className="px-5 py-7 text-center">
        <span className="bg-brand-gradient inline-block rounded-full px-6 py-1.5 text-base font-bold text-white md:text-xl">BECOME A TEACHER</span>
      </div>

      <div className="mx-auto max-w-[760px] px-5 pb-16">
        {/* 웰컴 배너 */}
        <div className="bg-brand-gradient mb-5 rounded-2xl px-6 py-7 text-white">
          <p className="text-xs font-bold tracking-[0.1em] opacity-90">FRIENDING SCHOOL · TEACHER</p>
          <p className="mt-2 text-xl font-bold md:text-2xl">Teach with Friending School 🎓</p>
          <p className="mt-1 text-sm opacity-90">Apply below — your teacher page opens once an admin approves your application.</p>
        </div>

        <section className="border-rule overflow-hidden rounded-2xl border bg-white">
          <div className="border-rule flex items-center gap-2 border-b px-6 py-5">
            <span aria-hidden>🧑‍🏫</span>
            <h2 className="text-ink text-base font-bold">Teacher application</h2>
            {teacherApp && (
              <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold", TEACHER_STATUS_BADGE[teacherApp.status])}>
                {TEACHER_STATUS_LABEL[teacherApp.status]}
              </span>
            )}
          </div>

          <div className="px-6 py-6">
            {teacherApp?.status === "신청" ? (
              <div>
                <p className="text-muted-fg text-sm">
                  Your teacher application has been received and is under review. The result will be shown on this page.
                </p>
                <dl className="bg-surface border-rule mt-4 rounded-xl border px-4 py-2 text-sm">
                  {[
                    ["First name", teacherApp.first_name ?? "-"],
                    ["Last name", teacherApp.last_name ?? "-"],
                    ["Phone", teacherApp.phone ?? "-"],
                    ["Nationality", nationalityLabelEn(teacherApp.nationality)],
                    ["Gender", genderLabelEn(teacherApp.gender)],
                    ["Center", teacherApp.center_id ? (centerNameById.get(teacherApp.center_id) ?? "None") : "None"],
                    ["Bio", teacherApp.bio],
                    ["Experience", teacherApp.experience ?? "-"],
                    ["Zoom URL", teacherApp.zoom_url ?? "-"],
                    ["Applied on", formatDate(teacherApp.created_at)],
                  ].map(([label, value]) => (
                    // 짧은 값·문단형 모두 동일 레이아웃: 라벨 고정 폭 좌측 열 + 값 좌측 정렬(제출 전 Review 다이얼로그와 일치).
                    <div key={label} className="border-rule flex gap-4 border-b py-2.5 last:border-b-0">
                      <dt className="text-muted-fg w-28 shrink-0 text-sm sm:w-36">{label}</dt>
                      <dd className="text-ink min-w-0 flex-1 text-left text-sm font-medium break-words whitespace-pre-wrap">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <>
                {teacherApp?.status === "거절" && (
                  <div className="border-brand/30 bg-brand/5 mb-5 rounded-lg border px-4 py-3">
                    <p className="text-brand text-sm font-bold">Your previous application was not approved.</p>
                    {teacherApp.admin_note && <p className="text-ink mt-1 text-sm whitespace-pre-wrap">Reason: {teacherApp.admin_note}</p>}
                    <p className="text-muted-fg mt-1 text-xs">You can revise your details and apply again.</p>
                  </div>
                )}
                <p className="text-muted-fg mb-4 text-sm">
                  If you'd like to teach at Friending School, please fill in the information below to apply. Your teacher page opens once an admin
                  approves your application.
                </p>
                {/* 거절 후 재신청이면 이전 지원서 값으로 프리필(폼 초기화 방지), 첫 지원이면 프로필 값. */}
                <TeacherApplicationForm
                  userId={user.id}
                  initialFirstName={teacherApp?.first_name ?? profile?.first_name ?? ""}
                  initialLastName={teacherApp?.last_name ?? profile?.last_name ?? ""}
                  initialPhone={teacherApp?.phone ?? profile?.phone ?? ""}
                  initialNationality={teacherApp?.nationality ?? profile?.nationality ?? ""}
                  initialGender={teacherApp?.gender ?? profile?.gender ?? ""}
                  initialCenterId={teacherApp?.center_id ?? profile?.center_id ?? ""}
                  centers={centers}
                  initialAvatarUrl={teacherApp?.avatar_url ?? profile?.avatar_url ?? ""}
                  initialBio={teacherApp?.bio ?? ""}
                  initialExperience={teacherApp?.experience ?? ""}
                  initialZoomUrl={teacherApp?.zoom_url ?? ""}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
