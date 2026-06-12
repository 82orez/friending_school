"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { updateMemberRole } from "@/app/admin/actions";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type AdminMember = {
  id: string;
  email: string;
  created_at: string;
  role: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-brand/10 text-brand",
  teacher: "bg-accent-blue-soft text-accent-blue-ink",
  student: "bg-rule text-muted-fg",
};

export default function MembersManager({ members }: { members: AdminMember[] }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(members);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; email: string; from: string; to: string } | null>(null);
  const [, startTransition] = useTransition();

  const thisMonth = useMemo(() => {
    const now = new Date();
    return rows.filter((m) => {
      const d = new Date(m.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((m) => m.email.toLowerCase().includes(q));
  }, [rows, query]);

  const requestRoleChange = (id: string, role: string) => {
    const member = rows.find((m) => m.id === id);
    if (!member || member.role === role) return;
    setConfirm({ id, email: member.email, from: member.role, to: role });
  };

  const applyRoleChange = () => {
    if (!confirm) return;
    const { id, from, to } = confirm;
    setConfirm(null);
    setRows((rs) => rs.map((m) => (m.id === id ? { ...m, role: to } : m)));
    setPendingId(id);
    startTransition(async () => {
      const res = await updateMemberRole(id, to);
      if (res.error) {
        setRows((rs) => rs.map((m) => (m.id === id ? { ...m, role: from } : m)));
        alert(res.error);
      }
      setPendingId(null);
    });
  };

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">회원 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">가입 회원 목록입니다.</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="border-rule rounded-xl border bg-white p-5">
          <p className="text-muted-fg-faint text-xs font-semibold">전체 회원</p>
          <p className="text-ink mt-1 text-2xl font-extrabold">{members.length}</p>
          <p className="text-muted-fg-faint mt-0.5 text-xs">누적 전체</p>
        </div>
        <div className="border-rule rounded-xl border bg-white p-5">
          <p className="text-muted-fg-faint text-xs font-semibold">이번달 가입</p>
          <p className="text-ink mt-1 text-2xl font-extrabold">{thisMonth}</p>
          <p className="text-muted-fg-faint mt-0.5 text-xs">이번 달</p>
        </div>
      </div>

      <div className="border-rule mt-5 flex items-center gap-2 rounded-lg border bg-white px-3">
        <Search className="text-muted-fg-faint size-4" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이메일 검색..."
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
        {filtered.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">표시할 회원이 없습니다.</p>
        ) : (
          <ul className="list-none">
            {filtered.map((m, i) => (
              <li key={m.id} className="border-rule flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0 md:px-6">
                <span className="text-muted-fg-faint w-7 shrink-0 text-center text-xs">{filtered.length - i}</span>
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-medium">{m.email}</span>
                {m.role === "admin" ? (
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", ROLE_BADGE.admin)}>admin</span>
                ) : (
                  <span className="relative shrink-0">
                    <select
                      value={m.role}
                      onChange={(e) => requestRoleChange(m.id, e.target.value)}
                      disabled={pendingId === m.id}
                      aria-label={`${m.email} 역할 변경`}
                      className={cn(
                        "border-rule focus-visible:ring-accent-blue/40 rounded-full border bg-white py-0.5 pr-7 pl-2.5 text-xs font-bold focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50",
                        m.role === "teacher" ? "text-accent-blue-ink" : "text-muted-fg",
                      )}>
                      <option value="student">student</option>
                      <option value="teacher">teacher</option>
                    </select>
                    {pendingId === m.id && (
                      <Loader2 aria-hidden className="text-muted-fg-faint absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 animate-spin" />
                    )}
                  </span>
                )}
                <span className="text-muted-fg-faint shrink-0 text-xs">{formatDate(m.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>역할을 변경하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (
                <>
                  <span className="text-ink font-semibold">{confirm.email}</span> 회원의 역할을 <span className="font-semibold">{confirm.from}</span>
                  에서 <span className="font-semibold">{confirm.to}</span>(으)로 변경합니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={applyRoleChange}>변경</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
