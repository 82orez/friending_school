"use client";

import { useMemo, useState } from "react";
import CurrentTeacherTable from "@/components/admin/CurrentTeacherTable";
import TeacherInfoModal from "@/components/admin/TeacherInfoModal";
import TeacherClassesModal from "@/components/admin/TeacherClassesModal";
import type { CurrentTeacher } from "@/components/admin/TeacherRequestsManager";

// 센터 매니저 '강사 관리' 탭 — admin 강사 관리 컴포넌트 재사용(읽기 전용).
export default function CenterTeachers({ teachers, centers }: { teachers: CurrentTeacher[]; centers: { id: string; name: string }[] }) {
  const [infoTarget, setInfoTarget] = useState<CurrentTeacher | null>(null);
  const [classesTarget, setClassesTarget] = useState<CurrentTeacher | null>(null);

  // TeacherInfoModal(readOnly)은 센터명 표시에만 centers를 쓰므로 최소 형태로 매핑.
  const centerOpts = useMemo(() => centers.map((c) => ({ id: c.id, name: c.name, price: null, currency: null })), [centers]);

  return (
    <div>
      <h2 className="text-ink mb-3 text-lg font-bold">Center teachers</h2>
      {teachers.length === 0 ? (
        <p className="text-muted-fg-faint py-10 text-center text-sm">No teachers are registered at your center.</p>
      ) : (
        <CurrentTeacherTable teachers={teachers} onView={setInfoTarget} onViewClasses={setClassesTarget} />
      )}

      <TeacherInfoModal teacher={infoTarget} centers={centerOpts} rows={[]} rates={{}} readOnly onClose={() => setInfoTarget(null)} />
      <TeacherClassesModal teacher={classesTarget} onClose={() => setClassesTarget(null)} />
    </div>
  );
}
