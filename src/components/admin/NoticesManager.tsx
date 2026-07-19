"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Pin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { kstDateTimeText } from "@/lib/kst";
import { addNotice, deleteNotice, setNoticePinned, setNoticeVisibility, updateNotice } from "@/app/admin/actions";
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

export type AdminNotice = {
  id: string;
  title: string;
  body: string;
  is_visible: boolean;
  is_pinned: boolean;
  published_at: string;
  view_count: number;
  created_at: string;
};

type Fields = { title: string; body: string; publishedAt: string; isPinned: boolean; isVisible: boolean };

// datetime-local 입력값(로컬 시각 'YYYY-MM-DDTHH:mm')으로 변환.
const toLocalInput = (iso?: string): string => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const emptyForm = (): Fields => ({ title: "", body: "", publishedAt: toLocalInput(), isPinned: false, isVisible: true });

// 게시일 표시는 kstDateTimeText(로케일 비의존 — 하이드레이션 불일치 방지). 미래 게시일은 '예약' 배지로 구분.

export default function NoticesManager({ notices }: { notices: AdminNotice[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Fields>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Fields>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<AdminNotice | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string, after?: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
        if (success) toast.success(success);
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const startEdit = (n: AdminNotice) => {
    setEditingId(n.id);
    setEditFields({ title: n.title, body: n.body, publishedAt: toLocalInput(n.published_at), isPinned: n.is_pinned, isVisible: n.is_visible });
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    run(() => deleteNotice(target.id), "공지를 삭제했습니다.");
  };

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">공지 사항</h1>
      <p className="text-muted-fg mt-1 text-sm">
        공지를 등록하면 사이트 하단(최근 3건)과 공지 목록에 노출됩니다. 게시일을 미래로 두면 그 시각부터 공개됩니다.
      </p>

      {/* 등록 폼 */}
      <div className="border-rule mt-5 rounded-xl border bg-white p-5">
        <p className="text-ink mb-3 text-base font-bold">새 공지 등록</p>
        <Field label="제목" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="공지 제목" />
        <Field className="mt-3" label="내용" value={form.body} onChange={(v) => setForm({ ...form, body: v })} placeholder="공지 내용" textarea />
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">게시일</label>
            <input
              type="datetime-local"
              value={form.publishedAt}
              onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
              className="border-rule-faint focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none"
            />
          </div>
          <label className="text-muted-fg mb-2.5 inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} className="size-4" />
            상단 고정
          </label>
          <label className="text-muted-fg mb-2.5 inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={form.isVisible} onChange={(e) => setForm({ ...form, isVisible: e.target.checked })} className="size-4" />
            공개
          </label>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => addNotice(form), "공지를 등록했습니다.", () => setForm(emptyForm()))}
          className="bg-ink mt-4 inline-flex h-10 items-center gap-1.5 rounded-md px-5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          등록하기
        </button>
      </div>

      {/* 목록 */}
      <div className="border-rule mt-5 overflow-hidden rounded-xl border bg-white">
        {notices.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">등록된 공지가 없습니다.</p>
        ) : (
          <ul className="list-none">
            {notices.map((n) => {
              const scheduled = new Date(n.published_at).getTime() > Date.now();
              return (
                <li key={n.id} className="border-rule border-b p-4 last:border-b-0 md:px-6">
                  {editingId === n.id ? (
                    <div>
                      <Field label="제목" value={editFields.title} onChange={(v) => setEditFields({ ...editFields, title: v })} />
                      <Field className="mt-3" label="내용" value={editFields.body} onChange={(v) => setEditFields({ ...editFields, body: v })} textarea />
                      <div className="mt-3">
                        <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">게시일</label>
                        <input
                          type="datetime-local"
                          value={editFields.publishedAt}
                          onChange={(e) => setEditFields({ ...editFields, publishedAt: e.target.value })}
                          className="border-rule-faint focus:border-accent-blue h-10 rounded-md border bg-white px-3 text-sm outline-none"
                        />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => updateNotice(n.id, editFields), "공지를 수정했습니다.", () => setEditingId(null))}
                          className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {pending && <Loader2 className="size-3.5 animate-spin" />}
                          저장
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="border-rule text-muted-fg h-9 rounded-md border px-4 text-sm font-medium">
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => setNoticePinned(n.id, !n.is_pinned), n.is_pinned ? "고정을 해제했습니다." : "상단에 고정했습니다.")}
                          aria-label={n.is_pinned ? "고정 해제" : "상단 고정"}
                          aria-pressed={n.is_pinned}
                          className={cn(
                            "border-rule rounded border p-1.5 transition-colors disabled:opacity-60",
                            n.is_pinned ? "border-cta/40 bg-cta/10 text-cta" : "text-muted-fg-faint hover:text-ink",
                          )}
                        >
                          <Pin className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => setNoticeVisibility(n.id, !n.is_visible), n.is_visible ? "비공개로 전환했습니다." : "공개로 전환했습니다.")}
                          aria-label={n.is_visible ? "비공개로 전환" : "공개로 전환"}
                          aria-pressed={n.is_visible}
                          className={cn(
                            "border-rule rounded border p-1.5 transition-colors disabled:opacity-60",
                            n.is_visible ? "border-accent-blue/40 bg-accent-blue-soft text-accent-blue-ink" : "text-muted-fg-faint hover:text-ink",
                          )}
                        >
                          <Eye className="size-3.5" />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-ink truncate text-sm font-semibold">
                          {n.is_pinned && <span className="bg-cta/10 text-cta mr-1.5 rounded-full px-1.5 py-0.5 text-xs font-bold">고정</span>}
                          {!n.is_visible && <span className="bg-surface text-muted-fg mr-1.5 rounded-full px-1.5 py-0.5 text-xs font-bold">비공개</span>}
                          {scheduled && <span className="mr-1.5 rounded-full bg-[#FFF7E6] px-1.5 py-0.5 text-xs font-bold text-[#B97400]">예약</span>}
                          {n.title}
                        </p>
                        <p className="text-muted-fg-faint truncate text-xs">
                          {kstDateTimeText(n.published_at)} · 조회 {n.view_count.toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button type="button" onClick={() => startEdit(n)} className="border-rule text-muted-fg rounded border px-2.5 py-1 text-xs">
                          수정
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setDeleteTarget(n)}
                          className="border-rule text-brand rounded border px-2.5 py-1 text-xs disabled:opacity-60"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 공지를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-ink font-bold">{deleteTarget?.title}</span> 공지가 영구 삭제되며 되돌릴 수 없습니다.
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  className?: string;
}) {
  const cls = "border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none";
  return (
    <div className={className}>
      <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={5} className={cls} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}
