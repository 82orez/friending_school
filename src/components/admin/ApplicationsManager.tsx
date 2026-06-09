"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateApplication } from "@/app/admin/actions";

export type AdminApplication = {
  id: string;
  course_title: string;
  option: string | null;
  name: string;
  phone: string;
  email: string | null;
  memo: string | null;
  status: "신청" | "확인" | "완료" | "취소";
  admin_note: string | null;
  created_at: string;
};

const STATUSES = ["신청", "확인", "완료", "취소"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_BADGE: Record<Status, string> = {
  신청: "bg-accent-blue-soft text-accent-blue-ink",
  확인: "bg-[#FFF7E6] text-[#B97400]",
  완료: "bg-[#E1F5EE] text-[#0F6E56]",
  취소: "bg-rule text-muted-fg",
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

export default function ApplicationsManager({ applications }: { applications: AdminApplication[] }) {
  const [rows, setRows] = useState(applications);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = rows.filter((r) => {
      const d = new Date(r.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const pending = rows.filter((r) => r.status === "신청").length;
    return { total: rows.length, thisMonth, pending };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.phone.includes(q) || r.course_title.toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">신청 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">상담 신청 내역을 확인하고 처리합니다.</p>

      {/* 통계 */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="총 신청" value={stats.total} sub="누적 전체" />
        <StatCard label="이번달 신청" value={stats.thisMonth} sub="이번 달" />
        <StatCard label="신규 (미처리)" value={`${stats.pending}건`} sub="상태=신청" accent />
      </div>

      {/* 검색 + 상태 탭 */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="border-rule flex items-center gap-2 rounded-lg border bg-white px-3">
          <Search className="text-muted-fg-faint size-4" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름, 전화번호, 과정 검색..."
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["all", ...STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                filter === s ? "bg-ink border-ink text-white" : "border-rule text-muted-fg bg-white",
              )}>
              {s === "all" ? "전체" : s}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 */}
      <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
        {filtered.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">표시할 신청이 없습니다.</p>
        ) : (
          <ul className="list-none">
            {filtered.map((r) => (
              <ApplicationRow key={r.id} row={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} onSaved={(updated) => setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ApplicationRow({
  row,
  open,
  onToggle,
  onSaved,
}: {
  row: AdminApplication;
  open: boolean;
  onToggle: () => void;
  onSaved: (updated: AdminApplication) => void;
}) {
  const [status, setStatus] = useState<Status>(row.status);
  const [note, setNote] = useState(row.admin_note ?? "");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const save = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateApplication(row.id, status, note);
      if (res.ok) {
        onSaved({ ...row, status, admin_note: note });
        setFeedback("✓ 저장됨");
      } else {
        setFeedback(res.error ?? "오류");
      }
    });
  };

  return (
    <li className="border-rule border-b last:border-b-0">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left md:px-6">
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_BADGE[row.status])}>{row.status}</span>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-sm font-bold">
            {row.name} <span className="text-muted-fg-faint font-normal">· {row.phone}</span>
          </p>
          <p className="text-muted-fg truncate text-xs">
            {row.course_title}
            {row.option ? ` · ${row.option}` : ""}
          </p>
        </div>
        <span className="text-muted-fg-faint shrink-0 text-xs">{formatDate(row.created_at)}</span>
        <ChevronDown aria-hidden className={cn("text-muted-fg-faint size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="bg-surface border-rule border-t px-4 py-4 md:px-6">
          <dl className="mb-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-muted-fg-faint w-14 shrink-0">이메일</dt>
              <dd className="text-ink break-all">{row.email ?? "-"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-fg-faint w-14 shrink-0">전화</dt>
              <dd className="text-ink">{row.phone}</dd>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <dt className="text-muted-fg-faint w-14 shrink-0">메모</dt>
              <dd className="text-ink break-words whitespace-pre-wrap">{row.memo ?? "-"}</dd>
            </div>
          </dl>

          <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">🔒 관리자 NOTE</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="관리자 메모를 입력하세요..."
            className="border-rule-faint focus:border-accent-blue mb-3 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="border-rule-faint focus:border-accent-blue h-9 rounded-md border bg-white px-3 text-sm outline-none">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              저장
            </button>
            {feedback && <span className="text-muted-fg text-xs font-medium">{feedback}</span>}
          </div>
        </div>
      )}
    </li>
  );
}
