import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { loadClasses } from "@/lib/classroom";
import ClassroomList from "@/components/classroom/ClassroomList";

export default async function TeacherClassroomPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/teacher/classroom");

  const classes = await loadClasses(supabase, user.id, true);

  return <ClassroomList classes={classes} isTeacher />;
}
