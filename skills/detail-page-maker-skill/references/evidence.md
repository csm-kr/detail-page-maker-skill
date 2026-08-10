# 공급처 근거와 제품 SSOT

## 입력 원칙

공급처 페이지를 재해석한 스크린샷보다 원본 파일, URL, SHA-256, 문서 내 위치
locator를 우선한다. 도매꾹은 대표 이미지, 상세 원본, 상세 자산, 상품명·구성·규격·
소재·사용법을 한 portable bundle에 보존한다.

- 공급처 URL은 필수다.
- 사용자가 제공하는 실제 제품 사진은 선택 사항이며 `input/product/`에만 둔다.
- 실제 사진이 없으면 최초 한 번만 추가 안내하고 `HOLD` 없이 계속한다.
- 같은 SKU의 공급처 이미지는 반드시 제품 동일성 SSOT와 ImageGen 참조로 쓴다.
- 공급처 원본은 고객 광고에 직접 싣지 않고 승인된 생성·변환 결과만 사용한다.
- 공급처가 도매꾹이면 `dmk-extractor`, 시장 근거가 쿠팡이면
  `coupang-extractor`가 만든 portable bundle과 ValidationReceipt를 요구한다.

```text
.detail-page/evidence/supplier/
├─ source.json
├─ thumbnail/
├─ detail/
├─ facts.json
└─ manifest.json
```

위 경로는 프로젝트 내부
`<project>/.detail-page/evidence/supplier/`다. `source.json`은 요청 URL,
최종 URL, 수집 시각, 수집 방법을 기록한다.
`manifest.json`은 파일별 상대 경로, 바이트, SHA-256, MIME을 기록한다.
`facts.json`은 사실 원문과 locator를 분리한다.

## 사실 레코드

```json
{
  "fact_id": "FACT-001",
  "kind": "dimension",
  "value": "약 47 × 14 cm",
  "source_url": "https://supplier.example/item/123456",
  "source_path": "detail/assets/detail-03.png",
  "locator": "y=1820..2240",
  "status": "verified"
}
```

관찰한 사실, 제조사 주장, 시장 불편을 섞지 않는다.

- `PRODUCT_FACT`: 현재 SKU의 구성·규격·소재·사용법
- `MANUFACTURER_CLAIM`: 제조사 제공 기능. 출처·원문·조건을 고정
- `MARKET_PAIN`: 경쟁 상품과 후기에서 관찰한 구매 불편
- `UNKNOWN`: 확인할 수 없어 공개하지 않는 항목

## 제품 SSOT

다음 항목을 면·부품별로 잠근다.

- 외곽 실루엣과 비율
- 색과 재질의 방향
- 상면·하면·앞·뒤
- 부품 위치와 상대 크기
- 한 쌍·세트 수량
- 로고·라벨·고유 문자와 장축

실제품 사진이 있으면 가장 강한 동일성 판정 기준으로 추가하되 자동으로 공개 광고
자산이 되지 않는다. 없으면 공급처 same-SKU 이미지 set이 동일성 기준이다. 생성
결과는 현재 SSOT와 나란히 비교하고 필요한 경우 반투명 겹치기와 확대 검사를 한다.

SSOT manifest에는 `identity_source`,
`actual_photo_status: provided | absent_notified_once`,
`supplier_media_required: true`, `supplier_use_roles:
[product_identity_ssot, image_generation_reference]`,
`direct_publication_allowed: false`를 기록한다.

## 승인 뒤 실제품 사진 개정

승인된 `identity.photo_set` 또는 `identity.supplier_media_set`의 파일을
덮어쓰거나 state를 직접 편집하지 않는다.
`workflow-revision-plan`의 `actual_product_photo_set_revision`은 새 immutable
artifact를 다음 최소 계약으로 받는다.

```json
{
  "artifact_id": "photo-set-new-id",
  "type": "identity.photo_set",
  "manifest_sha256": "<new-sha256>",
  "revision_of": {
    "artifact_id": "photo-set-old-id",
    "manifest_sha256": "<old-sha256>"
  },
  "member_ids": ["front.jpg"],
  "members": [
    {
      "member_id": "front.jpg",
      "member_sha256": "<photo-sha256>"
    }
  ],
  "member_manifest": {
    "schema_version": "1.0",
    "policy": "materialized",
    "members": [
      {
        "member_id": "front.jpg",
        "root_id": "project",
        "locator": "input/product/front.jpg",
        "sha256": "<photo-sha256>",
        "size_bytes": 12345
      }
    ]
  },
  "producer_agent_session_id": "<session-id>"
}
```

새 artifact ID와 manifest hash는 기존 것과 달라야 하고, member manifest는
`member_ids`를 빠짐없이 1:1 열거한다. locator는 project 내부 canonical 상대
경로 중 `input/product/` 아래의 일반 파일만 허용하며 symlink를 사용할 수 없다.
rights·identity provenance의 evidence locator와 SHA-256도 그 exact member와
일치해야 한다. plan과 commit 때뿐 아니라 이후 workflow
inspect/advance/export에서도 실제 size와 SHA-256을 다시 계산한다.

같은 `new_artifact`에는 다음 두 provenance receipt가 필요하다.

- `rights_provenance`: `receipt_type:
  photo_revision.rights_provenance`. `identity_reference`이면
  `production_use_allowed: false`, `production_licensed`이면 `true`다.
- `identity_provenance`: `receipt_type:
  photo_revision.identity_provenance`, `decision: verified`.

두 receipt의 subject는 새 artifact ID/hash와 exact photo member set이어야 한다.
`evidence.locator`와 `evidence.sha256`은 그중 실제 photo member를 가리키며,
`receipt_sha256`은 receipt body에서 다시 계산한다. 이 조건을 통과해
`workflow-revision-commit`하면 새 `identity.photo_set` ArtifactRecord와
old→new `revision_of` edge를 만들고 `G0C_NORMALIZE`, `G0Q_QA`,
`G0U_APPROVAL`만 재개한다. 사진이나 공급처 media가 `identity_reference`인 경우
이후 단계에서도 동일성 비교에만 쓰며 광고 자산으로 조립하지 않는다.

## ImageGen 동일성 블록

모든 제품 생성 프롬프트에 다음을 포함한다.

- 사용할 SSOT 상대 경로
- 유지할 면, 부품, 문자, 수량, 방향
- 변경 가능한 배경·조명·카메라 범위
- 금지할 부품 추가·삭제·재배치
- 출력 역할과 목표 W×H

제품이 한 쌍이면 복제 이미지가 아니라 좌우 구조가 맞는 거울 관계를 확인한다.
문자 OCR만 보지 말고 문자 위치, 제품 장축, 부품 접점을 함께 대조한다.

## 하드 실패

- 다른 SKU의 부품·색·수량이 섞임
- 제품 외곽이나 비율이 사용 장면마다 달라짐
- 상면·하면 또는 좌우가 뒤집힘
- 로고 철자·라벨 위치·부품 위치가 바뀜
- 시장 불편이나 경쟁사 기능을 현재 제품 사실로 승격함
- 원본 해시나 locator 없이 숫자·효능을 공개함
- 공급처 same-SKU media 없이 제품 이미지를 생성함
- 실제 제품 사진 부재만으로 workflow를 반복 안내하거나 중단함
