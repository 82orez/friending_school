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
  price_per_session: number | null;
};

// 강사 신청폼·프로필의 센터 드롭다운을 채우는 마스터 데이터. YoutubeManager CRUD 패턴 축약(필드=name 1개).
export default function CentersManager({ centers }: { centers: AdminCenter[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
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
    setEditPrice(c.price_per_session == null ? "" : String(c.price_per_session));
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
          <div className="sm:w-44">
            <label className="text-muted-fg-faint mb-1 block text-xs font-semibold">1회당 단가(원)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="예: 30000"
              className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
            />
          </div>
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              run(
                () => addCenter(name, price),
                () => {
                  setName("");
                  setPrice("");
                },
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
                  <th className="w-12 px-4 py-2.5 text-center md:px-6">#</th>
                  <th className="px-4 py-2.5">센터명</th>
                  <th className="px-4 py-2.5">회당 단가</th>
                  <th className="px-4 py-2.5 text-right md:px-6">
                    <span className="sr-only">관리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {centers.map((c, i) => (
                  <tr key={c.id} className="border-rule border-b last:border-b-0">
                    {editingId === c.id ? (
                      <>
                        <td className="text-muted-fg-faint px-4 py-3 text-center text-xs align-middle md:px-6">{i + 1}</td>
                        <td className="px-4 py-3 align-middle">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={100}
                            className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            placeholder="1회당 단가(원)"
                            className="border-rule-faint focus:border-accent-blue w-full rounded-md border bg-white px-3 py-2 text-sm outline-none sm:w-40"
                          />
                        </td>
                        <td className="px-4 py-3 align-middle md:px-6">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={pending || !editName.trim()}
                              onClick={() =>
                                run(
                                  () => updateCenter(c.id, editName, editPrice),
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
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="text-muted-fg-faint px-4 py-3.5 text-center text-xs align-middle md:px-6">{i + 1}</td>
                        <td className="text-ink px-4 py-3.5 align-middle text-sm font-semibold">{c.name}</td>
                        <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                          {c.price_per_session == null ? (
                            <span className="text-muted-fg-faint">단가 미설정</span>
                          ) : (
                            <span className="text-ink">{c.price_per_session.toLocaleString()}원</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-middle md:px-6">
                          <div className="flex justify-end gap-1.5">
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
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
