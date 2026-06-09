import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isAdmin } from "@/lib/auth";
import AdminNav from "@/components/admin/AdminNav";

export const metadata: Metadata = { title: "관리자 — 프렌딩 스쿨", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!(await isAdmin(supabase, user.id))) redirect("/");

  return (
    <div className="bg-surface min-h-screen">
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:py-10">
        <div className="mb-6 flex items-center gap-2">
          <span className="bg-brand-gradient inline-block rounded-full px-4 py-1 text-sm font-bold text-white">관리자</span>
          <span className="text-muted-fg-faint text-sm">{user.email}</span>
        </div>
        <AdminNav />
        <main className="mt-6">{children}</main>
      </div>
    </div>
  );
}
