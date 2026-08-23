"use client";

import { Fragment, type ReactNode, useCallback, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { fmtDateKo, fmtDateShort, formatWon, frienderLabel } from "@/lib/prep";
import { kstDateText } from "@/lib/kst";
import { PREP_STATUSES, PREP_STATUS_BADGE, PREP_STATUS_LABEL, type PrepStatus } from "@/data/prep";
import { roomLevelLabelKo } from "@/data/room-levels";
import { approvePrepCourse, deletePrepCourseAsAdmin, rejectPrepCourse, unapprovePrepCourse } from "@/app/admin/actions";
import PrepSessionCalendar from "@/components/admin/PrepSessionCalendar";
import PrepCourseInfoModal from "@/components/admin/PrepCourseInfoModal";
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
  friender_phone: string | null; // 스냅샷이 아니라 profiles 최신값(폐강·일정 문의용)
  friender_email: string;
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
  reviewed_at: string | null; // 마지막 승인/거절 처리 시각 — 승인 목록의 '승인일'
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

  // 개설된 강좌 관리 — 상세 보기 / 승인 해제 / 삭제.
  const [infoTarget, setInfoTarget] = useState<AdminPrepCourse | null>(null);
  const closeInfo = useCallback(() => setInfoTarget(null), []);
  const [unapproveTarget, setUnapproveTarget] = useState<AdminPrepCourse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPrepCourse | null>(null);
  const [reason, setReason] = useState(""); // 선택 입력 — 적으면 프렌더 SMS·화면에 사유로 붙는다
  const [busy, startBusy] = useTransition();

  const pending = rows.filter((r) => r.status === "신청").length;
  const approvedRows = rows.filter((r) => r.status === "승인");
  const rejected = rows.filter((r) => r.status === "거절").length;

  const matches = useCallback(
    (r: AdminPrepCourse) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [r.title, r.friender_name ?? "", r.friender_nickname ?? ""].some((v) => v.toLowerCase().includes(q));
    },
    [query],
  );

  const filtered = useMemo(() => rows.filter((r) => (filter === "all" || r.status === filter) && matches(r)), [rows, filter, matches]);
  const approvedList = useMemo(() => approvedRows.filter(matches), [approvedRows, matches]);

  // 다이얼로그를 닫으며 state를 비우므로 대상·사유를 먼저 스냅샷한다(FrienderRequestsManager와 같은 패턴).
  const confirmUnapprove = () => {
    const target = unapproveTarget;
    const note = reason.trim();
    setUnapproveTarget(null);
    setReason("");
    if (!target) return;
    startBusy(async () => {
      const res = await unapprovePrepCourse(target.id, note);
      if (res.ok) {
        setRows((prev) => prev.map((x) => (x.id === target.id ? { ...x, status: "신청" as PrepStatus, admin_note: note || null } : x)));
        toast.success("승인을 해제했습니다. 다시 심사 대기로 돌아갑니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    const note = reason.trim();
    setDeleteTarget(null);
    setReason("");
    if (!target) return;
    startBusy(async () => {
      const res = await deletePrepCourseAsAdmin(target.id, note);
      if (res.ok) {
        setRows((prev) => prev.filter((x) => x.id !== target.id));
        if (infoTarget?.id === target.id) setInfoTarget(null);
        toast.success("강좌를 삭제했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">프렙 강좌</h1>
      <p className="text-muted-fg mt-1 text-sm">
        위에서 프렌더 Plus가 올린 개설 요청을 승인/거절하고, 아래 「개설된 강좌」에서 운영 중인 강좌를 관리합니다. 처리 결과는 프렌더에게 SMS로
        전달됩니다.
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="승인 대기" value={`${pending}건`} sub="상태=신청" accent />
        <StatCard label="승인" value={approvedRows.length} sub="개설 완료" />
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

      {/* 개설된 강좌 — 심사 큐와 별개로 '지금 운영 중인 상품' 목록. 프렌더 관리 탭의 「현재 프렌더」 테이블과 같은 자리·같은 모양. */}
      <h2 className="text-ink mt-8 text-lg font-extrabold">개설된 강좌 ({approvedRows.length})</h2>
      <p className="text-muted-fg mt-1 text-sm">승인이 끝나 개설된 강좌입니다. 위 검색어가 이 목록에도 함께 적용됩니다.</p>
      <ApprovedCourseTable
        courses={approvedList}
        onView={setInfoTarget}
        onUnapprove={(c) => {
          setReason("");
          setUnapproveTarget(c);
        }}
        onDelete={(c) => {
          setReason("");
          setDeleteTarget(c);
        }}
        busy={busy}
        className="mt-3"
      />

      <PrepCourseInfoModal course={infoTarget} onClose={closeInfo} />

      {/* 승인 해제 확인 — 사유는 선택 입력. ⚠️ AlertDialogDescription은 <p>라 textarea는 바깥 형제로 둔다. */}
      <AlertDialog open={unapproveTarget !== null} onOpenChange={(open) => !open && setUnapproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>승인을 해제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {unapproveTarget && (
                <>
                  <span className="text-ink font-semibold">{unapproveTarget.title}</span> 강좌가 다시 「심사 중」으로 돌아가고 프렌더에게 SMS로
                  통보됩니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-left">
            <label className="flex flex-col gap-1">
              <span className="text-muted-fg-faint text-xs font-semibold">사유 (선택 · 프렌더에게 전달됩니다)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="예) 일정이 변경되어 재검토가 필요합니다."
                className="border-rule focus:border-accent-blue rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnapprove} variant="brand">
              승인 해제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>강좌를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="text-ink font-semibold">{deleteTarget.title}</span> 강좌와 {deleteTarget.sessions.length}개 회차가 모두 삭제됩니다.
                  되돌릴 수 없습니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-left">
            <label className="flex flex-col gap-1">
              <span className="text-muted-fg-faint text-xs font-semibold">사유 (선택 · 프렌더에게 전달됩니다)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="예) 중복 등록된 강좌입니다."
                className="border-rule focus:border-accent-blue rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} variant="brand">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ===== 개설된 강좌 테이블 ===== */

type SortKey = "title" | "friender" | "start" | "price" | "capacity" | "approved";

// 정렬은 문자열 비교 하나로 통일한다(FrienderRequestsManager와 같은 방식) — 날짜는 YYYY-MM-DD/ISO라,
// 숫자는 자리수를 맞춰 문자열로 만들면 사전순 = 값 순서가 된다.
const SORT_VALUE: Record<SortKey, (c: AdminPrepCourse) => string> = {
  title: (c) => c.title,
  friender: (c) => c.friender_name || c.friender_nickname || "",
  start: (c) => c.sessions[0]?.session_date ?? "",
  price: (c) => String(c.price_krw).padStart(12, "0"),
  capacity: (c) => String(c.capacity).padStart(6, "0"),
  approved: (c) => c.reviewed_at ?? "",
};

function ApprovedCourseTable({
  courses,
  onView,
  onUnapprove,
  onDelete,
  busy,
  className,
}: {
  courses: AdminPrepCourse[];
  onView: (c: AdminPrepCourse) => void;
  onUnapprove: (c: AdminPrepCourse) => void;
  onDelete: (c: AdminPrepCourse) => void;
  busy?: boolean;
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const sorted = useMemo(() => {
    if (!sort) return courses;
    const val = (c: AdminPrepCourse) => SORT_VALUE[sort.key](c).trim();
    return [...courses].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      // 빈 값은 항상 마지막으로.
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [courses, sort]);

  if (courses.length === 0) {
    return (
      <div className={cn("border-rule rounded-xl border bg-white", className)}>
        <p className="text-muted-fg px-6 py-12 text-center text-sm">개설된 강좌가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className={cn("border-rule overflow-x-auto rounded-xl border bg-white", className)}>
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead>
          <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
            <SortHeader label="강좌명" sortKey="title" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
            <SortHeader label="프렌더" sortKey="friender" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <SortHeader label="기간" sortKey="start" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <th className="px-4 py-2.5">시각</th>
            <SortHeader label="정원" sortKey="capacity" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <SortHeader label="수강료" sortKey="price" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <SortHeader label="승인일" sortKey="approved" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <th className="px-4 py-2.5 text-right md:px-6">
              <span className="sr-only">관리</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const first = c.sessions[0];
            const last = c.sessions[c.sessions.length - 1];
            return (
              <tr key={c.id} className="border-rule border-b last:border-b-0">
                <td className="text-ink px-4 py-3 font-bold md:px-6">{c.title}</td>
                <td className="text-muted-fg px-4 py-3">{frienderLabel(c.friender_name, c.friender_nickname)}</td>
                <td className="text-muted-fg px-4 py-3 whitespace-nowrap">
                  {first && last ? `${fmtDateKo(first.session_date)} ~ ${fmtDateKo(last.session_date)}` : "-"}
                  <span className="text-muted-fg-faint"> ({c.sessions.length}회)</span>
                </td>
                <td className="text-muted-fg px-4 py-3 whitespace-nowrap">
                  {fmtTime(c.start_min)}~{fmtRoomEnd(c.start_min + c.duration_min)}
                </td>
                <td className="text-muted-fg px-4 py-3">{c.capacity}명</td>
                <td className="text-ink px-4 py-3 font-semibold whitespace-nowrap">{formatWon(c.price_krw)}</td>
                <td className="text-muted-fg-faint px-4 py-3 whitespace-nowrap">{c.reviewed_at ? kstDateText(c.reviewed_at) : "-"}</td>
                <td className="px-4 py-3 text-right md:px-6">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onView(c)}
                      className="border-rule text-muted-fg hover:bg-surface rounded-md border px-3 py-1.5 text-xs font-bold transition-colors">
                      정보 보기
                    </button>
                    <button
                      type="button"
                      onClick={() => onUnapprove(c)}
                      disabled={busy}
                      className="border-rule text-muted-fg hover:bg-surface rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60">
                      승인 해제
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(c)}
                      disabled={busy}
                      className="border-brand/40 text-brand hover:bg-brand/5 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60">
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)} className="hover:text-ink inline-flex items-center gap-1 font-semibold transition-colors">
        {label}
        <Icon aria-hidden className={cn("size-3.5", active ? "text-ink" : "text-muted-fg-faint/60")} />
      </button>
    </th>
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
  const [showCalendar, setShowCalendar] = useState(false);
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

  const info: [string, ReactNode][] = [
    ["프렌더", frienderLabel(row.friender_name, row.friender_nickname)],
    [
      "기간",
      <>
        {period}
        {row.sessions.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCalendar((v) => !v)}
            aria-expanded={showCalendar}
            className="text-accent-blue-ink ml-2 text-xs font-bold">
            {showCalendar ? "수업 일자 닫기" : "수업 일자 보기"}
          </button>
        )}
      </>,
    ],
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
            {frienderLabel(row.friender_name, row.friender_nickname)} · {period}
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

          {/* 수업 일자 — 프렌더가 캘린더에서 개별 일자를 조정할 수 있어, 승인 전에 실제 배치를 봐야 한다.
              프렌더 개설 폼(PrepCourseForm)의 캘린더와 **같은 props로 그린다** — 두 화면에서 같은 일정이 다르게 보이면 안 된다.
              ⚠️ 읽기 전용은 `disabled`가 아니라 감싼 div의 `inert`+`pointer-events-none`으로 만든다:
                 `disabled`를 주면 캘린더 전체가 opacity-50으로 흐려져 프렌더 화면과 인상이 달라진다.
                 클릭·포커스가 아예 안 들어오므로 selected 내부 상태도 바뀔 수 없다. */}
          {showCalendar && row.sessions.length > 0 && (
            <div className="border-rule mt-3 rounded-xl border bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-ink text-sm font-bold">수업 일자</p>
                <p className="text-cta text-sm font-bold">총 {row.sessions.length}회</p>
              </div>
              <p className="text-muted-fg-faint mt-0.5 text-xs">프렌더가 등록한 일정입니다 (읽기 전용).</p>
              <PrepSessionCalendar dates={row.sessions.map((s) => s.session_date)} />
              <p className="text-muted-fg mt-2 text-xs">{period}</p>
            </div>
          )}

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
