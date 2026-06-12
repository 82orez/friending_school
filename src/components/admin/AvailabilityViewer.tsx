"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import AvailabilityGrid from "@/components/teacher/AvailabilityGrid";
import { cn } from "@/lib/utils";

export type TeacherAvailability = {
  id: string;
  name: string;
  email: string;
  slots: { day: number; min: number }[];
};

export default function AvailabilityViewer({ teachers }: { teachers: TeacherAvailability[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(teachers[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q));
  }, [teachers, query]);

  const selected = teachers.find((t) => t.id === selectedId) ?? null;

  return (
    <div>
      <h1 className="text-ink text-2xl font-extrabold">강사 시간표</h1>
      <p className="text-muted-fg mt-1 text-sm">강사별 주간 가능 시간입니다.</p>

      {teachers.length === 0 ? (
        <p className="text-muted-fg border-rule mt-5 rounded-xl border bg-white px-6 py-12 text-center text-sm">등록된 강사가 없습니다.</p>
      ) : (
        <>
          <div className="border-rule mt-5 flex items-center gap-2 rounded-lg border bg-white px-3">
            <Search className="text-muted-fg-faint size-4" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="강사 이름·이메일 검색..."
              className="h-10 flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {filtered.map((t) => {
              const active = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-ink border-ink text-white" : "border-rule text-muted-fg hover:border-accent-blue hover:text-accent-blue-ink bg-white",
                  )}>
                  {t.name}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="text-muted-fg py-2 text-sm">검색 결과가 없습니다.</p>}
          </div>

          {selected && (
            <div className="border-rule mt-4 rounded-2xl border bg-white p-6">
              <p className="text-ink font-bold">{selected.name}</p>
              {selected.email && <p className="text-muted-fg-faint text-xs">{selected.email}</p>}
              <div className="mt-4">
                <AvailabilityGrid initialSlots={selected.slots} readOnly />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
