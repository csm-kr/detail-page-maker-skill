export const PRODUCTION_ROADMAP = {
  schemaVersion: 1,
  title: "원본에서 상세페이지까지",
  summary:
    "화이트 루즈핏 쿨토시를 먼저 보여주고, 시원하게·조임 없이·손등까지·화이트 스타일이라는 네 가지 선택 이유를 서로 다른 증거로 이어갑니다.",
  strategy: {
    heroThesis: "시원하게, 조임 없이, 손등까지. 화이트로 가볍게.",
    singleJob:
      "여름 일상에서 팔과 손등을 한 번에 가리면서도 달라붙는 느낌과 기능성 토시 같은 인상을 줄이고 싶은 사람을 위한 선택입니다.",
    planningOverview: [
      {
        title: "고객의 구매 계기",
        body: "몸에 딱 붙는 스포츠형 토시가 부담스럽고, 팔과 손등을 따로 가려야 했던 여름 외출",
      },
      {
        title: "첫 화면의 약속",
        body: "화이트 루즈핏 쿨토시를 바로 보여주고, 시원하게·조임 없이·손등까지라는 가치를 함께 전달",
      },
      {
        title: "핵심 소구 4가지",
        body: "얇고 여유 있는 여름 구조, 딱 붙지 않는 루즈핏, 손등 커버와 안쪽 엄지홀, 화이트 데일리 스타일",
      },
      {
        title: "반드시 보여줄 장면",
        body: "양팔 착용, 손등 비교와 안쪽 엄지홀, 플리츠 매크로, 산책과 일상, 착용과 크기 이펙트",
      },
      {
        title: "옵션·사용법·구성",
        body: "화이트 색상과 공급처 표기 47 × 14cm를 확인하고, 착용 과정은 설명문 대신 한 개의 GIF로 전달",
      },
      {
        title: "구매 전 불안·FAQ",
        body: "엄지홀 위치, 앞뒤 방향, 한 쌍 구성, 크기, 공급처 기준 관리 방법을 구매 직전에 확인",
      },
      {
        title: "과장 없는 카피 범위",
        body: "쿨토시는 제품명으로 사용하고 시원함은 얇고 여유 있는 여름 인상으로만 표현. 냉감 수치·자외선 차단율·속건 등 시험 없는 표현은 제외",
      },
      {
        title: "섹션 순서·디자인 리듬",
        body: "제품 공개 → 불편과 답 → 네 가지 선택 이유 → 사용 GIF와 일상 예시 → 디테일 → 크기 이펙트 → FAQ → 최종 요약. 독립 모션 갤러리는 두지 않음",
      },
    ],
    primaryAppeals: [
      {
        order: 1,
        name: "시원하게",
        message: "얇고 여유 있는 플리츠 실루엣으로 가볍게 보이는 여름 토시",
        proof: "화이트 원단 매크로와 살랑이는 루즈핏 착용 장면",
      },
      {
        order: 2,
        name: "조임 없이",
        message: "팔에 딱 붙는 압박형이 아닌 여유 있게 떨어지는 착용감",
        proof: "팔꿈치를 굽혀도 여유가 보이는 전신·근접 장면",
      },
      {
        order: 3,
        name: "손등까지",
        message: "팔에서 끝나지 않고 손가락 시작점까지 자연스럽게 이어지는 커버",
        proof: "안쪽 엄지홀과 손등 커버 범위 클로즈업",
      },
      {
        order: 4,
        name: "화이트 스타일",
        message: "기능성 장비보다 밝은 여름 옷에 자연스럽게 이어지는 데일리 화이트",
        proof: "산책, 출퇴근, 실내 사용 장면",
      },
    ],
    sourceDocuments: [
      "planning/COMMERCIAL.md",
      "planning/DESIGN.md",
      "planning/BUYER-JOURNEY.md",
    ],
  },
  gate: {
    requiredApprovedCount: 25,
    description:
      "실제품 원장 1개, 제품·배경·착용·증거 필수 에셋 23개와 선택 모델 1개가 준비·승인되어야 최종 이미지와 GIF 제작을 시작할 수 있습니다.",
  },
  groups: [
    {
      id: "product-foundation",
      name: "실제 제품·누끼·방향별 뷰",
      description:
        "사용자 촬영 원본을 제품 외형의 기준으로 삼아 전체형, 앞·뒤·옆면과 소재를 준비합니다.",
    },
    {
      id: "model-selection",
      name: "모델 후보·모델 SSOT",
      description:
        "후보를 비교해 한 명을 승인하면 얼굴·체형·헤어·피부톤·의상을 이후 인간 장면에 고정합니다.",
    },
    {
      id: "background",
      name: "배경·공간 전용",
      description:
        "제품과 모델이 없는 깨끗한 공간 레퍼런스입니다. 최종 장면의 조명과 분위기만 담당합니다.",
    },
    {
      id: "use-example",
      name: "착용·사용 예시",
      description:
        "승인 모델과 제품 SSOT를 함께 사용해 실제 생활 속 착용 장면을 만듭니다.",
    },
    {
      id: "proof-detail",
      name: "소재·구조·동작 증거",
      description:
        "플리츠, 밴딩, 루즈핏, 손등 커버처럼 눈으로 확인할 수 있는 구조를 근접 증거로 만듭니다.",
    },
  ],
  assets: [
    {
      id: "product-contact-sheet",
      name: "실제품 원본 접촉판",
      role: "product-contact-sheet",
      group: "product-foundation",
      purpose: "등록한 실사진과 라벨·색상·앞뒤 구조를 한눈에 확인하는 제품 사실 원장",
      sourceMode: "product-ssot-derived",
      generatable: false,
      requiresModel: false,
      required: true,
      pageNumbers: [2, 3, 13, 14],
      prompt: "",
    },
    {
      id: "pair-product",
      name: "화이트 한 쌍 플랫레이",
      role: "pair-product",
      group: "product-foundation",
      purpose: "판매 구성 한 쌍의 전체 길이와 자연스럽게 안쪽으로 접힌 엄지홀 확인",
      sourceMode: "product-ssot",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [2, 3, 13, 14],
      prompt:
        "실제품 SSOT와 같은 화이트 쿨토시 한 쌍을 밝은 중성 배경에 나란히 펼친 플랫레이. 엄지홀은 실제 원본처럼 안쪽으로 접혀 겉에서 보이지 않을 수 있고, 손등 면의 작은 흰색 직조 라벨 HELLO / CUTE SLEEVE와 길고 여유 있는 플리츠 실루엣을 정확히 유지한다.",
    },
    {
      id: "single-front-view",
      name: "단품 앞면 전체 뷰",
      role: "single-front-view",
      group: "product-foundation",
      purpose: "단품의 길이·상단 밴딩·플리츠 폭을 확인하는 앞면 제품 뷰",
      sourceMode: "product-ssot",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [3, 13],
      prompt:
        "화이트 쿨토시 단품의 앞면을 수직으로 곧게 펼친 제품 사진. 제품 전체가 잘리지 않고 상단 밴딩, 얇은 세로 플리츠, 여유 있는 폭을 실제품 SSOT와 동일하게 유지하며 추가 문자와 장식은 넣지 않는다.",
    },
    {
      id: "single-back-view",
      name: "단품 손등면 전체 뷰",
      role: "single-back-view",
      group: "product-foundation",
      purpose: "손등 방향과 라벨 위치를 확인하는 반대면 제품 뷰",
      sourceMode: "product-ssot",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [3, 5, 13],
      prompt:
        "화이트 쿨토시 단품의 손등 방향 면을 곧게 펼친 제품 사진. 작은 흰색 직조 라벨은 손등 중앙 위치에 한 개만 두고 검정 2단 HELLO / CUTE SLEEVE를 정확히 유지한다.",
    },
    {
      id: "single-side-view",
      name: "단품 측면 실루엣",
      role: "single-side-view",
      group: "product-foundation",
      purpose: "압박형이 아닌 루즈핏 폭과 원단 두께를 확인하는 측면 제품 뷰",
      sourceMode: "product-ssot",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [3, 4],
      prompt:
        "화이트 쿨토시 단품의 측면 실루엣 제품 사진. 얇은 플리츠 원단과 여유 있는 튜브 폭을 실제품처럼 보이고 압박형 스포츠 토시처럼 좁거나 두껍게 만들지 않는다.",
    },
    {
      id: "hero-product-white-loosefit",
      name: "화이트 루즈핏 히어로",
      role: "hero-product",
      group: "product-foundation",
      purpose: "상세페이지 첫 제품 답과 최종 요약에 사용하는 대표 제품 이미지",
      sourceMode: "product-ssot",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [1, 2, 14],
      prompt:
        "실제품 SSOT를 기준으로 화이트 쿨토시 한 쌍이 가장 먼저 읽히는 프리미엄 스튜디오 제품 히어로. 길고 여유 있는 루즈핏, 얇은 세로 플리츠, 손등 커버, 작은 HELLO / CUTE SLEEVE 라벨을 유지하고 사람과 광고 카피는 넣지 않는다.",
    },
    {
      id: "label-position-macro",
      name: "손등 라벨 위치 매크로",
      role: "label-position-macro",
      group: "product-foundation",
      purpose: "라벨 문구가 아니라 실제 손등 방향과 봉제 위치를 확인하는 동일성 증거",
      sourceMode: "product-ssot",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [5, 14],
      prompt:
        "화이트 쿨토시 손등 면의 작은 흰색 직조 라벨과 주변 봉제를 보여주는 사실적 매크로. 검정 2단 HELLO / CUTE SLEEVE를 정확히 유지하되 라벨을 구매 소구처럼 과장하지 않는다.",
    },
    {
      id: "material-detail",
      name: "플리츠 원단 매크로",
      role: "material-detail",
      group: "product-foundation",
      purpose: "얇은 세로 플리츠·직물 결·봉제 마감을 확인하는 소재 증거",
      sourceMode: "product-ssot",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [6],
      prompt:
        "실제품 화이트 쿨토시의 가늘고 불규칙한 세로 플리츠, 얇은 직물 결, 봉제 마감을 보여주는 사실적인 소재 매크로. 확인되지 않은 냉감 수치나 기능 그래픽은 넣지 않는다.",
    },
    {
      id: "model-candidate-a",
      name: "모델 후보 A · 차분한 데일리",
      role: "model-candidate-a",
      group: "model-selection",
      purpose: "정면·측면·3/4·전신·상반신·양손을 비교하는 모델 후보 시트",
      sourceMode: "model-candidate",
      generatable: true,
      requiresModel: false,
      required: false,
      pageNumbers: [],
      prompt:
        "30대 한국인 여성 한 명의 캐스팅용 모델 아이덴티티 턴어라운드 시트. 자연스러운 피부결, 짙은 갈색 어깨 길이 머리, 건강한 일상 체형, 아이보리 반소매 상의와 연한 데님. 같은 인물의 전신 정면·측면·3/4, 상반신, 얼굴 클로즈업, 양손과 팔을 한 시트에 보여준다. 양팔은 반소매 끝부터 손끝까지 맨살이 완전히 드러나고 손목과 손은 맨손인 상태다. 깨끗한 중성 배경이며 문자, 수치, 액세서리는 없다.",
    },
    {
      id: "model-candidate-b",
      name: "모델 후보 B · 밝은 액티브",
      role: "model-candidate-b",
      group: "model-selection",
      purpose: "밝고 활동적인 인상의 얼굴·체형·헤어·기본 의상 후보",
      sourceMode: "model-candidate",
      generatable: true,
      requiresModel: false,
      required: false,
      pageNumbers: [],
      prompt:
        "30대 한국인 여성 한 명의 캐스팅용 모델 아이덴티티 턴어라운드 시트. 자연스러운 피부결, 묶은 짙은 머리, 건강한 일상 체형, 장식 없는 화이트 반소매와 베이지 팬츠. 같은 인물의 전신 정면·측면·3/4, 상반신, 얼굴 클로즈업, 양손과 팔을 한 시트에 보여준다. 양팔은 반소매 끝부터 손끝까지 맨살이 완전히 드러나고 손목과 손은 맨손인 상태다. 깨끗한 중성 배경이며 문자, 수치, 액세서리는 없다.",
    },
    {
      id: "model-candidate-c",
      name: "모델 후보 C · 자연스러운 출근룩",
      role: "model-candidate-c",
      group: "model-selection",
      purpose: "차분한 출퇴근 장면에 맞는 모델 인상과 기본 의상 후보",
      sourceMode: "model-candidate",
      generatable: true,
      requiresModel: false,
      required: false,
      pageNumbers: [],
      prompt:
        "30대 한국인 여성 한 명의 캐스팅용 모델 아이덴티티 턴어라운드 시트. 자연스러운 피부결, 짙은 단발머리, 건강한 일상 체형, 장식 없는 연회색 반소매와 네이비 팬츠. 같은 인물의 전신 정면·측면·3/4, 상반신, 얼굴 클로즈업, 양손과 팔을 한 시트에 보여준다. 양팔은 반소매 끝부터 손끝까지 맨살이 완전히 드러나고 손목과 손은 맨손인 상태다. 깨끗한 중성 배경이며 문자, 수치, 액세서리는 없다.",
    },
    {
      id: "model-candidate-d",
      name: "모델 후보 D · 편안한 주말룩",
      role: "model-candidate-d",
      group: "model-selection",
      purpose: "야외 산책·생활 장면에 맞는 편안한 모델 인상과 의상 후보",
      sourceMode: "model-candidate",
      generatable: true,
      requiresModel: false,
      required: false,
      pageNumbers: [],
      prompt:
        "30대 한국인 여성 한 명의 캐스팅용 모델 아이덴티티 턴어라운드 시트. 자연스러운 피부결, 긴 짙은 머리를 낮게 묶은 스타일, 건강한 일상 체형, 장식 없는 크림 반소매와 카키 팬츠. 같은 인물의 전신 정면·측면·3/4, 상반신, 얼굴 클로즈업, 양손과 팔 동작을 한 시트에 보여준다. 양팔은 반소매 끝부터 손끝까지 맨살이 완전히 드러나고 손목과 손은 맨손인 상태다. 깨끗한 중성 배경이며 문자, 수치, 액세서리는 없다.",
    },
    {
      id: "background-studio",
      name: "밝은 중성 스튜디오 배경",
      role: "background-studio",
      group: "background",
      purpose: "제품 히어로·전체형·구조 설명에 쓰는 깨끗한 조명 배경",
      sourceMode: "scene-reference",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [2, 3, 5, 6, 7],
      prompt:
        "제품과 사람이 없는 밝은 웜화이트 스튜디오 배경. 부드러운 사선 자연광, 옅은 회색 그림자, 제품을 크게 배치할 충분한 중앙 여백. 문자, 소품, 로고 없음.",
    },
    {
      id: "background-window-daylight",
      name: "창가 자연광 생활 배경",
      role: "background-window-daylight",
      group: "background",
      purpose: "루즈핏 착용·카페·일상 장면의 부드러운 자연광 기준",
      sourceMode: "scene-reference",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [1, 4, 10],
      prompt:
        "제품과 사람이 없는 밝은 실내 창가 생활 배경. 여름 낮의 부드러운 확산광, 웜화이트 벽과 밝은 목재, 팔과 손을 배치할 여백. 문자와 브랜드 소품 없음.",
    },
    {
      id: "background-car-interior",
      name: "정차 차량 실내 배경",
      role: "background-car-interior",
      group: "background",
      purpose: "운전 착용 장면의 안전한 정차 상태와 카메라 위치 기준",
      sourceMode: "scene-reference",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [8],
      prompt:
        "제품과 사람이 없는 밝은 정차 차량 운전석 배경. 대한민국 도로 환경에 맞는 좌핸들 차량으로 운전대가 차량 왼쪽 운전석에 분명히 위치한다. 운전대와 양팔이 들어갈 구도가 분명하고 주행 속도감이나 위험 연출이 없다. 차량 로고와 문자는 제거한다.",
    },
    {
      id: "background-summer-walk",
      name: "여름 산책길 배경",
      role: "background-summer-walk",
      group: "background",
      purpose: "야외 산책·자전거·가드닝 예시의 밝은 계절감 기준",
      sourceMode: "scene-reference",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [9, 11],
      prompt:
        "제품과 사람이 없는 밝은 여름 산책길 배경. 부드러운 녹음, 과하지 않은 햇빛, 인물 전신과 양팔을 배치할 충분한 공간. 자외선 수치, 아이콘, 문자 없음.",
    },
    {
      id: "background-neutral-proof",
      name: "중성 구조 증거 배경",
      role: "background-neutral-proof",
      group: "background",
      purpose: "엄지홀·손등 커버·밴딩·GIF 동작이 정확히 보이는 무채색 기준",
      sourceMode: "scene-reference",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [5, 7, 12],
      prompt:
        "제품과 사람이 없는 밝은 무채색 구조 증거 배경. 손과 팔의 윤곽, 흰색 제품의 플리츠와 봉제가 구분되는 중간 명도. 문자, 그래픽, 소품 없음.",
    },
    {
      id: "wearing-scene",
      name: "화이트 루즈핏 양팔 착용",
      role: "wearing-scene",
      group: "use-example",
      purpose: "팔꿈치 위부터 손등까지 전체 길이와 여유 있는 핏을 보여주는 기본 착용",
      sourceMode: "product-and-model-ssot",
      generatable: true,
      requiresModel: true,
      required: true,
      pageNumbers: [1, 4],
      prompt:
        "승인 모델이 화이트 쿨토시 한 쌍을 양팔에 자연스럽게 착용한 장면. 팔꿈치 위부터 손등까지 전체 길이, 루즈핏, 플리츠, 손등 라벨을 실제 제품 SSOT와 동일하게 유지한다.",
    },
    {
      id: "driving-scene",
      name: "화이트 운전 착용 장면",
      role: "driving-scene",
      group: "use-example",
      purpose: "정차 차량에서 운전대를 잡을 때 손등 커버가 보이는 사용 예시",
      sourceMode: "product-and-model-ssot",
      generatable: true,
      requiresModel: true,
      required: true,
      pageNumbers: [8],
      prompt:
        "승인 모델이 정차 차량에서 양손으로 운전대를 자연스럽게 잡은 장면. 화이트 쿨토시의 손등 커버와 라벨 방향을 실제 제품처럼 유지하고 위험한 주행 연출은 하지 않는다.",
    },
    {
      id: "outdoor-scene",
      name: "화이트 여름 야외 착용",
      role: "outdoor-scene",
      group: "use-example",
      purpose: "밝은 여름 야외에서 양팔 전체 실루엣을 보여주는 대표 생활 장면",
      sourceMode: "product-and-model-ssot",
      generatable: true,
      requiresModel: true,
      required: true,
      pageNumbers: [9],
      prompt:
        "승인 모델이 밝은 여름 산책길을 편안히 걷는 장면. 화이트 쿨토시 한 쌍의 전체 길이와 여유 있는 핏을 실제 제품처럼 유지하며 확인되지 않은 자외선·냉감 효과 그래픽은 넣지 않는다.",
    },
    {
      id: "commute-scene",
      name: "출퇴근 보행 착용",
      role: "commute-scene",
      group: "use-example",
      purpose: "가방을 들고 걷는 출퇴근 상황에서 자연스러운 양팔 착용 예시",
      sourceMode: "product-and-model-ssot",
      generatable: true,
      requiresModel: true,
      required: true,
      pageNumbers: [10],
      prompt:
        "승인 모델이 가벼운 가방을 들고 밝은 보행로를 걷는 출퇴근 장면. 같은 모델 얼굴·체형·의상과 화이트 쿨토시 한 쌍의 실제 구조를 유지한다.",
    },
    {
      id: "cafe-scene",
      name: "창가 카페 일상 착용",
      role: "cafe-scene",
      group: "use-example",
      purpose: "실내외를 오가는 일상 스타일에 자연스럽게 어울리는 착용 예시",
      sourceMode: "product-and-model-ssot",
      generatable: true,
      requiresModel: true,
      required: true,
      pageNumbers: [10],
      prompt:
        "승인 모델이 밝은 창가 테이블에서 자연스럽게 앉아 있는 일상 장면. 양팔의 화이트 쿨토시가 과장 없이 보이고 제품 SSOT와 모델 SSOT를 모두 유지한다.",
    },
    {
      id: "bicycle-scene",
      name: "자전거 정차 착용",
      role: "bicycle-scene",
      group: "use-example",
      purpose: "정차한 자전거 핸들을 잡을 때 양팔과 손등을 보여주는 야외 예시",
      sourceMode: "product-and-model-ssot",
      generatable: true,
      requiresModel: true,
      required: true,
      pageNumbers: [11],
      prompt:
        "승인 모델이 정차한 자전거 옆에서 핸들을 가볍게 잡은 안전한 장면. 양팔의 화이트 쿨토시 전체 길이, 손등 커버, 플리츠를 실제 제품처럼 유지한다.",
    },
    {
      id: "gardening-scene",
      name: "가벼운 가드닝 착용",
      role: "gardening-scene",
      group: "use-example",
      purpose: "화분을 돌보는 가벼운 야외 활동에서 손등과 팔 커버를 보여주는 예시",
      sourceMode: "product-and-model-ssot",
      generatable: true,
      requiresModel: true,
      required: true,
      pageNumbers: [11],
      prompt:
        "승인 모델이 작은 화분을 돌보는 밝은 야외 장면. 화이트 쿨토시 한 쌍의 손등 커버와 루즈핏을 실제 제품처럼 유지하고 과도한 보호 효과는 암시하지 않는다.",
    },
    {
      id: "structure-proof",
      name: "엄지홀·손등 커버 디테일",
      role: "structure-proof",
      group: "proof-detail",
      purpose: "착용 시 엄지홀은 안쪽에 자연스럽게 들어가고 손등 커버가 이어지는 실제 구조 증거",
      sourceMode: "product-and-model-ssot",
      generatable: true,
      requiresModel: true,
      required: true,
      pageNumbers: [5],
      prompt:
        "승인 모델의 손에 화이트 쿨토시를 착용한 손등 근접 사진. 엄지홀은 실제 구조처럼 안쪽에 자연스럽게 들어가 과장되게 벌어지지 않고, 손등 커버와 라벨 방향을 정확히 유지한다.",
    },
    {
      id: "loosefit-elbow-detail",
      name: "팔꿈치 루즈핏 디테일",
      role: "loosefit-elbow-detail",
      group: "proof-detail",
      purpose: "팔을 굽혀도 원단이 압박형처럼 달라붙지 않는 여유 있는 실루엣 증거",
      sourceMode: "product-and-model-ssot",
      generatable: true,
      requiresModel: true,
      required: true,
      pageNumbers: [4],
      prompt:
        "승인 모델이 팔을 자연스럽게 굽힌 팔꿈치 부근 근접 사진. 화이트 쿨토시의 얇은 플리츠와 여유 있는 루즈핏 주름을 실제 제품처럼 유지한다.",
    },
    {
      id: "cuff-band-detail",
      name: "상단 밴딩·봉제 디테일",
      role: "cuff-band-detail",
      group: "proof-detail",
      purpose: "상단 밴딩의 폭, 봉제, 플리츠 연결을 보여주는 제품 단독 증거",
      sourceMode: "product-ssot",
      generatable: true,
      requiresModel: false,
      required: true,
      pageNumbers: [7],
      prompt:
        "화이트 쿨토시 상단 밴딩과 플리츠 원단 연결 봉제를 보여주는 제품 단독 매크로. 실제품 폭과 얇은 소재를 유지하고 기능 수치나 추가 라벨은 넣지 않는다.",
    },
    {
      id: "handback-coverage-detail",
      name: "손등 커버 범위 디테일",
      role: "handback-coverage-detail",
      group: "proof-detail",
      purpose: "손등에서 손가락 시작점까지 이어지는 커버 범위를 보여주는 근접 증거",
      sourceMode: "product-and-model-ssot",
      generatable: true,
      requiresModel: true,
      required: true,
      pageNumbers: [5, 7],
      prompt:
        "승인 모델의 손등을 카메라에 향한 근접 사진. 화이트 쿨토시가 손등에서 손가락 시작점까지 자연스럽게 이어지고 작은 HELLO / CUTE SLEEVE 라벨이 실제 위치에 보인다.",
    },
  ],
  pages: [
    {
      number: 1,
      id: "pain-recognition",
      name: "제품 한눈에",
      headline: "화이트 루즈핏 쿨토시.",
      sellingPoint: "시원하게, 조임 없이, 손등까지.",
      purpose: "대표 제품 이미지는 첫 화면에서 한 번만 사용합니다.",
      assetRoles: ["hero-product"],
      gifIds: [],
    },
    {
      number: 2,
      id: "product-answer",
      name: "불편과 답",
      headline: "붙고 조이는 토시가 부담스러웠다면.",
      sellingPoint: "몸에 딱 붙는 스포츠형 대신 옷처럼 여유 있게 흐르는 화이트 데일리 핏입니다.",
      purpose: "측면 실루엣 하나로 압박형과 다른 여유를 보여줍니다.",
      assetRoles: ["single-side-view"],
      gifIds: [],
    },
    {
      number: 3,
      id: "cool-light-proof",
      name: "시원하게",
      headline: "보기만 해도 가벼운 여름 무드.",
      sellingPoint: "얇은 플리츠 위로 아이스 블루 파동이 번지는 연출로 시각적 청량감을 보여줍니다.",
      purpose: "실측 온도 수치 없이 소재 근접 이미지와 쿨 무드 이펙트를 결합합니다.",
      assetRoles: ["material-detail"],
      gifIds: ["cool-wave-motion"],
    },
    {
      number: 4,
      id: "loosefit-proof",
      name: "조임 없이",
      headline: "딱 붙지 않아, 주름이 살랑.",
      sellingPoint: "팔을 굽혀도 여유 있게 남는 플리츠 실루엣을 확인하세요.",
      purpose: "팔꿈치 근접 이미지와 루즈핏 변화 GIF만 사용합니다.",
      assetRoles: ["loosefit-elbow-detail"],
      gifIds: ["loose-ripple-motion"],
    },
    {
      number: 5,
      id: "handback-coverage",
      name: "손등까지",
      headline: "손목에서 끝나는 일반형과, 손등까지 이어지는 살랑.",
      sellingPoint: "일반형 예시와 손등 커버를 같은 구도에서 비교하고 안쪽 엄지홀 움직임까지 확인합니다.",
      purpose: "일반적인 손목 끝형 예시는 경쟁 제품이 아닌 구조 비교용으로만 표시합니다.",
      assetRoles: ["structure-proof"],
      gifIds: ["handback-compare-motion", "thumb-flex-motion"],
    },
    {
      number: 6,
      id: "white-style",
      name: "화이트 스타일",
      headline: "기능성 토시보다, 화이트 데일리 스타일.",
      sellingPoint: "출퇴근과 창가 일상에 자연스럽게 이어지는 밝은 화이트입니다.",
      purpose: "서로 다른 두 생활 장면을 짧은 가로 리듬으로 보여줍니다.",
      assetRoles: ["commute-scene", "cafe-scene"],
      gifIds: [],
    },
    {
      number: 7,
      id: "how-to-wear",
      name: "착용 GIF",
      headline: "",
      sellingPoint: "",
      purpose: "설명 문장과 단계 카드를 없애고 착용 전 과정을 GIF 하나로만 보여줍니다.",
      assetRoles: [],
      gifIds: ["put-on-motion"],
    },
    {
      number: 8,
      id: "everyday-use",
      name: "사용 예시",
      headline: "산책, 출퇴근, 가벼운 야외 활동에도.",
      sellingPoint: "운전 장면 없이 서로 다른 여름 일상 예시를 한 번씩만 보여줍니다.",
      purpose: "산책·정차 자전거·가드닝을 서로 다른 비율의 카드로 구성합니다.",
      assetRoles: ["outdoor-scene", "bicycle-scene", "gardening-scene"],
      gifIds: [],
    },
    {
      number: 9,
      id: "construction-details",
      name: "디테일",
      headline: "가까이 볼수록, 구조가 보입니다.",
      sellingPoint: "상단 밴딩, 손등 끝단, 라벨 방향을 서로 다른 근접 컷으로 확인하세요.",
      purpose: "소재 소구에서 쓴 매크로를 재사용하지 않고 세 개의 새 디테일만 사용합니다.",
      assetRoles: ["cuff-band-detail", "handback-coverage-detail", "label-position-macro"],
      gifIds: ["pleat-release-motion"],
    },
    {
      number: 10,
      id: "configuration-size",
      name: "크기",
      headline: "47 × 14cm, 선으로 펼쳐지는 실제 표기 크기.",
      sellingPoint: "제품 실루엣 위에서 전체 길이와 폭이 순서대로 나타납니다.",
      purpose: "화이트 한 쌍 플랫레이 없이 단품 전체 뷰와 크기 이펙트만 사용합니다.",
      assetRoles: ["single-front-view"],
      gifIds: ["size-reveal-motion"],
    },
    {
      number: 11,
      id: "final-questions",
      name: "마지막 질문",
      headline: "방향과 엄지홀, 마지막으로 확인하세요.",
      sellingPoint: "라벨이 향하는 손등 방향과 안쪽 엄지홀을 짧게 답합니다.",
      purpose: "손등면 전체 뷰는 이 섹션에서만 사용합니다.",
      assetRoles: ["single-back-view"],
      gifIds: [],
    },
    {
      number: 12,
      id: "decision-recap",
      name: "최종 선택",
      headline: "시원하게, 조임 없이, 손등까지.",
      sellingPoint: "살랑 루즈핏 쿨토시의 네 가지 선택 이유를 한 착용 장면으로 마무리합니다.",
      purpose: "첫 화면과 다른 양팔 착용 이미지를 마지막에 한 번만 사용합니다.",
      assetRoles: ["wearing-scene"],
      gifIds: [],
    },
  ],
  gifs: [
    {
      number: 1,
      id: "cool-wave-motion",
      outputAssetId: "gif-cool-wave-motion",
      name: "아이스 블루 쿨 무드",
      purpose:
        "플리츠 근접 장면에 서리빛 파동과 투명한 냉기 결이 번지는 3~5초 HyperFrames 시각 연출. 실측 온도와 수치 표시는 사용하지 않습니다.",
      sourceAssetRoles: ["material-detail"],
      keyframeRoles: ["gif-cool-neutral", "gif-cool-ice"],
      pageNumbers: [3],
    },
    {
      number: 2,
      id: "loose-ripple-motion",
      outputAssetId: "gif-loose-ripple-motion",
      name: "루즈핏 원단 살랑임",
      purpose:
        "팔을 굽혀도 여유 있는 플리츠가 작게 움직이는 3~5초 HyperFrames 구조 증거입니다.",
      sourceAssetRoles: ["loosefit-elbow-detail"],
      keyframeRoles: ["gif-ripple-start", "gif-ripple-end"],
      pageNumbers: [4],
    },
    {
      number: 3,
      id: "handback-compare-motion",
      outputAssetId: "gif-handback-compare-motion",
      name: "손목 끝형 예시 ↔ 손등 커버",
      purpose:
        "일반적인 손목 끝형 예시와 살랑의 손등 커버 범위를 같은 구도에서 와이프로 비교합니다.",
      sourceAssetRoles: ["structure-proof"],
      keyframeRoles: ["gif-wrist-end-example", "gif-handback-covered"],
      pageNumbers: [5],
    },
    {
      number: 4,
      id: "thumb-flex-motion",
      outputAssetId: "gif-thumb-flex-motion",
      name: "안쪽 엄지홀 움직임",
      purpose:
        "엄지홀이 겉으로 벌어지지 않고 안쪽에 유지된 채 엄지가 움직이는 3~5초 HyperFrames 모션입니다.",
      sourceAssetRoles: ["structure-proof"],
      keyframeRoles: ["gif-thumb-relaxed", "gif-thumb-flexed"],
      pageNumbers: [5],
    },
    {
      number: 5,
      id: "put-on-motion",
      outputAssetId: "gif-put-on-motion",
      name: "한 번에 보는 착용 과정",
      purpose:
        "별도 설명 문장 없이 팔에 끼우는 시작부터 손등 정리까지 한 GIF로 보여줍니다.",
      sourceAssetRoles: ["wearing-scene", "structure-proof"],
      keyframeRoles: ["gif-puton-start", "gif-puton-end"],
      pageNumbers: [7],
    },
    {
      number: 6,
      id: "pleat-release-motion",
      outputAssetId: "gif-pleat-release-motion",
      name: "플리츠 집기 → 놓기",
      purpose:
        "플리츠 원단을 가볍게 집었다 놓아 얇고 불규칙한 주름 결을 보여주는 3~5초 HyperFrames 모션입니다.",
      sourceAssetRoles: ["cuff-band-detail"],
      keyframeRoles: ["gif-pleat-pinch", "gif-pleat-release"],
      pageNumbers: [9],
    },
    {
      number: 7,
      id: "size-reveal-motion",
      outputAssetId: "gif-size-reveal-motion",
      name: "47 × 14cm 크기 이펙트",
      purpose:
        "단품 실루엣을 따라 세로 47cm와 폭 14cm 측정선이 순서대로 펼쳐지는 3~5초 HyperFrames 모션입니다.",
      sourceAssetRoles: ["single-front-view"],
      keyframeRoles: ["gif-size-clean", "gif-size-measured"],
      pageNumbers: [10],
    },
  ],
};

export function cloneProductionRoadmap() {
  const roadmap = JSON.parse(JSON.stringify(PRODUCTION_ROADMAP));
  const pageNumbersByRole = new Map();
  const archivedAssetIds = new Set([
    "pair-product",
    "driving-scene",
    "background-car-interior",
  ]);
  roadmap.pages.forEach((page) => {
    (page.assetRoles || []).forEach((role) => {
      const numbers = pageNumbersByRole.get(role) || [];
      numbers.push(page.number);
      pageNumbersByRole.set(role, numbers);
    });
  });
  roadmap.assets.forEach((asset) => {
    asset.pageNumbers = [...new Set(pageNumbersByRole.get(asset.role) || [])];
    asset.required =
      asset.id === "product-contact-sheet" || asset.pageNumbers.length > 0;
  });
  roadmap.assets = roadmap.assets.filter(
    (asset) =>
      !archivedAssetIds.has(asset.id) &&
      (asset.required ||
        asset.id === "product-contact-sheet" ||
        asset.group === "model-selection"),
  );
  const visibleGroupIds = new Set(roadmap.assets.map((asset) => asset.group));
  roadmap.groups = roadmap.groups.filter((group) =>
    visibleGroupIds.has(group.id),
  );
  const requiredCount = roadmap.assets.filter((asset) => asset.required).length;
  roadmap.gate.requiredApprovedCount = requiredCount + 1;
  roadmap.gate.description =
    `공개 섹션에 한 번씩만 쓰는 필수 에셋 ${requiredCount}개와 선택 모델 1개를 승인한 뒤 조립합니다.`;
  return roadmap;
}
