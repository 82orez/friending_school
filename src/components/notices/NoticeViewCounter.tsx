"use client";

import { useEffect, useRef } from "react";
import { recordNoticeView } from "@/app/notices/actions";

// 공지 상세 진입 시 조회수 1회 기록(렌더 결과 없음). StrictMode 이중 실행 방지용 ref 가드.
export default function NoticeViewCounter({ id }: { id: string }) {
  const doneRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id || doneRef.current === id) return;
    doneRef.current = id;
    void recordNoticeView(id);
  }, [id]);

  return null;
}
