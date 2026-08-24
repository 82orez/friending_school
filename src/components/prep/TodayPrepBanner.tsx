"use client";

import { useEffect, useState } from "react";
import { canEnterClass } from "@/lib/classtime";
import { fmtTime } from "@/lib/availability";
import { fmtRoomEnd } from "@/lib/room-time";
import { enterPrepSession } from "@/app/prep/session-actions";
import EnterZoomButton from "@/components/EnterZoomButton";

export type TodayPrepBannerItem = {
  id: string;
  courseTitle: string;
  sessionNo: number;
  total: number;
  topic: string | null;
  startMin: number;
  durationMin: number;
  startMs: number;
  endMs: number;
  isHost: boolean;
};

// 마이페이지 상단 '오늘 수업' 안내 — 어느 탭에 있든 보이도록 layout이 렌더한다.
// ⚠️ 오늘 수업이 없으면 layout이 아예 이 컴포넌트를 렌더하지 않는다(빈 자리를 남기지 않기 위해).
export default function TodayPrepBanner({ sessions }: { sessions: TodayPrepBannerItem[] }) {
  // 1분 틱 — 입장 시간창 진입이 새로고침 없이 반영된다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 이미 끝난 회차는 안내할 이유가 없다.
  const live = sessions.filter((s) => s.endMs >= now);
  if (live.length === 0) return null;

  return (
    <div className="border-accent-blue/30 bg-accent-blue-soft mb-5 rounded-2xl border px-5 py-4">
      <p className="text-accent-blue-ink text-xs font-extrabold">오늘 수업</p>
      <ul className="mt-2 list-none space-y-2">
        {live.map((s) => {
          const enterable = canEnterClass(now, s.startMs, s.endMs);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-ink shrink-0 text-sm font-bold">
                {fmtTime(s.startMin)}~{fmtRoomEnd(s.startMin + s.durationMin)}
              </span>
              <span className="text-ink min-w-0 flex-1 truncate text-sm">
                「{s.courseTitle}」 {s.sessionNo}/{s.total}강{s.topic?.trim() ? <span className="text-muted-fg"> · {s.topic}</span> : null}
                {s.isHost && <span className="text-muted-fg-faint text-xs"> (내 강좌)</span>}
              </span>
              {enterable ? (
                <EnterZoomButton
                  enter={() => enterPrepSession(s.id)}
                  withGuide={!s.isHost}
                  label="입장"
                  guideBody={<>Zoom으로 연결됩니다. 얼굴을 보이고 참여하는 것을 원칙으로 하며, 수업 중에는 마이크를 꺼 두었다가 말할 때 켜 주세요.</>}
                  className="bg-cta ml-auto shrink-0 rounded-md px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                />
              ) : (
                <span className="text-muted-fg-faint ml-auto shrink-0 text-xs">시작 15분 전 입장</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
