import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { deriveBookedSlots } from "@/lib/availability";
import { loadEndedEnrollmentIds } from "@/lib/booking";
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

  // 가용 그리드 오버레이용 예약 슬롯 — 확정(승인/결제완료)·결제대기(pending; confirmed 우선).
  // 종료된 '결제완료'(남은 예정 수업 없음)는 제외 — 마지막 수업 다음날부터 슬롯 해제.
  const { data: enrollRows } = await supabase
    .from("enrollments")
    .select("id, slots, status, student_name, student_english_name")
    .eq("teacher_id", user.id);
  const ended = await loadEndedEnrollmentIds(supabase, [user.id]);
  const bookedSlots = deriveBookedSlots((enrollRows ?? []).filter((r) => !(r.status === "결제완료" && ended.has(r.id))));

  return (
    <>
      <TeacherProfileForm userId={user.id} email={user.email ?? ""} initial={initial} centers={centers} />
      {/* 주간 가능 시간 — 요약 카드 + 모달 편집 */}
      <AvailabilityModal initialSlots={initialSlots} bookedSlots={bookedSlots} />
    </>
  );
}
