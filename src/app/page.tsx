import Image from "next/image";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { todayKst } from "@/lib/booking";
import { kstDateMinToMs } from "@/lib/classtime";
import { seatHeld } from "@/lib/room-time";
import { isPrepApplyOpen, prepChargeKrw, prepRemainingSessions } from "@/lib/prep";
import SuccessBanner from "@/components/SuccessBanner";
import HeroBubbles from "@/components/HeroBubbles";
import { seriesKeyOf } from "@/lib/room-series";
import FriendingRooms, { type HostProfile, type PublicRoomSeries, type PublicRoomSession } from "@/components/friending/FriendingRooms";
import PrepEnrollBanner, { type OpenPrepCourse } from "@/components/prep/PrepEnrollBanner";

type RoomRow = {
  id: string;
  series_id: string | null;
  friender_id: string;
  friender_name: string | null;
  friender_nickname: string | null;
  title: string;
  description: string | null;
  level: string;
  capacity: number;
  topic: string | null;
  session_date: string;
  start_min: number;
  duration_min: number;
};

const ROOM_COLUMNS =
  "id, series_id, friender_id, friender_name, friender_nickname, title, description, level, capacity, topic, session_date, start_min, duration_min";

type ProfileRow = {
  id: string;
  avatar_url: string | null;
  nickname: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  nationality: string | null;
  gender: string | null;
};

export default async function Home({ searchParams }: { searchParams: Promise<{ reset?: string; verified?: string; signup?: string }> }) {
  // 비밀번호 재설정·이메일 인증 완료는 `/?reset=success`·`/?verified=success`로 돌아온다
  // (reset-password/actions.ts · AuthHashHandler) — 배너는 홈이 소유한다.
  const { reset, verified, signup } = await searchParams;
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 공개 조회 — RLS friender_rooms_select_public이 anon에도 열려 있다.
  // ⚠️ **2단계로 읽는다**: ① 아직 끝나지 않은 회차로 '살아 있는 시리즈'를 가려내고
  //    ② 그 시리즈의 **전 회차**(지난 회차 포함)를 다시 읽는다. 상세 모달이 커리큘럼을 통째로
  //    보여주고, 회차 번호(n/N)의 분모도 전체 회차라야 맞기 때문이다.
  const { data } = await supabase
    .from("friender_rooms")
    .select(ROOM_COLUMNS)
    .gte("session_date", todayKst())
    .order("session_date", { ascending: true })
    .order("start_min", { ascending: true });

  // 오늘이지만 이미 끝난 방은 SQL로 못 거른다(날짜 단위 필터) → 종료 시각 기준 JS 필터.
  const now = Date.now();
  const liveRows = ((data ?? []) as RoomRow[]).filter((r) => kstDateMinToMs(r.session_date, r.start_min + r.duration_min) > now);

  const byId = new Map<string, RoomRow>(liveRows.map((r) => [r.id, r]));
  // series_id가 null인 행(전환 이전 단발 방)은 이미 전부 들어와 있다 — 보충할 것이 없다.
  const liveSeriesIds = Array.from(new Set(liveRows.map((r) => r.series_id).filter((v): v is string => !!v)));
  if (liveSeriesIds.length > 0) {
    const { data: full } = await supabase.from("friender_rooms").select(ROOM_COLUMNS).in("series_id", liveSeriesIds);
    for (const r of (full ?? []) as RoomRow[]) byId.set(r.id, r);
  }
  const rows = Array.from(byId.values()).sort((a, b) => a.session_date.localeCompare(b.session_date) || a.start_min - b.start_min);

  // ── 샤우팅 강좌(수강신청 배너) ──────────────────────────────────────────
  // ⚠️ 연습방보다 **먼저** 조회한다 — 아래 profiles 배치 조회가 방 개설자와 강좌 프렌더를
  //    한 번의 .in()으로 함께 읽기 때문이다(카드·상세 모달이 아바타·소개를 쓴다).
  // 공개 조회 — RLS prep_courses_select_public이 '승인'만 통과시킨다(비로그인 포함).
  // ⚠️ 마이그레이션 적용 전에는 테이블·정책이 없어 에러가 나지만, data가 null이 되어
  //    배너가 렌더되지 않을 뿐이다(페이지는 죽지 않는다). 이 성질을 일부러 유지한다.
  const { data: prepData } = await supabase
    .from("prep_courses")
    .select(
      "id, friender_id, title, description, friender_name, friender_nickname, level, capacity, start_min, duration_min, price_krw, prep_sessions(session_no, session_date, topic)",
    )
    .eq("status", "승인");

  type PrepRow = {
    id: string;
    friender_id: string;
    title: string;
    description: string | null;
    friender_name: string | null;
    friender_nickname: string | null;
    level: string;
    capacity: number;
    start_min: number;
    duration_min: number;
    price_krw: number;
    prep_sessions: { session_no: number; session_date: string; topic: string | null }[] | null;
  };

  // 중도 신청 — 시작된 강좌도 **남은 회차가 있으면** 계속 받는다(RPC의 ended 판정과 같은 기준).
  // 잔여 회차·청구액 계산은 src/lib/prep.ts가 소유한다(RPC와 같은 공식).
  const prepRows = ((prepData ?? []) as unknown as PrepRow[])
    .map((c) => {
      // 커리큘럼 탭이 회차 번호 순으로 읽으므로 여기서 한 번만 정렬해 둔다.
      const sessions = (c.prep_sessions ?? []).slice().sort((a, b) => a.session_no - b.session_no);
      const dates = sessions.map((s) => s.session_date).sort();
      return { ...c, sessions, dates, remaining: prepRemainingSessions(dates, c.start_min, c.duration_min) };
    })
    .filter((c) => c.remaining.length > 0)
    .sort((a, b) => a.remaining[0].localeCompare(b.remaining[0]));

  // 참여 인원 집계 — 참가자 RLS는 select_own뿐이라 카운트는 service_role로 센다
  // (참가자 신원은 공개하지 않고 숫자만 노출).
  const countByRoom = new Map<string, number>();
  // 개설자 프로필 — profiles_select_own RLS로 공개 조회가 막혀 있어 service_role로 읽는다.
  // 스냅샷 컬럼을 두지 않고 매 요청 조회하는 이유: ① 사진·소개 수정이 즉시 반영돼야 하고
  // ② cleanupOldAvatars가 옛 파일을 지워 스냅샷 avatar URL은 깨진다.
  // 방마다 중복 직렬화되지 않도록 friender_id 기준 맵으로 모아 별도 prop으로 넘긴다.
  // ⚠️ 방이 없어도 강좌가 있으면 프로필을 읽어야 한다(강좌 카드의 아바타·프렌더 소개).
  const hosts: Record<string, HostProfile> = {};
  if (rows.length > 0 || prepRows.length > 0) {
    const admin = createAdminClient();

    const { data: parts } = await admin
      .from("friender_room_participants")
      .select("room_id, entered_at")
      .in(
        "room_id",
        rows.map((r) => r.id),
      );
    // 노쇼(시작 + 유예까지 미입장)는 자리를 반환한 것으로 보고 카운트에서 뺀다.
    const startMsByRoom = new Map(rows.map((r) => [r.id, kstDateMinToMs(r.session_date, r.start_min)]));
    for (const p of (parts ?? []) as { room_id: string; entered_at: string | null }[]) {
      if (!seatHeld(p.entered_at, startMsByRoom.get(p.room_id) ?? 0, now)) continue;
      countByRoom.set(p.room_id, (countByRoom.get(p.room_id) ?? 0) + 1);
    }

    // ⚠️ email·phone·zoom_url은 의도적으로 select하지 않는다 — 공개 페이지라
    //    HTML 페이로드에 남기지 않기 위함. 특히 zoom_url은 방 입장의 사실상 열쇠다.
    const { data: profs } = await admin
      .from("profiles")
      .select("id, avatar_url, nickname, first_name, last_name, bio, nationality, gender")
      // 방 개설자 + 강좌 프렌더를 한 번에 — 같은 사람이 둘 다 하는 경우가 흔하다.
      .in("id", Array.from(new Set([...rows.map((r) => r.friender_id), ...prepRows.map((c) => c.friender_id)])));
    for (const p of (profs ?? []) as ProfileRow[]) {
      hosts[p.id] = {
        // 표시명 규칙: 닉네임 > 성+이름(공백 없이) > "프렌더".
        name: p.nickname?.trim() || `${p.last_name ?? ""}${p.first_name ?? ""}`.trim() || "프렌더",
        realName: `${p.last_name ?? ""}${p.first_name ?? ""}`.trim() || null,
        avatarUrl: p.avatar_url?.trim() || null,
        nationality: p.nationality,
        gender: p.gender,
        bio: p.bio,
      };
    }
  }

  // 내 참여 여부 + 내 입장 시각 — 본인 세션 client(RLS select_own).
  // ⚠️ entered_at까지 읽는 이유: 카드 CTA가 "노쇼면 예약 취소를 감춘다"를 판정해야 하는데
  //    그 판정은 본인 참가 행 없이는 불가능하다(/mypage/rooms의 같은 규칙과 한 쌍).
  // ⚠️ service_role로 바꾸지 말 것 — 남의 entered_at은 공개 페이지 페이로드에 실리면 안 된다.
  const enteredAtByRoom = new Map<string, string | null>();
  if (user && rows.length > 0) {
    const { data: mine } = await supabase.from("friender_room_participants").select("room_id, entered_at").eq("user_id", user.id);
    for (const m of (mine ?? []) as { room_id: string; entered_at: string | null }[]) enteredAtByRoom.set(m.room_id, m.entered_at);
  }

  // 신청자 수는 신청자 RLS(select_own) 때문에 세션 client로 못 읽는다 → 카운트만 service_role
  // (연습방 참여 인원과 같은 방식·같은 이유. 신원은 노출하지 않는다).
  const prepCountByCourse = new Map<string, number>();
  const myPrep = new Map<string, "입금대기" | "수강확정">();
  if (prepRows.length > 0) {
    const ids = prepRows.map((c) => c.id);
    const { data: counts } = await createAdminClient()
      .from("prep_enrollments")
      .select("course_id, status")
      .in("course_id", ids)
      .neq("status", "취소");
    for (const row of (counts ?? []) as { course_id: string; status: string }[]) {
      prepCountByCourse.set(row.course_id, (prepCountByCourse.get(row.course_id) ?? 0) + 1);
    }
    if (user) {
      const { data: mine } = await supabase.from("prep_enrollments").select("course_id, status").in("course_id", ids).neq("status", "취소");
      for (const m of (mine ?? []) as { course_id: string; status: "입금대기" | "수강확정" }[]) myPrep.set(m.course_id, m.status);
    }
  }

  const prepCourses: OpenPrepCourse[] = prepRows.map((c) => ({
    id: c.id,
    frienderId: c.friender_id,
    title: c.title,
    description: c.description,
    // hosts 조회가 실패했거나 프렌더가 방금 탈퇴한 경우의 폴백.
    // ⚠️ 공개 화면은 **닉네임 우선**이다(연습방 카드와 같은 규칙) — 본명 우선은 admin 화면의 규칙.
    frienderName: c.friender_nickname?.trim() || c.friender_name?.trim() || "프렌더",
    level: c.level,
    capacity: c.capacity,
    startMin: c.start_min,
    durationMin: c.duration_min,
    priceKrw: c.price_krw,
    sessionCount: c.dates.length,
    // 커리큘럼(주 단위) 탭용 — 회차 번호·날짜·주제. topic은 초안 단계 강좌에서 비어 있을 수 있다.
    sessions: c.sessions.map((s) => ({ no: s.session_no, date: s.session_date, topic: s.topic })),
    firstDate: c.dates[0],
    lastDate: c.dates[c.dates.length - 1],
    // 잔여(=실제로 사게 되는 것). 시작 전 강좌는 잔여 = 전체라 청구액도 정가 그대로다.
    remainingCount: c.remaining.length,
    remainingFirstDate: c.remaining[0],
    chargeKrw: prepChargeKrw(c.price_krw, c.dates.length, c.remaining.length),
    enrolled: prepCountByCourse.get(c.id) ?? 0,
    myStatus: myPrep.get(c.id) ?? null,
  }));

  // 신청 자격(휴대폰 인증 + 성·이름·영어 이름)에서 빠진 항목 — 모달에서 미리 안내한다.
  // ⚠️ 서버 RPC(join_prep_course)가 authoritative고 여기는 사전 안내 레이어일 뿐이다.
  const profileMissing: string[] = [];
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("phone_verified_at, first_name, last_name, english_name")
      .eq("id", user.id)
      .maybeSingle();
    const p = (prof ?? {}) as {
      phone_verified_at?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      english_name?: string | null;
    };
    if (!p.phone_verified_at) profileMissing.push("휴대폰 인증");
    if (!p.last_name?.trim() || !p.first_name?.trim()) profileMissing.push("성·이름");
    if (!p.english_name?.trim()) profileMissing.push("영어 이름");
  }

  // 회차를 시리즈로 묶는다 — 전환 이전 단발 방은 series_id가 null이라 자기 id가 곧 키(1회차 시리즈).
  // ⚠️ 공통값(이름·소개·난이도·정원)은 **마지막 회차**를 대표로 쓴다: 시리즈 일괄 수정이 아직
  //    시작하지 않은 회차에만 반영되므로, 지난 회차에는 옛 이름이 남아 있을 수 있다.
  const bySeries = new Map<string, { row: RoomRow; sessions: PublicRoomSession[] }>();
  for (const r of rows) {
    const session: PublicRoomSession = {
      id: r.id,
      sessionDate: r.session_date,
      startMin: r.start_min,
      durationMin: r.duration_min,
      topic: r.topic,
      participants: countByRoom.get(r.id) ?? 0,
      joined: enteredAtByRoom.has(r.id),
      enteredAt: enteredAtByRoom.get(r.id) ?? null,
    };
    const key = seriesKeyOf(r);
    const found = bySeries.get(key);
    if (found) {
      found.sessions.push(session);
      found.row = r; // rows가 날짜 오름차순이라 마지막 회차가 남는다
    } else {
      bySeries.set(key, { row: r, sessions: [session] });
    }
  }

  const series: PublicRoomSeries[] = Array.from(bySeries.entries())
    .map(([key, { row, sessions }]) => ({
      key,
      frienderId: row.friender_id,
      // 프로필 조회가 실패했거나 방금 탈퇴한 경우를 대비한 폴백 — 방 행의 이름 스냅샷을 쓴다.
      fallbackName: row.friender_nickname?.trim() || row.friender_name?.trim() || "프렌더",
      isMine: !!user && row.friender_id === user.id,
      title: row.title,
      description: row.description,
      level: row.level,
      capacity: row.capacity,
      sessions,
    }))
    // 가장 가까운 '남은 회차'가 이른 시리즈부터 — 카드 순서가 곧 임박 순이다.
    .sort((a, b) => {
      const nextOf = (x: PublicRoomSeries) =>
        x.sessions.find((s) => kstDateMinToMs(s.sessionDate, s.startMin + s.durationMin) > now)?.sessionDate ?? "9999-12-31";
      return nextOf(a).localeCompare(nextOf(b));
    });

  // 샤우팅 배너 노출 조건 = PrepEnrollBanner의 자체 가드(courses.length === 0 → null)와 같은 값.
  // 히어로·구분선이 배너와 어긋나지 않도록 한 곳에서 뽑아 쓴다.
  const showPrepBanner = prepCourses.length > 0;

  return (
    <div className="bg-surface">
      {reset === "success" && <SuccessBanner queryKey="reset" message="비밀번호가 성공적으로 변경되었습니다." />}
      {verified === "success" && <SuccessBanner queryKey="verified" message="이메일 인증이 완료되어 자동으로 로그인되었습니다." />}
      {signup === "success" && <SuccessBanner queryKey="signup" message="프렌딩 스쿨에 오신 것을 환영합니다." />}

      <div className="mx-auto max-w-[1100px] px-5 py-8 md:py-12">
        {/* 히어로 — v9 목업(mainhero_bg01) 이식. 이미지 위에 어둡게 깔고 카피를 올린다.
            ⚠️ **샤우팅 배너가 없을 때만** 보여 준다: 둘 다 전폭 다크 비주얼이라 함께 두면 첫 화면이
            배너 두 장으로 채워져 정작 강좌·연습방 목록이 접힌다. 배너가 있으면 그것이 페이지 헤더 역할을 한다. */}
        {!showPrepBanner && (
          <section className="relative isolate flex min-h-[140px] items-center justify-center overflow-hidden rounded-2xl md:min-h-[190px]">
            <Image src="/images/friending-hero.jpg" alt="" fill sizes="(max-width: 1100px) 100vw, 1100px" priority className="-z-10 object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-black/45" />
            {/* 말풍선 장식 — 목업 SVG 이식. 샤우팅 배너 히어로와 공용(`HeroBubbles`). */}
            <HeroBubbles className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full md:block" />

            <div className="px-5 py-8 text-center md:px-16">
              <p className="text-[12px] font-bold text-white/95 md:text-[15px]">친구와 친구가 만나 배우는, 프렌딩 스쿨</p>
              <h1 className="mt-1.5 text-[22px] font-bold tracking-[-0.04em] text-white md:mt-2 md:text-[34px]">
                스피킹은, <span className="underline decoration-white/60 underline-offset-[6px]">말한 만큼</span> 늘어요
              </h1>
            </div>
          </section>
        )}

        {/* 접수 시간창(KST 11:00~19:00)은 서버에서 계산해 초기값으로 넘긴다 — 배너가 1분 틱으로 갱신하되
            첫 렌더 값이 서버·클라에서 갈리면 hydration mismatch가 난다. */}
        <PrepEnrollBanner
          courses={prepCourses}
          hosts={hosts}
          isLoggedIn={!!user}
          profileMissing={profileMissing}
          applyOpenInitial={isPrepApplyOpen()}
        />

        {/* 유료 샤우팅 신청과 무료 연습방은 성격이 다른 영역이라 구분선으로 나눈다.
            ⚠️ 배너가 없으면(신청 가능한 강좌 0개) 히어로 바로 아래에 선만 남으므로 함께 숨긴다. */}
        {showPrepBanner && <div aria-hidden className="border-rule mt-8 border-t" />}

        <FriendingRooms series={series} hosts={hosts} isLoggedIn={!!user} />
      </div>
    </div>
  );
}
