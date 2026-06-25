// 과정 상세페이지(/courses/[slug]) 데이터. project0607 프로토타입 pages/course/*.html에서 이식.
// ⚠️ UI-first — 신청폼 저장은 Phase 4(applications DB)에서 연결. 커리큘럼은 landing.ts BOOKS 재사용.

import { BOOKS, type BookUnit } from "./landing";

export const COURSE_SLUGS = ["workhol", "kitchen", "grammar", "cosmetic"] as const;
export type CourseSlug = (typeof COURSE_SLUGS)[number];

export type SpecItem = { key: string; val: string };
export type NoticeStep = { step: string; text: string; link?: { label: string; href: string } };
export type RegretCard = { num: string; title: string; desc: string };
export type DiffItem = { title: string; desc: string };
export type Review = { text: string; author: string; role: string };
export type ApplyOption = { value: string; label: string };
export type ApplyGroup = { group: string; options: ApplyOption[] };
export type CurriculumGroup = { title?: string; units: BookUnit[] };

export type Course = {
  slug: CourseSlug;
  title: string;
  heroImage: string;
  tagline: string;
  introTitle: string;
  introDesc: string[];
  spec: SpecItem[];
  price: string;
  per: string;
  regretHeadLead: string;
  regretHeadEm: string;
  regret: RegretCard[];
  diffHeadLead: string;
  diffHeadEm: string;
  diff: DiffItem[];
  reviewHeadLead: string;
  reviewHeadEm: string;
  reviews: Review[];
  curriculumBooks: { bookKey: string; title?: string }[];
  applyTitle: string;
  applyHeading: string[];
  applyOptions: ApplyOption[] | ApplyGroup[];
};

// 모든 과정 공통 — 과정 개요 일부 / 신청 안내 / 가격.
const COMMON_SPEC = (courseName: string, progress = "총 24회 · 각 25분"): SpecItem[] => [
  { key: "과정", val: courseName },
  { key: "구분", val: "1:1 화상 교육" },
  { key: "진행", val: progress },
  { key: "횟수", val: "주2회(12주)·주3회(8주)·주5회(5주)" },
  { key: "레벨", val: "초급" },
  { key: "교재", val: "온라인 교재 (0원)" },
  { key: "강사", val: "필리핀 원어민" },
];

export const NOTICE_STEPS: NoticeStep[] = [
  { step: "STEP 01. 신청", text: "원하는 요일·시간과 강사를 선택해 수강신청을 하시면 강사 승인 후 진행됩니다." },
  { step: "STEP 02. 결제", text: "무통장 입금으로 진행됩니다.\n계좌번호\n국민은행 680401-00-111464\n(주)프렌딩" },
  { step: "STEP 03. 진행", text: "수업 일정 및 진행 방법은 상담 시 안내드립니다." },
  {
    step: "프렌딩 화상교육센터",
    text: "화상교육은 교육센터에서 진행되요.",
    link: { label: "교육센터 바로가기", href: "http://friending.kr" },
  },
];

const SIMPLE_OPTIONS: ApplyOption[] = [
  { value: "2", label: "주 2회 과정 (12주)" },
  { value: "3", label: "주 3회 과정 (8주)" },
  { value: "5", label: "주 5회 과정 (5주)" },
];

const COURSES: Record<CourseSlug, Course> = {
  workhol: {
    slug: "workhol",
    title: "워홀 생존영어 과정",
    heroImage: "/images/course-workhol.jpg",
    tagline: "SIM 개통 · 이력서 돌리기 · 면접 · 급여 협상까지",
    introTitle: "현지에서 당당하게 살아가기",
    introDesc: ["해외 현지 적응, 면접, 일상 영어까지.", "초급이라도 지금부터 준비하면", "호주 현장에서 당당하게 생활할 수 있습니다."],
    spec: COMMON_SPEC("워홀 생존영어 과정"),
    price: "₩240,000",
    per: "/ 24회",
    regretHeadLead: "선배 워홀러들이",
    regretHeadEm: "후회하는 3가지",
    regret: [
      {
        num: "01",
        title: "워홀 실전 영어를 더 일찍 준비했더라면...",
        desc: "현지에 가니 일상 대화부터 업무 지시까지 모든 게 영어였어요. 기초 영어만으로는 생활 자체를 따라가기 어려웠어요. 현지에서 또 배워야 했고, 시간이 너무 아까웠어요.",
      },
      {
        num: "02",
        title: "현장에서 쓰는 표현을 더 공부했더라면…",
        desc: "일반 학원에서 배운 영어와 실제 현지에서 쓰는 표현은 달랐어요. 동료와의 자연스러운 대화, 직장에서의 소통 방식은 따로 배워야 했어요.",
      },
      {
        num: "03",
        title: "면접 준비를 더 확실하게 했더라면…",
        desc: "면접에서 버벅거렸어요. 내 경험과 강점을 제대로 설명하지 못해 떨어진 면접이 수십 개예요. 지금 생각하니 영어만 됐어도 훨씬 빨리 일자리를 얻었을 것 같아요.",
      },
    ],
    diffHeadLead: "워홀 생존영어 과정",
    diffHeadEm: "이렇게 달라요",
    diff: [
      {
        title: "직종 상관없이, 호주 워홀에서 진짜 쓰는 말만 담았습니다.",
        desc: "카페든, 농장이든, 공장이든 — 어디서 일하든 공통으로 필요한 영어가 있습니다. UNIT 1-24는 수백 명의 워홀러 경험에서 추린 현장 밀착 표현으로만 구성됩니다.",
      },
      {
        title: "도착 첫날부터 퇴근 후까지, 생활 전체를 커버합니다.",
        desc: "SIM 개통, 집 구하기, 은행 계좌, 운전면허, 이력서 돌리기, 면접, 첫 출근, 동료와의 대화. 직장 영어만이 아니라 워홀 생활 전체를 준비합니다.",
      },
      {
        title: "영어 왕초보도 출국 전에 끝낼 수 있습니다.",
        desc: "20년 경력 강사의 초단기 집중 커리큘럼. 2주 몰입부터 5주, 8주, 12주까지 — 출국 날짜에 맞게 역산해서 설계합니다.",
      },
    ],
    reviewHeadLead: "워홀 희망자들의 ",
    reviewHeadEm: "반응",
    reviews: [
      {
        text: "“대학을 졸업하고 호주 워홀을 생각하고 있었는데, 영어 때문에 많이 고민했어요. 이 과정이 정말 도움이 될 것 같습니다. 현지 생활부터 취업까지 실제 상황으로 배울 수 있어 호주 도전할 용기가 생겼어요!”",
        author: "김○○",
        role: "워홀 준비 중 (대졸)",
      },
      {
        text: "“다음 달에 호주로 출국하는데, 이런 과정이 있어서 정말 다행이에요. 면접부터 직장 생활까지 실제 상황을 배워서 자신감이 생길 것 같습니다. 정말 추천하고 싶어요!”",
        author: "이○○",
        role: "워홀 출국 준비 중",
      },
      {
        text: "“호주에서 1년을 고생했는데, 처음부터 이 과정이 있었으면 얼마나 좋았을까 싶어요. 제가 겪었던 어려움들이 모두 커리큘럼에 담겨있네요. 후배들에게 꼭 추천하고 싶습니다.”",
        author: "박○○",
        role: "호주 워홀 1년 경험자",
      },
    ],
    curriculumBooks: [{ bookKey: "workhol" }],
    applyTitle: "워홀 생존영어 1:1 화상수업",
    applyHeading: ["버벅거리는 순간이 오기 전에", "제대로 준비하세요"],
    applyOptions: SIMPLE_OPTIONS,
  },

  kitchen: {
    slug: "kitchen",
    title: "셰프 영어 과정",
    heroImage: "/images/course-kitchen.jpg",
    tagline: "미장플라스부터 러시아워 · 매니저 소통까지",
    introTitle: "주방에서 당당하게 일하기",
    introDesc: ['"Behind!" 한 마디도 못 알아들었던 첫날,', "이제는 주방 어디서든 당당하게", "소통할 수 있습니다. 지금 시작하세요."],
    spec: COMMON_SPEC("셰프 영어 과정"),
    price: "₩240,000",
    per: "/ 24회",
    regretHeadLead: "주방에서 일했던 사람들이",
    regretHeadEm: "가장 많이 털어놓는 3가지",
    regret: [
      {
        num: "01",
        title: '"Behind!"가 뭔지 몰라서 부딪혔어요',
        desc: "지시사항이 짧고 빠르게 날아오는데, 뭘 해야 할지 몰라 멈춰버렸어요. 기초 영어로는 주방 현장을 절대 따라갈 수 없었어요. 그 짧은 순간이 너무 아까웠어요.",
      },
      {
        num: "02",
        title: "주방 용어는 일반 학원에서 안 가르쳐줘요",
        desc: "Mise en Place, Sear, Deglaze... 주방에서 정말 필요한 말은 따로 있었어요. 일반 영어 학원 3개월 다녔는데, 정작 현장에서 쓸 수 있는 표현은 하나도 없었어요.",
      },
      {
        num: "03",
        title: "셰프한테 물어보는 것조차 두려웠어요",
        desc: '"한 번 더 말씀해 주시겠어요?"라는 말 한마디를 못해서 엉뚱하게 일을 처리한 적이 수도 없어요. 소통이 안 되니 자신감도 기회도 같이 사라졌어요.',
      },
    ],
    diffHeadLead: "셰프 영어 과정 ",
    diffHeadEm: "이렇게 달라요",
    diff: [
      {
        title: "주방에서 쓰는 말만 24유닛에 담았습니다.",
        desc: "일반 교과서는 버립니다. UNIT 1-24는 모두 실제 주방 현장에서 나온 필수 표현입니다. Mise en Place부터 Rush Hour Communication까지, 딱 필요한 것만.",
      },
      {
        title: "내일 출근해서 바로 써먹는 영어.",
        desc: '"Behind!", "Fire table 3!", "86 the salmon!" — 교실에서 끝나지 않고 주방에서 통하는 표현만 가르칩니다.',
      },
      {
        title: "준비 기간에 맞게 집중적으로.",
        desc: "출근 D-day에서 역산해 설계했습니다. 2주 몰입 과정, 5주, 8주, 12주까지 본인 일정에 맞게 준비 가능합니다.",
      },
    ],
    reviewHeadLead: "셰프 영어 희망자들의 ",
    reviewHeadEm: "반응",
    reviews: [
      {
        text: "“요리는 할 수 있는데 영어가 발목을 잡았어요. 이런 과정이 있으면 셰프 지시를 바로 알아듣고 바로 대답할 수 있을 것 같아요. 주방에서 처음으로 자신감이 생길것 같아요.”",
        author: "이○○",
        role: "호텔 조리팀 근무 중",
      },
      {
        text: "“Mise en Place부터 Rush Hour까지, 주방에서 정말 쓰는 표현만 배우는 게 좋아요 일반 영어 학원에서 몇 달을 다녀도 못 배웠던 것들이 여기 다 있었어요. 진작 알았더라면!”",
        author: "최○○",
        role: "워홀 출국 준비 중",
      },
      {
        text: "“해외 주방에서 1년을 고생했는데, 처음부터 이 과정이 있었으면 얼마나 좋았을까 싶어요. 제가 매일 버벅거렸던 표현들이 모두 커리큘럼에 담겨있네요. 후배들에게 꼭 추천합니다.”",
        author: "박○○",
        role: "호주 주방 1년 경험자",
      },
    ],
    curriculumBooks: [{ bookKey: "kitchen" }],
    applyTitle: "셰프 영어 1:1 화상수업",
    applyHeading: ["주방에서 버벅거리는 순간이 오기 전에", "제대로 준비하세요"],
    applyOptions: SIMPLE_OPTIONS,
  },

  grammar: {
    slug: "grammar",
    title: "회화 공식영어 1,2 과정",
    heroImage: "/images/course-basic1.jpg",
    tagline: "Be동사 · 시제 · 조동사 · 가정법까지",
    introTitle: "영어를 이해하고 말하는 공부",
    introDesc: ["토익 점수는 올라가는데", "입이 안 떨어졌다면,", "영어의 뼈대와 원리부터", "다시 시작하세요."],
    spec: COMMON_SPEC("회화 공식영어 1,2", "각 24회 · 각 25분"),
    price: "₩240,000",
    per: "/ 24회",
    regretHeadLead: "영어 공부를 해봤던 분들이",
    regretHeadEm: "가장 많이 털어놓는 3가지",
    regret: [
      {
        num: "01",
        title: "문법은 아는데, 말이 안 나와요",
        desc: "학교에서 문법은 배웠는데 정작 입이 안 떨어졌어요. 규칙을 외웠을 뿐, 왜 그렇게 쓰는지 몰랐거든요. 이해하지 못한 문법은 말할 때 절대 나오지 않아요.",
      },
      {
        num: "02",
        title: "학원을 다녀도 늘 같은 자리예요",
        desc: "회화 학원, 문법 학원 번갈아 다녀봤는데 연결이 안 됐어요. 문법은 문법대로, 회화는 회화대로 따로 놀았어요. 둘을 같이 배워야 했는데.",
      },
      {
        num: "03",
        title: "Be동사가 뭔지 아직도 헷갈려요",
        desc: "am / is / are를 외웠는데 왜 쓰는지 몰랐어요. 원리를 이해하지 못한 채 외우기만 하면, 조금만 문장이 바뀌어도 막혀버려요.",
      },
    ],
    diffHeadLead: "회화 공식영어 ",
    diffHeadEm: "이렇게 달라요",
    diff: [
      {
        title: "외우는 문법이 아니라, 이해하는 문법.",
        desc: 'Be동사를 "존재동사"로, 분사를 "동사에서 나온 형용사"로 설명합니다. 어려운 용어를 쉽게 재해석해서 한 번 이해하면 절대 잊지 않습니다.',
      },
      {
        title: "문법 설명에서 끝나지 않습니다.",
        desc: "배운 내용을 화상 수업에서 직접 말해보며 연습합니다. 이해한 문법이 입 밖으로 나오는 순간, 진짜 실력이 됩니다.",
      },
      {
        title: "48유닛, 회화 중심으로 촘촘하게.",
        desc: "Be동사부터 가정법까지, 일상에서 정말 쓰는 표현 중심으로 구성했습니다. 문법1(1-24유닛) · 문법2(25-48유닛)로 나뉘어 단계적으로 완성됩니다.",
      },
    ],
    reviewHeadLead: "회화 공식영어",
    reviewHeadEm: "반응",
    reviews: [
      {
        text: "“Be동사를 존재동사로 설명해 주시는데, 그 순간 모든 게 이해됐어요. 10년 동안 외워만 왔는데, 왜 그렇게 쓰는지 처음으로 알게 됐습니다.”",
        author: "유○○",
        role: "문화센터 수강생",
      },
      {
        text: "“문법 배우고 바로 화상 수업에서 말해보니까 확실히 달랐어요. 머릿속에 있던 게 입으로 나오는 느낌, 다른 학원에서는 한 번도 못 느꼈거든요.”",
        author: "김○○",
        role: "기초회화 수강생",
      },
      {
        text: "“관계대명사가 한국어에도 있다는 설명에 무릎을 탁 쳤어요. 그렇게 어렵던 문법이 갑자기 친숙해지더라고요. 진작 이렇게 배웠으면 좋았을 텐데!”",
        author: "박○○",
        role: "문화센터 수강생",
      },
    ],
    curriculumBooks: [
      { bookKey: "basic1", title: "회화 공식영어 1 (Unit 1–24)" },
      { bookKey: "basic2", title: "회화 공식영어 2 (Unit 25–48)" },
    ],
    applyTitle: "회화 공식영어 1:1 화상수업",
    applyHeading: ["외우다 포기했던 영어,", "이번엔 이해하고 말해보세요"],
    applyOptions: [
      {
        group: "회화 공식영어 1 (Unit 1–24)",
        options: [
          { value: "공식영어1-주2회", label: "공식영어1 · 주 2회 과정 (12주)" },
          { value: "공식영어1-주3회", label: "공식영어1 · 주 3회 과정 (8주)" },
          { value: "공식영어1-주5회", label: "공식영어1 · 주 5회 과정 (5주)" },
        ],
      },
      {
        group: "회화 공식영어 2 (Unit 25–48)",
        options: [
          { value: "공식영어2-주2회", label: "공식영어2 · 주 2회 과정 (12주)" },
          { value: "공식영어2-주3회", label: "공식영어2 · 주 3회 과정 (8주)" },
          { value: "공식영어2-주5회", label: "공식영어2 · 주 5회 과정 (5주)" },
        ],
      },
    ],
  },

  cosmetic: {
    slug: "cosmetic",
    title: "뷰티 영어 과정",
    heroImage: "/images/course-cosmetic.jpg",
    tagline: "바이어 미팅 · 협상 · 이메일 · 계약까지",
    introTitle: "바이어 앞에서 당당하게",
    introDesc: [
      "첫 미팅부터 계약 성사까지,",
      "K-뷰티 수출 영어 24유닛",
      "바이어가 눈앞에 있는데",
      "영어가 막혔다면,",
      "제품 소개부터 협상, 이메일까지",
      "한 번에 준비하세요.",
    ],
    spec: COMMON_SPEC("뷰티 영어 과정"),
    price: "₩240,000",
    per: "/ 24회",
    // 프로토타입 cosmetic.html의 후회/차별점/후기 섹션은 워홀 카피를 그대로 사용 중 — 원본 충실 이식.
    // ※ 차별점 헤딩만 이 과정(뷰티 영어) 이름으로 교정(diffHeadLead), 나머지 본문 카피는 원본 유지.
    regretHeadLead: "선배 워홀러들이",
    regretHeadEm: "후회하는 3가지",
    regret: [
      {
        num: "01",
        title: "워홀 실전 영어를 더 일찍 준비했더라면...",
        desc: "현지에 가니 일상 대화부터 업무 지시까지 모든 게 영어였어요. 기초 영어만으로는 생활 자체를 따라가기 어려웠어요. 현지에서 또 배워야 했고, 시간이 너무 아까웠어요.",
      },
      {
        num: "02",
        title: "현장에서 쓰는 표현을 더 공부했더라면…",
        desc: "일반 학원에서 배운 영어와 실제 현지에서 쓰는 표현은 달랐어요. 동료와의 자연스러운 대화, 직장에서의 소통 방식은 따로 배워야 했어요.",
      },
      {
        num: "03",
        title: "면접 준비를 더 확실하게 했더라면…",
        desc: "면접에서 버벅거렸어요. 내 경험과 강점을 제대로 설명하지 못해 떨어진 면접이 수십 개예요. 지금 생각하니 영어만 됐어도 훨씬 빨리 일자리를 얻었을 것 같아요.",
      },
    ],
    diffHeadLead: "뷰티 영어 과정 ",
    diffHeadEm: "이렇게 달라요",
    diff: [
      {
        title: "직종 상관없이, 호주 워홀에서 진짜 쓰는 말만 담았습니다.",
        desc: "카페든, 농장이든, 공장이든 — 어디서 일하든 공통으로 필요한 영어가 있습니다. UNIT 1-24는 수백 명의 워홀러 경험에서 추린 현장 밀착 표현으로만 구성됩니다.",
      },
      {
        title: "도착 첫날부터 퇴근 후까지, 생활 전체를 커버합니다.",
        desc: "SIM 개통, 집 구하기, 은행 계좌, 운전면허, 이력서 돌리기, 면접, 첫 출근, 동료와의 대화. 직장 영어만이 아니라 워홀 생활 전체를 준비합니다.",
      },
      {
        title: "영어 왕초보도 출국 전에 끝낼 수 있습니다.",
        desc: "20년 경력 강사의 초단기 집중 커리큘럼. 2주 몰입부터 5주, 8주, 12주까지 — 출국 날짜에 맞게 역산해서 설계합니다.",
      },
    ],
    reviewHeadLead: "워홀 희망자들의 ",
    reviewHeadEm: "반응",
    reviews: [
      {
        text: "“대학을 졸업하고 호주 워홀을 생각하고 있었는데, 영어 때문에 많이 고민했어요. 이 과정이 정말 도움이 될 것 같습니다. 현지 생활부터 취업까지 실제 상황으로 배울 수 있어 호주 도전할 용기가 생겼어요!”",
        author: "김○○",
        role: "워홀 준비 중 (대졸)",
      },
      {
        text: "“다음 달에 호주로 출국하는데, 이런 과정이 있어서 정말 다행이에요. 면접부터 직장 생활까지 실제 상황을 배워서 자신감이 생길 것 같습니다. 정말 추천하고 싶어요!”",
        author: "이○○",
        role: "워홀 출국 준비 중",
      },
      {
        text: "“호주에서 1년을 고생했는데, 처음부터 이 과정이 있었으면 얼마나 좋았을까 싶어요. 제가 겪었던 어려움들이 모두 커리큘럼에 담겨있네요. 후배들에게 꼭 추천하고 싶습니다.”",
        author: "박○○",
        role: "호주 워홀 1년 경험자",
      },
    ],
    curriculumBooks: [{ bookKey: "cosmetic" }],
    applyTitle: "뷰티 영어 1:1 화상수업",
    applyHeading: ["버벅거리는 순간이 오기 전에", "제대로 준비하세요"],
    applyOptions: SIMPLE_OPTIONS,
  },
};

export function getCourse(slug: string): Course | undefined {
  return (COURSES as Record<string, Course>)[slug];
}

/** 과정 커리큘럼을 BOOKS에서 조립 (그룹별 유닛 목록). */
export function getCurriculumGroups(course: Course): CurriculumGroup[] {
  return course.curriculumBooks.map(({ bookKey, title }) => {
    const book = BOOKS.find((b) => b.key === bookKey);
    return { title, units: book ? [...book.units, ...book.extra] : [] };
  });
}

export function isApplyGroup(opt: ApplyOption | ApplyGroup): opt is ApplyGroup {
  return "group" in opt;
}
