import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  injectPersistentStudioLauncher,
  markWingExportCompleted,
  prepareOutputHtmlForStudio,
  readProjectOutputState,
  sanitizePublicHtml,
  saveProjectOutput,
  shouldPromoteOutputToAuthoring,
  validatePublicMotionClosure,
} from "../runtime/project-output-runtime.mjs";

const TWO_FRAME_GIF = Buffer.from(
  "47494638396101000100800000000000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b",
  "hex",
);
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl2kAAAAASUVORK5CYII=",
  "base64",
);

test("sanitizer는 data-motion-src를 실제 공개 GIF src로 승격한다", () => {
  const html = `<figure data-motion-src="media/gifs/demo.gif" data-poster-src="media/gifs/demo-poster.png"><img src="media/gifs/demo-poster.png" alt="기능 변화"></figure>`;
  const sanitized = sanitizePublicHtml(html);
  assert.match(sanitized, /src="media\/gifs\/demo\.gif"/);
  assert.doesNotMatch(sanitized, /data-motion-src/);
  assert.match(sanitized, /IntersectionObserver/);
  assert.match(sanitized, /max-width:780px!important/);
});

test("output HTML은 상시 Studio 편집 버튼을 가지고 완성본을 저작본으로 승격할 수 있다", () => {
  const finished =
    '<!doctype html><html><head></head><body><main id="detailPage"><section class="hero"><h1>완성 상세</h1></section></main></body></html>';
  const launched = injectPersistentStudioLauncher(finished);
  assert.match(launched, /id="detail-page-studio-launcher"/);
  assert.match(launched, /studio\.html\?view=edit/);
  assert.match(launched, /target="detail-page-studio"/);
  const authoring = prepareOutputHtmlForStudio(launched);
  assert.match(authoring, /<base href="\/output\/"/);
  assert.match(authoring, /<script src="\/app\.js"/);
  assert.doesNotMatch(authoring, /detail-page-studio-launcher/);
  assert.equal(
    shouldPromoteOutputToAuthoring({
      authoringHtml:
        "승인된 에셋으로 첫 화면을 조립합니다. 제품을 보여 줄 에셋을 먼저 완성해 주세요.",
      outputHtml: launched,
    }),
    true,
  );
});

test("public output은 GIF bytes와 frame count를 manifest까지 닫는다", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-public-motion-"),
  );
  const project = path.join(root, "project");
  const revisionMedia = path.join(root, "revision-media");
  try {
    await Promise.all([
      mkdir(
        path.join(project, ".detail-page", "authoring"),
        { recursive: true },
      ),
      mkdir(
        path.join(project, ".detail-page", "workflow"),
        { recursive: true },
      ),
      mkdir(path.join(project, "output"), { recursive: true }),
      mkdir(path.join(revisionMedia, "gifs"), {
        recursive: true,
      }),
    ]);
    await Promise.all([
      writeFile(
        path.join(revisionMedia, "gifs", "demo.gif"),
        TWO_FRAME_GIF,
      ),
      writeFile(
        path.join(
          revisionMedia,
          "gifs",
          "demo-poster.png",
        ),
        ONE_PIXEL_PNG,
      ),
    ]);
    const html = `<!doctype html><html><body><main id="detailPage"><figure data-motion-src="media/gifs/demo.gif" data-poster-src="media/gifs/demo-poster.png"><img src="media/gifs/demo-poster.png" alt="기능 변화"></figure></main></body></html>`;
    const saved = await saveProjectOutput(project, {
      html,
      immutableMediaRoot: revisionMedia,
      exportManifest: {
        schema_version: "test",
        export_type: "public-detail-page-html",
      },
    });
    await access(
      path.join(project, "output", "media", "gifs", "demo.gif"),
    );
    const publicHtml = await readFile(
      path.join(project, "output", "detail-page.html"),
      "utf8",
    );
    assert.match(publicHtml, /src="media\/gifs\/demo\.gif"/);
    assert.doesNotMatch(publicHtml, /data-motion-src/);
    assert.match(publicHtml, /id="detail-page-studio-launcher"/);
    assert.equal(
      saved.export_manifest.media[0].animation_frame_count,
      2,
    );
    assert.deepEqual(
      saved.public_output_qa.motion_closure,
      {
        status: "PASS",
        planned_motion_count: 1,
        public_motion_count: 1,
        poster_only_count: 0,
        animation_paths: ["media/gifs/demo.gif"],
      },
    );
    assert.match(saved.source_revision_id, /^source-/);
    const stateAfterSave = await readProjectOutputState(project);
    assert.equal(
      stateAfterSave.source_revision_id,
      saved.source_revision_id,
    );
    const beforeWing = await readFile(
      path.join(project, "output", "detail-page.html"),
    );
    await markWingExportCompleted(project, {
      exportId: "wing-test-001",
      cdnHtml: "<!doctype html><p>Wing delivery</p>",
      manifestSha256: "b".repeat(64),
    });
    const afterWing = await readFile(
      path.join(project, "output", "detail-page.html"),
    );
    assert.deepEqual(afterWing, beforeWing);
    assert.equal(
      await readFile(
        path.join(
          project,
          "output",
          "wing",
          "wing-test-001",
          "detail-page.html",
        ),
        "utf8",
      ),
      "<!doctype html><p>Wing delivery</p>",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("poster-only materialization은 public motion closure에서 실패한다", () => {
  assert.throws(
    () =>
      validatePublicMotionClosure({
        authoringHtml:
          '<figure data-motion-src="media/gifs/demo.gif"><img src="media/gifs/demo-poster.png"></figure>',
        publicHtml:
          '<figure><img src="media/gifs/demo-poster.png"></figure>',
        mediaFiles: [
          {
            path: "media/gifs/demo-poster.png",
            animation_frame_count: null,
          },
        ],
      }),
    (error) => error?.code === "PUBLIC_MOTION_CLOSURE_FAILED",
  );
});
