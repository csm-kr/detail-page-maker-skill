# Studio v1 Asset Approval Specification

## Status

`ready-for-agent`

## Goal

노바페이스 기능성깔창을 만들며 검증한 Studio v1의 직접 편집 경험을 유지하면서,
상세페이지에 들어갈 이미지와 GIF를 조립 전에 한 장씩 사용자 승인하도록 한다.

## Active Studio

- 활성: 노바페이스 `domeggook-60851997` 기반 Studio v1
- 폐기: 복잡한 상태 머신과 다단계 작업 센터를 중심으로 만든 Studio v2
- v2 파일은 삭제하지 않고 비활성 과거 자료로 남긴다.

## Public seams

1. 사용자가 Studio의 `승인` 또는 `반려` 버튼을 누른다.
2. 서버가 `confirmedByUser: true`를 확인한다.
3. 파일이 `pending`에서 `approved` 또는 `rejected`로 한 번만 이동한다.
4. 승인 원장과 manifest에 파일명, 버전, SHA-256, 결정 시각을 기록한다.
5. pending 필수 에셋이 있으면 게시용 내보내기를 잠근다.

## Required folders

```text
asset/
├── input/
├── ssot/
├── generated/
│   ├── pending/
│   │   ├── image/
│   │   └── gif/
│   ├── approved/
│   │   ├── image/
│   │   └── gif/
│   └── rejected/
│       ├── image/
│       └── gif/
├── output/
│   ├── page/
│   └── gif/
└── deprecated/
```

## Acceptance criteria

- 신규 프로젝트가 위 폴더를 모두 만든다.
- Studio v1에 `에셋 승인` 작업면이 상세 편집과 최종 출력 사이에 있다.
- 이미지와 GIF를 분리해 미리 볼 수 있다.
- 사용자 확인 없는 승인 API 호출은 거절한다.
- 같은 대상 파일을 덮어쓰지 않는다.
- 반려 파일은 다시 사용하지 않고 새 버전만 pending에 등록한다.
- 승인된 에셋만 페이지 조립과 output 생성에 사용할 수 있다.
- 기본 GIF 방식은 `hybrid`이며 파일명에 방식을 기록한다.
- Studio v1의 360px 기본 폭, 직접 문구 편집, 자동 높이, 단일 HTML 내보내기를 유지한다.
- Browser Harness에서 승인 화면과 360px 편집 화면을 검증한다.
