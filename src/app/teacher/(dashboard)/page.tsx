import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { loadTeacherBookedSlots } from "@/lib/booking";
import TeacherProfileForm, { type TeacherProfile } from "@/components/teacher/TeacherProfileForm";
import AvailabilityModal from "@/components/teacher/AvailabilityModal";

export default async function TeacherProfilePage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teacher");

  const { data } = await supabase
    .from("profiles")
    .select("first_name, last_name, avatar_url, zoom_url, bio, experience, phone, nationality, gender, center_id")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (data ?? {}) as Partial<TeacherProfile>;
  const initial: TeacherProfile = {
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    avatar_url: profile.avatar_url ?? "",
    zoom_url: profile.zoom_url ?? "",
    bio: profile.bio ?? "",
    experience: profile.experience ?? "",
    phone: profile.phone ?? "",
    nationality: profile.nationality ?? "",
    gender: profile.gender ?? "",
    center_id: profile.center_id ?? "",
  };

  // 센터 드롭다운 목록.
  const { data: centersData } = await supabase.from("centers").select("id, name").order("sort_order", { ascending: true });
  const centers = (centersData ?? []) as { id: string; name: string }[];

  const { data: availRows } = await supabase.from("teacher_availability").select("day_of_week, start_min").eq("teacher_id", user.id);
  const initialSlots = (availRows ?? []).map((r) => ({ day: r.day_of_week, min: r.start_min }));

  // 가용 그리드 오버레이용 예약 슬롯 — 진행중 신청 전부(신청/승인/결제대기/결제완료), 종료된 '결제완료'는 자동 해제.
  // 세 tier 모두 그리드에서 잠금 대상이라 서버 가드(updateTeacherAvailability)와 같은 로더를 쓴다.
  const bookedSlots = await loadTeacherBookedSlots(supabase, user.id);

  return (
    <>
      <TeacherProfileForm userId={user.id} email={user.email ?? ""} initial={initial} centers={centers} />
      {/* 주간 가능 시간 — 요약 카드 + 모달 편집 */}
      <AvailabilityModal initialSlots={initialSlots} bookedSlots={bookedSlots} />
    </>
  );
}
