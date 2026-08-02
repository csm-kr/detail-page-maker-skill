# Studio·HTML·Wing

G4와 G5에서 읽는다. 모든 저작, 미디어, 브라우저 캡처와 전달 자산은 폭 780px를
기준으로 한다. `references/coupang-wing-detail-780.html`은 Wing 형태와 밀도를
확인하는 보존된 참고 파일이며 삭제하거나 고객용 기본 템플릿으로 복제하지 않는다.

## HTML 조립

Lean Page Plan의 순서대로 승인 자산만 조립한다. 한 패널에는 헤드라인 1개, 설명
1개, 보조 강조 1~3개와 주 이미지 또는 GIF 1개를 기본으로 한다. 제품 이미지는
패널에서 충분히 크게 보이게 하고 설명만 있는 의미 없는 공간을 만들지 않는다.

제목은 의미 단위의 `<br>`을 유지하고 780px 실제 렌더에서 직접 확인한다. 중앙
정렬은 `text-align` 선언만 보지 말고 제목·제품·배지·아이콘·숫자의 시각적 중심선과
카드 간격을 캡처에서 확인한다.

본문에는 `word-break: keep-all`을 건다. 브라우저 기본값은 한글을 음절 단위로 끊어
`돌려주세` / `요.` 처럼 단어 중간에서 줄을 바꾼다. `<br>`은 제목과 지정한 청킹에만
쓰고, 나머지 본문은 `keep-all`로 어절 경계에서만 접히게 한다. 배지와 칩처럼 폭이
좁은 칸은 `keep-all`을 걸어도 넘치므로, 글자 수를 줄이거나 숫자와 설명을 분리해
숫자는 크게, 설명은 아래 줄로 내린다.

일반 HTML은 화면에 들어온 motion을 재생하고 필요하면 poster fallback을 제공한다.
최종 공개 animation 참조 수, manifest 항목 수와 실제 animation 파일 수가 같아야
한다.

## Studio

Studio는 조사, 기획, 에셋 승인 또는 중간 gate가 아니라 완성 working HTML의 최종
수정 UI다. 사용자는 텍스트, 색, 정렬, 위치, 크기, 이미지, 섹션 순서와 표시를
수정할 수 있다. Studio를 열지 않아도 자동 완성본은 만들어진다.

로컬 서버는 exact working session으로 Studio를 열고 저장은 mutable working
revision에만 적용한다. 저장 성공 전 공개 `output/detail-page.html`을 직접
덮어쓰지 않으며, 저장 뒤 같은 780px QA를 다시 수행하고 통과본만 공개한다.
Studio 링크와 session ID는 로컬 응답에만 주입할 수 있고 디스크 HTML과 Wing에는
남기지 않는다.

## HTML QA

실제 브라우저로 전체 페이지를 캡처하고 다음을 검사한다.

- 콘텐츠와 모든 주요 자산이 780px 폭 프로필을 채운다.
- 가로 스크롤, 잘린 제목·숫자·제품, 깨진 이미지·한글이 없다.
- 의미 단위 줄바꿈, 시각적 중앙 정렬과 패널 간 강약이 유지된다.
- 제품 identity와 카피/이미지/GIF의 주장이 일치한다.
- GIF/WebP가 실제로 움직이고 첫·중간·끝이 정상이다.
- 공개 DOM과 화면에 내부 메타데이터나 로컬 Studio 런처가 없다.

## 공개 출력

고객 진입점은 `output/detail-page.html` 하나다. 이미지는
`output/media/images/`, GIF/WebP는 `output/media/gifs/`에 둔다. 공개 HTML에는
제품 사실, 효익, 사용법, 구성·규격, 주의사항만 남긴다.

다음은 공개하지 않는다.

- 프롬프트, 모델, agent, 생성 방식
- 파일명, 로컬 경로, hash, QA 점수, 승인 상태
- 내부 fact/claim ID, workflow 속성, Studio session
- 가짜 후기, 출처 없는 수치와 성능 표현

## Coupang Wing과 CDN

Wing Export마다 새 `<project_key>/<export_id>/` namespace를 만든다. 기존 경로를
덮어쓰거나 삭제하지 않는다. 각 섹션을 폭 780px WebP로 평탄화하고 motion 섹션은
animated WebP로 유지한다. `<img>`를 세로로 연결한 Wing HTML과 manifest를
`output/wing/<export-id>/`에 만든다.

CDN config에는 secret이나 token을 저장하지 않고 인증은 기존 로컬 보안 저장소를
사용한다. 업로드 전후에 URL, HTTP 상태, MIME, 바이트와 hash를 확인한다. 새 자산과
기존 namespace 보존이 모두 확인된 뒤에만 Wing export를 완료한다. 실패하면 현재
`output/detail-page.html`과 이전 Wing export를 유지한다.
