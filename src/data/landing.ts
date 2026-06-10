// 랜딩 페이지("청년을 세계로") 표시용 데이터.
// ⚠️ presentational only — project0607 프로토타입(js/index.js)에서 이식. Phase 3(교재 5종 확장)에서
// 실제 교재 데이터(reading_progress.course)와 재조정 예정. 현재는 셀프디벨롭/과정카드/유튜브 UI 렌더용.

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
    tags: [{ t: "무료", free: true }, { t: "음성 포함" }, { t: "24유닛" }],
    units: [
      { n: "Unit 01", t: "Mise en Place", sub: "준, 미장플라스를 익히다", situation: "준은 시드니의 한 프렌치 비스트로에 출근한 첫날, 셰프에게 미장플라스(mise en place, 모든 재료와 도구를 제자리에 미리 준비해 두는 것)를 배운다. 셰프는 준에게 자신의 스테이션(station, 작업 자리)을 정리하고 프렙 리스트(prep list, 준비 목록)대로 재료를 컨테이너(container, 보관 용기)에 담아 두라고 지시한다. 가니쉬(garnish, 장식용 재료)까지 모두 챙겨야 서비스를 시작할 수 있다.", s: "" },
      { n: "Unit 02", t: "Chopping & Cutting", sub: "준, 기본 칼질을 배우다", situation: "준은 미장플라스를 마치고 본격적으로 재료 손질을 시작한다. 셰프는 깨끗한 커팅 보드(cutting board, 도마)를 쓰라고 강조하며, 양파는 곱게 다지고(chop, 잘게 썰기), 빵은 얇게 자르고(slice), 당근은 깍둑썰기(dice)로, 마늘은 더 잘게 다지는(mince) 법을 알려준다. 균일한 칼질이 좋은 요리의 첫걸음이다.", s: "" },
      { n: "Unit 03", t: "French Cutting Techniques", sub: "준, 프렌치 컷팅 기법을 익히다", situation: "이제 준은 기본 썰기를 익혔다. 오늘은 셰프가 프렌치 컷팅 기법을 가르친다. 당근은 쥘리엔(julienne, 성냥개비 모양 채썰기)으로, 더 작게는 브뤼누아즈(brunoise, 1~2mm 정육면체)로 자른다. 굵은 막대 모양은 바토네(batonnet, 작은 막대썰기), 잎채소는 시포나드(chiffonade, 잎을 말아 가늘게 썰기)로 처리한다. 스톡용처럼 모양이 중요하지 않을 때는 러프 챱(rough chop, 거칠게 썰기)을 한다.", s: "" },
      { n: "Unit 04", t: "Peeling & Tomato Concassé", sub: "준, 토마토 콘카세를 만들다", situation: "준은 셰프에게 토마토 콘카세(tomato concassé, 토마토를 데쳐 껍질을 벗기고 씨를 제거한 뒤 잘게 다진 것)를 배운다. 먼저 토마토 윗부분에 십자로 칼집을 내고, 끓는 물에 잠깐 데친 후 얼음물에 넣는다. 그 다음 껍질을 벗기고(peel, 껍질 벗기기 / skin, 외피 제거하기), 반으로 잘라 씨를 제거하고(remove seeds), 가장자리를 다듬어(trim, 다듬기) 작게 다진다. 이 기본 손질은 수많은 프렌치 소스의 시작점이다.", s: "" },
      { n: "Unit 05", t: "Frying & Searing", sub: "준, 튀기기와 시어링을 배우다", situation: "준은 본격적인 조리법을 배우기 시작한다. 셰프는 다양한 튀김 기법을 가르친다. 기름에 깊이 잠기게 하는 딥프라이(deep-fry, 기름에 완전히 잠겨 튀기기), 적은 기름으로 표면만 익히는 섈로우 프라이(shallow fry, 얕은 기름에 지지기), 강한 불에 표면만 갈변시키는 시어링(sear, 센 불에 겉면 빠르게 익히기), 기름에 빠르게 볶는 소테(sauté, 빠르게 볶기)까지. 모두 불의 강도가 핵심이다.", s: "" },
      { n: "Unit 06", t: "Boiling & Simmering", sub: "준, 끓이기와 약불을 익히다", situation: "준은 다양한 끓이기 기법을 배운다. 강한 거품이 올라오는 롤링 보일(rolling boil, 펄펄 끓는 상태)부터 약불에서 잔잔하게 끓는 시머(simmer, 약하게 끓이기)까지 그 차이가 중요하다. 큰 스톡팟(stockpot, 육수용 큰 냄비)에 채소와 뼈를 넣고 천천히 시머링하면 풍부한 육수가 된다. 마지막으로 졸여서(reduce, 졸이기) 농도와 풍미를 진하게 만든다.", s: "" },
      { n: "Unit 07", t: "Poaching & Blanching", sub: "준, 포칭과 블랜칭을 익히다", situation: "준은 부드러운 익힘 기법을 배운다. 끓기 직전의 잔잔한 물에서 익히는 포칭(poach, 약한 물에서 천천히 익히기)은 계란이나 생선에 적합하다. 시금치나 콩 같은 채소는 끓는 소금물에 잠깐 데친(blanch, 데치기) 뒤, 얼음물(ice bath, 얼음물)에 충격(shock, 찬물로 즉시 식혀 조리 중단)을 줘 색을 살린다. 마지막으로 잘 빼서(drain, 물기 빼기) 사용한다.", s: "" },
      { n: "Unit 08", t: "Steaming & Roasting", sub: "준, 찜과 로스팅을 익히다", situation: "준은 오븐과 찜기를 사용하는 법을 배운다. 채소와 고기를 트레이(tray, 오븐 팬)에 올려 오븐랙(oven rack, 오븐 선반)에 넣고 로스트(roast, 오븐에 굽기)하면 표면이 캐러멜라이즈되며 풍미가 진해진다. 한편 만두나 생선은 찜기에 넣고 스팀(steam, 증기로 익히기)으로 부드럽게 익힌다. 빵과 케이크는 베이크(bake, 오븐에 굽기)한다. 같은 오븐도 용도에 따라 다른 표현을 쓴다.", s: "" },
    ],
    extra: [
      { n: "Unit 09", t: "Caramelizing & Sweating", sub: "준, 캐러멜라이징과 스웨팅을 익히다", situation: "준은 향채의 풍미를 끌어올리는 두 가지 핵심 기법을 배운다. 약한 불에서 뚜껑을 덮고 색은 내지 않고 부드럽게 익히는 스웨팅(sweat, 약불에 색 없이 익히기), 그리고 더 강한 불에서 노릇한 색과 단맛을 끌어내는 캐러멜라이징(caramelize, 노릇하게 단맛 끌어올리기)이다. 또한 고기 표면을 갈변시키는 브라우닝(brown, 갈변시키기), 채소를 부드럽게 익히는 소프트닝(soften, 부드럽게 익히기), 마지막에 윤기를 주는 글레이즈(glaze, 윤기내기)도 함께 익힌다.", s: "" },
      { n: "Unit 10", t: "Seasoning & Garnishing", sub: "준, 시즈닝과 가니쉬를 익히다", situation: "준은 요리의 마무리 단계를 배운다. 모든 요리는 시즈닝(season, 간하기)으로 맛이 완성된다. 셰프는 \"맛보며 간하기\"의 원칙을 강조한다. 향을 더하는 허브(herbs, 허브)를 잘게 다지고, 갓 갈은 크랙드 페퍼(cracked pepper, 굵게 간 후추)를 뿌린다. 마지막으로 플레이팅(plating, 접시 담기) 위에 가니쉬(garnish, 장식 재료)를 올려야 한 접시가 완성된다.", s: "" },
      { n: "Unit 11", t: "Pureeing & Pulsing", sub: "준, 퓌레와 펄싱을 익히다", situation: "준은 부드러운 텍스처를 만드는 법을 배운다. 수프나 소스를 매끄럽게 만들려면 푸드 프로세서(food processor, 분쇄기) 또는 핸드블렌더에 재료를 넣고 퓌레(puree, 곱게 갈기)한다. 살사처럼 거친 식감을 원하면 잠깐씩 끊어 돌리는 펄스(pulse, 짧게 끊어 갈기)를 한다. 두 기법 모두 끝나면 매끄러운 텍스처(smooth texture, 부드러운 질감)와 균일한 블렌딩(blend, 골고루 섞기)이 핵심이다.", s: "" },
      { n: "Unit 12", t: "Thickening Techniques", sub: "준, 농도 조절 기법을 익히다", situation: "준은 소스의 농도를 조절하는 법을 배운다. 가장 클래식한 방법은 버터와 밀가루를 함께 볶아 만든 루(roux, 버터·밀가루 농후제)다. 더 빠르게는 옥수수전분(cornstarch, 옥수수전분)을 찬물에 풀어 만든 슬러리(slurry, 전분 물)를 끓는 소스에 풀어 넣는다. 졸여서(reduce, 졸이기) 수분을 자연스럽게 날리는 방법도 있다. 마지막으로 노른자와 크림으로 만든 리에종(liaison, 노른자·크림 농후제)은 부드럽고 우아한 마무리에 쓰인다.", s: "" },
      { n: "Unit 13", t: "Bard & Lard", sub: "준, 바딩과 라딩을 익히다", situation: "준은 살코기를 부드럽게 익히는 클래식 프렌치 기법을 배운다. 바딩(bard, 베이컨이나 비계로 감싸 굽기)은 살코기(lean meat, 살코기) 겉을 베이컨으로 감싸(wrap) 굽는 방법이다. 라딩(lard, 살코기 안에 지방 박아넣기)은 가는 막대 모양 지방(fat, 지방)을 살코기 내부에 직접 끼워 넣어 익히는 동안 풍미와 수분을 더한다. 두 기법 모두 마른 살코기를 촉촉하게 만드는 셰프의 무기다.", s: "" },
      { n: "Unit 14", t: "Confit & Slow Cooking", sub: "준, 콩피와 슬로우 쿠킹을 익히다", situation: "준은 프렌치 클래식 중에서도 가장 인내심을 요하는 기법인 콩피(confit, 지방에 잠겨 천천히 익히기)를 배운다. 오리 다리를 소금에 절인 뒤, 덕 팻(duck fat, 오리 기름)에 잠기게 해 약불(low heat, 약불)에서 2~3시간 천천히 익히면 텐더(tender, 부드러운)한 식감이 된다. 원래는 식재료를 보존(preserve, 보존하기)하기 위한 기법이었지만, 지금은 풍미를 위해 쓴다.", s: "" },
      { n: "Unit 15", t: "Stocks & Broths", sub: "준, 스톡과 육수를 익히다", situation: "준은 프렌치 주방의 영혼인 스톡 만들기를 배운다. 닭뼈로 만드는 치킨 스톡(chicken stock, 닭 육수), 생선 뼈로 만드는 피쉬 스톡(fish stock, 생선 육수), 그리고 뼈를 진하게 구워 짙은 색을 낸 다크 스톡(dark stock, 진한 갈색 육수)이 있다. 야채와 허브로 더 가벼운 브로스(broth, 가벼운 육수)도 만든다. 다크 스톡을 졸여 진한 데미글라스(demi-glace, 짙게 졸인 갈색 소스)로 마무리한다.", s: "" },
      { n: "Unit 16", t: "Sauces", sub: "준, 클래식 소스를 익히다", situation: "준은 클래식 프렌치 소스를 배운다. 우유와 루로 만든 베샤멜(béchamel, 화이트 크림 소스), 마늘 마요네즈인 아이올리(aioli, 마늘 마요네즈), 식초와 기름으로 만든 비네그레트(vinaigrette, 식초 드레싱), 후추와 크림이 들어간 페퍼 소스(pepper sauce, 후추 소스), 그리고 다크 스톡을 짙게 졸인 데미글라스(demi-glace, 짙은 갈색 소스). 셰프는 소스의 농도와 광택, 시즈닝이 한 접시를 완성한다고 강조한다.", s: "" },
      { n: "Unit 17", t: "During Service", sub: "준, 서비스 한복판에 서다", situation: "드디어 서비스(service, 영업 시간) 시간이다. 패스에서는 익스피다이터가 티켓(ticket, 주문 전표)을 큰 소리로 외치고, 셰프는 주문(order, 주문)을 정리해 \"All day!\"라고 외친다. \"All day(all day, 합계로 몇 개)\"는 지금까지 들어온 같은 메뉴의 총 개수를 뜻한다. 음식이 완성되면 픽업(pickup, 픽업)을 외쳐 서버에게 알린다. 빠르고 정확한 호흡, 그게 서비스의 전부다.", s: "" },
      { n: "Unit 18", t: "Fire & Refire", sub: "준, 파이어와 리파이어를 다루다", situation: "서비스 중 가장 자주 듣는 명령이 파이어(fire, 조리 시작)다. \"Fire\"는 \"지금 익히기 시작하라\"는 뜻이다. 손님 컴플레인이나 실수로 다시 만들어야 할 때는 리파이어(refire, 다시 조리하기)나 리메이크(remake, 처음부터 다시 만들기)를 한다. 가장 흔한 이유는 오버쿡(overcooked, 너무 익은)이나 언더쿡(undercooked, 덜 익은). 빠르고 정확한 응답이 손님과 셰프 모두를 살린다.", s: "" },
      { n: "Unit 19", t: "Kitchen Safety", sub: "준, 주방 안전 호출을 익히다", situation: "주방은 좁고 위험한 공간이다. 동료 뒤로 지나갈 때는 비하인드(behind, 뒤로 지나갑니다)나 코너(corner, 코너 돌아갑니다)를 큰 소리로 외친다. 뜨거운 팬(hot pan, 뜨거운 팬)을 들고 이동할 때도, 날카로운 칼(sharp knife, 날카로운 칼)을 옮길 때도 마찬가지. 바닥에 스필(spill, 흘린 물·기름)이 생기면 즉시 외쳐서 알린다. 큰 목소리가 모두를 살린다.", s: "" },
      { n: "Unit 20", t: "Rush Hour Communication", sub: "준, 러시 아워를 견뎌내다", situation: "주방이 폭주(slammed, 폭주한)하는 러시 아워(rush, 폭주 시간)에는 짧고 빠른 영어가 필수다. 셰프는 모두에게 \"We're slammed!\"라고 외치며 분위기를 다잡는다. 러시에는 프렙(prep, 준비된 재료)이 빠르게 떨어진다 — 어떤 재료가 러닝 로(running low, 거의 떨어지는 상태)인지 즉시 보고해야 한다. 백업(backup, 예비 재료)을 미리 꺼내두는 것이 셰프의 생존 비결이다.", s: "" },
      { n: "Unit 21", t: "Potatoes & Fries", sub: "준, 감자 사이드를 책임지다", situation: "준은 이제 프렌치 비스트로의 사이드 디시를 책임지게 되었다. 가장 자주 나가는 건 프라이(fries, 프렌치프라이)와 매시드 포테이토(mashed potatoes, 으깬 감자). 그 외에도 통째로 굽는 베이크드 포테이토(baked potatoes, 베이크드 포테이토), 동그랗게 빚어 튀긴 크로켓(croquettes, 크로켓), 그리고 우아한 모양으로 짜낸 뒤시스 포테이토(duchess potatoes, 뒤시스 포테이토)까지. 감자 하나로도 셰프의 솜씨가 드러난다.", s: "" },
      { n: "Unit 22", t: "Eggs & Breakfast", sub: "준, 브런치 서비스에 투입되다", situation: "준은 브런치 서비스에 투입된다. 가장 까다로운 게 계란이다. 식초 푼 잔잔한 물에서 익히는 포치드 에그(poached egg, 포치드 에그), 부드럽게 휘저은 스크램블드 에그(scrambled egg, 스크램블드 에그), 반숙으로 삶은 소프트 보일드(soft-boiled, 반숙 계란), 팬에 굽는 프라이드 에그(fried egg, 프라이드 에그), 그리고 가장 어려운 오믈렛(omelet, 오믈렛). 손님이 원하는 방식대로 정확히 내야 한다.", s: "" },
      { n: "Unit 23", t: "Soups & Purees", sub: "준, 수프와 퓌레를 마스터하다", situation: "준은 다양한 수프를 만든다. 갑각류로 만든 진한 비스크(bisque, 갑각류 크림 수프), 맑게 정제한 콘소메(consommé, 맑은 수프), 채소를 곱게 간 퓌레(puree, 퓌레 수프), 그리고 크림이 들어간 클래식 크림 수프(cream soup, 크림 수프). 마지막 한 방울이 결정한다 — 가니쉬 오일(garnish oil, 마무리 허브 오일)을 한두 방울 떨어뜨려 색과 향을 더한다.", s: "" },
      { n: "Unit 24", t: "Modern Kitchen Techniques", sub: "준, 모던 기법으로 시리즈를 완성하다", situation: "마지막 Unit이다. 준은 현대 프렌치 주방의 모던 기법까지 익힌다. 진공포장한 재료를 정밀한 온도의 물에서 익히는 수비드(sous vide, 정밀 저온 조리)와 진공 쿠킹(vacuum cook, 진공 조리), 크림이나 액체에 가스를 주입해 거품(foam, 거품)을 만드는 사이펀(siphon, 가스 주입기), 그리고 액체를 굳혀 만든 젤리(jelly, 젤리). 24개 Unit을 마친 준은 이제 견습 단계를 졸업하고, 주방의 모든 호흡을 영어로 다룰 수 있는 주니어 셰프로 한 걸음 다가섰다.", s: "" },
    ],
    exLabel: "유닛 전체 보기 (16개 더)",
  },
  {
    key: "basic1",
    title: "회화기초 문법 1 — 기초부터 탄탄하게",
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
    title: "회화기초 문법 2 — 실전 회화 완성",
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
    title: "화장품 수출 영어 — 글로벌 비즈니스 실전",
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
