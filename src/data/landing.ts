// 랜딩 페이지("청년을 세계로") 표시용 데이터.
// ⚠️ presentational only — project0607 프로토타입(js/index.js)에서 이식. Phase 3(교재 5종 확장)에서
// 실제 교재 데이터(reading_progress.course)와 재조정 예정. 현재는 셀프디벨롭/과정카드/유튜브 UI 렌더용.

import { COURSE_PRICE_LABEL, COURSE_PER_LABEL } from "./pricing";

/* ===== 셀프 디벨롭 — 무료 교재 미리보기 ===== */

export type BookUnit = {
  n: string; // "Unit 01"
  t: string; // 영문 제목
  sub?: string; // 한글 부제
  situation?: string; // 유닛 상황 소개(전자책 .situation과 동일) — 있으면 셀프디벨롭 카드에 노출
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
    title: "워홀 생존영어 — 현지에서 쓰는 실전 영어",
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
    title: "셰프 영어 — 식당 · 카페 · 주방 현장 실전",
    copy: "주방에서 바로 통하는 영어, 워홀러 필수!",
    tags: [{ t: "무료", free: true }, { t: "음성 포함" }, { t: "24유닛" }],
    units: [
      { n: "Unit 01", t: "First Day in the Kitchen", sub: "주방 첫 출근 & 자기소개", situation: "아침, 시드니의 한 카페 주방으로 첫 출근했습니다. 셰프가 당신을 맞이합니다. 당신은 인사하고, 이름을 말하고, 오늘이 첫 날임을 알리고, 무엇부터 하면 될지를 차례로 말해야 합니다. 어려운 요리 용어는 필요 없습니다 — 짧고 분명하게만 말하면 됩니다.", s: "" },
      { n: "Unit 02", t: "Understanding Instructions", sub: "기본 지시 알아듣기", situation: "셰프가 빠르게 지시를 내립니다. 어려운 단어는 없지만 말이 빨라서 놓치기 쉽습니다. 못 들었을 때 추측하지 말고 다시 묻는 법과, 핵심 단어를 복창해 확인하는 법을 익힙니다.", s: "" },
      { n: "Unit 03", t: "Kitchen Tools & Stations", sub: "도구와 작업 구역", situation: "셰프가 도구와 구역을 알려줍니다. 도구 이름을 알면 지시를 훨씬 빨리 알아들을 수 있습니다. 기본 도구 10개와 위치 묻는 법을 익힙니다.", s: "" },
      { n: "Unit 04", t: "Asking Where Things Are", sub: "물건 위치 묻기", situation: "바쁜 주방에서 물건 찾느라 헤매면 시간 낭비입니다. 짧게 물어보는 법과 위치 표현(전치사)을 익혀 빠르게 찾습니다.", s: "" },
      { n: "Unit 05", t: "Getting Set Up (Prep)", sub: "프렙 준비하기", situation: "서비스 전, 셰프가 프렙(밑준비) 리스트를 줍니다. 양과 우선순위, 써는 방법(peel/slice/dice)을 확인하고 시작합니다.", s: "" },
      { n: "Unit 06", t: "Quantities & Measurements", sub: "양과 계량 말하기", situation: "셰프가 \"두 개 더\", \"한 줌\", \"티스푼 하나\"처럼 양을 말합니다. 숫자·단위·\"조금 더/그만\" 같은 표현을 정확히 알아듣는 게 중요합니다.", s: "" },
      { n: "Unit 07", t: "Food Storage & Labelling", sub: "보관과 라벨링", situation: "남은 재료는 용기에 담아 라벨을 붙여 냉장고/창고에 넣습니다. 이름+날짜 라벨과 \"먼저 들어온 것 먼저 쓰기(FIFO)\"가 위생의 핵심입니다.", s: "" },
      { n: "Unit 08", t: "Receiving Deliveries", sub: "납품 받기", situation: "아침에 식자재가 배달됩니다. 주문서(송장)와 실제 물건을 대조하고, 모자라거나 상한 게 있으면 말한 뒤 서명합니다.", s: "" },
    ],
    extra: [
      { n: "Unit 09", t: "Reading the Docket", sub: "주문서(도켓) 읽기", situation: "프린터에서 도켓(주문서)이 나옵니다. 메뉴, 수량, 특별요청(양파 빼고·소스 따로)을 빠르고 정확히 읽어야 합니다. 알레르기 메모는 최우선!", s: "" },
      { n: "Unit 10", t: "On the Line", sub: "서비스 중 소통", situation: "한창 바쁜 서비스. 길게 말할 시간이 없습니다. 짧은 주방 콜을 알아듣고 즉시 반응해야 충돌과 사고를 막습니다.", s: "" },
      { n: "Unit 11", t: "Plating & Passing Food", sub: "플레이팅 & 음식 전달", situation: "요리가 완성되면 접시에 담아 패스(전달대)에 올리고 서버를 부릅니다. 깔끔하게(가장자리 닦기), 빠르게(Order up!)가 핵심입니다.", s: "" },
      { n: "Unit 12", t: "Handling the Rush", sub: "바쁜 시간 견디기", situation: "점심 러시. 주문이 쏟아집니다. 무엇부터 할지 묻고, 밀리면 숨기지 말고 말하고, 도움을 청하는 법을 익힙니다.", s: "" },
      { n: "Unit 13", t: "Allergies & Dietary Needs", sub: "알레르기 & 식이요청", situation: "손님이 알레르기나 식단 요청을 합니다. 잘못 전달하면 위험할 수 있으니, 추측하지 말고 정확히 확인해 셰프에게 알립니다.", s: "" },
      { n: "Unit 14", t: "Asking for Help", sub: "도움 요청하기", situation: "새 일을 맡았는데 방법을 모릅니다. 혼자 추측하다 실수하지 말고, 적절하고 정중하게 도움을 청하는 법을 익힙니다.", s: "" },
      { n: "Unit 15", t: "Reporting a Mistake", sub: "실수 보고하기", situation: "실수로 음식을 태우거나 주문을 잘못 만들었습니다. 빨리 인정하고 바로잡는 것이 호주 주방에서 가장 프로다운 태도입니다.", s: "" },
      { n: "Unit 16", t: "Running Out of Stock", sub: "재료 떨어졌을 때", situation: "한창 바쁜데 우유나 재료가 떨어집니다. \"다 떨어졌을 때\"가 아니라 \"거의 떨어질 때\" 미리 알려야 메뉴를 막거나 대체할 수 있습니다.", s: "" },
      { n: "Unit 17", t: "Health & Safety", sub: "안전과 위험 알리기", situation: "주방은 위험이 많습니다 — 뜨거운 것, 젖은 바닥, 칼. 주변에 큰 소리로 경고하고, 사고가 나면 바로 알리는 법을 익힙니다.", s: "" },
      { n: "Unit 18", t: "Dishwashing Duties", sub: "설거지 담당", situation: "오늘은 설거지 담당입니다. 더러운 그릇이 계속 들어옵니다. 긁어내고, 헹구고, 식기세척기를 돌리는 순서를 익힙니다.", s: "" },
      { n: "Unit 19", t: "Cleaning as You Go", sub: "수시 청소", situation: "호주 주방의 기본 규칙 \"Clean as you go\". 작업 중간중간 닦고 정리해야 위생 점검도, 마감도 훨씬 쉬워집니다.", s: "" },
      { n: "Unit 20", t: "Closing the Kitchen", sub: "마감 청소", situation: "영업 종료 후 마감입니다. 장비를 끄고, 남은 재료를 보관하고, 청소하고, 쓰레기를 버립니다. 빠짐없이 끝내야 퇴근할 수 있습니다.", s: "" },
      { n: "Unit 21", t: "Small Talk with Coworkers", sub: "동료와 잡담", situation: "휴식 시간이나 한가할 때 동료와 짧은 잡담을 나눕니다. 친해지면 일도 훨씬 편해집니다. 가벼운 안부와 호주식 표현을 익힙니다.", s: "" },
      { n: "Unit 22", t: "Shifts & Roster", sub: "시프트와 근무표", situation: "다음 주 로스터(근무표)가 나왔습니다. 내 시프트를 확인하고, 바꿔야 하면 정중히 요청하는 법을 익힙니다. 무단결근(no-show)은 절대 금물!", s: "" },
      { n: "Unit 23", t: "Asking About Pay", sub: "급여·근무시간 묻기", situation: "첫 급여일이 다가옵니다. 시급, 지급일, 페이슬립(명세서), 주말 할증을 정중하게 확인합니다. 호주에선 급여를 묻는 게 당연한 권리입니다.", s: "" },
      { n: "Unit 24", t: "Wrapping Up the Shift", sub: "퇴근 인사", situation: "시프트가 끝났습니다. 남은 일을 인계하고, 동료·셰프에게 인사하고, 다음 근무를 확인하고 퇴근합니다. 호주식 인사로 마무리해 보세요.", s: "" },
    ],
    exLabel: "유닛 전체 보기 (16개 더)",
  },
  {
    key: "basic1",
    title: "회화 기초문법 1 — 기초부터 탄탄하게",
    copy: "영어가 처음이라면, 여기서 시작하세요.",
    tags: [{ t: "무료", free: true }, { t: "음성 포함" }, { t: "24유닛" }],
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
    title: "회화 기초문법 2 — 실전 회화 완성",
    copy: "문법 1을 마쳤다면, 이제 실전으로!",
    tags: [{ t: "무료", free: true }, { t: "음성 포함" }, { t: "24유닛" }],
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
    title: "뷰티 수출영어 — 글로벌 비즈니스 실전",
    copy: "바이어와 직접 협상하는 비즈니스 영어!",
    tags: [{ t: "무료", free: true }, { t: "음성 포함" }, { t: "24유닛" }, { t: "기업 추천" }],
    units: [
      { n: "Unit 01", t: "Greets the First Overseas Buyer", sub: "첫 해외 바이어 맞이하기", situation: "민성(David)은 (주)웰빙헬스팜의 해외마케팅부 부장이다. 오늘은 미국 보스턴에서 온 첫 바이어 Sarah Miller를 인천공항에서 픽업해 호텔까지 안내해야 한다. 첫인상이 거래의 시작을 좌우하기에, 자기소개와 일정 안내, 자연스러운 아이스브레이킹까지 모두 영어로 매끄럽게 진행해야 한다.", s: "" },
      { n: "Unit 02", t: "Gives a Company Tour", sub: "회사 투어 안내하기", situation: "민성(David)은 어제 도착한 보스턴 바이어 Sarah를 인천 본사로 데려와 회사 시설을 안내한다. 25년간 풋케어 전문 제조 노하우를 쌓아온 웰빙헬스팜의 R&D 센터와 생산 라인을 보여주며, 단순한 견학이 아니라 신뢰감을 형성하는 자리로 만들어야 한다.", s: "" },
      { n: "Unit 03", t: "Introduces the Brand Lineup", sub: "브랜드 라인업 소개", situation: "회사에는 3WB, WHB, 웰빙헬스팜이라는 3개의 브랜드 라인이 있다. 민성(David)은 바이어 Sarah에게 각 라인의 포지셔닝과 유통 채널 차이를 명확히 설명해 미국 시장에 가장 적합한 라인을 함께 검토한다.", s: "" },
      { n: "Unit 04", t: "Presents the Hero Product", sub: "대표 제품 프레젠테이션", situation: "민성(David)은 회사의 베스트셀러이자 시그니처 제품인 '명품고운발' 풋크림을 미국 바이어 Sarah에게 프레젠테이션한다. 핵심 성분 우레아(요소)의 효능, 사용 효과, '한국 풋크림 No.1' 포지셔닝을 어떻게 영어로 전달할지가 핵심이다.", s: "" },
      { n: "Unit 05", t: "Demonstrates the Foot Care Set", sub: "풋케어 세트 시연", situation: "민성(David)은 풋크림 단품이 아닌 풋파일(각질 제거 도구)과 풋크림을 함께 사용하는 '풋케어 세트'를 미국 바이어 Sarah에게 시연한다. 단계별 사용법을 영어로 자연스럽게 설명하며 세트 판매의 장점을 어필해야 한다.", s: "" },
      { n: "Unit 06", t: "Explains the Joint Care Line", sub: "관절 케어 라인 설명", situation: "민성(David)은 풋케어 외 또 다른 인기 라인인 '관절애' 마사지젤(HOT/COOL)을 소개한다. 채널A TV에 방영되며 시니어 시장에서 큰 호응을 얻은 이 제품의 특징과 미국 시니어 시장 가능성을 영어로 설명한다.", s: "" },
      { n: "Unit 07", t: "Walks Through the Facial Skincare Range", sub: "페이셜 스킨케어 라인 소개", situation: "민성(David)은 페이셜 스킨케어 라인 '예쁜얼굴' 시리즈를 소개한다. 콜라겐 크림, 비타민C 크림, 시카 크림, 썬크림 등 다양한 라인업의 차이와 가격대별 포지셔닝을 설명해 바이어 Sarah가 매장에 도입할 제품을 선택하도록 돕는다.", s: "" },
      { n: "Unit 08", t: "Handles the Buyer's First Questions", sub: "바이어의 첫 질문 응대", situation: "제품 소개가 끝나고 바이어 Sarah가 본격적인 질문을 시작한다. 가격, MOQ, 납기 등 즉답이 어려운 질문이 쏟아진다. 민성(David)은 자신 있게 답할 수 있는 부분은 답하고, 모르는 부분은 정중하게 \"확인 후 답변드리겠다\"고 응대해야 한다.", s: "" },
    ],
    extra: [
      { n: "Unit 09", t: "Takes the Buyer Out for Korean BBQ", sub: "한국식 BBQ 접대", situation: "공식 회의가 끝나고 민성(David)은 바이어 Sarah를 한국식 바비큐 식당으로 안내한다. 단순한 식사가 아니라 관계를 형성하는 중요한 자리다. 메뉴 추천, 굽고 싸 먹는 방법 설명 등을 영어로 자연스럽게 풀어가야 한다.", s: "" },
      { n: "Unit 10", t: "Talks About Korean Food Culture", sub: "한국 음식 문화 이야기", situation: "바이어 Sarah가 한국 음식 문화에 호기심을 보이며 더 깊은 질문을 한다. 민성(David)은 김치·발효 문화, 반찬 공유 문화, 술자리 매너 등을 영어로 자연스럽게 설명한다. 단순한 정보 전달이 아니라 한국 문화에 대한 자부심과 친근감을 전달하는 것이 핵심이다.", s: "" },
      { n: "Unit 11", t: "Shares the Story of K-Beauty", sub: "K-뷰티 이야기 들려주기", situation: "저녁 식사 자리에서 바이어 Sarah가 \"K-뷰티가 어떻게 세계적으로 유명해졌나요?\"라고 묻는다. 민성(David)은 1990년대 한방 화장품부터 BB크림, 그리고 K-팝·K-드라마와 함께 폭발한 2020년대까지의 K-뷰티 진화 스토리를 흥미롭게 풀어낸다.", s: "" },
      { n: "Unit 12", t: "Talks About Korean History Briefly", sub: "한국 역사 간단히 소개", situation: "식사 후 카페에서 바이어 Sarah가 \"한국에 와보니 짧은 시간에 큰 발전을 이룬 게 인상적이에요. 짧게 한국 역사 좀 알려주세요\"라고 묻는다. 민성(David)은 조선시대 궁중 미용부터 한강의 기적, 그리고 K-콘텐츠 글로벌화까지 핵심만 압축해서 들려준다.", s: "" },
      { n: "Unit 13", t: "Tells the Story of Wellbeing Healthfarm", sub: "우리 회사 스토리텔링", situation: "이제 분위기가 무르익은 카페에서, 바이어 Sarah가 \"이 회사는 어떻게 시작됐나요?\"라고 묻는다. 민성(David)은 25년 전 작은 약국 거래에서 시작해 '풋크림의 명가'로 자리 잡기까지의 회사 창업 스토리를 영어로 진솔하게 들려준다.", s: "" },
      { n: "Unit 14", t: "Talks About Himself Over Coffee", sub: "커피챗 — 나를 소개하기", situation: "이튿날 오전, 바이어 Sarah와 카페에서 커피를 마시며 민성(David)이 자신의 이야기를 들려준다. 미국 유학 시절, 한국에 돌아와 일을 시작한 계기, 회사를 글로벌 브랜드로 키우려는 비전 등을 자연스럽게 공유한다.", s: "" },
      { n: "Unit 15", t: "Discusses Pricing in Detail", sub: "가격 상세 협의", situation: "커피톡 다음 날, 본격적인 가격 협상이 시작된다. 민성(David)은 FOB·CIF 인코텀즈, 단가표, 환율 변동 리스크 등을 영어로 정확하게 설명한다. 처음으로 '돈 이야기'를 영어로 풀어내는 자리다.", s: "" },
      { n: "Unit 16", t: "Negotiates MOQ Down", sub: "최소주문수량(MOQ) 협상", situation: "바이어 Sarah는 \"6,000개는 부담스럽다. MOQ를 낮춰달라\"고 요청한다. 민성(David)은 회사 정책과 바이어 요구 사이에서 협상해야 한다. \"트라이얼 오더로 일단 진행하고 단계적으로 늘리는 방안\"을 제안하며 윈윈 해법을 찾는다.", s: "" },
      { n: "Unit 17", t: "Handles a Tough Discount Request", sub: "까다로운 할인 요청 대응", situation: "바이어 Sarah가 \"단가를 20% 더 낮춰달라\"는 무리한 요구를 한다. 민성(David)은 단순히 거절하지 않고, 정중하게 거절하면서 대신 마케팅 지원, 무상 샘플 추가 등 대안을 제시한다. 거절도 영어로 우아하게 하는 법을 익히는 자리.", s: "" },
      { n: "Unit 18", t: "Negotiates Exclusive Distribution Rights", sub: "독점 유통권 협상", situation: "바이어 Sarah가 \"미국 전역 독점 판매권을 요청한다\"고 한다. 민성(David)은 독점 vs 비독점, 영역 범위 정의, 연간 최소 매출 목표 등을 영어로 협상한다. 독점권은 양날의 검이라 신중한 접근이 필요한 자리.", s: "" },
      { n: "Unit 19", t: "Follow-up Email After the Meeting", sub: "미팅 후 팔로업 이메일", situation: "공식 협상이 끝나고 민성(David)은 미팅 내용을 정리해 follow-up 이메일을 보내야 한다. 이메일 작성법의 기초인 Subject Line·인사·요약·다음 단계 구조를 익히고, 협상 결과를 정확히 기록해 향후 분쟁의 여지를 없애는 것이 목표다.", s: "" },
      { n: "Unit 20", t: "Sample Shipment Email", sub: "샘플 발송 이메일", situation: "트라이얼 오더 진행 전, 민성(David)은 바이어 Sarah에게 샘플 100세트를 DHL로 발송하고 발송 안내 이메일을 작성한다. 정보 전달형 이메일의 핵심 (트래킹 번호·관세·예상 도착일·첨부파일 안내)을 명확하고 간결하게 담는 것이 목표다.", s: "" },
      { n: "Unit 21", t: "Negotiation Email", sub: "협상 이메일 작성", situation: "샘플 평가 후 바이어 Sarah가 \"단가를 5% 추가 인하해달라\"고 메일로 요청해왔다. 민성(David)은 설득형 이메일 구조 (조건 제시 → 근거 → 요청)로 답변 메일을 작성한다. 일방적 거절이 아닌 협상의 여지를 담는 톤이 핵심이다.", s: "" },
      { n: "Unit 22", t: "Bad News Email", sub: "곤란한 소식 전하는 이메일", situation: "생산 라인 문제로 트라이얼 오더 납기가 2주 지연된다는 통보를 해야 한다. 민성(David)은 완곡한 거절·지연 통보 이메일 구조 (감사 → 사실 전달 → 사과 → 대안 → 약속)로 신뢰를 잃지 않으면서 안 좋은 소식을 전한다.", s: "" },
      { n: "Unit 23", t: "Handles Customer Complaint Emails", sub: "고객 컴플레인 이메일 대응", situation: "미국 최종 고객 한 명이 \"풋크림이 피부에 자극을 줬다\"는 클레임을 영문 이메일로 보내왔다. 민성(David)은 사과·해결책 구조 (공감 → 사과 → 해결책 → 재발 방지)로 답변 메일을 작성한다. CS 톤은 협상 메일과 또 다른 결의 영어가 필요하다.", s: "" },
      { n: "Unit 24", t: "Negotiation & Email", sub: "계약 성사 & 최종 이메일", situation: "마침내 계약 체결의 날. 민성(David)과 바이어 Sarah는 모든 조건을 합의하고 사인을 마쳤다. 민성(David)은 첫 발주 일정 확정과 장기 파트너십에 대한 비전을 담은 최종 확인 이메일을 작성한다. 24개 유닛 학습의 대미를 장식하는 자리.", s: "" },
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
  desc?: string; // mock 데이터용 (DB 영상은 description 컬럼 사용)
  description?: string; // DB(youtube_videos) 컬럼
  duration?: string; // mock 전용 — DB 영상엔 없음
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
    name: "워홀 생존영어 과정",
    desc: "해외 현지 적응, 면접, 일상 영어까지. 초보라도 지금부터 준비하면 호주 현장에서 당당하게 생활할 수 있습니다.",
    price: COURSE_PRICE_LABEL,
    per: COURSE_PER_LABEL,
    image: "/images/course-workhol.jpg",
  },
  {
    slug: "kitchen",
    name: "셰프 영어 과정",
    desc: '"Behind!" 한 마디도 못 알아들었던 첫날, 이제는 주방 어디서든 당당하게 소통할 수 있습니다. 지금 시작하세요.',
    price: COURSE_PRICE_LABEL,
    per: COURSE_PER_LABEL,
    image: "/images/course-kitchen.jpg",
  },
  {
    slug: "grammar1",
    name: "회화 기초문법 1 과정",
    desc: "토익 점수는 올라가는데 입이 안 떨어졌다면, 영어의 뼈대와 원리부터 다시 시작하세요. (Unit 1–24)",
    price: COURSE_PRICE_LABEL,
    per: COURSE_PER_LABEL,
    image: "/images/course-basic1.jpg",
  },
  {
    slug: "grammar2",
    name: "회화 기초문법 2 과정",
    desc: "기초를 다졌다면 이제 실전 회화로. 표현의 폭을 넓혀 어떤 상황에서도 막힘없이 말해보세요. (Unit 25–48)",
    price: COURSE_PRICE_LABEL,
    per: COURSE_PER_LABEL,
    image: "/images/course-basic2.jpg",
  },
  {
    slug: "cosmetic",
    name: "뷰티 수출영어 과정",
    desc: "첫 미팅부터 계약 성사까지, K-뷰티 수출 영어 24유닛. 바이어가 눈앞에 있는데 영어가 막혔다면, 제품 소개부터 협상, 이메일까지 한 번에 준비하세요.",
    price: COURSE_PRICE_LABEL,
    per: COURSE_PER_LABEL,
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
