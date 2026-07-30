import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { createProject } from "../../skills/detail-page-maker-skill/scripts/lib/new-project.mjs";
import {
  listProjectBackups,
  readProjectOutputState,
  restoreProjectBackup,
  sanitizePublicHtml,
  saveProjectOutput,
} from "../../skills/detail-page-maker-skill/scripts/runtime/project-output-runtime.mjs";
import {
  createWingExportIdentity,
  verifyCdnWingExport,
} from "../../skills/detail-page-maker-skill/scripts/runtime/studio-v1-server.mjs";

function authoringHtml(copy) {
  return `<!doctype html>
<html lang="ko">
<head><style>section{height:9999px}</style></head>
<body data-agent="writer" data-qa-score="100">
<main id="detailPage" data-graph-id="graph-1">
  <section data-section="hero" data-claim-id="claim-1">
    <h1 data-edit data-model="secret">${copy}</h1>
    <p data-fact-id="fact-1" data-evidence-id="ev-1">고객용 근거</p>
  </section>
</main>
<script type="application/json">{"prompt":"secret","agent":"worker"}</script>
<script src="app.js"></script>
</body></html>`;
}

function publicMotionFixture({
  observerSupported = true,
  reducedMotion = false,
  taintedCanvas = false,
} = {}) {
  const listeners = new Map();
  const posterProbes = [];
  const preference = {
    matches: reducedMotion,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const image = {
    width: 320,
    height: 180,
    naturalWidth: 320,
    naturalHeight: 180,
    currentSrc: "https://shop.example/media/use.gif",
    attributes: new Map([
      ["src", "https://shop.example/media/use.gif"],
    ]),
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    getBoundingClientRect() {
      return { top: 0, right: 320, bottom: 180, left: 0 };
    },
  };
  let observer = null;
  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      observer = this;
    }
    observe(target) {
      this.observed.push(target);
    }
  }
  const document = {
    readyState: "complete",
    images: [image],
    baseURI: "https://shop.example/output/detail-page.html",
    documentElement: { clientWidth: 390, clientHeight: 844 },
    createElement(name) {
      assert.equal(name, "canvas");
      const captureCanvas = posterProbes.length === 0;
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            drawImage() {
              if (taintedCanvas && captureCanvas) {
                throw new Error("cross-origin canvas is tainted");
              }
            },
            fillRect() {},
            fillText() {},
          };
        },
        toDataURL() {
          return taintedCanvas
            ? "data:image/png;base64,visible-poster"
            : "data:image/png;base64,poster";
        },
      };
    },
  };
  class FakePosterImage {
    constructor() {
      this.naturalWidth = 320;
      this.naturalHeight = 180;
      this.onload = null;
      this.onerror = null;
      this._src = "";
      posterProbes.push(this);
    }
    set src(value) {
      this._src = String(value);
    }
    get src() {
      return this._src;
    }
  }
  const window = {
    innerWidth: 390,
    innerHeight: 844,
    matchMedia() {
      return preference;
    },
    addEventListener() {},
  };
  const context = {
    document,
    window,
    URL,
    requestAnimationFrame(callback) {
      callback();
    },
    Date,
    Image: FakePosterImage,
  };
  if (observerSupported) {
    window.IntersectionObserver = FakeIntersectionObserver;
    context.IntersectionObserver = FakeIntersectionObserver;
  }
  return {
    context,
    image,
    preference,
    listeners,
    observer: () => observer,
    posterProbes,
    resolvePoster({ success = true } = {}) {
      const probe = posterProbes.at(-1);
      assert.ok(probe, "poster probe is required");
      if (success) probe.onload();
      else probe.onerror();
    },
  };
}

function executePublicMotionRuntime(html, fixture) {
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, "trusted public motion runtime is required");
  vm.runInNewContext(match[1], fixture.context);
}

test("공개 HTML은 authoring 메타데이터를 제거하고 콘텐츠 높이를 자동으로 맞춘다", () => {
  const html = sanitizePublicHtml(authoringHtml("저장된 문구"));
  assert.match(html, /저장된 문구/);
  assert.match(html, /height:auto!important/);
  assert.doesNotMatch(
    html,
    /data-(?:claim|fact|evidence|graph|plan|prompt|model|agent|qa|generation|edit|section)/i,
  );
  assert.doesNotMatch(html, /app\.js|application\/json|secret/);
  assert.equal((html.match(/<script\b/gi) || []).length, 0);
});

test("quoted·unquoted·boolean·mixed-case 내부 속성을 값까지 제거하고 태그를 보존한다", () => {
  const html = sanitizePublicHtml(`<!doctype html>
<html>
<body
  class="customer-page"
  DATA-AGENT = secret
  data-claim-id='claim-secret'
  DaTa-FaCt-Id = "fact > secret"
  data-evidence-id
  data-plan-id==malformed
  contenteditable=true
  SPELLCHECK = false
  onClick=steal()
  ONLOAD = "steal-again()">
  <main data-generation-id = generated>
    <p contenteditable spellcheck='true'>문장 속 data-agent=keep-text 는 보존</p>
    <img
      src="media/gifs/use.gif"
      data-qa-score =100
      data-prompt-id=prompt/secret
      onerror = report()
      alt="사용 장면">
  </main>
  <script>window.secret = "remove"</script>
</body>
</html>`);
  assert.match(html, /<body\s+class="customer-page">/);
  assert.match(html, /문장 속 data-agent=keep-text 는 보존/);
  assert.match(html, /<p>문장 속/);
  assert.match(
    html,
    /<img\s+src="media\/gifs\/use\.gif"\s+alt="사용 장면">/,
  );
  assert.doesNotMatch(
    html,
    /<[^>]*\s(?:data-[^\s=/>]*|contenteditable|spellcheck|on[a-z][^\s=/>]*)\b/gi,
  );
  assert.doesNotMatch(
    html,
    /<body(?:=|\s*=)|=secret|claim-secret|fact > secret|==malformed|steal-again|window\.secret|prompt\/secret/,
  );
  assert.equal((html.match(/<script\b/gi) || []).length, 1);
});

test("공개 sanitizer는 active element·event handler·실행 URL을 제거하고 안전한 이미지와 alt를 보존한다", () => {
  const html = sanitizePublicHtml(`<!doctype html>
<html><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <meta HTTP-EQUIV = "re&#x66;resh" content="0; url=javascript:alert(1)">
  <base href="https://evil.example/">
</head><body onload="steal()" ONFOCUS>
  <a href="javascript:alert(1)" onclick=steal()>위험 링크</a>
  <a href = "java&#x73;cript:alert(2)">우회 링크</a>
  <a href="data:text/html,%3Cscript%3Esteal()%3C/script%3E">데이터 링크</a>
  <a href="/guide">안전 링크</a>
  <form action="java&#x73;cript:steal()"><button>위험 폼</button></form>
  <form ACTION = "data:text/html,%3Cscript%3Esteal()%3C/script%3E"><input></form>
  <button formaction=vbscript:steal()>버튼</button>
  <button formaction = "java&NewLine;script:steal()">우회 버튼</button>
  <img src=javascript:steal() onerror alt="위험 이미지">
  <img srcset="https://cdn.example/safe.webp 1x, javascript:steal() 2x" alt="위험 srcset">
  <img src="https://cdn.example/product.webp" alt="HTTPS 제품 이미지">
  <img src="../media/product.webp" alt="상대 제품 이미지">
  <img src="data:image/png;base64,AAAA" alt="PNG 제품 이미지">
  <img src="data:image/svg+xml,%3Csvg%20onload=steal()%3E" alt="SVG 차단">
  <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==" alt="GIF 제품 이미지">
  <svg onload=steal()>
    <script>alert("svg script")</script>
    <animate xlink:href="#dynamic-link" attributeName="href" values="javascript:steal()" />
    <set xlink:href="#dynamic-link" attributeName="href" to="data:text/html,steal" />
    <a id="dynamic-link"><text>동적 링크</text></a>
    <a xlink:href="java&Tab;script:steal()">SVG 링크</a>
    <foreignObject><iframe srcdoc="<script>steal()</script>">중첩 공격</iframe></foreignObject>
  </svg>
  <math><mtext href="javascript:steal()">수식 링크</mtext></math>
  <iframe src="https://evil.example/frame">iframe payload</iframe>
  <object data="https://evil.example/object">object payload</object>
  <embed src="https://evil.example/embed">
</body></html>`);
  const publicDom = html.replace(/<script>[\s\S]*?<\/script>/i, "");

  assert.doesNotMatch(
    publicDom,
    /<(?:iframe|object|embed|base|foreignobject|svg|math|animate|set)\b/i,
  );
  assert.doesNotMatch(publicDom, /<meta\b[^>]*http-equiv\s*=/i);
  assert.doesNotMatch(
    publicDom,
    /<[^>]*\son[a-z][^\s=/>]*(?:\s*=|\s|\/?>)/i,
  );
  assert.doesNotMatch(
    publicDom,
    /(?:javascript|vbscript):|data:text\/html|data:image\/svg\+xml|&#x73;|&tab;/i,
  );
  assert.doesNotMatch(
    publicDom,
    /iframe payload|object payload|svg script|동적 링크|수식 링크|중첩 공격/,
  );
  assert.match(publicDom, /<meta charset="utf-8">/);
  assert.match(
    publicDom,
    /<meta name="viewport" content="width=device-width">/,
  );
  assert.match(publicDom, /href="\/guide"/);
  assert.match(
    publicDom,
    /src="https:\/\/cdn\.example\/product\.webp" alt="HTTPS 제품 이미지"/,
  );
  assert.match(
    publicDom,
    /src="\.\.\/media\/product\.webp" alt="상대 제품 이미지"/,
  );
  assert.match(
    publicDom,
    /src="data:image\/png;base64,AAAA" alt="PNG 제품 이미지"/,
  );
  assert.match(
    publicDom,
    /src="data:image\/gif;base64,R0lGODlhAQABAIAAAAUEBA==" alt="GIF 제품 이미지"/,
  );
  assert.match(publicDom, /alt="위험 이미지"/);
  assert.match(publicDom, /alt="SVG 차단"/);
  assert.equal((html.match(/<script\b/gi) || []).length, 1);
});

test("공개 GIF에는 임의 script 대신 visible-only motion runtime 하나만 주입한다", () => {
  const html = sanitizePublicHtml(`<!doctype html>
<html><head><script>window.authoringSecret = "remove-me"</script></head>
<body data-agent="writer">
  <main id="detailPage">
    <section data-section="motion">
      <img src="media/gifs/use.gif?version=1" alt="사용 장면">
    </section>
  </main>
  <script src="https://evil.example/arbitrary.js"></script>
  <script type="module">console.log("arbitrary-module")</script>
</body></html>`);
  assert.equal((html.match(/<script\b/gi) || []).length, 1);
  assert.doesNotMatch(
    html,
    /authoringSecret|remove-me|evil\.example|arbitrary-module/,
  );
  assert.doesNotMatch(html, /\sdata-[\w:-]+(?:=|\s|>)/i);
  assert.match(html, /const originals=new WeakMap\(\)/);
  assert.match(html, /const posters=new WeakMap\(\)/);
  assert.match(html, /document\.createElement\("canvas"\)/);
  assert.match(html, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(html, /new IntersectionObserver\(entries=>/);
  assert.match(html, /entry\.isIntersecting\)restart\(image\);else stop\(image\)/);
  assert.match(html, /_motion_restart/);
  assert.match(html, /Date\.now\(\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /if\(preference\.matches\)\{stop\(image\);return\}/);
  assert.match(html, /!\("IntersectionObserver"in window\)/);
  assert.match(html, /addEventListener\("change",onPreferenceChange\)/);
  assert.match(html, /height:auto!important/);
  assert.equal(
    (html.match(/src="media\/gifs\/use\.gif\?version=1"/g) || []).length,
    1,
  );
});

test("motion runtime은 진입마다 GIF를 재시작하고 이탈·reduced-motion에서는 정지한다", () => {
  const html = sanitizePublicHtml(
    '<html><body><img src="https://shop.example/media/use.gif" alt="사용"></body></html>',
  );
  const fixture = publicMotionFixture();
  executePublicMotionRuntime(html, fixture);
  assert.equal(
    fixture.image.getAttribute("src"),
    "data:image/png;base64,poster",
  );
  assert.deepEqual(fixture.observer().observed, [fixture.image]);

  fixture.observer().callback([
    { target: fixture.image, isIntersecting: true },
  ]);
  const firstRestart = fixture.image.getAttribute("src");
  assert.match(firstRestart, /_motion_restart=/);

  fixture.observer().callback([
    { target: fixture.image, isIntersecting: false },
  ]);
  assert.equal(
    fixture.image.getAttribute("src"),
    "data:image/png;base64,poster",
  );

  fixture.observer().callback([
    { target: fixture.image, isIntersecting: true },
  ]);
  const secondRestart = fixture.image.getAttribute("src");
  assert.match(secondRestart, /_motion_restart=/);
  assert.notEqual(secondRestart, firstRestart);

  fixture.preference.matches = true;
  fixture.listeners.get("change")();
  assert.equal(
    fixture.image.getAttribute("src"),
    "data:image/png;base64,poster",
  );
  fixture.observer().callback([
    { target: fixture.image, isIntersecting: true },
  ]);
  assert.equal(
    fixture.image.getAttribute("src"),
    "data:image/png;base64,poster",
  );
});

test("IntersectionObserver 미지원 환경은 GIF를 재생하지 않고 정지 poster를 유지한다", () => {
  const html = sanitizePublicHtml(
    '<html><body><img src="https://shop.example/media/use.gif" alt="사용"></body></html>',
  );
  const fixture = publicMotionFixture({ observerSupported: false });
  assert.doesNotThrow(() => executePublicMotionRuntime(html, fixture));
  assert.equal(
    fixture.image.getAttribute("src"),
    "data:image/png;base64,poster",
  );
  assert.equal(fixture.observer(), null);
  fixture.preference.matches = false;
  fixture.listeners.get("change")();
  assert.equal(
    fixture.image.getAttribute("src"),
    "data:image/png;base64,poster",
  );
});

test("초기 reduced-motion 환경도 observer를 유지하되 재생하지 않는다", () => {
  const html = sanitizePublicHtml(
    '<html><body><img src="https://shop.example/media/use.gif" alt="사용"></body></html>',
  );
  const fixture = publicMotionFixture({ reducedMotion: true });
  executePublicMotionRuntime(html, fixture);
  assert.deepEqual(fixture.observer().observed, [fixture.image]);
  fixture.observer().callback([
    { target: fixture.image, isIntersecting: true },
  ]);
  assert.equal(
    fixture.image.getAttribute("src"),
    "data:image/png;base64,poster",
  );
  fixture.preference.matches = false;
  fixture.listeners.get("change")();
  assert.match(
    fixture.image.getAttribute("src"),
    /_motion_restart=/,
  );
});

test("cross-origin GIF canvas taint는 가시 fallback을 즉시 보이고 검증된 poster convention을 우선한다", () => {
  const html = sanitizePublicHtml(
    '<html><body><img src="https://shop.example/media/use.gif?version=7" alt="착용 동작"></body></html>',
  );
  const fixture = publicMotionFixture({
    reducedMotion: true,
    taintedCanvas: true,
  });
  executePublicMotionRuntime(html, fixture);

  assert.equal(
    fixture.image.getAttribute("src"),
    "data:image/png;base64,visible-poster",
  );
  assert.equal(fixture.posterProbes.length, 1);
  assert.equal(
    fixture.posterProbes[0].src,
    "https://shop.example/media/use-poster.webp",
  );

  fixture.resolvePoster();
  assert.equal(
    fixture.image.getAttribute("src"),
    "https://shop.example/media/use-poster.webp",
  );
  fixture.observer().callback([
    { target: fixture.image, isIntersecting: true },
  ]);
  assert.equal(
    fixture.image.getAttribute("src"),
    "https://shop.example/media/use-poster.webp",
  );
});

test("명시적 Save 21회는 현재 파일을 덮어쓰고 복구본 20개만 유지한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-output-save-"),
  );
  try {
    const { projectRoot } = await createProject({
      name: "저장 테스트",
      supplierUrl: "https://supplier.example/123456",
      root: temporaryRoot,
    });
    for (let index = 1; index <= 21; index += 1) {
      await saveProjectOutput(projectRoot, {
        html: authoringHtml(`저장 ${index}`),
        now: new Date(Date.UTC(2026, 6, 30, 0, 0, index)),
      });
    }
    const backups = await listProjectBackups(projectRoot);
    assert.equal(backups.length, 20);
    assert.match(
      await readFile(
        path.join(projectRoot, ".detail-page/authoring/detail-page.html"),
        "utf8",
      ),
      /저장 21/,
    );
    const publicHtml = await readFile(
      path.join(projectRoot, "output/detail-page.html"),
      "utf8",
    );
    assert.match(publicHtml, /저장 21/);
    assert.doesNotMatch(publicHtml, /data-claim-id|data-agent|app\.js/);
    assert.equal(
      (await readProjectOutputState(projectRoot)).wing_export_required,
      true,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Save 실패는 authoring과 공개 결과의 이전 bytes를 모두 보존한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-output-rollback-"),
  );
  try {
    const { projectRoot } = await createProject({
      name: "원복 테스트",
      supplierUrl: "https://supplier.example/123456",
      root: temporaryRoot,
    });
    await saveProjectOutput(projectRoot, {
      html: authoringHtml("정상 버전"),
    });
    const authoringPath = path.join(
      projectRoot,
      ".detail-page/authoring/detail-page.html",
    );
    const outputPath = path.join(projectRoot, "output/detail-page.html");
    const beforeAuthoring = await readFile(authoringPath);
    const beforeOutput = await readFile(outputPath);
    await assert.rejects(
      saveProjectOutput(projectRoot, {
        html: authoringHtml("깨진 버전"),
        failureInjection: "after-authoring",
      }),
      /injected save failure/,
    );
    assert.deepEqual(await readFile(authoringPath), beforeAuthoring);
    assert.deepEqual(await readFile(outputPath), beforeOutput);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("export manifest 갱신 실패도 기존 HTML·manifest bytes를 함께 보존한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-export-rollback-"),
  );
  try {
    const { projectRoot } = await createProject({
      name: "Export 원복",
      supplierUrl: "https://supplier.example/123456",
      root: temporaryRoot,
    });
    await saveProjectOutput(projectRoot, {
      html: authoringHtml("승인 버전"),
      exportManifest: {
        schema_version: "2.0",
        export_type: "public-detail-page-html",
        revision_id: "revision-1",
      },
    });
    const authoringPath = path.join(
      projectRoot,
      ".detail-page/authoring/detail-page.html",
    );
    const outputPath = path.join(projectRoot, "output/detail-page.html");
    const manifestPath = path.join(
      projectRoot,
      "output/export-manifest.json",
    );
    const before = await Promise.all([
      readFile(authoringPath),
      readFile(outputPath),
      readFile(manifestPath),
    ]);
    await assert.rejects(
      saveProjectOutput(projectRoot, {
        html: authoringHtml("실패 버전"),
        exportManifest: {
          schema_version: "2.0",
          export_type: "public-detail-page-html",
          revision_id: "revision-2",
        },
        failureInjection: "after-export-manifest",
      }),
      /injected save failure/,
    );
    assert.deepEqual(await readFile(authoringPath), before[0]);
    assert.deepEqual(await readFile(outputPath), before[1]);
    assert.deepEqual(await readFile(manifestPath), before[2]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("복구본 목록에서 선택한 Save 직전 상태를 current로 복원한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-output-restore-"),
  );
  try {
    const { projectRoot } = await createProject({
      name: "복구 테스트",
      supplierUrl: "https://supplier.example/123456",
      root: temporaryRoot,
    });
    await saveProjectOutput(projectRoot, { html: authoringHtml("첫 저장") });
    const second = await saveProjectOutput(projectRoot, {
      html: authoringHtml("두 번째 저장"),
    });
    assert.ok(second.backup_id);
    await restoreProjectBackup(projectRoot, second.backup_id);
    assert.match(
      await readFile(
        path.join(projectRoot, "output/detail-page.html"),
        "utf8",
      ),
      /첫 저장/,
    );
    assert.equal(
      (await readProjectOutputState(projectRoot)).wing_export_required,
      true,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Save는 승인 미디어만 output/media로 복사하고 변경된 미디어만 복구한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-output-media-"),
  );
  try {
    const { projectRoot } = await createProject({
      name: "미디어 복구",
      supplierUrl: "https://supplier.example/123456",
      root: temporaryRoot,
    });
    const approved = path.join(
      projectRoot,
      ".detail-page/generation/approved/image/product.webp",
    );
    const firstBytes = Buffer.from("webp-v1");
    const secondBytes = Buffer.from("webp-v2");
    await writeFile(approved, firstBytes);
    const withMedia = (copy) =>
      `<!doctype html><html><body><main id="detailPage"><section data-section="hero"><h1>${copy}</h1><img src="/.detail-page/generation/approved/image/product.webp" alt="상품"></section></main></body></html>`;
    await saveProjectOutput(projectRoot, { html: withMedia("첫 버전") });
    const publicMedia = path.join(
      projectRoot,
      "output/media/images/product.webp",
    );
    assert.deepEqual(await readFile(publicMedia), firstBytes);
    assert.match(
      await readFile(
        path.join(projectRoot, "output/detail-page.html"),
        "utf8",
      ),
      /src="media\/images\/product\.webp"/,
    );

    await writeFile(approved, secondBytes);
    const saved = await saveProjectOutput(projectRoot, {
      html: withMedia("두 번째 버전"),
    });
    assert.deepEqual(await readFile(publicMedia), secondBytes);
    await restoreProjectBackup(projectRoot, saved.backup_id);
    assert.deepEqual(await readFile(publicMedia), firstBytes);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("Wing Export 두 번은 390×2 규격과 서로 다른 CDN namespace를 사용한다", () => {
  const projectRoot = path.resolve("fixture-project");
  const first = createWingExportIdentity({
    projectRoot,
    cdnBaseUrl: "https://cdn.example.com/detail",
    projectKey: "팔토시-56328525",
    now: new Date("2026-07-30T01:02:03.000Z"),
    nonce: "aaaaaaaa",
  });
  const second = createWingExportIdentity({
    projectRoot,
    cdnBaseUrl: "https://cdn.example.com/detail",
    projectKey: "팔토시-56328525",
    now: new Date("2026-07-30T01:02:03.000Z"),
    nonce: "bbbbbbbb",
  });
  assert.notEqual(first.exportId, second.exportId);
  assert.notEqual(first.cdnBaseUrl, second.cdnBaseUrl);
  assert.match(first.cdnBaseUrl, /56328525\/wing-/);
});

test("원격 CDN의 HTTP·MIME·크기·해시 검증 뒤에만 공개 HTML을 Wing stack으로 확정한다", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "detail-page-wing-verify-"),
  );
  try {
    const { projectRoot } = await createProject({
      name: "Wing 검증",
      supplierUrl: "https://supplier.example/123456",
      root: temporaryRoot,
    });
    const exportId = "wing-20260730-010203-aaaaaaaa";
    const outputRoot = path.join(projectRoot, "output", "wing", exportId);
    await mkdir(outputRoot, { recursive: true });
    const bytes = Buffer.from("fake-webp-bytes");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const cdnUrl =
      "https://cdn.example.com/detail/123456/wing-20260730-010203-aaaaaaaa/section-01.webp";
    const wingHtml =
      `<div align="center">\n  <img src="${cdnUrl}" width="780" alt="상품"><br>\n</div>\n`;
    await Promise.all([
      writeFile(
        path.join(outputRoot, "cdn-upload-manifest.json"),
        `${JSON.stringify(
          {
            schema_version: "2.0",
            export_id: exportId,
            project_key: "123456",
            cdn_base_url:
              "https://cdn.example.com/detail/123456/wing-20260730-010203-aaaaaaaa",
            assets: [
              {
                filename: "section-01.webp",
                mime_type: "image/webp",
                width: 780,
                bytes: bytes.length,
                sha256: digest,
                cdn_url: cdnUrl,
              },
            ],
            remote_verification: { status: "pending" },
          },
          null,
          2,
        )}\n`,
        "utf8",
      ),
      writeFile(
        path.join(outputRoot, "coupang-wing-detail-780.html"),
        wingHtml,
        "utf8",
      ),
    ]);
    const manifestPath = path.join(
      outputRoot,
      "cdn-upload-manifest.json",
    );
    const exactManifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    );
    const foreignHostManifest = structuredClone(exactManifest);
    foreignHostManifest.assets[0].cdn_url =
      "https://foreign.example/section-01.webp";
    await writeFile(
      manifestPath,
      `${JSON.stringify(foreignHostManifest, null, 2)}\n`,
    );
    let foreignHostFetched = false;
    await assert.rejects(
      verifyCdnWingExport(projectRoot, exportId, {
        expectedPublicBaseUrl: "https://cdn.example.com/detail",
        fetchImpl: async () => {
          foreignHostFetched = true;
          return new Response(bytes, { status: 200 });
        },
      }),
      (error) => {
        assert.equal(error.code, "WING_CDN_ASSET_URL_MISMATCH");
        return true;
      },
    );
    assert.equal(foreignHostFetched, false);
    await writeFile(
      manifestPath,
      `${JSON.stringify(exactManifest, null, 2)}\n`,
    );
    const beforeRedirectAttempt = await readFile(
      path.join(projectRoot, "output", "detail-page.html"),
    );
    let redirectOptions;
    await assert.rejects(
      verifyCdnWingExport(projectRoot, exportId, {
        expectedPublicBaseUrl: "https://cdn.example.com/detail",
        fetchImpl: async (_url, options) => {
          redirectOptions = options;
          return new Response(null, {
            status: 302,
            headers: {
              Location: "https://redirect.example/section-01.webp",
              "Content-Type": "image/webp",
              "Cache-Control":
                "public, max-age=31536000, immutable",
            },
          });
        },
      }),
      (error) => {
        assert.equal(error.code, "WING_REMOTE_VERIFICATION_FAILED");
        return true;
      },
    );
    assert.equal(redirectOptions.redirect, "manual");
    assert.deepEqual(
      await readFile(
        path.join(projectRoot, "output", "detail-page.html"),
      ),
      beforeRedirectAttempt,
    );
    let fetchOptions;
    const verified = await verifyCdnWingExport(projectRoot, exportId, {
      expectedPublicBaseUrl: "https://cdn.example.com/detail",
      fetchImpl: async (_url, options) => {
        fetchOptions = options;
        return (
        new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control":
              "public, max-age=31536000, immutable",
          },
        })
        );
      },
    });
    assert.equal(verified.status, "completed");
    assert.equal(fetchOptions.redirect, "manual");
    assert.equal(
      await readFile(
        path.join(projectRoot, "output", "detail-page.html"),
        "utf8",
      ),
      wingHtml,
    );
    assert.equal(
      (await readProjectOutputState(projectRoot)).wing_export_required,
      false,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
