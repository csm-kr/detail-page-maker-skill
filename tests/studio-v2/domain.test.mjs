import assert from "node:assert/strict";
import test from "node:test";
import {
  approveAssetVersion,
  approveFinalQa,
  createInitialProject,
  createRevision,
  lockAssembly,
  recordAssetQa,
  recordFinalQa,
  registerAssetVersion,
  startDetailPageReview,
} from "../../skills/detail-page-maker-skill/scripts/studio-domain.mjs";

function project() {
  return createInitialProject({
    name: "노바페이스 발편한 기능성깔창",
    supplierUrl: "https://domeggook.com/60851997",
  });
}

function register(state, assetId, dependencies = []) {
  return registerAssetVersion(state, {
    assetId,
    name: assetId,
    role: assetId,
    kind: assetId.includes("motion") ? "gif" : "image",
    dependencies,
    versionPath: `assets/source/${assetId}/v1.png`,
    sha256: assetId.padEnd(64, "0").slice(0, 64),
    mime: "image/png",
  }).version;
}

function passAndApprove(state, assetId, version = 1) {
  recordAssetQa(state, {
    assetId,
    version,
    status: "passed",
    score: 98,
  });
  approveAssetVersion(state, {
    assetId,
    version,
    decision: "approved",
  });
}

test("QA를 통과하지 않은 에셋은 승인할 수 없다", () => {
  const state = project();
  register(state, "hero");
  assert.throws(
    () =>
      approveAssetVersion(state, {
        assetId: "hero",
        version: 1,
        decision: "approved",
      }),
    (error) => error.code === "QA_NOT_PASSED",
  );
});

test("제품 동일성 하드 실패가 있으면 사용자 승인도 차단한다", () => {
  const state = project();
  register(state, "hero");
  recordAssetQa(state, {
    assetId: "hero",
    version: 1,
    status: "passed",
    score: 99,
    hardFailures: ["로고가 원본과 다름"],
  });
  assert.throws(
    () =>
      approveAssetVersion(state, {
        assetId: "hero",
        version: 1,
        decision: "approved",
      }),
    (error) => ["QA_NOT_PASSED", "IDENTITY_HARD_FAILURE"].includes(error.code),
  );
});

test("업로드 원본은 참조 전용이며 ImageGen 파생 전에는 승인할 수 없다", () => {
  const state = project();
  const version = registerAssetVersion(state, {
    assetId: "user-upload-reference",
    name: "사용자 촬영 원본",
    role: "user-upload-reference",
    required: true,
    versionPath: "assets/source/user-upload-reference/v1.png",
    sha256: "reference".padEnd(64, "0"),
    mime: "image/png",
    provenance: "raw-upload-reference",
    allowedUse: "reference-only",
  }).version;
  recordAssetQa(state, {
    assetId: "user-upload-reference",
    version: version.number,
    status: "passed",
    score: 99,
  });

  assert.throws(
    () =>
      approveAssetVersion(state, {
        assetId: "user-upload-reference",
        version: version.number,
        decision: "approved",
        approvedBy: "local-user",
        userOverride: true,
        overrideReason: "직접 촬영한 정확한 원본",
      }),
    (error) => error.code === "REFERENCE_ONLY_ASSET",
  );
});

test("비교 중인 이전 버전을 승인하면 현재 개정판의 채택 버전이 된다", () => {
  const state = project();
  register(state, "hero");
  register(state, "hero");
  assert.equal(state.revisions[0].assetSelections.hero, 2);
  passAndApprove(state, "hero", 1);
  assert.equal(state.revisions[0].assetSelections.hero, 1);
});

test("사용자는 QA 대기 버전도 사유를 남겨 직접 채택할 수 있다", () => {
  const state = project();
  register(state, "hero");
  register(state, "hero");
  const approved = approveAssetVersion(state, {
    assetId: "hero",
    version: 1,
    decision: "approved",
    approvedBy: "local-user",
    userOverride: true,
    overrideReason: "실물 플랫레이에서는 엄지홀이 안쪽으로 접혀 보이지 않음",
  });
  assert.equal(state.revisions[0].assetSelections.hero, 1);
  assert.equal(approved.approval.override.applied, true);
  assert.equal(
    approved.approval.override.reason,
    "실물 플랫레이에서는 엄지홀이 안쪽으로 접혀 보이지 않음",
  );
});

test("필수 에셋이 모두 승인되기 전에는 조립을 잠글 수 없다", () => {
  const state = project();
  register(state, "hero");
  assert.throws(
    () => lockAssembly(state, { confirmedByUser: true }),
    (error) => error.code === "ASSEMBLY_GATE_FAILED",
  );
  passAndApprove(state, "hero");
  const assembly = lockAssembly(state, { confirmedByUser: true });
  assert.equal(assembly.assets.hero.version, 1);
  assert.equal(state.phase, "html_editing");
});

test("조립 뒤 에셋은 읽기 전용이며 직접 새 버전을 등록할 수 없다", () => {
  const state = project();
  register(state, "hero");
  passAndApprove(state, "hero");
  lockAssembly(state, { confirmedByUser: true });
  assert.throws(
    () => register(state, "hero"),
    (error) => error.code === "ASSET_STAGE_LOCKED",
  );
});

test("상세페이지 제작 시작은 에셋을 잠그고 근거 기반 12개 섹션 검토 단계로 이동한다", () => {
  const state = project();
  register(state, "hero");
  passAndApprove(state, "hero");
  const sections = Array.from({ length: 12 }, (_, index) => ({
    id: `page-${index + 1}`,
    number: index + 1,
    name: `${index + 1}장`,
    assetIds: ["hero"],
  }));

  const result = startDetailPageReview(state, {
    confirmedByUser: true,
    sections,
  });

  assert.equal(result.pageCount, 12);
  assert.equal(result.entry, "html/index.html");
  assert.equal(state.phase, "html_editing");
  assert.equal(state.html.sections.length, 12);
  assert.equal(state.revisions[0].assembly.assets.hero.version, 1);
});

test("새 개정판은 변경 에셋과 의존 에셋만 다시 연다", () => {
  const state = project();
  register(state, "product-ssot");
  register(state, "airflow-motion", ["product-ssot"]);
  register(state, "decorative-background");
  state.html.sections = [
    { id: "feature-airflow", assetIds: ["airflow-motion"] },
    { id: "finale", assetIds: ["decorative-background"] },
  ];
  for (const id of [
    "product-ssot",
    "airflow-motion",
    "decorative-background",
  ]) {
    passAndApprove(state, id);
  }
  lockAssembly(state, { confirmedByUser: true });
  const revision = createRevision(state, {
    changedAssetIds: ["product-ssot"],
    reason: "제품 실루엣 후보 재생성",
    confirmedByUser: true,
  });
  assert.deepEqual(
    new Set(revision.affectedAssetIds),
    new Set(["product-ssot", "airflow-motion"]),
  );
  assert.deepEqual(revision.affectedSectionIds, ["feature-airflow"]);
  assert.equal(revision.assetSelections["product-ssot"], undefined);
  assert.equal(revision.assetSelections["airflow-motion"], undefined);
  assert.equal(revision.assetSelections["decorative-background"], 1);
});

test("게시 승인은 97점 이상·하드 실패 0건에서만 가능하다", () => {
  const state = project();
  register(state, "hero");
  passAndApprove(state, "hero");
  lockAssembly(state, { confirmedByUser: true });
  recordFinalQa(state, { score: 96, hardFailures: [] });
  assert.throws(
    () => approveFinalQa(state, { confirmedByUser: true }),
    (error) => error.code === "PUBLISH_GATE_FAILED",
  );
  recordFinalQa(state, { score: 97, hardFailures: [] });
  approveFinalQa(state, { confirmedByUser: true });
  assert.equal(state.phase, "published");
  assert.equal(state.finalQa.userApproved, true);
});
