import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { todayKst } from "@/lib/booking";
import { kstDateMinToMs } from "@/lib/classtime";
import FriendingRooms, { type PublicRoom } from "@/components/friending/FriendingRooms";

export const metadata: Metadata = { title: "프렌딩 — 프렌딩 스쿨" };

type RoomRow = {
  id: string;
  friender_id: string;
  friender_name: string | null;
  friender_nickname: string | null;
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  session_date: string;
  start_min: number;
  duration_min: number;
};

export default async function FriendingPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 공개 조회 — RLS friender_rooms_select_public이 anon에도 열려 있다.
  // .eq("is_visible")는 정책과 중복이지만 랜딩 youtube 쿼리와 같은 belt-and-braces 컨벤션.
  const { data } = await supabase
    .from("friender_rooms")
    .select("id, friender_id, friender_name, friender_nickname, title, description, level, capacity, session_date, start_min, duration_min")
    .eq("is_visible", true)
    .gte("session_date", todayKst())
    .order("session_date", { ascending: true })
    .order("start_min", { ascending: true });

  // 오늘이지만 이미 끝난 방은 SQL로 못 거른다(날짜 단위 필터) → 종료 시각 기준 JS 필터.
  const now = Date.now();
  const rows = ((data ?? []) as RoomRow[]).filter((r) => kstDateMinToMs(r.session_date, r.start_min + r.duration_min) > now);

  // 참여 인원 집계 — 참가자 RLS는 select_own뿐이라 카운트는 service_role로 센다
  // (참가자 신원은 공개하지 않고 숫자만 노출).
  const countByRoom = new Map<string, number>();
  if (rows.length > 0) {
    const admin = createAdminClient();
    const { data: parts } = await admin
      .from("friender_room_participants")
      .select("room_id")
      .in(
        "room_id",
        rows.map((r) => r.id),
      );
    for (const p of (parts ?? []) as { room_id: string }[]) {
      countByRoom.set(p.room_id, (countByRoom.get(p.room_id) ?? 0) + 1);
    }
  }

  // 내 참여 여부 — 본인 세션 client(RLS select_own).
  const joined = new Set<string>();
  if (user && rows.length > 0) {
    const { data: mine } = await supabase.from("friender_room_participants").select("room_id").eq("user_id", user.id);
    for (const m of (mine ?? []) as { room_id: string }[]) joined.add(m.room_id);
  }

  const rooms: PublicRoom[] = rows.map((r) => ({
    id: r.id,
    hostName: r.friender_nickname?.trim() || r.friender_name?.trim() || "프렌더",
    isMine: !!user && r.friender_id === user.id,
    title: r.title,
    description: r.description,
    level: r.level,
    capacity: r.capacity,
    sessionDate: r.session_date,
    startMin: r.start_min,
    durationMin: r.duration_min,
    participants: countByRoom.get(r.id) ?? 0,
    joined: joined.has(r.id),
  }));

  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-[1100px] px-5 py-8 md:py-12">
        {/* 히어로 — v9 목업(mainhero_bg01) 이식. 이미지 위에 어둡게 깔고 카피를 올린다. */}
        <section className="relative isolate flex min-h-[140px] items-center justify-center overflow-hidden rounded-2xl md:min-h-[190px]">
          <Image src="/images/friending-hero.jpg" alt="" fill sizes="(max-width: 1100px) 100vw, 1100px" priority className="-z-10 object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-black/45" />
          {/* 말풍선 장식 — 목업 SVG 이식(비율 무시하고 늘려 배경처럼 깔림) */}
          <svg
            aria-hidden
            viewBox="0 0 1200 300"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full md:block">
            <rect x="60" y="40" width="130" height="80" rx="24" fill="rgba(255,255,255,0.16)" />
            <path d="M90 118 L78 142 L112 120 Z" fill="rgba(255,255,255,0.16)" />
            <rect x="1000" y="170" width="110" height="70" rx="22" fill="rgba(255,255,255,0.14)" />
            <path d="M1030 238 L1042 260 L1072 240 Z" fill="rgba(255,255,255,0.14)" />
            <rect x="960" y="30" width="80" height="52" rx="18" fill="rgba(255,255,255,0.1)" />
            <path d="M980 80 L972 98 L998 82 Z" fill="rgba(255,255,255,0.1)" />
            <rect x="40" y="200" width="70" height="46" rx="16" fill="rgba(255,255,255,0.1)" />
            <path d="M58 244 L50 262 L76 246 Z" fill="rgba(255,255,255,0.1)" />
          </svg>

          <div className="px-5 py-8 text-center md:px-16">
            <p className="text-[12px] font-bold text-white/95 md:text-[15px]">친구와 친구가 만나 배우는, 프렌딩 스쿨</p>
            <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.04em] text-white md:mt-2 md:text-[34px]">
              스피킹은, <span className="underline decoration-white/60 underline-offset-[6px]">말한 만큼</span> 늘어요
            </h1>
          </div>
        </section>

        <FriendingRooms rooms={rooms} isLoggedIn={!!user} />
      </div>
    </div>
  );
}
