# 2026-07-28 recoverable archive

활성 제작 경로에서 제외한 파일을 삭제하지 않고 보존한다.

- `assets-product-ssot/`: 과거 프로젝트 루트 `assets/product-ssot/`의 비활성
  원본·복구 파일·이전 manifest와 활성 `asset/`로 이동한 공급처 crop의 체크섬
- `superseded-gif/`: 그래프형 쿨링 표현에서 쿨 스윕 FX로 교체된 이전 GIF

복구할 때는 먼저 이 폴더의 `checksums.sha256`과
`assets-product-ssot/checksums.sha256`을 검증한다. 현재 활성 진입점이나 manifest가
이 archive를 직접 참조해서는 안 된다.
