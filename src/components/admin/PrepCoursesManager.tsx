"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, fmtDateShort, formatWon } from "@/lib/prep";
import { PREP_STATUSES, PREP_STATUS_BADGE, PREP_STATUS_LABEL, type PrepStatus } from "@/data/prep";
import { roomLevelLabelKo } from "@/data/room-levels";
import { approvePrepCourse, rejectPrepCourse } from "@/app/admin/actions";
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

export type AdminPrepCourse = {
  id: string;
  friender_id: string;
  friender_name: string | null;
  friender_nickname: string | null;
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  start_min: number;
  duration_min: number;
  session_count: number;
  price_krw: number;
  status: PrepStatus;
  admin_note: string | null;
  submitted_at: string | null;
  created_at: string;
  sessions: { session_no: number; session_date: string; topic: string | null }[]; // 날짜 오름차순
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

// 프렙 강좌 심사 — FrienderRequestsManager의 축소판(신청 목록 아코디언 + 승인/거절).
// 결과는 서버 액션이 프렌더에게 SMS로 통보한다.
export default function PrepCoursesManager({ courses }: { courses: AdminPrepCourse[] }) {
  const [rows, setRows] = useState(courses);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | PrepStatus>("신청");
  const [openId, setOpenId] = useState<string | null>(null);

  const pending = rows.filter((r) => r.status === "신청").length;
  const approved = rows.filter((r) => r.status === "승인").length;
  const rejected = rows.filter((r) => r.status === "거절").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.title, r.friender_name ?? "", r.friender_nickname ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, query, filter]);

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">프렙 강좌</h1>
      <p className="text-muted-fg mt-1 text-sm">
        프렌더 Plus가 올린 프렙 강좌 개설 요청을 승인/거절합니다. 승인해야 개설이 완료되며, 결과는 프렌더에게 SMS로 전달됩니다.
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="승인 대기" value={`${pending}건`} sub="상태=신청" accent />
        <StatCard label="승인" value={approved} sub="개설 완료" />
        <StatCard label="거절" value={rejected} sub="사유 통보됨" />
      </div>

      {/* 검색 + 상태 탭 */}
      <div className="mt-5 flex flex-col gap-3">
        <div className="border-rule flex items-center gap-2 rounded-lg border bg-white px-3">
          <Search className="text-muted-fg-faint size-4" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="강좌명, 프렌더 이름/닉네임 검색..."
            className="h-10 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {(["all", ...PREP_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                filter === s ? "bg-ink border-ink text-white" : "border-rule text-muted-fg bg-white",
              )}>
              {s === "all" ? "전체" : PREP_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* 강좌 목록 */}
      <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
        {filtered.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">표시할 강좌가 없습니다.</p>
        ) : (
          <ul className="list-none">
            {filtered.map((r) => (
              <CourseRow
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
    </div>
  );
}

function CourseRow({
  row,
  open,
  onToggle,
  onUpdated,
}: {
  row: AdminPrepCourse;
  open: boolean;
  onToggle: () => void;
  onUpdated: (row: AdminPrepCourse) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [pending, startTransition] = useTransition();

  const isPending = row.status === "신청";
  const first = row.sessions[0];
  const last = row.sessions[row.sessions.length - 1];
  const period = first && last ? `${fmtDateKo(first.session_date)} ~ ${fmtDateKo(last.session_date)} (${row.sessions.length}회)` : "-";
  const filledTopics = row.sessions.filter((s) => s.topic?.trim()).length;

  const approve = () => {
    setConfirmApprove(false); // base-nova는 AlertDialogAction이 자동으로 닫지 않는다.
    setBusy("approve");
    startTransition(async () => {
      const res = await approvePrepCourse(row.id);
      if (res.ok) {
        onUpdated({ ...row, status: "승인", admin_note: null });
        toast.success("강좌를 승인했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
      setBusy(null);
    });
  };

  // 사유는 필수 — 프렌더가 무엇을 고쳐야 할지 아는 유일한 경로다.
  const askReject = () => {
    if (!note.trim()) {
      toast.error("거절 사유를 입력해 주세요.");
      return;
    }
    setConfirmReject(true);
  };

  const reject = () => {
    setConfirmReject(false);
    const reason = note.trim();
    setBusy("reject");
    startTransition(async () => {
      const res = await rejectPrepCourse(row.id, reason);
      if (res.ok) {
        onUpdated({ ...row, status: "거절", admin_note: reason });
        toast.success("강좌를 거절했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
      setBusy(null);
    });
  };

  const info: [string, string][] = [
    ["프렌더", `${row.friender_name ?? "-"}${row.friender_nickname ? ` (${row.friender_nickname})` : ""}`],
    ["기간", period],
    ["시각", `${fmtTime(row.start_min)}~${fmtRoomEnd(row.start_min + row.duration_min)} (${row.duration_min}분)`],
    ["난이도", roomLevelLabelKo(row.level)],
    ["제한 인원", `${row.capacity}명`],
    ["수강료", formatWon(row.price_krw)],
    ["주제 입력", `${filledTopics}/${row.sessions.length}`],
    ["요청 일시", formatDateTime(row.submitted_at)],
    ["소개", row.description?.trim() || "-"],
  ];

  return (
    <li className="border-rule border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hover:bg-surface flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors md:px-6">
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", PREP_STATUS_BADGE[row.status])}>
          {PREP_STATUS_LABEL[row.status]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-sm font-bold">{row.title}</span>
          <span className="text-muted-fg-faint block truncate text-xs">
            {row.friender_nickname || row.friender_name || "-"} · {period}
          </span>
        </span>
        <ChevronDown className={cn("text-muted-fg-faint size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="border-rule bg-surface/40 border-t px-4 py-4 md:px-6">
          <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
            {info.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-muted-fg-faint">{label}</dt>
                <dd className="text-ink font-semibold break-words whitespace-pre-wrap">{value}</dd>
              </Fragment>
            ))}
          </dl>

          {/* 커리큘럼 — 유료 강좌 심사의 핵심이라 목록에서 바로 펼쳐 본다. */}
          {row.sessions.length > 0 && (
            <details className="mt-3">
              <summary className="text-accent-blue-ink cursor-default text-xs font-bold">커리큘럼 {row.sessions.length}회 보기</summary>
              <ol className="text-muted-fg mt-1.5 list-none space-y-1 text-xs">
                {row.sessions.map((s, i) => (
                  <li key={s.session_date} className="flex gap-2">
                    <span className="text-muted-fg-faint w-20 shrink-0">
                      {i + 1}강 {fmtDateShort(s.session_date)}
                    </span>
                    <span className="text-ink break-words">{s.topic?.trim() || "-"}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {isPending ? (
            <div className="mt-4">
              <label className="flex flex-col gap-1">
                <span className="text-muted-fg-faint text-xs font-semibold">거절 사유 (거절 시 필수 · 프렌더에게 전달됩니다)</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="예) 수강료가 과정 길이에 비해 높습니다. 조정 후 다시 요청해 주세요."
                  className="border-rule focus:border-accent-blue rounded-md border bg-white px-3 py-2 text-sm outline-none"
                />
              </label>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={askReject}
                  disabled={pending}
                  className="border-brand/40 text-brand hover:bg-brand/5 inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60">
                  {busy === "reject" && <Loader2 className="size-4 animate-spin" />}
                  거절
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmApprove(true)}
                  disabled={pending}
                  className="bg-cta hover:bg-cta/90 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-60">
                  {busy === "approve" && <Loader2 className="size-4 animate-spin" />}
                  승인 (개설 확정)
                </button>
              </div>
            </div>
          ) : (
            <p className="text-muted-fg mt-4 text-sm">
              {row.status === "승인" && "✅ 승인된 강좌입니다. 프렌더가 내용을 수정하면 다시 심사 대기로 돌아옵니다."}
              {row.status === "거절" && `❌ 거절 · 사유: ${row.admin_note?.trim() || "-"}`}
              {row.status === "작성중" && "프렌더가 아직 승인을 요청하지 않은 초안입니다."}
            </p>
          )}
        </div>
      )}

      {/* 승인 확인 */}
      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 강좌를 승인할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{row.title}</span> 강좌의 개설이 확정되고 프렌더에게 SMS로 통보됩니다.
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

      {/* 거절 확인 */}
      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 강좌를 거절할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              입력한 사유가 프렌더에게 SMS와 화면으로 전달됩니다. 프렌더는 수정 후 다시 요청할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={reject} variant="brand">
              거절
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
