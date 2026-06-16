import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getUserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import StudentProfileForm from "@/components/mypage/StudentProfileForm";
import TeacherApplicationForm from "@/components/mypage/TeacherApplicationForm";

export const metadata: Metadata = { title: "마이페이지 — 프렌딩 스쿨" };

type TeacherApplicationRow = {
  id: string;
  name: string;
  phone: string;
  headline: string | null;
  intro: string;
  experience: string | null;
  status: "신청" | "승인" | "거절";
  admin_note: string | null;
  created_at: string;
};

const TEACHER_STATUS_BADGE: Record<TeacherApplicationRow["status"], string> = {
  신청: "bg-[#FFF7E6] text-[#B97400]",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  거절: "bg-brand/10 text-brand",
};

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

  const { data: profile } = await supabase.from("profiles").select("first_name, phone").eq("id", user.id).maybeSingle();

  const role = await getUserRole(supabase, user.id);
  const isStudent = role !== "teacher" && role !== "admin";

  // 강사 지원 섹션은 학생에게만 노출 — 본인 최신 지원 1건 조회.
  let teacherApp: TeacherApplicationRow | null = null;
  if (isStudent) {
    const { data: taData } = await supabase
      .from("teacher_applications")
      .select("id, name, phone, headline, intro, experience, status, admin_note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    teacherApp = (taData as TeacherApplicationRow | null) ?? null;
  }

  const displayName = profile?.first_name || applications[0]?.name || user.email?.split("@")[0] || "회원";
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
            <StudentProfileForm initialName={profile?.first_name ?? ""} initialPhone={profile?.phone ?? ""} />
          </div>
        </details>

        {/* 강사 지원 (학생만) */}
        {isStudent && (
          <details className="border-rule group mb-5 overflow-hidden rounded-2xl border bg-white" open={teacherApp?.status !== "신청"}>
            <summary className="flex cursor-pointer items-center justify-between px-6 py-5 [&::-webkit-details-marker]:hidden">
              <span className="text-ink flex items-center gap-2 text-base font-bold">
                <span aria-hidden>🧑‍🏫</span> 강사 지원
              </span>
              <div className="flex items-center gap-2">
                {teacherApp && (
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", TEACHER_STATUS_BADGE[teacherApp.status])}>
                    {teacherApp.status === "신청" ? "심사 중" : teacherApp.status}
                  </span>
                )}
                <ChevronDown aria-hidden className="text-muted-fg-faint size-5 transition-transform group-open:rotate-180" />
              </div>
            </summary>

            <div className="border-rule border-t px-6 py-6">
              {teacherApp?.status === "신청" ? (
                <div>
                  <p className="text-muted-fg text-sm">강사 지원이 접수되어 관리자 심사 중입니다. 결과는 이 페이지에서 안내됩니다.</p>
                  <dl className="bg-surface border-rule mt-4 rounded-xl border px-4 py-2 text-sm">
                    {[
                      ["이름", teacherApp.name],
                      ["전화번호", teacherApp.phone],
                      ["한 줄 소개", teacherApp.headline ?? "-"],
                      ["자기소개·지원 동기", teacherApp.intro],
                      ["경력", teacherApp.experience ?? "-"],
                      ["지원일", formatDate(teacherApp.created_at)],
                    ].map(([label, value]) => (
                      <div key={label} className="border-rule flex justify-between gap-4 border-b py-2.5 last:border-b-0">
                        <dt className="text-muted-fg shrink-0 text-sm">{label}</dt>
                        <dd className="text-ink text-right text-sm font-medium break-words whitespace-pre-wrap">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <>
                  {teacherApp?.status === "거절" && (
                    <div className="border-brand/30 bg-brand/5 mb-5 rounded-lg border px-4 py-3">
                      <p className="text-brand text-sm font-bold">지난 지원이 반려되었습니다.</p>
                      {teacherApp.admin_note && <p className="text-ink mt-1 text-sm whitespace-pre-wrap">사유: {teacherApp.admin_note}</p>}
                      <p className="text-muted-fg mt-1 text-xs">내용을 보완해 다시 지원하실 수 있습니다.</p>
                    </div>
                  )}
                  <p className="text-muted-fg mb-4 text-sm">
                    프렌딩 스쿨 강사로 활동하고 싶으시면 아래 정보를 입력해 지원해 주세요. 관리자 승인 후 강사 페이지가 열립니다.
                  </p>
                  <TeacherApplicationForm initialName={profile?.first_name ?? ""} initialPhone={profile?.phone ?? ""} />
                </>
              )}
            </div>
          </details>
        )}

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
