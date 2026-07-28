# G5 게시 전 최종 QA 보고서

- 상태: **PASS, 사용자 G5 게시 승인 대기**
- 점수: **98/100**
- 제품: 살랑 루즈핏 쿨토시
- 판매처: 쿠팡
- G4 조립본 승인: 기록 완료

## 최종 패키지

- 정적 WebP: 40개
- 애니메이션 WebP: 10개
- 공개 자산 합계: 50개
- 독립 실행 HTML: 49.501MiB
- 최대 개별 자산: 10MiB 미만
- GIF 총 재생시간·반복 설정 보존: PASS
- 외부 CDN 배포: 미실행
- 쿠팡 Wing 게시: 미실행

## 공개본 검사

- HTML validator: PASS
- 깨진 자산: 0개
- 중복 ID: 0개
- alt 누락: 0개
- 스크립트: 0개
- 외부 스타일시트: 0개
- 편집·제작 메타데이터 노출: 0개
- 독립 실행 HTML 내장 WebP: 50개
- 독립 실행 HTML 재오픈 로드: 50/50

## 반응형 검사

| CSS 뷰포트 | 로드 자산 | 애니메이션 | 깨진 자산 | 가로 넘침 | 외부 이탈 텍스트 | 최소 구매자 글자 |
|---:|---:|---:|---:|:---:|---:|---:|
| 320px | 50 | 10 | 0 | 없음 | 0 | 14px |
| 360px | 50 | 10 | 0 | 없음 | 0 | 14px |
| 390px | 50 | 10 | 0 | 없음 | 0 | 14px |
| 768px | 50 | 10 | 0 | 없음 | 0 | 17px |
| 800px | 50 | 10 | 0 | 없음 | 0 | 17px |

## 산출물

- 로컬 공개본: `asset/output/page/rev017/preview-local.html`
- 독립 실행 HTML: `asset/output/page/rev017/sallang-loosefit-coolsleeve-rev017-standalone.html`
- 패키지 manifest: `asset/output/page/rev017/package-manifest.json`
- 게시 잠금: `assembly/publish-lock-rev017.json`

## 게시 보류

이 결과는 게시 가능한 G5 후보지만 아직 사용자 G5 게시 승인이 없습니다. 승인 전에는 외부 CDN 배포와 쿠팡 Wing 반영을 실행하지 않습니다.
