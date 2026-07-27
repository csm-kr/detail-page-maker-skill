# 공급처 bundle 보존 상태

최초 캡처 bundle 전체는 이 프로젝트에 포함되어 있지 않다. 따라서 이 프로젝트는 외부 `.artifacts` 경로를 런타임 또는 검증 의존성으로 사용하지 않는다.

프로젝트에 보존된 근거는 다음과 같다.

- 정규화된 사실과 원본 해시: `../supplier-facts.json`
- 제품 컷아웃: `../detail-page/assets/product-cutout.png`
- 양면 칼날 구조: `../detail-page/assets/supplier-dual-blade-evidence.png`
- 수납 구조: `../detail-page/assets/supplier-storage-evidence.png`
- 치수·재질 정보: `../detail-page/assets/supplier-spec-evidence.png`

새 사실을 추가하거나 기존 사실을 변경하려면 공급처를 다시 캡처해 이 프로젝트의 `evidence/` 아래에 저장하고 G0 승인을 다시 받아야 한다.
