"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { addYoutubeVideo, deleteYoutubeVideo, setYoutubeVisibility, updateYoutubeVideo } from "@/app/admin/actions";

export type AdminVideo = {
  id: string;
  tag: string;
  url: string;
  title: string;
  description: string;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
};

type Fields = { tag: string; url: string; title: string; description: string };
const EMPTY: Fields = { tag: "", url: "", title: "", description: "" };

export default function YoutubeManager({ videos }: { videos: AdminVideo[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Fields>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Fields>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else {
        setError(res.error ?? "오류가 발생했습니다.");
      }
    });
  };

  const startEdit = (v: AdminVideo) => {
    setEditingId(v.id);
    setEditFields({ tag: v.tag, url: v.url, title: v.title, description: v.description });
  };

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">유튜브 관리</h1>
      <p className="text-muted-fg mt-1 text-sm">영상을 등록하고 노출 여부를 관리합니다.</p>

      {error && (
        <p role="alert" className="border-brand/30 bg-brand/5 text-brand mt-4 rounded-md border px-3.5 py-2.5 text-sm font-medium">
          {error}
        </p>
      )}

      {/* 등록 폼 */}
      <div className="border-rule mt-5 rounded-xl border bg-white p-5">
        <p className="text-ink mb-3 text-base font-bold">새 영상 등록</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="구분 라벨" value={form.tag} onChange={(v) => setForm({ ...form, tag: v })} placeholder="예: 일자리, 숙소" />
          <Field label="유튜브 URL" value={form.url} onChange={(v) => setForm({ ...form, url: v })} placeholder="https://youtube.com/..." />
        </div>
        <Field className="mt-3" label="영상 제목" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="영상 제목" />
        <Field
          className="mt-3"
          label="내용 설명"
          value={form.description}
          onChange={(v) => setForm({ ...form, description: v })}
          placeholder="영상 설명"
          textarea
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => addYoutubeVideo(form),
              () => setForm(EMPTY),
            )
          }
          className="bg-ink mt-4 inline-flex h-10 items-center gap-1.5 rounded-md px-5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          등록하기
        </button>
      </div>

      {/* 목록 */}
      <div className="border-rule mt-5 overflow-hidden rounded-xl border bg-white">
        {videos.length === 0 ? (
          <p className="text-muted-fg px-6 py-12 text-center text-sm">등록된 영상이 없습니다.</p>
        ) : (
          <ul className="list-none">
            {videos.map((v, i) => (
              <li key={v.id} className="border-rule border-b p-4 last:border-b-0 md:px-6">
                {editingId === v.id ? (
                  <div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="구분 라벨" value={editFields.tag} onChange={(val) => setEditFields({ ...editFields, tag: val })} />
                      <Field label="유튜브 URL" value={editFields.url} onChange={(val) => setEditFields({ ...editFields, url: val })} />
                    </div>
                    <Field
                      className="mt-3"
                      label="영상 제목"
                      value={editFields.title}
                      onChange={(val) => setEditFields({ ...editFields, title: val })}
                    />
                    <Field
                      className="mt-3"
                      label="내용 설명"
                      value={editFields.description}
                      onChange={(val) => setEditFields({ ...editFields, description: val })}
                      textarea
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => updateYoutubeVideo(v.id, editFields),
                            () => setEditingId(null),
                          )
                        }
                        className="bg-cta inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                        {pending && <Loader2 className="size-3.5 animate-spin" />}
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="border-rule text-muted-fg h-9 rounded-md border px-4 text-sm font-medium">
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-muted-fg-faint w-6 shrink-0 text-center text-xs">{i + 1}</span>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={v.is_visible}
                        disabled={pending}
                        onChange={(e) => run(() => setYoutubeVisibility(v.id, e.target.checked))}
                        className="size-4"
                      />
                      <span className="text-muted-fg-faint hidden sm:inline">노출</span>
                    </label>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink truncate text-sm font-semibold">
                        {v.tag && <span className="bg-accent-blue-soft text-accent-blue-ink mr-1.5 rounded-full px-1.5 py-0.5 text-xs">{v.tag}</span>}
                        {v.title}
                      </p>
                      <p className="text-muted-fg-faint truncate text-xs">{v.url}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => startEdit(v)} className="border-rule text-muted-fg rounded border px-2.5 py-1 text-xs">
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (confirm("이 영상을 삭제할까요?")) run(() => deleteYoutubeVideo(v.id));
                        }}
                        className="border-rule text-brand rounded border px-2.5 py-1 text-xs disabled:opacity-60">
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
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className={cls} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}
