"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { approveFrienderApplication, rejectFrienderApplication, revokeFriender, setFrienderTier } from "@/app/admin/actions";
import { nationalityLabel } from "@/data/nationalities";
import { genderLabelKo } from "@/data/genders";
import { formatPhone } from "@/lib/phone";
import FrienderInfoModal from "@/components/admin/FrienderInfoModal";
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

export type FrienderApplication = {
  id: string;
  user_id: string;
  name: string;
  nickname: string | null;
  phone: string;
  nationality: string | null;
  gender: string | null;
  email: string;
  intro: string;
  zoom_url: string;
  avatar_url: string | null;
  status: "신청" | "승인" | "거절";
  admin_note: string | null;
  created_at: string;
};

export type CurrentFriender = {
  id: string;
  role: FrienderTier;
  email: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  nationality: string | null;
  gender: string | null;
  bio: string | null;
  zoomUrl: string | null;
  avatarUrl: string | null;
};

const STATUSES = ["신청", "승인", "거절"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_BADGE: Record<Status, string> = {
  신청: "bg-[#FFF7E6] text-[#B97400]",
  승인: "bg-[#E1F5EE] text-[#0F6E56]",
  거절: "bg-brand/10 text-brand",
};

// 프렌더 등급 — role 단일값이라 friender / friender_plus 둘 중 하나.
export type FrienderTier = "friender" | "friender_plus";

export const TIER_LABEL: Record<FrienderTier, string> = { friender: "프렌더", friender_plus: "프렌더 Plus" };
const TIER_BADGE: Record<FrienderTier, string> = { friender: "bg-cta/10 text-cta", friender_plus: "bg-cta text-white" };

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

// 프렌더 관리 — 강사 관리(TeacherRequestsManager)에서 강사 전용 요소(센터·가용시간·수업·정산)를
// 걷어낸 축소판. 승인/거절 결과는 서버 액션이 SMS로 통보한다(프렌더는 인증된 번호 보유).
export default function FrienderRequestsManager({
  applications,
  currentFrienders,
}: {
  applications: FrienderApplication[];
  currentFrienders: CurrentFriender[];
}) {
  const [rows, setRows] = useState(applications);
  const [frienders, setFrienders] = useState(currentFrienders);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("신청");
  const [openId, setOpenId] = useState<string | null>(null);
  const [infoTarget, setInfoTarget] = useState<CurrentFriender | null>(null);
  const closeInfo = useCallback(() => setInfoTarget(null), []);
  const [revokeTarget, setRevokeTarget] = useState<CurrentFriender | null>(null);
  const [revokeReason, setRevokeReason] = useState(""); // 선택 입력 — 적으면 본인 안내 메일에 사유로 포함
  const [revoking, startRevoke] = useTransition();
  const [tierTarget, setTierTarget] = useState<CurrentFriender | null>(null); // 등급 변경(승격/강등) 대상
  const [tierPending, startTier] = useTransition();

  const pending = useMemo(() => rows.filter((r) => r.status === "신청").length, [rows]);
  const plusCount = useMemo(() => frienders.filter((f) => f.role === "friender_plus").length, [frienders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) || (r.nickname ?? "").toLowerCase().includes(q) || r.phone.includes(q) || r.email.toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter]);

  const confirmRevoke = () => {
    if (!revokeTarget) return;
    // 다이얼로그를 닫으며 state를 비우므로 대상·사유를 먼저 스냅샷.
    const target = revokeTarget;
    const reason = revokeReason;
    setRevokeTarget(null);
    setRevokeReason("");
    startRevoke(async () => {
      const res = await revokeFriender(target.id, reason);
      if (res.ok) {
        setFrienders((prev) => prev.filter((f) => f.id !== target.id));
        toast.success("프렌더 자격을 해제했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  // 등급 변경 — 현재 등급의 반대쪽으로 전환. 다이얼로그를 닫으며 state를 비우므로 대상을 먼저 스냅샷.
  const confirmTier = () => {
    if (!tierTarget) return;
    const target = tierTarget;
    const next: FrienderTier = target.role === "friender" ? "friender_plus" : "friender";
    setTierTarget(null);
    startTier(async () => {
      const res = await setFrienderTier(target.id, next);
      if (res.ok) {
        setFrienders((prev) => prev.map((f) => (f.id === target.id ? { ...f, role: next } : f)));
        toast.success(next === "friender_plus" ? "프렌더 Plus로 승격했습니다." : "일반 프렌더로 변경했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">프렌더 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">프렌더 신청을 승인/거절하고, 현재 프렌더 자격을 해제합니다. 결과는 신청자에게 SMS로 전달됩니다.</p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatCard label="총 신청" value={rows.length} sub="누적 전체" />
        <StatCard label="현재 프렌더" value={frienders.length} sub={`일반 ${frienders.length - plusCount} · Plus ${plusCount}`} />
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
            placeholder="이름, 닉네임, 전화번호, 이메일 검색..."
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
              )}>
              {s === "all" ? "전체" : s}
            </button>
          ))}
        </div>
      </div>

      {/* 신청 목록 */}
      <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
        {filtered.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">표시할 신청이 없습니다.</p>
        ) : (
          <ul className="list-none">
            {filtered.map((r) => (
              <ApplicationRow
                key={r.id}
                row={r}
                open={openId === r.id}
                onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                onUpdated={(updated) => setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
                onApproved={(friender) => setFrienders((prev) => (prev.some((f) => f.id === friender.id) ? prev : [...prev, friender]))}
              />
            ))}
          </ul>
        )}
      </div>

      {/* 현재 프렌더 */}
      <h2 className="text-ink mt-10 text-lg font-extrabold">현재 프렌더</h2>
      <p className="text-muted-fg mt-1 text-sm">
        프렌더는 무료 연습방을, 프렌더 Plus는 유료방까지 개설할 수 있습니다. 등급 변경은 본인에게 SMS로 안내됩니다.
      </p>
      <p className="text-muted-fg mt-1 text-sm">
        자격을 해제하면 일반 회원(student)으로 돌아갑니다. 계정과 데이터는 유지되며 다시 신청할 수 있습니다.
      </p>
      {frienders.length === 0 ? (
        <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
          <p className="text-muted-fg px-6 py-12 text-center text-sm">현재 프렌더가 없습니다.</p>
        </div>
      ) : (
        <CurrentFrienderTable
          frienders={frienders}
          onView={setInfoTarget}
          onRevoke={setRevokeTarget}
          onTier={setTierTarget}
          revoking={revoking}
          tierPending={tierPending}
          className="mt-4"
        />
      )}

      {/* 프렌더 정보 보기 */}
      <FrienderInfoModal friender={infoTarget} onClose={closeInfo} />

      {/* 자격 해제 확인 */}
      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
            setRevokeReason(""); // 다음 대상에 이전 사유가 남지 않도록 초기화
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프렌더 자격을 해제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget && (
                <>
                  <span className="text-ink font-semibold">{revokeTarget.name || revokeTarget.email}</span> 회원을 일반 회원으로 되돌립니다. 계정과
                  프로필 데이터는 유지되며, 원하면 다시 프렌더로 신청할 수 있습니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* 사유 입력은 AlertDialogDescription(=p 태그) 바깥에 둔다 — textarea 중첩은 invalid HTML. */}
          <div className="text-left">
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">해제 사유 (선택) - 입력하면 회원에게 이메일로 전달됩니다.</label>
            <textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              rows={2}
              placeholder="해제 사유를 입력하세요..."
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRevoke} variant="brand">
              해제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 등급 변경 확인 (승격 ↔ 강등) */}
      <AlertDialog open={tierTarget !== null} onOpenChange={(open) => !open && setTierTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tierTarget?.role === "friender" ? "프렌더 Plus로 승격하시겠습니까?" : "프렌더 Plus 자격을 해제하시겠습니까?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tierTarget && (
                <>
                  <span className="text-ink font-semibold">{tierTarget.name || tierTarget.email}</span>
                  {tierTarget.role === "friender"
                    ? " 회원을 프렌더 Plus로 승격합니다. 무료 연습방에 더해 유료방도 개설할 수 있게 됩니다."
                    : " 회원을 일반 프렌더로 되돌립니다. 유료방은 개설할 수 없고 무료 연습방만 가능해집니다."}
                  {" 변경 내용은 본인에게 SMS로 안내됩니다."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTier} className="bg-cta hover:bg-cta/90 border-transparent text-white">
              {tierTarget?.role === "friender" ? "승격" : "해제"}
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
  onApproved,
}: {
  row: FrienderApplication;
  open: boolean;
  onToggle: () => void;
  onUpdated: (updated: FrienderApplication) => void;
  onApproved: (friender: CurrentFriender) => void;
}) {
  const [note, setNote] = useState(row.admin_note ?? "");
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<null | "approve" | "reject">(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const isPending = row.status === "신청";

  const approve = () => {
    setConfirmApprove(false);
    setBusyAction("approve");
    startTransition(async () => {
      const res = await approveFrienderApplication(row.id);
      if (res.ok) {
        onUpdated({ ...row, status: "승인" });
        onApproved({
          id: row.user_id,
          role: "friender", // 승인은 항상 일반 프렌더로 — Plus 승격은 목록에서 별도 처리
          email: row.email,
          name: row.name,
          nickname: row.nickname,
          phone: row.phone,
          nationality: row.nationality,
          gender: row.gender,
          bio: row.intro,
          zoomUrl: row.zoom_url,
          avatarUrl: row.avatar_url,
        });
        toast.success("프렌더로 승인했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
      setBusyAction(null);
    });
  };

  // 거절 버튼 → 사유 검증 후 confirm 다이얼로그 오픈.
  const askReject = () => {
    if (!note.trim()) {
      toast.error("거절 사유를 입력해 주세요.");
      return;
    }
    setConfirmReject(true);
  };

  const reject = () => {
    setConfirmReject(false);
    setBusyAction("reject");
    startTransition(async () => {
      const res = await rejectFrienderApplication(row.id, note);
      if (res.ok) {
        onUpdated({ ...row, status: "거절", admin_note: note || null });
        toast.success("신청을 거절했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
      setBusyAction(null);
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
            {row.name}
            <span className="text-muted-fg-faint font-normal"> · {formatPhone(row.phone)}</span>
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
              alt={`${row.name} 프로필 사진`}
              width={64}
              height={64}
              className="border-rule mb-3 size-16 rounded-2xl border object-cover"
            />
          )}
          <dl className="mb-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm">
            {[
              ["이메일", row.email],
              ["닉네임", row.nickname ?? "-"],
              ["전화", formatPhone(row.phone)],
              ["국적", nationalityLabel(row.nationality)],
              ["성별", genderLabelKo(row.gender)],
              ["자기소개", row.intro],
              ["Zoom URL", row.zoom_url],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="text-muted-fg-faint w-32 shrink-0">{label}</dt>
                <dd className="text-ink break-words whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>

          {isPending ? (
            <>
              <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">거절 사유 - 신청자에게 SMS로 전달됩니다.</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="거절 사유를 입력하세요..."
                className="border-rule-faint focus:border-accent-blue mb-3 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmApprove(true)}
                  disabled={pending}
                  className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                  {busyAction === "approve" && <Loader2 className="size-3.5 animate-spin" />}
                  승인 (프렌더 전환)
                </button>
                <button
                  type="button"
                  onClick={askReject}
                  disabled={pending}
                  className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50">
                  {busyAction === "reject" && <Loader2 className="size-3.5 animate-spin" />}
                  거절
                </button>
              </div>
            </>
          ) : (
            <p className="text-muted-fg text-sm">
              {row.status === "승인"
                ? "✅ 승인되어 프렌더로 전환되었습니다. 자격 해제는 아래 「현재 프렌더」에서 처리합니다."
                : "❌ 거절된 신청입니다."}
              {row.status === "거절" && row.admin_note && <span className="whitespace-pre-wrap"> · 사유: {row.admin_note}</span>}
            </p>
          )}
        </div>
      )}

      <AlertDialog open={confirmApprove} onOpenChange={setConfirmApprove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프렌더 신청을 승인하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{row.name}</span>({row.email}) 회원을 프렌더로 전환하고 승인 안내 SMS를 보냅니다. 프로필은
              신청서 내용으로 채워집니다.
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

      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프렌더 신청을 거절하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{row.name}</span>({row.email}) 회원의 신청을 거절합니다. 입력한 거절 사유는 신청자에게 SMS로
              전달됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={reject} className="bg-brand hover:bg-brand/90 border-transparent text-white">
              거절
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

type SortKey = "name" | "role" | "nationality" | "gender";

// 정렬 비교값은 원본 값 기준(국기 이모지·라벨이 순서에 영향 주지 않도록).
const SORT_VALUE: Record<SortKey, (f: CurrentFriender) => string> = {
  name: (f) => f.name || f.email,
  role: (f) => f.role,
  nationality: (f) => f.nationality ?? "",
  gender: (f) => f.gender ?? "",
};

function CurrentFrienderTable({
  frienders,
  onView,
  onRevoke,
  onTier,
  revoking,
  tierPending,
  className,
}: {
  frienders: CurrentFriender[];
  onView: (f: CurrentFriender) => void;
  onRevoke: (f: CurrentFriender) => void;
  onTier: (f: CurrentFriender) => void;
  revoking?: boolean;
  tierPending?: boolean;
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const sorted = useMemo(() => {
    if (!sort) return frienders;
    const val = (f: CurrentFriender) => SORT_VALUE[sort.key](f).trim();
    return [...frienders].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      // 빈 값은 항상 마지막으로.
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [frienders, sort]);

  return (
    <div className={cn("border-rule overflow-x-auto rounded-xl border bg-white", className)}>
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
            <SortHeader label="이름" sortKey="name" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
            <SortHeader label="등급" sortKey="role" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <SortHeader label="국적" sortKey="nationality" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <SortHeader label="성별" sortKey="gender" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <th className="px-4 py-2.5 text-right md:px-6">
              <span className="sr-only">관리</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => (
            <tr key={f.id} className="border-rule border-b last:border-b-0">
              <td className="px-4 py-3.5 align-middle md:px-6">
                <p className="text-ink font-bold">
                  {f.name || f.email}
                  {f.nickname && <span className="text-muted-fg font-normal"> ({f.nickname})</span>}
                </p>
                {f.name && <p className="text-muted-fg text-xs">{f.email}</p>}
              </td>
              <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", TIER_BADGE[f.role])}>{TIER_LABEL[f.role]}</span>
              </td>
              <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">{nationalityLabel(f.nationality)}</td>
              <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">{genderLabelKo(f.gender)}</td>
              <td className="px-4 py-3.5 align-middle md:px-6">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onView(f)}
                    className="border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors">
                    정보 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => onTier(f)}
                    disabled={tierPending}
                    className={cn(
                      "shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60",
                      f.role === "friender" ? "border-cta/40 text-cta hover:bg-cta/5" : "border-rule text-muted-fg hover:bg-surface",
                    )}>
                    {f.role === "friender" ? "Plus 승격" : "Plus 해제"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRevoke(f)}
                    disabled={revoking}
                    className="border-brand/40 text-brand hover:bg-brand/5 shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60">
                    프렌더 해제
                  </button>
                </div>
              </td>
            </tr>
          ))}
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
