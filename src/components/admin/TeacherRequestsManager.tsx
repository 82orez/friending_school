"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { approveTeacherApplication, rejectTeacherApplication, revokeTeacher } from "@/app/admin/actions";
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

export type TeacherApplication = {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string;
  bio: string;
  experience: string | null;
  zoom_url: string | null;
  avatar_url: string | null;
  status: "신청" | "승인" | "거절";
  admin_note: string | null;
  created_at: string;
};

export type CurrentTeacher = {
  id: string;
  email: string;
  name: string;
};

const STATUSES = ["신청", "승인", "거절"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_BADGE: Record<Status, string> = {
  신청: "bg-[#FFF7E6] text-[#B97400]",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  거절: "bg-brand/10 text-brand",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: boolean }) {
  return (
    <div className="border-rule rounded-xl border bg-white p-5">
      <p className="text-muted-fg-faint text-xs font-semibold">{label}</p>
      <p className={cn("mt-1 text-2xl font-extrabold", accent ? "text-brand" : "text-ink")}>{value}</p>
      <p className="text-muted-fg-faint mt-0.5 text-xs">{sub}</p>
    </div>
  );
}

export default function TeacherRequestsManager({
  applications,
  currentTeachers,
}: {
  applications: TeacherApplication[];
  currentTeachers: CurrentTeacher[];
}) {
  const [rows, setRows] = useState(applications);
  const [teachers, setTeachers] = useState(currentTeachers);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<CurrentTeacher | null>(null);
  const [revoking, startRevoke] = useTransition();

  const pending = useMemo(() => rows.filter((r) => r.status === "신청").length, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.phone.includes(q) || r.email.toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  const confirmRevoke = () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevokeTarget(null);
    startRevoke(async () => {
      const res = await revokeTeacher(target.id);
      if (res.ok) setTeachers((prev) => prev.filter((t) => t.id !== target.id));
      else alert(res.error ?? "오류가 발생했습니다.");
    });
  };

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">강사 신청</h1>
      <p className="text-muted-fg mt-1 text-sm">강사 지원을 승인/거절하고, 현재 강사 자격을 회수합니다.</p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="총 지원" value={rows.length} sub="누적 전체" />
        <StatCard label="현재 강사" value={teachers.length} sub="role=teacher" />
        <StatCard label="신규 (미처리)" value={`${pending}건`} sub="상태=신청" accent />
      </div>

      {/* 검색 + 상태 탭 */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="border-rule flex items-center gap-2 rounded-lg border bg-white px-3">
          <Search className="text-muted-fg-faint size-4" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름, 전화번호, 이메일 검색..."
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {(["all", ...STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                filter === s ? "bg-ink border-ink text-white" : "border-rule text-muted-fg bg-white",
              )}
            >
              {s === "all" ? "전체" : s}
            </button>
          ))}
        </div>
      </div>

      {/* 지원 목록 */}
      <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
        {filtered.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">표시할 지원이 없습니다.</p>
        ) : (
          <ul className="list-none">
            {filtered.map((r) => (
              <ApplicationRow
                key={r.id}
                row={r}
                open={openId === r.id}
                onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                onUpdated={(updated) => setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
              />
            ))}
          </ul>
        )}
      </div>

      {/* 현재 강사 */}
      <h2 className="text-ink mt-10 text-lg font-extrabold">현재 강사</h2>
      <p className="text-muted-fg mt-1 text-sm">강사 자격을 회수하면 해당 회원은 학생으로 되돌아갑니다.</p>
      <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
        {teachers.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">현재 강사가 없습니다.</p>
        ) : (
          <ul className="list-none">
            {teachers.map((t) => (
              <li key={t.id} className="border-rule flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0 md:px-6">
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-bold">{t.name || t.email}</p>
                  {t.name && <p className="text-muted-fg truncate text-xs">{t.email}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setRevokeTarget(t)}
                  disabled={revoking}
                  className="border-brand/40 text-brand hover:bg-brand/5 shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60"
                >
                  자격 회수
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 회수 확인 */}
      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>강사 자격을 회수하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget && (
                <>
                  <span className="text-ink font-semibold">{revokeTarget.name || revokeTarget.email}</span> 회원을 학생으로 되돌립니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevoke} variant="brand">
              회수
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ApplicationRow({
  row,
  open,
  onToggle,
  onUpdated,
}: {
  row: TeacherApplication;
  open: boolean;
  onToggle: () => void;
  onUpdated: (updated: TeacherApplication) => void;
}) {
  const [note, setNote] = useState(row.admin_note ?? "");
  const [pending, startTransition] = useTransition();
  const [confirmApprove, setConfirmApprove] = useState(false);

  const approve = () => {
    setConfirmApprove(false);
    startTransition(async () => {
      const res = await approveTeacherApplication(row.id);
      if (res.ok) onUpdated({ ...row, status: "승인" });
      else alert(res.error ?? "오류가 발생했습니다.");
    });
  };

  const reject = () => {
    startTransition(async () => {
      const res = await rejectTeacherApplication(row.id, note);
      if (res.ok) onUpdated({ ...row, status: "거절", admin_note: note || null });
      else alert(res.error ?? "오류가 발생했습니다.");
    });
  };

  return (
    <li className="border-rule border-b last:border-b-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left md:px-6">
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[row.status])}>
          {row.status === "신청" ? "심사 중" : row.status}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-sm font-bold">
            {row.name} <span className="text-muted-fg-faint font-normal">· {row.phone}</span>
          </p>
          <p className="text-muted-fg truncate text-xs">{row.email}</p>
        </div>
        <span className="text-muted-fg-faint shrink-0 text-xs">{formatDate(row.created_at)}</span>
        <ChevronDown aria-hidden className={cn("text-muted-fg-faint size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="bg-surface border-rule border-t px-4 py-4 md:px-6">
          {row.avatar_url && (
            <Image
              src={row.avatar_url}
              alt={`${row.name} profile photo`}
              width={64}
              height={64}
              className="border-rule mb-3 size-16 rounded-2xl border object-cover"
            />
          )}
          <dl className="mb-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {[
              ["이메일", row.email],
              ["전화", row.phone],
              ["자기소개(Bio)", row.bio],
              ["경력", row.experience ?? "-"],
              ["Zoom URL", row.zoom_url ?? "-"],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-32 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">🔒 관리자 NOTE (거절 사유 등)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="거절 사유 등 관리자 메모를 입력하세요..."
            className="border-rule-faint focus:border-accent-blue mb-3 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmApprove(true)}
              disabled={pending || row.status === "승인"}
              className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              승인 (강사 전환)
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={pending || row.status === "거절"}
              className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50"
            >
              거절
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>강사 지원을 승인하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{row.name}</span>({row.email}) 회원을 강사로 전환합니다. 빈 프로필 항목은 지원서 내용으로
              채워집니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={approve} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              승인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
