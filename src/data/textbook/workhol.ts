export type WorkholUnit = {
  unit: number;
  title: string;
  titleKr: string;
  situation: string;
  htmlFile: string;
};

export const WORKHOL_COURSE = "workhol" as const;
export const WORKHOL_TOTAL_UNITS = 24;

export const WORKHOL_UNITS: WorkholUnit[] = [
  {
    unit: 1,
    title: "Jun Buys a SIM Card",
    titleKr: "준, 유심을 개통하다",
    situation:
      "준은 호주에 도착한 다음 날, 통신사 매장에 갔다. 데이터 요금제를 고르고 새 번호를 개통해야 한다. 직원에게 자신의 상황을 설명하고 적절한 요금제를 추천받는다.",
    htmlFile: "unit-01.html",
  },
  {
    unit: 2,
    title: "Jun Starts English School",
    titleKr: "준, 영어학원을 시작하다",
    situation: "준은 퍼스의 어학원에서 첫 수업을 시작한다. 반 친구들 중에는 일본인 친구들이 많다. 자기소개를 하고 왜 영어를 공부하는지 이야기한다.",
    htmlFile: "unit-02.html",
  },
  {
    unit: 3,
    title: "Jun Meets International Friends",
    titleKr: "준, 외국인 친구들과 어울리다",
    situation: "준은 어학원에서 만난 친구들과 함께 시간을 보낸다. 서로의 취미와 나라에 대해 이야기하고, 주말에 무엇을 했는지 공유한다.",
    htmlFile: "unit-03.html",
  },
  {
    unit: 4,
    title: "Jun Opens a Bank Account",
    titleKr: "준, 은행 계좌를 만들다",
    situation: "준은 일자리를 구하기 전에 호주 은행 계좌가 필요하다. 은행에 방문해서 계좌를 개설하고, 직불카드를 신청하며, 주소를 알려준다.",
    htmlFile: "unit-04.html",
  },
  {
    unit: 5,
    title: "Jun Goes Grocery Shopping",
    titleKr: "준, 마트에서 장을 보다",
    situation: "준은 처음으로 호주 마트에 갔다. 한국 식재료를 찾고, 가격을 묻고, 계산대에서 결제한다.",
    htmlFile: "unit-05.html",
  },
  {
    unit: 6,
    title: "Jun Uses Public Transportation",
    titleKr: "준, 버스와 기차를 이용하다",
    situation: "준은 시내로 가기 위해 버스와 기차를 이용한다. 길을 묻고, 환승 정보를 확인하며, 교통카드를 충전한다.",
    htmlFile: "unit-06.html",
  },
  {
    unit: 7,
    title: "Jun Gets an Australian Driver's License",
    titleKr: "준, 호주 운전면허를 따다",
    situation: "준은 일자리를 위해 호주 운전면허가 필요하다. 시험을 예약하고, 면허를 발급받고, 호주 운전에 대한 질문을 한다.",
    htmlFile: "unit-07.html",
  },
  {
    unit: 8,
    title: "Jun Visits a Used Car Dealer",
    titleKr: "준, 중고차 가게에 가다",
    situation: "준은 중고차를 사려고 한다. 차의 상태를 묻고, 주행거리를 확인하고, 가격을 흥정한다.",
    htmlFile: "unit-08.html",
  },
  {
    unit: 9,
    title: "Jun Introduces Himself at a Restaurant",
    titleKr: "준, 레스토랑에서 자기소개를 하다",
    situation: "준은 레스토랑 면접에서 매니저에게 자기소개를 한다. 한국에서의 요리 경력과 요리학교 졸업에 대해 이야기한다.",
    htmlFile: "unit-09.html",
  },
  {
    unit: 10,
    title: "Jun Drops Off His Resume",
    titleKr: "준, 직접 이력서를 돌리다",
    situation: "준은 카페와 레스토랑을 돌아다니며 이력서를 직접 전달한다. 매니저를 찾고, 짧게 자기소개를 하며, 일할 수 있는 시간을 설명한다.",
    htmlFile: "unit-10.html",
  },
  {
    unit: 11,
    title: "Jun Has a Café Interview",
    titleKr: "준, 카페 인터뷰를 보다",
    situation: "준은 카페에서 면접을 본다. 커피 관련 경험과 영어 실력, 손님 응대에 대한 질문을 받는다.",
    htmlFile: "unit-11.html",
  },
  {
    unit: 12,
    title: "Jun Has a Kitchen Interview",
    titleKr: "준, 키친 인터뷰를 보다",
    situation: "준은 레스토랑 주방 면접을 본다. 주방 경험, 바쁜 환경에서의 적응력, 팀워크에 대해 이야기한다.",
    htmlFile: "unit-12.html",
  },
  {
    unit: 13,
    title: "Jun Has a Trial Shift",
    titleKr: "준, 트라이얼 근무를 하다",
    situation: "준은 합격 전 트라이얼 근무를 한다. 첫 업무를 받고, 속도를 평가받으며, 매니저에게 피드백을 듣는다.",
    htmlFile: "unit-13.html",
  },
  {
    unit: 14,
    title: "Jun Talks About His Cooking Experience",
    titleKr: "준, 요리 경력을 설명하다",
    situation: "준은 면접에서 자신의 요리 경력을 자세히 설명한다. 한국에서의 경력, 전문학교 교육, 만들 수 있는 음식들에 대해 이야기한다.",
    htmlFile: "unit-14.html",
  },
  {
    unit: 15,
    title: "Jun Visits a Recruitment Agency",
    titleKr: "준, 에이전시에 가다",
    situation: "준은 광산 일자리를 찾기 위해 에이전시를 방문한다. FIFO에 대한 설명을 듣고, 자신의 경력을 알려준다.",
    htmlFile: "unit-15.html",
  },
  {
    unit: 16,
    title: "Jun Applies for a Mining Kitchen Job",
    titleKr: "준, 광산 키친핸드에 지원하다",
    situation: "준은 광산 키친핸드 자리에 지원한다. 대량 조리 경험, 체력, 장기 근무 가능 여부에 대한 질문을 받는다.",
    htmlFile: "unit-16.html",
  },
  {
    unit: 17,
    title: "Jun Has a Mining Job Interview",
    titleKr: "준, 광산 인터뷰를 보다",
    situation: "준은 광산 회사와 본면접을 본다. FIFO 생활에 대한 질문, 긴 근무 시간, 스트레스 관리 방법에 대해 답한다.",
    htmlFile: "unit-17.html",
  },
  {
    unit: 18,
    title: "Jun's First Day in the Kitchen",
    titleKr: "준의 첫 출근",
    situation: "준은 합격한 레스토랑에서 첫 출근을 한다. 유니폼을 받고, 업무 설명을 듣고, 주방 구조를 배운다.",
    htmlFile: "unit-18.html",
  },
  {
    unit: 19,
    title: "Jun Learns Kitchen Instructions",
    titleKr: "준, 주방 지시를 배우다",
    situation: "준은 빠르게 말하는 셰프의 지시를 받는다. 다시 말해달라고 부탁하고, 이해했는지 확인 질문을 한다.",
    htmlFile: "unit-19.html",
  },
  {
    unit: 20,
    title: "Jun Works a Busy Dinner Shift",
    titleKr: "준, 바쁜 저녁 근무를 하다",
    situation: "준은 주문이 폭주하는 바쁜 저녁 근무를 한다. 긴장된 상황에서 동료들과 협력하며 일한다.",
    htmlFile: "unit-20.html",
  },
  {
    unit: 21,
    title: "Jun Makes a Mistake at Work",
    titleKr: "준, 실수하다",
    situation: "준은 주문을 잘못 만들었다. 매니저에게 사과하고, 문제를 해결하며, 다시 만들겠다고 한다.",
    htmlFile: "unit-21.html",
  },
  {
    unit: 22,
    title: "Jun Talks With His Manager",
    titleKr: "준, 매니저와 대화하다",
    situation: "준은 매니저와 스케줄, 근무 시간, 업무 피드백에 대해 이야기한다.",
    htmlFile: "unit-22.html",
  },
  {
    unit: 23,
    title: "Jun Talks With Coworkers",
    titleKr: "준, 동료들과 친해지다",
    situation: "준은 동료들과 가벼운 대화를 나눈다. 농담을 주고받고, 한국 음식에 대해 이야기하며 친해진다.",
    htmlFile: "unit-23.html",
  },
  {
    unit: 24,
    title: "Jun Talks About His Pay",
    titleKr: "준, 급여에 대해 질문하다",
    situation: "준은 매니저에게 급여에 대해 질문한다. 시급, 페이슬립 확인, 근무시간 계산, 급여일, 오버타임에 대해 묻는다.",
    htmlFile: "unit-24.html",
  },
];

export function getWorkholUnit(unit: number): WorkholUnit | undefined {
  return WORKHOL_UNITS.find((u) => u.unit === unit);
}
