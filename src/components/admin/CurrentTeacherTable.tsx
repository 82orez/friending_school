"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { nationalityLabel } from "@/data/nationalities";
import { genderLabelKo } from "@/data/genders";
import type { CurrentTeacher } from "@/components/admin/TeacherRequestsManager";

type SortKey = "name" | "center" | "nationality" | "gender";

// 정렬 비교값은 원본 값 기준(국기 이모지·라벨이 순서에 영향 주지 않도록).
const SORT_VALUE: Record<SortKey, (t: CurrentTeacher) => string> = {
  name: (t) => t.name || t.email,
  center: (t) => t.centerName ?? "",
  nationality: (t) => t.nationality ?? "",
  gender: (t) => t.gender ?? "",
};

export default function CurrentTeacherTable({
  teachers,
  onView,
  onDelete,
  deleting,
  className,
}: {
  teachers: CurrentTeacher[];
  onView: (t: CurrentTeacher) => void;
  onDelete?: (t: CurrentTeacher) => void;
  deleting?: boolean;
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const toggleSort = (key: SortKey) => setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const sortedTeachers = useMemo(() => {
    if (!sort) return teachers;
    const val = (t: CurrentTeacher) => SORT_VALUE[sort.key](t).trim();
    return [...teachers].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      // 빈 값은 항상 마지막으로.
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      const cmp = av.localeCompare(bv, "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [teachers, sort]);

  return (
    <div className={cn("border-rule overflow-x-auto rounded-xl border bg-white", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-rule bg-surface text-muted-fg-faint border-b text-left text-xs font-semibold">
            <SortHeader label="이름" sortKey="name" sort={sort} onSort={toggleSort} className="px-4 py-2.5 md:px-6" />
            <SortHeader label="센터" sortKey="center" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <SortHeader label="국적" sortKey="nationality" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <SortHeader label="성별" sortKey="gender" sort={sort} onSort={toggleSort} className="px-4 py-2.5" />
            <th className="px-4 py-2.5 text-right md:px-6">
              <span className="sr-only">관리</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTeachers.map((t) => (
            <tr key={t.id} className="border-rule border-b last:border-b-0">
              <td className="px-4 py-3.5 align-middle md:px-6">
                <p className="text-ink font-bold">{t.name || t.email}</p>
                {t.name && <p className="text-muted-fg text-xs">{t.email}</p>}
              </td>
              <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">{t.centerName ?? "None"}</td>
              <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">{nationalityLabel(t.nationality)}</td>
              <td className="text-ink px-4 py-3.5 align-middle whitespace-nowrap">{genderLabelKo(t.gender)}</td>
              <td className="px-4 py-3.5 align-middle md:px-6">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onView(t)}
                    className="border-rule text-muted-fg hover:bg-surface shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors"
                  >
                    정보 보기
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(t)}
                      disabled={deleting}
                      className="border-brand/40 text-brand hover:bg-brand/5 shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60"
                    >
                      강사 삭제
                    </button>
                  )}
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
