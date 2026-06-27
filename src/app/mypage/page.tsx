import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import StudentProfileForm from "@/components/mypage/StudentProfileForm";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export default async function MyPageBasicInfo() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, english_name, phone, phone_verified_at, postcode, address, address_detail")
    .eq("id", user.id)
    .maybeSingle();

  const joinedAt = user.created_at ? formatDate(user.created_at) : "-";

  // 회원정보 필수 완료 여부 — 전화번호는 인증 완료(phone_verified_at)되어야 충족.
  const nameComplete = !!(profile?.first_name && profile?.last_name);
  const englishNameComplete = !!profile?.english_name;
  const phoneComplete = !!profile?.phone_verified_at;
  const missing = [!nameComplete && "이름", !englishNameComplete && "영문 이름", !phoneComplete && "전화번호 인증"].filter(Boolean) as string[];

  return (
    <section className="border-rule overflow-hidden rounded-2xl border bg-white">
      <div className="border-rule flex items-center gap-2 border-b px-6 py-5">
        <span aria-hidden>👤</span>
        <h2 className="text-ink text-base font-bold">회원정보</h2>
      </div>
      {missing.length > 0 && (
        <div className="border-brand/30 bg-brand/5 text-brand border-b px-6 py-3 text-sm font-medium">
          회원 정보 완성을 위해 {missing.join("과 ")} 항목을 완료해 주세요.
        </div>
      )}
      <dl className="px-6 py-2">
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
    </section>
  );
}
