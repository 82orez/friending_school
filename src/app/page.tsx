const reasons = [
  {
    title: "01. 영어 준비를 너무 늦게 시작했어요",
    desc: "워홀 출국 한두 달 전에 준비하다 보니 기초만 배웠어요. 현장에 가서 또 배워야 했어요. 시간이 너무 아까웠어요.",
  },
  {
    title: "02. 쓸모 없는 것만 배웠어요",
    desc: "일반 기초 영어 학원에서 배웠는데, 워홀에서 정말 필요한 표현은 거의 없었어요. 면접, 급여 확인 같은 건 따로 배웠어요.",
  },
];

const lastReason = {
  title: "03. 첫 일자리를 못 얻었어요",
  desc: "면접에서 버벅거렸어요. 말을 못 해서 떨어진 면접이 수십 개예요. 지금 생각하니 영어만 됐어도 훨씬 빨리 일자리를 얻었을 것 같아요.",
};

const opportunityCards = [
  { number: "01", title: "공항 입국", desc: "세관원 질문에 못 답하면 입국이 지연되거나 거부될 수 있습니다" },
  { number: "02", title: "좋은 숙소", desc: "집주인과 협상하지 못하면 나쁜 집, 비싼 집을 얻게 됩니다" },
  { number: "03", title: "공공시설", desc: "말을 못 하면 필요한 서비스를 받지 못합니다" },
  { number: "04", title: "일자리 면접", desc: "면접에서 떨어집니다. 기회는 돌아오지 않습니다" },
  { number: "05", title: "업무 소통", desc: "동료를 못 알아들으면 일을 제대로 할 수 없습니다" },
];

const infoCards = [
  { label: "기간", value: "2주 (10일)", isPrice: false },
  { label: "수업 시간", value: "매일 50분", isPrice: false },
  { label: "형식", value: "1:1 화상교육", isPrice: false },
  { label: "가격", value: "15만원", isPrice: true },
];

const reviewsTop = [
  {
    text: '"처음에는 영어가 두려웠는데, 이 과정이 정말 필요할 것 같아요. 워홀에서 실제로 쓸 상황들이 담겨있어서 현실적이고 좋습니다. 공항부터 면접까지 단계별로 준비할 수 있을 것 같아서 안심이 돼요."',
    author: "박○○",
    status: "호주 워홀 준비 중",
  },
  {
    text: '"일반 영어 학원과는 정말 다르네요. 면접, 숙소 찾기, 업무 소통 등 정말 필요한 표현들만 집중적으로 배울 수 있다는 게 최고의 장점입니다. 2주 집중 과정이라 부담 없이 시작할 수 있을 것 같아요."',
    author: "이○○",
    status: "호주 워홀 예정",
  },
];

const reviewBottom = {
  text: '"커리큘럼을 보니 정말 모든 상황이 다 담겨있네요. 막연했던 워홀 준비가 구체적으로 무엇을 해야 할지 알게 되어 좋습니다. 50분 집중 수업이라 효율적일 것 같고, 강사님도 워홀 경험이 있을 것 같아서 신뢰가 갑니다."',
  author: "김○○",
  status: "호주 워홀 계획 중",
};

const units = [
  {
    title: "Unit 1: 워홀 첫날 - 낙오 없이 안착하기",
    items: ["1. 공항 입국 & 트러블 대처", "2. 교통 수단 및 라스트 마일", "3. 숙소 안착 & 컨디션 체크", "4. 유심 개통 & 첫 식사"],
  },
  {
    title: "Unit 2: 워홀 2일 차 - 행정 마스터 & 리스크 관리",
    items: ["1. 은행 계좌 개설 및 카드 신청", "2. 카드 수령 및 돌발상황 대처", "3. 세금 번호 등록 및 우편 관리", "4. 신분 증명 및 리스크 관리"],
  },
  {
    title: "Unit 3: 주거 해결 - 나만의 안식처 찾기",
    items: ["1. 인스펙션(방 보기) 약속 잡기", "2. 방 상태 및 계약 조건 확인", "3. 디파짓 송금 및 영수증 요청", "4. 입주 후 관리 및 수리 요청"],
  },
  {
    title: "Unit 4: 공공시설 활용 - 현지인처럼 살기",
    items: [
      "1. 도서관 멤버십 및 사무 서비스",
      "2. 약국 증상 설명 및 상비약 구매",
      "3. 구청(Council) 서비스 및 지역 정보",
      "4. 우체국 택배 및 행정 서비스",
    ],
  },
  {
    title: "Unit 5: 소셜 네트워킹 - 현지인과 친구 되기",
    items: ["1. 카페/펍 주문 및 스몰토크", "2. 로컬 모임 참가 및 친구 만들기", "3. 현지인 꿀팁 요청 및 정보 교류", "4. 구체적인 약속 잡기 및 초대"],
  },
  {
    title: "Unit 6: 구직 활동의 시작 - 현장 지원 및 전화 응대",
    items: ["1. 엔터링 톡 & 일자리 문의", "2. 이력서 전달 및 필살기 어필", "3. 전화 문의 및 확인", "4. 전화 면접 제안 대응"],
  },
  {
    title: "Unit 7: 실전 면접 (1) - Personal & Resume Check",
    items: ["1. 도착 인사 및 비자/시간 확답", "2. 이력서 기반 경력 요약", "3. 나의 강점 및 태도 어필", "4. 기본 조건 확인 및 마무리"],
  },
  {
    title: "Unit 8: 실전 면접 (2) - Job-Related & Scenarios",
    items: ["1. 러쉬 타임 및 우선순위 대처", "2. 실수 대처 및 컴플레인 응대", "3. 협업 및 능동적인 태도", "4. 트라이얼 제안 및 확정"],
  },
  {
    title: "Unit 9: 계약 및 조건 확인",
    items: ["1. 페이 및 세부 조건 확인", "2. 로스터 및 근무 요일 협의", "3. 텍스 파일 번호(TFN) 및 서류 제출", "4. 첫 출근 준비물 및 복장 체크"],
  },
  {
    title: "Unit 10: 실전 업무 및 소통 - On the Job",
    items: ["1. 업무 지시 확인 및 다시 묻기", "2. 동료에게 도움 요청 및 협업", "3. 업무 중 실수 보고 및 수습", "4. 업무 종료 및 피드백 주고받기"],
  },
];

import { buttonVariants } from "@/components/ui/button";
import { SectionCard } from "@/components/SectionCard";
import ApplyForm from "@/components/ApplyForm";
import { cn } from "@/lib/utils";

export default async function Home({ searchParams }: { searchParams: Promise<{ reset?: string; verified?: string }> }) {
  const { reset, verified } = await searchParams;
  const showResetSuccess = reset === "success";
  const showVerifiedSuccess = verified === "success";

  return (
    <>
      {showResetSuccess && (
        <div className="bg-green-50 px-6 py-3 text-center text-sm font-medium text-green-700" role="status">
          비밀번호가 성공적으로 변경되었습니다.
        </div>
      )}
      {showVerifiedSuccess && (
        <div className="bg-green-50 px-6 py-3 text-center text-sm font-medium text-green-700" role="status">
          이메일 인증이 완료되어 자동으로 로그인되었습니다.
        </div>
      )}
      {/* 1. 히어로 */}
      <section id="hero" className="from-ink bg-gradient-to-br to-[#2d2d2d] px-6 py-12 text-center text-white md:py-20">
        <p className="mb-4 text-base font-bold tracking-wider opacity-80 md:text-lg">청년을 세계로, 프렌딩 스쿨</p>
        <h1 className="mb-3 text-[26px] leading-tight font-black md:text-4xl">
          초보 워홀 영어
          <br />
          2주만에 판바꾸기
        </h1>
        <p className="text-brand mb-5 text-[17px] font-extrabold md:text-xl">
          매일 50분
          <br />
          워홀 필수 생존 영어 말하기
        </p>
        <p className="text-rule-faint text-sm leading-[1.8] md:text-[15px]">
          <strong className="text-base">버벅거리는 순간 기회가 날라갑니다.</strong>
        </p>
        <p className="text-rule-faint my-6 text-base leading-[1.9] font-semibold md:text-[17px]">
          받을 걸 제대로 받을 기회
          <br />
          문제를 원활히 해결할 수 있는 기회
          <br />
          직업을 빨리 구할 기회
          <br />
          <br />
          <strong className="text-base">제대로 잡으세요.</strong>
        </p>
        <a
          href="#apply"
          className={cn(buttonVariants({ variant: "brand" }), "mt-6 h-auto w-full px-8 py-4 text-sm font-bold md:max-w-xl md:text-[15px]")}>
          지금 신청하기
        </a>
      </section>

      {/* 2. 선배 워홀러가 후회하는 3가지 */}
      <section className="px-6 py-10 md:py-14">
        <h2 className="mb-8 text-center text-2xl leading-snug font-black md:text-3xl">
          선배 워홀러들이
          <br />
          <span className="text-brand">후회하는 3가지</span>
        </h2>

        <div className="my-8 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
          {reasons.map((r) => (
            <SectionCard key={r.title} variant="accent-left" className="rounded-2xl p-6 md:p-8">
              <h3 className="text-ink mb-4 text-base leading-normal font-extrabold md:text-[17px]">{r.title}</h3>
              <p className="text-muted-fg text-sm leading-[1.85]">{r.desc}</p>
            </SectionCard>
          ))}
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6">
          <SectionCard variant="accent-left" className="rounded-2xl p-6 md:p-8">
            <h3 className="text-ink mb-4 text-base leading-normal font-extrabold md:text-[17px]">{lastReason.title}</h3>
            <p className="text-muted-fg text-sm leading-[1.85]">{lastReason.desc}</p>
          </SectionCard>
        </div>
      </section>

      {/* 3. 우리는 이렇게 달라요 */}
      <section className="bg-ink mx-6 my-8 rounded-xl px-6 py-10 text-white md:py-14">
        <h2 className="mb-6 text-center text-2xl leading-[1.3] font-black md:text-3xl">
          우리는 <span className="text-brand">이렇게 달라요</span>
        </h2>
        <p className="text-rule-faint mb-6 text-center text-sm leading-[1.95] md:text-base">
          <strong className="text-[17px] font-extrabold md:text-[19px]">매일 50분 몰입이 만드는 힘</strong>
          <br />
          영어 초급이라도 집중된 환경에서 2주 반복하면 자동 반응이 됩니다.
        </p>
        <p className="text-rule-faint mt-6 mb-6 text-center text-sm leading-[1.95] md:text-base">
          <strong className="text-[17px] font-extrabold md:text-[19px]">워홀에서 정말 쓸 표현만</strong>
          <br />
          일반 교과서는 버립니다. Unit 1-10은 모두 실제 워홀러 경험에서 나온 필수 표현입니다.
        </p>
        <p className="text-rule-faint mt-6 mb-6 text-center text-sm leading-[1.95] md:text-base">
          <strong className="text-[17px] font-extrabold md:text-[19px]">현장에서 바로 먹혀듭니다</strong>
          <br />
          공항, 숙소, 면접, 업무. 당신이 정말 할 말만 배웁니다.
        </p>
      </section>

      {/* 4. 버벅거리면 떨어집니다 */}
      <section className="px-6 py-10 md:py-14">
        <h2 className="mb-8 text-center text-2xl leading-snug font-black md:text-3xl">
          버벅거리면
          <br />
          <span className="text-brand">떨어집니다</span>
        </h2>
        <p className="mb-8 text-center text-base leading-[1.9] font-bold text-[#555] md:text-lg">
          말 한 마디가 인생을 바꿉니다.
          <br />
          버벅거리면 기회는 오지 않습니다.
        </p>

        <div className="my-8 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
          {opportunityCards.map((c) => (
            <SectionCard key={c.number} variant="outline" className="rounded-2xl p-6 text-center md:p-8">
              <div aria-hidden="true" className="text-brand mb-3 text-[22px] font-black md:text-[28px]">
                {c.number}
              </div>
              <h3 className="text-ink mb-3 text-base font-extrabold md:text-lg">{c.title}</h3>
              <p className="text-muted-fg text-sm leading-[1.85]">{c.desc}</p>
            </SectionCard>
          ))}
        </div>
      </section>

      {/* 5. 과정 정보 */}
      <section className="px-6 py-10 md:py-14">
        <h2 className="mb-4 text-center text-2xl leading-snug font-black md:text-3xl">과정 정보</h2>
        <div className="mb-8 text-center">
          <p className="text-ink mb-4 text-base font-extrabold md:text-lg">2주 초보 워홀 집중과정</p>
          <p className="text-muted-fg text-sm md:text-[15px]">2주의 교육으로 시간과 비용을 세이브하세요.</p>
        </div>

        <dl className="my-8 grid grid-cols-2 gap-4 md:gap-6">
          {infoCards.map((c) => (
            <SectionCard key={c.label} variant="plain" className="rounded-xl p-5 text-center md:p-8">
              <dt className="text-muted-fg-faint mb-3 text-xs font-bold tracking-wide md:text-sm">{c.label}</dt>
              <dd className={`text-xl leading-[1.6] font-black md:text-2xl ${c.isPrice ? "text-brand" : "text-ink"}`}>{c.value}</dd>
            </SectionCard>
          ))}
        </dl>
      </section>

      {/* 6. 워홀러 반응 */}
      <section className="px-6 py-10 md:py-14">
        <h2 className="mb-8 text-center text-2xl leading-snug font-black md:text-3xl">
          실제 워홀러들의
          <br />
          <span className="text-brand">반응</span>
        </h2>

        <div className="my-8 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
          {reviewsTop.map((r) => (
            <SectionCard key={r.author} variant="outline" className="rounded-xl p-6 md:p-8">
              <blockquote>
                <div role="img" aria-label="별점 5점 만점에 5점" className="mb-4 text-[13px] tracking-wide text-[#ffc107]">
                  ⭐ ⭐ ⭐ ⭐ ⭐
                </div>
                <p className="text-muted-fg mb-6 text-sm leading-[1.85]">{r.text}</p>
                <footer>
                  <cite className="text-ink mb-1 block text-[13px] font-bold not-italic">{r.author}</cite>
                  <span className="text-muted-fg-faint text-xs">{r.status}</span>
                </footer>
              </blockquote>
            </SectionCard>
          ))}
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6">
          <SectionCard variant="outline" className="rounded-xl p-6 md:p-8">
            <blockquote>
              <div role="img" aria-label="별점 5점 만점에 5점" className="mb-4 text-[13px] tracking-wide text-[#ffc107]">
                ⭐ ⭐ ⭐ ⭐ ⭐
              </div>
              <p className="text-muted-fg mb-6 text-sm leading-[1.85]">{reviewBottom.text}</p>
              <footer>
                <cite className="text-ink mb-1 block text-[13px] font-bold not-italic">{reviewBottom.author}</cite>
                <span className="text-muted-fg-faint text-xs">{reviewBottom.status}</span>
              </footer>
            </blockquote>
          </SectionCard>
        </div>
      </section>

      {/* 7. 커리큘럼 */}
      <section id="curriculum" className="px-6 py-10 md:py-14">
        <h2 className="mb-4 text-center text-2xl leading-snug font-black md:text-3xl">
          10 UNITS
          <br />2 주 집중 과정
        </h2>
        <p className="text-muted-fg mb-8 text-center text-sm">각 Unit은 4가지 실제 상황으로 구성되어 있습니다</p>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-8">
          {units.map((u) => (
            <SectionCard key={u.title} variant="accent-left" className="rounded-lg p-5 md:p-7">
              <h3 className="text-ink mb-5 text-sm leading-normal font-extrabold md:text-[15px]">{u.title}</h3>
              <ul className="list-none">
                {u.items.map((item) => (
                  <li key={item} className="border-rule-faint text-muted-fg ml-2 border-l-2 pl-3 text-sm leading-[1.9] md:ml-4">
                    {item}
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}
        </div>
      </section>

      {/* 8. 프렌딩 스쿨 소개 */}
      <section className="px-6 py-10 md:py-14">
        <SectionCard variant="plain" className="my-8 rounded-xl p-6 text-center md:p-10">
          <h3 className="text-ink mb-6 text-xl font-extrabold md:text-2xl">프렌딩 스쿨은?</h3>
          <p className="text-muted-fg mb-4 text-sm leading-[1.95]">
            전국 120개 문화센터에서 외국어 클래스를 진행 중인
            <br />
            전문 외국어 교육 기관입니다.
          </p>
          <p className="text-muted-fg mt-6 mb-4 text-sm leading-[1.95]">
            롯데마트, 롯데백화점, 신세계백화점, 이마트,
            <br />
            트레이더스, AK플라자, NC 백화점
          </p>
          <p className="text-muted-fg mt-6 mb-4 text-sm leading-[1.95]">
            영어, 일본어, 중국어, 여행영어, 문법회화 등
            <br />
            다양한 과정을 제공하고 있습니다.
          </p>
          <p className="text-muted-fg mt-6 mb-4 text-sm leading-[1.95]">
            컨텐츠 제작, 호주 여행, 워홀 진행,
            <br />
            일문화교류 등 해외 진출을 위한
            <br />
            종합 교육 서비스를 제공합니다.
          </p>
        </SectionCard>
      </section>

      {/* 9. 최종 CTA */}
      <section
        id="apply"
        className="from-brand mx-6 mt-10 mb-8 rounded-xl bg-gradient-to-br to-[#ff6b7a] px-6 py-10 text-center text-white md:mt-12 md:py-14">
        <h2 id="apply-heading" className="mb-3 text-[22px] leading-snug font-black md:text-[28px]">
          버벅거리는 순간이 오기 전에
        </h2>
        <p className="mb-8 text-[22px] leading-snug font-extrabold md:text-[28px]">제대로 준비하세요</p>
        <ApplyForm />
      </section>
    </>
  );
}
