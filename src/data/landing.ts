// 랜딩 페이지("청년을 세계로") 표시용 데이터.
// ⚠️ presentational only — project0607 프로토타입(js/index.js)에서 이식. Phase 3(교재 5종 확장)에서
// 실제 교재 데이터(reading_progress.course)와 재조정 예정. 현재는 셀프디벨롭/과정카드/유튜브 UI 렌더용.

/* ===== 셀프 디벨롭 — 무료 교재 미리보기 ===== */

export type BookUnit = {
  n: string; // "Unit 01"
  t: string; // 영문 제목
  sub?: string; // 한글 부제
  s: "done" | "active" | "locked" | ""; // 상태
};

export type BookTag = { t: string; free?: boolean };

export type Book = {
  key: string;
  title: string;
  copy: string;
  tags: BookTag[];
  units: BookUnit[]; // 기본 노출(8개)
  extra: BookUnit[]; // "더보기"로 펼침
  exLabel: string;
};

export const BOOKS: Book[] = [
  {
    key: "workhol",
    title: "워홀 영어 — 현지에서 쓰는 생존 영어",
    copy: "워홀러 초보 생존 필수! 이건 꼭 알고 가세요!",
    tags: [{ t: "무료", free: true }, { t: "음성 포함" }, { t: "24유닛" }],
    units: [
      { n: "Unit 01", t: "Jun Buys a SIM Card", s: "done" },
      { n: "Unit 02", t: "Jun Starts English School", s: "done" },
      { n: "Unit 03", t: "Jun Meets International Friends", s: "active" },
      { n: "Unit 04", t: "Jun Opens a Bank Account", s: "" },
      { n: "Unit 05", t: "Jun Goes Grocery Shopping", s: "" },
      { n: "Unit 06", t: "Jun Uses Public Transportation", s: "" },
      { n: "Unit 07", t: "Jun Gets an Australian Driver's License", s: "" },
      { n: "Unit 08", t: "Jun Visits a Used Car Dealer", s: "" },
    ],
    extra: [
      { n: "Unit 09", t: "Jun Introduces Himself at Work", s: "" },
      { n: "Unit 10", t: "Jun Drops Off His Resume", s: "" },
      { n: "Unit 11", t: "Jun Has a Café Interview", s: "" },
      { n: "Unit 12", t: "Jun Has a Job Interview", s: "" },
      { n: "Unit 13", t: "Jun Has a Trial Shift", s: "" },
      { n: "Unit 14", t: "Jun Talks About His Work Experience", s: "" },
      { n: "Unit 15", t: "Jun Visits a Recruitment Agency", s: "" },
      { n: "Unit 16", t: "Jun Applies for a Farm Job", s: "" },
      { n: "Unit 17", t: "Jun Has a Farm Job Interview", s: "" },
      { n: "Unit 18", t: "Jun's First Day at Work", s: "" },
      { n: "Unit 19", t: "Jun Learns Workplace Instructions", s: "" },
      { n: "Unit 20", t: "Jun Works a Busy Shift", s: "" },
      { n: "Unit 21", t: "Jun Makes a Mistake at Work", s: "" },
      { n: "Unit 22", t: "Jun Talks With His Manager", s: "" },
      { n: "Unit 23", t: "Jun Talks With Coworkers", s: "" },
      { n: "Unit 24", t: "Jun Talks About His Pay", s: "" },
    ],
    exLabel: "유닛 전체 보기 (16개 더)",
  },
  {
    key: "kitchen",
    title: "주방 영어 — 식당 · 카페 · 주방 현장 실전",
    copy: "주방에서 바로 통하는 영어, 워홀러 필수!",
    tags: [{ t: "유료" }, { t: "음성 포함" }, { t: "24유닛" }],
    units: [
      { n: "Unit 01", t: "Mise en Place", sub: "준, 미장플라스를 익히다", s: "" },
      { n: "Unit 02", t: "Chopping & Cutting", sub: "준, 기본 칼질을 배우다", s: "" },
      { n: "Unit 03", t: "French Cutting Techniques", sub: "준, 프렌치 컷팅 기법을 익히다", s: "" },
      { n: "Unit 04", t: "Peeling & Tomato Concassé", sub: "준, 토마토 콘카세를 만들다", s: "" },
      { n: "Unit 05", t: "Frying & Searing", sub: "준, 튀기기와 시어링을 배우다", s: "" },
      { n: "Unit 06", t: "Boiling & Simmering", sub: "준, 끓이기와 약불을 익히다", s: "" },
      { n: "Unit 07", t: "Poaching & Blanching", sub: "준, 포칭과 블랜칭을 익히다", s: "" },
      { n: "Unit 08", t: "Steaming & Roasting", sub: "준, 찜과 로스팅을 익히다", s: "" },
    ],
    extra: [
      { n: "Unit 09", t: "Caramelizing & Sweating", sub: "준, 캐러멜라이징과 스웨팅을 익히다", s: "" },
      { n: "Unit 10", t: "Seasoning & Garnishing", sub: "준, 시즈닝과 가니쉬를 익히다", s: "" },
      { n: "Unit 11", t: "Pureeing & Pulsing", sub: "준, 퓌레와 펄싱을 익히다", s: "" },
      { n: "Unit 12", t: "Thickening Techniques", sub: "준, 농도 조절 기법을 익히다", s: "" },
      { n: "Unit 13", t: "Bard & Lard", sub: "준, 바딩과 라딩을 익히다", s: "" },
      { n: "Unit 14", t: "Confit & Slow Cooking", sub: "준, 콩피와 슬로우 쿠킹을 익히다", s: "" },
      { n: "Unit 15", t: "Stocks & Broths", sub: "준, 스톡과 육수를 익히다", s: "" },
      { n: "Unit 16", t: "Sauces", sub: "준, 클래식 소스를 익히다", s: "" },
      { n: "Unit 17", t: "During Service", sub: "준, 서비스 한복판에 서다", s: "" },
      { n: "Unit 18", t: "Fire & Refire", sub: "준, 파이어와 리파이어를 다루다", s: "" },
      { n: "Unit 19", t: "Kitchen Safety", sub: "준, 주방 안전 호출을 익히다", s: "" },
      { n: "Unit 20", t: "Rush Hour Communication", sub: "준, 러시 아워를 견뎌내다", s: "" },
      { n: "Unit 21", t: "Potatoes & Fries", sub: "준, 감자 사이드를 책임지다", s: "" },
      { n: "Unit 22", t: "Eggs & Breakfast", sub: "준, 브런치 서비스에 투입되다", s: "" },
      { n: "Unit 23", t: "Soups & Purees", sub: "준, 수프와 퓌레를 마스터하다", s: "" },
      { n: "Unit 24", t: "Modern Kitchen Techniques", sub: "준, 모던 기법으로 시리즈를 완성하다", s: "" },
    ],
    exLabel: "유닛 전체 보기 (16개 더)",
  },
  {
    key: "basic1",
    title: "회화기초 문법 1 — 기초부터 탄탄하게",
    copy: "영어가 처음이라면, 여기서 시작하세요.",
    tags: [{ t: "유료" }, { t: "음성 포함" }, { t: "24유닛" }],
    units: [
      { n: "Unit 01", t: "Be동사로 내 상태 말하기", sub: "be동사 — 기분과 상태 표현", s: "" },
      { n: "Unit 02", t: "Be동사로 직업·역할 말하기", sub: "be동사 — 직업과 역할 표현", s: "" },
      { n: "Unit 03", t: "저는 ~하는 걸 좋아해요!", sub: "like to + 동사원형", s: "" },
      { n: "Unit 04", t: "저는 여행하고 싶어요!", sub: "want to + 동사원형", s: "" },
      { n: "Unit 05", t: "저는 시간이 있어요!", sub: "have — 소유 표현", s: "" },
      { n: "Unit 06", t: "지금 뭐 하고 있어요?", sub: "현재진행형 — be동사 + 동사-ing", s: "" },
      { n: "Unit 07", t: "매일 하는 일이 있어요?", sub: "현재시제 — 반복되는 일상", s: "" },
      { n: "Unit 08", t: "지금 하는 중인가요? 평소에?", sub: "현재시제 vs 현재진행형", s: "" },
    ],
    extra: [
      { n: "Unit 09", t: "거기 가본 적 있어요?", sub: "현재완료 — have been to", s: "" },
      { n: "Unit 10", t: "해본 적 있어요?", sub: "현재완료 (경험) — have + p.p.", s: "" },
      { n: "Unit 11", t: "얼마나 오래 했어요?", sub: "현재완료 (계속) — for / since", s: "" },
      { n: "Unit 12", t: "끝났어요, 그래서 지금은요?", sub: "현재완료 (결과/완료)", s: "" },
      { n: "Unit 13", t: "그때 뭐 하고 있었어요?", sub: "과거진행형 — was/were + -ing", s: "" },
      { n: "Unit 14", t: "어제 뭐 했어요?", sub: "규칙 과거 — 동사원형 + -ed", s: "" },
      { n: "Unit 15", t: "왜 불규칙이에요?", sub: "불규칙 과거 — 자주 쓰는 동사", s: "" },
      { n: "Unit 16", t: "그냥 지금 결정했어요!", sub: "Will — 즉흥 결정 & 미래 예상", s: "" },
      { n: "Unit 17", t: "이미 계획해 놨어요!", sub: "be going to — 계획된 미래", s: "" },
      { n: "Unit 18", t: "일정이 이미 잡혀 있어요!", sub: "현재진행형 미래", s: "" },
      { n: "Unit 19", t: "할 수 있어요? 해도 돼요?", sub: "조동사 — can / may", s: "" },
      { n: "Unit 20", t: "이렇게 하는 게 좋겠어요!", sub: "Should — 부드러운 조언", s: "" },
      { n: "Unit 21", t: "해야 할 것을 갖고 있어요!", sub: "Have to — 의무", s: "" },
      { n: "Unit 22", t: "상태가 어디를 향하나요?", sub: "Be + 형용사 + 전치사 ①", s: "" },
      { n: "Unit 23", t: "미쳤어요? 비슷해요?", sub: "Be + 형용사 + 전치사 ②", s: "" },
      { n: "Unit 24", t: "만족해요? 긴장돼요?", sub: "Be + 형용사 + 전치사 ③", s: "" },
    ],
    exLabel: "유닛 전체 보기 (16개 더)",
  },
  {
    key: "basic2",
    title: "회화기초 문법 2 — 실전 회화 완성",
    copy: "문법 1을 마쳤다면, 이제 실전으로!",
    tags: [{ t: "유료" }, { t: "음성 포함" }, { t: "24유닛" }],
    units: [
      { n: "Unit 25", t: "충분해요!", sub: "Enough — 위치에 따라 뜻이 달라요", s: "" },
      { n: "Unit 26", t: "더 ~해요!", sub: "비교급 — -er / more", s: "" },
      { n: "Unit 27", t: "가장 ~해요!", sub: "최상급 — -est / the most", s: "" },
      { n: "Unit 28", t: "즐기고 있어요!", sub: "Enjoy + ~ing", s: "" },
      { n: "Unit 29", t: "괜찮으세요?", sub: "Mind + ~ing — 정중하게 부탁하기", s: "" },
      { n: "Unit 30", t: "계획이 있어요!", sub: "Plan to / Planning to", s: "" },
      { n: "Unit 31", t: "약속해요!", sub: "Promise to + 동사원형", s: "" },
      { n: "Unit 32", t: "셀 수 있어요? 없어요?", sub: "가산명사 / 불가산명사 ①", s: "" },
    ],
    extra: [
      { n: "Unit 33", t: "아파요! I have a cold.", sub: "병과 증상 표현", s: "" },
      { n: "Unit 34", t: "항상 복수로 써요!", sub: "항상 복수로 쓰는 단어들", s: "" },
      { n: "Unit 35", t: "어디에 있어요?", sub: "장소 전치사 — in / at / on", s: "" },
      { n: "Unit 36", t: "언제예요?", sub: "시간 전치사 — at / on / in", s: "" },
      { n: "Unit 37", t: "어디로 가요?", sub: "방향 전치사 — to / from / into", s: "" },
      { n: "Unit 38", t: "어떻게 해야 할지 몰라요!", sub: "의문사 + to 동사", s: "" },
      { n: "Unit 39", t: "네가 해줬으면 해요!", sub: "목적어 + to 동사", s: "" },
      { n: "Unit 40", t: "예전엔 그랬어요!", sub: "used to + 동사원형", s: "" },
      { n: "Unit 41", t: "문장을 연결해요!", sub: "접속사 — and / but / or / so", s: "" },
      { n: "Unit 42", t: "~하는 사람이에요!", sub: "관계대명사 who", s: "" },
      { n: "Unit 43", t: "~한 것이에요!", sub: "관계대명사 which", s: "" },
      { n: "Unit 44", t: "~하는 것이요!", sub: "관계대명사 what", s: "" },
      { n: "Unit 45", t: "거기에서 ~했어요!", sub: "관계부사 where", s: "" },
      { n: "Unit 46", t: "만약 ~하면, ~할 거에요!", sub: "가정법 1 — If + 현재형", s: "" },
      { n: "Unit 47", t: "만약 ~라면 좋을 텐데!", sub: "가정법 2 — If + 과거형", s: "" },
      { n: "Unit 48", t: "그때 ~했더라면!", sub: "가정법 3 — If + had p.p.", s: "" },
    ],
    exLabel: "유닛 전체 보기 (16개 더)",
  },
  {
    key: "cosmetic",
    title: "화장품 수출 영어 — 글로벌 비즈니스 실전",
    copy: "바이어와 직접 협상하는 비즈니스 영어!",
    tags: [{ t: "유료" }, { t: "음성 포함" }, { t: "24유닛" }, { t: "기업 추천" }],
    units: [
      { n: "Unit 01", t: "Greets the First Overseas Buyer", sub: "첫 해외 바이어 맞이하기", s: "" },
      { n: "Unit 02", t: "Gives a Company Tour", sub: "회사 투어 안내하기", s: "" },
      { n: "Unit 03", t: "Introduces the Brand Lineup", sub: "브랜드 라인업 소개", s: "" },
      { n: "Unit 04", t: "Presents the Hero Product", sub: "대표 제품 프레젠테이션", s: "" },
      { n: "Unit 05", t: "Demonstrates the Foot Care Set", sub: "풋케어 세트 시연", s: "" },
      { n: "Unit 06", t: "Explains the Joint Care Line", sub: "관절 케어 라인 설명", s: "" },
      { n: "Unit 07", t: "Walks Through the Facial Skincare Range", sub: "페이셜 스킨케어 라인 소개", s: "" },
      { n: "Unit 08", t: "Handles the Buyer's First Questions", sub: "바이어의 첫 질문 응대", s: "" },
    ],
    extra: [
      { n: "Unit 09", t: "Takes the Buyer Out for Korean BBQ", sub: "한국식 BBQ 접대", s: "" },
      { n: "Unit 10", t: "Talks About Korean Food Culture", sub: "한국 음식 문화 이야기", s: "" },
      { n: "Unit 11", t: "Shares the Story of K-Beauty", sub: "K-뷰티 이야기 들려주기", s: "" },
      { n: "Unit 12", t: "Talks About Korean History Briefly", sub: "한국 역사 간단히 소개", s: "" },
      { n: "Unit 13", t: "Tells the Story of Wellbeing Healthfarm", sub: "우리 회사 스토리텔링", s: "" },
      { n: "Unit 14", t: "Talks About Himself Over Coffee", sub: "커피챗 — 나를 소개하기", s: "" },
      { n: "Unit 15", t: "Discusses Pricing in Detail", sub: "가격 상세 협의", s: "" },
      { n: "Unit 16", t: "Negotiates MOQ Down", sub: "최소주문수량(MOQ) 협상", s: "" },
      { n: "Unit 17", t: "Handles a Tough Discount Request", sub: "까다로운 할인 요청 대응", s: "" },
      { n: "Unit 18", t: "Negotiates Exclusive Distribution Rights", sub: "독점 유통권 협상", s: "" },
      { n: "Unit 19", t: "Follow-up Email After the Meeting", sub: "미팅 후 팔로업 이메일", s: "" },
      { n: "Unit 20", t: "Sample Shipment Email", sub: "샘플 발송 이메일", s: "" },
      { n: "Unit 21", t: "Negotiation Email", sub: "협상 이메일 작성", s: "" },
      { n: "Unit 22", t: "Bad News Email", sub: "곤란한 소식 전하는 이메일", s: "" },
      { n: "Unit 23", t: "Handles Customer Complaint Emails", sub: "고객 컴플레인 이메일 대응", s: "" },
      { n: "Unit 24", t: "Negotiation & Email", sub: "계약 성사 & 최종 이메일", s: "" },
    ],
    exLabel: "유닛 전체 보기 (16개 더)",
  },
];

/* ===== 호주 현지생존기 — 유튜브 영상 ===== */
// Phase 5 admin 유튜브 관리에서 DB(youtube_videos)로 대체 예정.

export type Video = {
  url: string;
  tag: string;
  title: string;
  desc: string;
  duration: string;
};

export const VIDEOS: Video[] = [
  {
    url: "https://youtube.com/shorts/wlXR6N883J8?feature=share",
    tag: "일자리",
    title: "카페 면접 — 영어로 어떻게 해요?",
    desc: "준이 직접 카페 매니저한테 영어로 말 건 현장.",
    duration: "14:32",
  },
  {
    url: "https://youtube.com/shorts/MXmxtoM3s3o?feature=share",
    tag: "숙소",
    title: "쉐어하우스 구할 때 이 말은 꼭 해야 해요",
    desc: "집주인이랑 직접 대화하는 법 — 리얼 현장.",
    duration: "11:08",
  },
  {
    url: "https://youtube.com/shorts/B7ZNjgmynl8?feature=share",
    tag: "현지 생활",
    title: "워홀 한 달, 실제로 얼마나 벌었나요?",
    desc: "수입, 지출, 생활비 리얼 공개.",
    duration: "09:45",
  },
  {
    url: "https://youtube.com/shorts/x2HMGpSOToI?feature=share",
    tag: "현지 생활",
    title: "워홀 한 달, 실제로 얼마나 벌었나요?",
    desc: "수입, 지출, 생활비 리얼 공개.",
    duration: "09:45",
  },
];

/** YouTube URL에서 영상 ID 추출 (썸네일용). */
export function getYoutubeId(url: string): string | null {
  const patterns = [/youtu\.be\/([^?&]+)/, /youtube\.com\/watch\?v=([^&]+)/, /youtube\.com\/shorts\/([^?&]+)/];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/* ===== 실전 스피킹 디벨롭 — 과정 카드 ===== */
// href는 Phase 2 과정 상세페이지(/courses/<slug>) 경로 placeholder.

export type CourseCard = {
  slug: string;
  name: string;
  desc: string;
  price: string;
  per: string;
  image: string;
};

export const COURSE_CARDS: CourseCard[] = [
  {
    slug: "workhol",
    name: "워홀 영어 과정",
    desc: "해외 현지 적응, 면접, 일상 영어까지. 초보라도 지금부터 준비하면 호주 현장에서 당당하게 생활할 수 있습니다.",
    price: "₩240,000",
    per: "/ 24회",
    image: "/images/course-workhol.jpg",
  },
  {
    slug: "kitchen",
    name: "주방 영어 과정",
    desc: '"Behind!" 한 마디도 못 알아들었던 첫날, 이제는 주방 어디서든 당당하게 소통할 수 있습니다. 지금 시작하세요.',
    price: "₩240,000",
    per: "/ 24회",
    image: "/images/course-kitchen.jpg",
  },
  {
    slug: "grammar",
    name: "회화기초 문법 1,2과정",
    desc: "토익 점수는 올라가는데 입이 안 떨어졌다면, 영어의 뼈대와 원리부터 다시 시작하세요.",
    price: "₩240,000",
    per: "/ 24회",
    image: "/images/course-basic1.jpg",
  },
  {
    slug: "cosmetic",
    name: "화장품 수출 영어 과정",
    desc: "첫 미팅부터 계약 성사까지, K-뷰티 수출 영어 24유닛. 바이어가 눈앞에 있는데 영어가 막혔다면, 제품 소개부터 협상, 이메일까지 한 번에 준비하세요.",
    price: "₩240,000",
    per: "/ 24회",
    image: "/images/course-cosmetic.jpg",
  },
];

/* ===== 원어민 · 세대교감 액티비티 ===== */

export type Activity = {
  title: string;
  desc: string;
  date: string;
  badge: string;
  badgeVariant: "open" | "plan" | "new";
  image: string;
};

export const ACTIVITIES: Activity[] = [
  {
    title: "외국인과 함께하는 하이킹",
    desc: "원어민 참가자, 줌마분들과 함께 영어로 대화하며 가는 하이킹. 무료 참여 가능하시고요. 즐거운 시간을 많이 많이 보내고 있답니다. 건강도 챙기고 영어도 하고!",
    date: "일정 공지",
    badge: "상시진행",
    badgeVariant: "open",
    image: "/images/activity-hiking.jpg",
  },
  {
    title: "27년 호주 스피킹 투어",
    desc: "호주 퍼스에서 단기 어학연수 및 현지 여행. 아카데미에서 단기연수도 하고, 해변파티, 주요관광지에서 관광도 해요. 홈스테이를 통해서 현지를 느낄 수 있어요. 2018년 퍼스, 2019년 유럽, 2025년 퍼스 스피킹 투어를 진행했어요.",
    date: "2027년 1월 예정",
    badge: "준비 중",
    badgeVariant: "plan",
    image: "/images/activity-australia.jpg",
  },
];
