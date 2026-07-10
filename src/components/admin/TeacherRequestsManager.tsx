"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { BookedSlot } from "@/lib/availability";
import { approveTeacherApplication, rejectTeacherApplication, deleteTeacher } from "@/app/admin/actions";
import { nationalityLabel } from "@/data/nationalities";
import { genderLabelKo } from "@/data/genders";
import TeacherInfoModal from "@/components/admin/TeacherInfoModal";
import TeacherClassesModal from "@/components/admin/TeacherClassesModal";
import TeacherAvailabilityFinder from "@/components/admin/TeacherAvailabilityFinder";
import CurrentTeacherTable from "@/components/admin/CurrentTeacherTable";
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
  phone: string | null;
  nationality: string | null;
  gender: string | null;
  center_id: string | null;
  center_name: string | null;
  email: string;
  bio: string;
  experience: string | null;
  zoom_url: string | null;
  avatar_url: string | null;
  status: "신청" | "승인" | "거절";
  admin_note: string | null;
  created_at: string;
};

// 진행 중인 수업(과정) 한 건 — 「수업 보기」 모달용.
export type TeacherClassItem = {
  enrollmentId: string;
  course: string;
  courseTitle: string;
  studentName: string;
  studentEnglishName: string | null;
  status: string; // 승인 | 결제대기 | 결제완료
  slots: { day: number; min: number }[];
  startDate: string | null;
  total: number; // 계획 회차(보강 제외)
  done: number; // 완료 회차
  nextDate: string | null; // 다음 예정 수업일
  nextMin: number | null;
};

export type CurrentTeacher = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  nationality: string | null;
  gender: string | null;
  centerId: string | null;
  centerName: string | null;
  bio: string | null;
  experience: string | null;
  zoomUrl: string | null;
  avatarUrl: string | null;
  slots: { day: number; min: number }[];
  bookedSlots: BookedSlot[];
  classes: TeacherClassItem[];
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
  centers,
}: {
  applications: TeacherApplication[];
  currentTeachers: CurrentTeacher[];
  centers: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState(applications);
  const [teachers, setTeachers] = useState(currentTeachers);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [infoTarget, setInfoTarget] = useState<CurrentTeacher | null>(null);
  const closeInfo = useCallback(() => setInfoTarget(null), []);
  // 강사 센터 변경 낙관적 반영(테이블 + 열린 모달 동기화).
  const onCenterUpdated = useCallback((teacherId: string, centerId: string | null, centerName: string | null) => {
    setTeachers((prev) => prev.map((t) => (t.id === teacherId ? { ...t, centerId, centerName } : t)));
    setInfoTarget((prev) => (prev && prev.id === teacherId ? { ...prev, centerId, centerName } : prev));
  }, []);
  const [classesTarget, setClassesTarget] = useState<CurrentTeacher | null>(null);
  const closeClasses = useCallback(() => setClassesTarget(null), []);
  const [deleteTarget, setDeleteTarget] = useState<CurrentTeacher | null>(null);
  const [deleting, startDelete] = useTransition();

  const pending = useMemo(() => rows.filter((r) => r.status === "신청").length, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.phone ?? "").includes(q) || r.email.toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    startDelete(async () => {
      const res = await deleteTeacher(target.id);
      if (res.ok) {
        setTeachers((prev) => prev.filter((t) => t.id !== target.id));
        // cascade로 지원 행도 사라지므로 목록에서 함께 제거.
        setRows((prev) => prev.filter((r) => r.user_id !== target.id));
        toast.success("강사를 삭제했습니다.");
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">강사 관리</h1>
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
                onApproved={(teacher) => setTeachers((prev) => (prev.some((t) => t.id === teacher.id) ? prev : [...prev, teacher]))}
              />
            ))}
          </ul>
        )}
      </div>

      {/* 수업 가능 시간으로 강사 찾기 */}
      <div className="mt-10">
        <TeacherAvailabilityFinder teachers={teachers} onView={setInfoTarget} />
      </div>

      {/* 현재 강사 */}
      <h2 className="text-ink mt-10 text-lg font-extrabold">현재 강사</h2>
      <p className="text-muted-fg mt-1 text-sm">강사를 삭제하면 계정과 모든 데이터가 영구 삭제되며 되돌릴 수 없습니다.</p>
      {teachers.length === 0 ? (
        <div className="border-rule mt-4 overflow-hidden rounded-xl border bg-white">
          <p className="text-muted-fg px-6 py-12 text-center text-sm">현재 강사가 없습니다.</p>
        </div>
      ) : (
        <CurrentTeacherTable
          teachers={teachers}
          onView={setInfoTarget}
          onViewClasses={setClassesTarget}
          onDelete={setDeleteTarget}
          deleting={deleting}
          className="mt-4"
        />
      )}

      {/* 강사 정보 보기 */}
      <TeacherInfoModal teacher={infoTarget} centers={centers} onCenterUpdated={onCenterUpdated} onClose={closeInfo} />

      {/* 진행 중인 수업 목록 */}
      <TeacherClassesModal teacher={classesTarget} onClose={closeClasses} />

      {/* 삭제 확인 */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>강사를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="text-ink font-semibold">{deleteTarget.name || deleteTarget.email}</span> 계정과 모든 데이터(프로필·지원 내역·수업
                  가능 시간 등)가 영구 삭제되며 되돌릴 수 없습니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
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

function ApplicationRow({
  row,
  open,
  onToggle,
  onUpdated,
  onApproved,
}: {
  row: TeacherApplication;
  open: boolean;
  onToggle: () => void;
  onUpdated: (updated: TeacherApplication) => void;
  onApproved: (teacher: CurrentTeacher) => void;
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
      const res = await approveTeacherApplication(row.id);
      if (res.ok) {
        onUpdated({ ...row, status: "승인" });
        onApproved({
          id: row.user_id,
          email: row.email,
          name: row.name,
          phone: row.phone,
          nationality: row.nationality,
          gender: row.gender,
          centerId: row.center_id,
          centerName: row.center_name,
          bio: row.bio,
          experience: row.experience,
          zoomUrl: row.zoom_url,
          avatarUrl: row.avatar_url,
          slots: [],
          bookedSlots: [],
          classes: [],
        });
        toast.success("강사로 승인했습니다.");
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
      const res = await rejectTeacherApplication(row.id, note);
      if (res.ok) {
        onUpdated({ ...row, status: "거절", admin_note: note || null });
        toast.success("지원을 거절했습니다.");
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
            {row.phone && <span className="text-muted-fg-faint font-normal"> · {row.phone}</span>}
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
              ["국적", nationalityLabel(row.nationality)],
              ["성별", genderLabelKo(row.gender)],
              ["센터", row.center_name ?? "None"],
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

          {isPending ? (
            <>
              <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">거절 사유 - 신청자에게 표시됨. 영어로 작성.</label>
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
                  disabled={pending}
                  className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busyAction === "approve" && <Loader2 className="size-3.5 animate-spin" />}
                  승인 (강사 전환)
                </button>
                <button
                  type="button"
                  onClick={askReject}
                  disabled={pending}
                  className="border-brand/40 text-brand hover:bg-brand/5 inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {busyAction === "reject" && <Loader2 className="size-3.5 animate-spin" />}
                  거절
                </button>
              </div>
            </>
          ) : (
            <p className="text-muted-fg text-sm">
              {row.status === "승인" ? "✅ 승인되어 강사로 전환되었습니다. 자격 회수는 아래 「현재 강사」에서 처리합니다." : "❌ 거절된 지원입니다."}
              {row.status === "거절" && row.admin_note && <span className="whitespace-pre-wrap"> · 사유: {row.admin_note}</span>}
            </p>
          )}
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

      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>강사 지원을 거절하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-semibold">{row.name}</span>({row.email}) 회원의 지원을 거절합니다. 입력한 거절 사유는 신청자에게 메일로
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
