"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addCenter, deleteCenter, updateCenter } from "@/app/admin/actions";
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

export type AdminCenter = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

// 강사 신청폼·프로필의 센터 드롭다운을 채우는 마스터 데이터. YoutubeManager CRUD 패턴 축약(필드=name 1개).
export default function CentersManager({ centers }: { centers: AdminCenter[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminCenter | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else {
        toast.error(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const startEdit = (c: AdminCenter) => {
    setEditingId(c.id);
    setEditName(c.name);
  };

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">센터 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">
        강사 신청·프로필에서 선택하는 센터 목록을 관리합니다. 센터를 삭제하면 해당 강사는 자동으로 미지정(None)됩니다.
      </p>

      {/* 등록 폼 */}
      <div className="border-rule mt-5 rounded-xl border bg-white p-5">
        <p className="text-ink mb-3 text-base font-bold">새 센터 추가</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">센터 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: Lani, Sebu"
              maxLength={100}
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
            />
          </div>
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              run(
                () => addCenter(name),
                () => setName(""),
              )
            }
            className="bg-ink inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            추가하기
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div className="border-rule mt-5 overflow-hidden rounded-xl border bg-white">
        {centers.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">등록된 센터가 없습니다.</p>
        ) : (
          <ul className="list-none">
            {centers.map((c, i) => (
              <li key={c.id} className="border-rule border-b p-4 last:border-b-0 md:px-6">
                {editingId === c.id ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={100}
                      className="border-rule-faint focus:border-accent-blue flex-1 rounded-md border bg-white px-3 py-2 text-sm outline-none"
                    />
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={pending || !editName.trim()}
                        onClick={() =>
                          run(
                            () => updateCenter(c.id, editName),
                            () => setEditingId(null),
                          )
                        }
                        className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {pending && <Loader2 className="size-3.5 animate-spin" />}
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="border-rule text-muted-fg h-9 rounded-md border px-4 text-sm font-medium"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-muted-fg-faint w-6 shrink-0 text-center text-xs">{i + 1}</span>
                    <p className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</p>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => startEdit(c)} className="border-rule text-muted-fg rounded border px-2.5 py-1 text-xs">
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setDeleteTarget(c)}
                        className="border-rule text-brand rounded border px-2.5 py-1 text-xs disabled:opacity-60"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>센터를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="text-ink font-semibold">{deleteTarget.name}</span> 센터를 삭제합니다. 이 센터로 지정된 강사는 자동으로
                  미지정(None)으로 바뀝니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = deleteTarget;
                setDeleteTarget(null);
                if (target) run(() => deleteCenter(target.id));
              }}
              variant="brand"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
