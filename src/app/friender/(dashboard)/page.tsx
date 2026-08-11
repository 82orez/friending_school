import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import FrienderProfileForm, { type FrienderProfile } from "@/components/friender/FrienderProfileForm";

export default async function FrienderProfilePage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/friender");

  const { data } = await supabase
    .from("profiles")
    .select("first_name, last_name, avatar_url, zoom_url, bio, phone, nationality, gender")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (data ?? {}) as Partial<FrienderProfile>;
  const initial: FrienderProfile = {
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    avatar_url: profile.avatar_url ?? "",
    zoom_url: profile.zoom_url ?? "",
    bio: profile.bio ?? "",
    phone: profile.phone ?? "",
    nationality: profile.nationality ?? "",
    gender: profile.gender ?? "",
  };

  return <FrienderProfileForm userId={user.id} email={user.email ?? ""} initial={initial} />;
}
