#!/usr/bin/env node
// Wing 로컬 내보내기. 정본 HTML 을 780px WebP 로 굽고 `<img>` 를 세로로 이어 낸다.
//
// 왜 오케스트레이터의 lean-wing-export.mjs 를 쓰지 않는가 — lib/wing.mjs 머리말에 적었다.
// 요약하면 Cloudflare config 가 없어 dry-run 도 못 지나고, 그 렌더러의 캡처 설정은 이
// 호스트에서 빈 그림을 준다(work/g11-probe.mjs 실측).
//
// 캡처에서 실측으로 배운 것 세 가지. 전부 이 파일이 지킨다.
//
//   1. 창이 있는 Chrome 의 배경 탭은 rAF 가 얼어 **직전 프레임을 그대로 돌려준다.**
//      높이가 같은 세 섹션이 바이트까지 같은 그림으로 나왔다. 전용 헤드리스로 찍는다.
//   2. 큰 창은 어떤 섹션에서 응답하지 않는다. 1,200px 로 나눠 찍고 ffmpeg 으로 잇는다.
//   3. 같은 그림이 두 번 나오면 멈춘다. 조용히 같은 장을 두 번 내보내지 않는다.

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { runLeanQa } from "../../detail-page-orchestrator/scripts/lean-studio-server.mjs";
import { guard, refuse } from "../../detail-page-orchestrator/scripts/lib/stage.mjs";
import { OUTPUT_WIDTH, groupBlocks, makeExportId, manifestOf, webpSize, wingHtml } from "./lib/wing.mjs";

/** 한 번에 찍는 창 높이. 이보다 크게 잡으면 어떤 섹션에서 캡처가 응답하지 않는다. */
const CHUNK_H = 1200;
const out = (line) => process.stdout.write(`${line}\n`);
const flag = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => reject(new Error(`${command}_SPAWN ${error.message}`)));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command}_FAILED ${code}\n  ${stderr.trim().slice(0, 500)}`)),
    );
  });
}

/** RIFF/WEBP 의 ANMF 청크 수가 곧 프레임 수다. 없으면 정지본이다. */
function webpFrames(buffer) {
  let frames = 0;
  for (let index = 12; index + 8 <= buffer.length; ) {
    const tag = buffer.toString("ascii", index, index + 4);
    const size = buffer.readUInt32LE(index + 4);
    if (tag === "ANMF") frames += 1;
    index += 8 + size + (size % 2);
  }
  return frames === 0 ? 1 : frames;
}

// ── CDP ────────────────────────────────────────────────────────────────────
async function connect(endpoint) {
  const version = await fetch(`${endpoint}/json/version`).then((r) => r.json());
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP_CONNECT_FAILED")), { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      seq += 1;
      const id = seq;
      const timer = setTimeout(() => (pending.delete(id), reject(new Error(`CDP_TIMEOUT ${method}`))), 120000);
      pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  return { send, close: () => socket.close() };
}

try {
  const ctx = await guard("G11");
  const endpoint = flag("cdp", "http://127.0.0.1:9333");
  const pageUrl = flag("page-url");
  if (!pageUrl) throw new Error("PAGE_URL_MISSING --page-url 이 필요하다 (Studio 가 띄운 주소)");

  // 정본이 lean QA 를 지나지 않으면 굽지 않는다. 깨진 화면을 납품물로 만들지 않는다.
  const canonical = await readFile(path.join(ctx.project, "output", "detail-page.html"));
  const qa = await runLeanQa(ctx.project, canonical.toString("utf8"));
  if (qa.status !== "PASS") {
    throw new Error(`LEAN_QA_FAILED ${qa.errors.map((e) => e.code).join(", ")}`);
  }

  // 제목 없는 섹션의 alt 에 쓴다. 상품명은 프로젝트 이름의 앞자리다.
  const productName = path.basename(ctx.project).replace(/-\d+$/, "");
  const exportId = makeExportId(new Date(), randomBytes(3).toString("hex"));
  const root = path.join(ctx.project, "output", "wing", exportId);
  const assetRoot = path.join(root, "assets");
  await mkdir(path.dirname(root), { recursive: true });
  // 이미 있는 namespace 는 덮어쓰지 않는다. 앞 회차의 납품본이 거기 있다.
  await mkdir(root, { recursive: false }).catch(() => {
    throw new Error(`EXPORT_NAMESPACE_EXISTS output/wing/${exportId}/ 이 이미 있다`);
  });
  await mkdir(assetRoot, { recursive: true });

  const browser = await connect(endpoint);
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => browser.send(method, params, sessionId);
  const js = async (expression) => {
    const result = await page("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`JS ${result.exceptionDetails.exception?.description}`);
    return result.result.value;
  };

  const assets = [];
  const seen = new Set();
  try {
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Emulation.setDeviceMetricsOverride", {
      width: OUTPUT_WIDTH,
      height: CHUNK_H,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page("Page.navigate", { url: pageUrl });

    let ready = false;
    for (let attempt = 0; attempt < 900 && !ready; attempt += 1) {
      ready = await js(
        "document.readyState === 'complete' && Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)",
      ).catch(() => false);
      if (!ready) await new Promise((r) => setTimeout(r, 200));
    }
    if (!ready) throw new Error("IMAGES_NOT_LOADED 자산이 다 붙기 전에는 굽지 않는다");

    // 블록 목록. 모션 블록은 어느 파일에서 왔는지까지 받아 온다 — 그 파일을 그대로
    // animated WebP 로 옮긴다. 다시 찍으면 GIF 가 정지 프레임이 된다.
    const blocks = JSON.parse(
      await js(`(() => {
        const root = document.querySelector('#detailPage') || document.querySelector('.page') || document.body;
        const list = [];
        for (const section of root.querySelectorAll(':scope > section')) {
          for (const block of section.children) {
            const motion = Array.from(block.querySelectorAll('img'))
              .map(image => image.getAttribute('src'))
              .find(src => /\\.gif$|\\/gifs\\//i.test(src || ''));
            block.dataset.wing = String(list.length);
            list.push({
              index: list.length,
              kind: motion ? 'motion' : 'static',
              src: motion || null,
              section: section.id,
              height: Math.ceil(block.getBoundingClientRect().height),
              // <br> 를 지우고 이으면 "걸어두면완벽 포획" 이 된다. 줄바꿈은 빈칸이다.
              // 제목이 없는 섹션에 섹션 id 를 넣지 않는다 — 고객이 보는 자리에 내부
              // 이름을 흘리는 것이다.
              alt: ((section.querySelector('h2')?.innerHTML || '')
                .replace(/<br\\s*\\/?>/gi, ' ').replace(/<[^>]*>/g, '')).replace(/\\s+/g, ' ').trim(),
            });
          }
        }
        return JSON.stringify(list);
      })()`),
    );
    if (blocks.length === 0) throw new Error("NO_BLOCKS 내보낼 블록이 없다");

    const runs = groupBlocks(blocks);
    out(`블록 ${blocks.length}개 → 자산 ${runs.length}장`);

    for (const [order, group] of runs.entries()) {
      const name = `block-${String(order + 1).padStart(2, "0")}.webp`;
      const dest = path.join(assetRoot, name);
      const head = blocks[group.from];

      if (group.kind === "motion") {
        // 이미 780px 로 구운 움직임이다. 다시 찍지 않고 그대로 옮긴다.
        const source = path.join(ctx.project, "output", head.src.split("/").join(path.sep));
        await run("ffmpeg", [
          "-hide_banner", "-loglevel", "error", "-y",
          "-i", source,
          "-vf", `scale=${OUTPUT_WIDTH}:-2:flags=lanczos`,
          "-loop", "0", "-c:v", "libwebp_anim", "-quality", "80",
          dest,
        ]);
      } else {
        // 이 묶음만 남기고 숨긴 뒤, 1,200px 창으로 나눠 찍어 잇는다.
        // 섹션까지 숨겨야 한다. 블록만 숨기면 **부모 섹션의 padding 과 배경이 남는다** —
        // `<section class="caution">` 은 그 자체가 검은 판이라 닫는 컷 위에 150px 짜리
        // 검은 띠가 붙어 나왔다.
        // 높이는 **보이는 블록의 상자**에서 잰다. documentElement.scrollHeight 는 창보다
        // 작아지지 않아, 116px 짜리 각주가 앞 컷의 창 높이 그대로 980px 로 나왔다 —
        // 864px 이 빈 여백인 납품 이미지다.
        const box = JSON.parse(
          await js(`(() => {
            const target = document.querySelector('[data-wing="${group.from}"]').closest('section');
            document.querySelectorAll('#detailPage > section').forEach(section => {
              section.style.display = section === target ? '' : 'none';
            });
            document.querySelectorAll('[data-wing]').forEach(block => {
              const index = Number(block.dataset.wing);
              block.style.display = index >= ${group.from} && index <= ${group.to} ? '' : 'none';
            });
            document.querySelectorAll('details').forEach(details => details.open = true);
            window.scrollTo(0, 0);
            const boxes = Array.from(document.querySelectorAll('[data-wing]'))
              .filter(block => block.style.display !== 'none')
              .map(block => block.getBoundingClientRect());
            const top = Math.min(...boxes.map(b => b.top)) + window.scrollY;
            const bottom = Math.max(...boxes.map(b => b.bottom)) + window.scrollY;
            return JSON.stringify({ top: Math.floor(top), height: Math.ceil(bottom - top) });
          })()`),
        );
        const height = box.height;
        const parts = [];
        for (let top = 0; top < height; top += CHUNK_H) {
          const chunk = Math.min(CHUNK_H, height - top);
          await page("Emulation.setDeviceMetricsOverride", {
            width: OUTPUT_WIDTH,
            height: chunk,
            deviceScaleFactor: 1,
            mobile: false,
          });
          await js(`window.scrollTo(0, ${box.top + top})`);
          await new Promise((r) => setTimeout(r, 350));
          const shot = await page("Page.captureScreenshot", { format: "png" });
          if (seen.has(shot.data)) throw new Error(`STALE_FRAME ${name} @${top} 직전 프레임이 그대로 왔다`);
          seen.add(shot.data);
          const part = path.join(assetRoot, `.part-${parts.length}.png`);
          await writeFile(part, Buffer.from(shot.data, "base64"));
          parts.push(part);
        }
        const flat = path.join(assetRoot, ".flat.png");
        if (parts.length === 1) {
          await rename(parts[0], flat);
        } else {
          const args = ["-v", "error", "-y"];
          for (const part of parts) args.push("-i", part);
          args.push("-filter_complex", `vstack=inputs=${parts.length}`, flat);
          await run("ffmpeg", args);
          await Promise.all(parts.map((part) => rm(part, { force: true })));
        }
        await run("ffmpeg", [
          "-hide_banner", "-loglevel", "error", "-y",
          "-i", flat,
          "-vf", `scale=${OUTPUT_WIDTH}:-2:flags=lanczos`,
          "-c:v", "libwebp", "-quality", "85",
          dest,
        ]);
        await rm(flat, { force: true });
      }

      const bytes = await readFile(dest);
      const size = await stat(dest);
      // 크기는 구운 파일에서 잰다. 굽기 전 CSS 박스 높이를 적으면 manifest 가 없는
      // 그림을 설명하게 된다.
      const measured = webpSize(bytes);
      if (!measured) throw new Error(`WEBP_UNREADABLE ${name} 의 크기를 읽지 못했다`);
      assets.push({
        order: order + 1,
        filename: name,
        kind: group.kind,
        mime_type: "image/webp",
        width: measured.width,
        height: measured.height,
        frames: group.kind === "motion" ? webpFrames(bytes) : 1,
        bytes: size.size,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        alt: head.alt || `${productName} 상세 이미지 ${order + 1}`,
        from: head.section,
      });
      out(`  ○ ${name} ${group.kind} ${(size.size / 1024).toFixed(0)}KB`);
    }
  } finally {
    await browser.send("Target.closeTarget", { targetId }).catch(() => null);
    browser.close();
  }

  // 굽는 동안 정본이 바뀌었으면 이 자산들은 그 정본의 것이 아니다.
  const after = await readFile(path.join(ctx.project, "output", "detail-page.html"));
  const sourceSha = createHash("sha256").update(canonical).digest("hex");
  if (createHash("sha256").update(after).digest("hex") !== sourceSha) {
    throw new Error("SOURCE_CHANGED_DURING_EXPORT 굽는 동안 정본 HTML 이 바뀌었다");
  }

  const manifest = manifestOf({
    exportId,
    projectKey: path.basename(ctx.project),
    source: { path: "output/detail-page.html", bytes: canonical.length, sha256: sourceSha },
    assets,
    generatedAt: new Date().toISOString(),
  });
  await writeFile(path.join(root, "coupang-wing-detail-780.html"), wingHtml(assets), "utf8");
  await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const files = await readdir(root);
  out("");
  out(`export id  ${exportId}`);
  out(`자산       ${manifest.local_qa.asset_count}장 · 움직임 ${manifest.local_qa.animated_count}장 · ${(manifest.local_qa.total_bytes / 1048576).toFixed(2)}MB`);
  out(`폭 780     ${manifest.local_qa.all_width_780 ? "전량" : "**아닌 자산이 있다**"}`);
  out(`세로 합    ${assets.reduce((sum, asset) => sum + asset.height, 0)}px`);
  out(`자리       output/wing/${exportId}/ (파일 ${files.length}개)`);
} catch (error) {
  refuse(error);
}
