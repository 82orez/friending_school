import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { loadClasses } from "@/lib/classroom";
import ClassroomList from "@/components/classroom/ClassroomList";

export default async function MyPageClassroom() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/classroom");

  const classes = await loadClasses(supabase, user.id, false);

  return <ClassroomList classes={classes} isTeacher={false} />;
}
