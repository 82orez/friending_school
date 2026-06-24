import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { type Slot } from "@/lib/availability";
import StudentProfileForm from "@/components/mypage/StudentProfileForm";
import StudentEnrollments, { type StudentEnrollment } from "@/components/mypage/StudentEnrollments";

export const metadata: Metadata = { title: "마이페이지 — 프렌딩 스쿨" };

type EnrollmentRow = {
  id: string;
  course_title: string;
  teacher_name: string | null;
  start_date: string;
  slots: Slot[];
  status: "신청" | "승인" | "거절" | "취소";
  teacher_note: string | null;
  created_at: string;
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
    .from("enrollments")
    .select("id, course_title, teacher_name, start_date, slots, status, teacher_note, created_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });
  const enrollments: StudentEnrollment[] = ((data ?? []) as EnrollmentRow[]).map((e) => ({
    id: e.id,
    courseTitle: e.course_title,
    teacherName: e.teacher_name,
    startDate: e.start_date,
    slots: Array.isArray(e.slots) ? e.slots : [],
    status: e.status,
    teacherNote: e.teacher_note,
    createdAt: e.created_at,
  }));

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, english_name, phone, phone_verified_at, postcode, address, address_detail")
    .eq("id", user.id)
    .maybeSingle();

  // 한국 관례: 성+이름 붙임(홍+길동=홍길동).
  const fullName = `${profile?.last_name ?? ""}${profile?.first_name ?? ""}`.trim();
  const displayName = fullName || user.email?.split("@")[0] || "회원";
  const joinedAt = user.created_at ? formatDate(user.created_at) : "-";

  // 회원정보 필수 완료 여부 — 전화번호는 인증 완료(phone_verified_at)되어야 충족.
  const nameComplete = !!(profile?.first_name && profile?.last_name);
  const englishNameComplete = !!profile?.english_name;
  const phoneComplete = !!profile?.phone_verified_at;
  const missing = [!nameComplete && "이름", !englishNameComplete && "영문 이름", !phoneComplete && "전화번호 인증"].filter(Boolean) as string[];

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
          {missing.length > 0 && (
            <div className="border-brand/30 bg-brand/5 text-brand border-t px-6 py-3 text-sm font-medium">
              회원 정보 완성을 위해 {missing.join("과 ")} 항목을 완료해 주세요.
            </div>
          )}
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
              initialEnglishName={profile?.english_name ?? ""}
              initialPhone={profile?.phone ?? ""}
              initialPhoneVerified={!!profile?.phone_verified_at}
              initialPostcode={profile?.postcode ?? ""}
              initialAddress={profile?.address ?? ""}
              initialAddressDetail={profile?.address_detail ?? ""}
            />
          </div>
        </details>

        {/* 수강신청 내역 */}
        <StudentEnrollments enrollments={enrollments} />
      </div>
    </div>
  );
}
