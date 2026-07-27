import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  approveAssetVersion,
  createInitialProject,
  recordAssetQa,
  registerAssetVersion,
} from "../../skills/detail-page-maker-skill/scripts/studio-domain.mjs";
import {
  buildDetailPageReview,
  publicOutputViolations,
} from "../../skills/detail-page-maker-skill/scripts/studio-detail-page-review.mjs";
import { createProject } from "../../skills/detail-page-maker-skill/scripts/new-project.mjs";
import { startStudioServer } from "../../skills/detail-page-maker-skill/scripts/studio-server.mjs";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl2kAAAAASUVORK5CYII=";

function createReadyState() {
  const state = createInitialProject({
    name: "도매꾹 55873582 - 살랑 루즈핏 쿨토시",
    supplierUrl: "https://domeggook.com/55873582?affid=",
  });
  registerAssetVersion(state, {
    assetId: "hero",
    name: "히어로",
    role: "hero-product",
    versionPath: "assets/candidates/hero/v1.png",
    sha256: "hero".padEnd(64, "0"),
    mime: "image/png",
    prompt: "ImageGen 파생 히어로",
  });
  recordAssetQa(state, {
    assetId: "hero",
    version: 1,
    status: "passed",
    score: 98,
  });
  approveAssetVersion(state, {
    assetId: "hero",
    version: 1,
    decision: "approved",
  });
  return state;
}

test("COMMERCIAL·DESIGN 로드맵을 제품 사진 중심의 가변 높이 검토본으로 만든다", () => {
  const state = createReadyState();
  const roadmap = {
    title: "COMMERCIAL.md × DESIGN.md 기반 제작 로드맵",
    summary: "14장 검토본",
    strategy: {
      sourceDocuments: ["planning/COMMERCIAL.md", "planning/DESIGN.md"],
    },
    pages: Array.from({ length: 14 }, (_, index) => ({
      number: index + 1,
      id: index === 0 ? "pain-recognition" : `page-${index + 1}`,
      name: `${index + 1}장`,
      kind: index % 2 ? "proof" : "emotion",
      purpose: "앞뒤 장과 겹치지 않는 구매 서사",
      purchaseQuestion: "왜 선택해야 하나?",
      headline:
        index === 0
          ? "조이는 토시 말고, 살랑이는 쪽으로."
          : `${index + 1}장 단일 메시지`,
      sellingPoint: "여유 있게 떨어지는 루즈핏",
      evidence: "승인된 실제품 파생 에셋",
      designRule: "헤드라인과 증거를 한 화면에서 읽게 한다.",
      assetRoles: ["hero-product"],
      gifIds: [],
    })),
  };

  const review = buildDetailPageReview({
    state,
    roadmap,
    generatedAt: "2026-07-27T00:00:00.000Z",
  });

  assert.equal(review.sections.length, 14);
  assert.equal(review.specs.pageCount, 14);
  assert.equal(
    (review.html.match(/class="detail-page /g) || []).length,
    14,
  );
  assert.doesNotMatch(review.html, /min-height: 2400px/);
  assert.match(review.html, /composition-pain-recognition is-hero/);
  assert.match(review.html, /화이트 루즈핏 쿨토시\./);
  assert.match(review.html, /시원하게, 조임 없이, 손등까지\./);
  assert.match(review.html, /data-layer-id="pain-recognition-headline"/);
  assert.deepEqual(review.specs.sourceDocuments, [
    "planning/COMMERCIAL.md",
    "planning/DESIGN.md",
  ]);
  assert.doesNotMatch(review.html, /planning\/COMMERCIAL\.md/);
  assert.doesNotMatch(review.html, /planning\/DESIGN\.md/);
  assert.doesNotMatch(review.html, /구매 질문|확인 근거|DESIGN RULE/);
  assert.doesNotMatch(
    review.html,
    /에셋|hero · v1|SSOT|ImageGen|HyperFrames/,
  );
  assert.deepEqual(publicOutputViolations(review.html), []);
});

test("제작 시작 API는 에셋 확정과 14장 HTML 검토본 생성을 한 동작으로 실행한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-review-start-"),
  );
  let server;
  try {
    const created = await createProject({
      name: "살랑 루즈핏 쿨토시",
      supplierUrl: "https://domeggook.com/55873582?affid=",
      root: path.join(temporaryRoot, "projects"),
    });
    const pages = Array.from({ length: 14 }, (_, index) => ({
      number: index + 1,
      id: `page-${index + 1}`,
      name: `${index + 1}장`,
      kind: "proof",
      purpose: "비중복 구매 서사",
      purchaseQuestion: "왜 선택해야 하나?",
      headline: `${index + 1}장 단일 메시지`,
      sellingPoint: "여유 있게 떨어지는 루즈핏",
      evidence: "승인 에셋",
      designRule: "증거를 카피 옆에 둔다.",
      assetRoles: ["hero-product"],
      gifIds: [],
    }));
    await mkdir(path.join(created.projectRoot, "planning"), {
      recursive: true,
    });
    await writeFile(
      path.join(created.projectRoot, "planning", "commercial-roadmap.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          title: "COMMERCIAL.md × DESIGN.md 기반 제작 로드맵",
          summary: "14장",
          strategy: {
            sourceDocuments: [
              "planning/COMMERCIAL.md",
              "planning/DESIGN.md",
            ],
          },
          pages,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const started = await startStudioServer({
      projectRoot: created.projectRoot,
      port: 0,
      open: false,
    });
    server = started.server;
    const post = async (pathname, body) => {
      const response = await fetch(new URL(pathname, started.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { response, payload: await response.json() };
    };
    const registered = await post("/api/assets/register", {
      assetId: "hero",
      name: "히어로",
      role: "hero-product",
      required: true,
      dataUrl: ONE_PIXEL_PNG,
      fileName: "hero.png",
      provenance: "imagegen-derived",
    });
    await post("/api/assets/hero/qa", {
      version: registered.payload.version.number,
      status: "passed",
      score: 98,
      hardFailures: [],
    });
    await post("/api/assets/hero/approve", {
      version: registered.payload.version.number,
      decision: "approved",
    });

    const result = await post("/api/detail-page/start", {
      approvedBy: "local-user",
      confirmedByUser: true,
    });
    const projectResponse = await fetch(new URL("/api/project", started.url));
    const project = await projectResponse.json();
    const html = await readFile(
      path.join(created.projectRoot, "html", "index.html"),
      "utf8",
    );
    const specs = JSON.parse(
      await readFile(
        path.join(
          created.projectRoot,
          "planning",
          "commercial-max-page-specs.json",
        ),
        "utf8",
      ),
    );

    assert.equal(result.response.status, 201);
    assert.equal(result.payload.pageCount, 14);
    assert.equal(project.phase, "html_editing");
    assert.equal(project.html.sections.length, 14);
    assert.equal((html.match(/class="detail-page /g) || []).length, 14);
    assert.equal(specs.status, "DRAFT_REVIEW");
    assert.equal(specs.pageCount, 14);

    await post("/api/html/layers", {
      layerId: "page-1-headline",
      patch: { text: "구매 질문" },
      viewport: "global",
    });
    const blockedDraft = await post("/api/export/draft", {});
    assert.equal(blockedDraft.response.status, 409);
    assert.equal(
      blockedDraft.payload.error.code,
      "PUBLIC_OUTPUT_METADATA_EXPOSED",
    );
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    const safeTempRoot = path.resolve(os.tmpdir());
    const resolvedTemporaryRoot = path.resolve(temporaryRoot);
    if (resolvedTemporaryRoot.startsWith(`${safeTempRoot}${path.sep}`)) {
      await rm(resolvedTemporaryRoot, { recursive: true, force: true });
    }
  }
});
