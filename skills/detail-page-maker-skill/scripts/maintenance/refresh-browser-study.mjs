import { spawn } from "node:child_process";
import {
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const MARKERS = Object.freeze({
  behance: "__BEHANCE_LEARNING_JSON__",
  hyperframes: "__HYPERFRAMES_LEARNING_JSON__",
});

const BROWSER_SCRIPTS = Object.freeze({
  behance: String.raw`
import json

def _attach_without_focus(target_id):
    wrapped = switch_tab
    inner = wrapped.__closure__[0].cell_contents if wrapped.__closure__ else wrapped
    private = inner.__globals__
    sid = cdp("Target.attachToTarget", targetId=target_id, flatten=True)["sessionId"]
    private["_send"]({"meta": "set_session", "session_id": sid, "target_id": target_id})
    private["_mark_tab"]()
    return sid

def new_background_tab(url="about:blank"):
    previous = current_tab()["targetId"]
    target_id = cdp("Target.createTarget", url="about:blank", background=True)["targetId"]
    _attach_without_focus(target_id)
    if url != "about:blank":
        goto_url(url)
        wait_for_load()
    return {"targetId": target_id, "previousTargetId": previous}

def close_background_tab(context):
    cdp("Target.closeTarget", targetId=context["targetId"])
    _attach_without_focus(context["previousTargetId"])

recording_path = start_recording(
    "behance-learning-refresh",
    title="Behance 상세페이지 학습 후보 수집",
)
context = None
payload = {"recording_path": str(recording_path), "projects": []}
try:
    context = new_background_tab(
        "https://www.behance.net/search/projects/%EC%83%81%EC%84%B8%ED%8E%98%EC%9D%B4%EC%A7%80"
    )
    if js("document.hasFocus()") is not False:
        raise RuntimeError("배경 탭 포커스 안전성 검사에 실패했습니다.")
    payload["projects"] = js("""
      (() => {
        const rows = [...document.querySelectorAll('a[href*="/gallery/"]')]
          .map((anchor) => ({
            href: anchor.href,
            title: (anchor.innerText || anchor.getAttribute('aria-label') || '').trim(),
          }))
          .filter((row) => row.href);
        const unique = new Map();
        for (const row of rows) {
          const url = new URL(row.href);
          const key = decodeURIComponent(url.pathname);
          const current = unique.get(key);
          if (!current || (!current.title && row.title)) {
            unique.set(key, {href: url.origin + url.pathname, title: row.title});
          }
        }
        return [...unique.values()];
      })()
    """)
finally:
    if context:
        close_background_tab(context)
    payload["recording_path"] = str(stop_recording())

print("__BEHANCE_LEARNING_JSON__" + json.dumps(payload, ensure_ascii=False))
`,
  hyperframes: String.raw`
import json

def _attach_without_focus(target_id):
    wrapped = switch_tab
    inner = wrapped.__closure__[0].cell_contents if wrapped.__closure__ else wrapped
    private = inner.__globals__
    sid = cdp("Target.attachToTarget", targetId=target_id, flatten=True)["sessionId"]
    private["_send"]({"meta": "set_session", "session_id": sid, "target_id": target_id})
    private["_mark_tab"]()
    return sid

def new_background_tab(url="about:blank"):
    previous = current_tab()["targetId"]
    target_id = cdp("Target.createTarget", url="about:blank", background=True)["targetId"]
    _attach_without_focus(target_id)
    if url != "about:blank":
        goto_url(url)
        wait_for_load()
    return {"targetId": target_id, "previousTargetId": previous}

def close_background_tab(context):
    cdp("Target.closeTarget", targetId=context["targetId"])
    _attach_without_focus(context["previousTargetId"])

recording_path = start_recording(
    "hyperframes-gif-learning-refresh",
    title="HyperFrames 공식 GIF 패턴 후보 수집",
)
context = None
payload = {"recording_path": str(recording_path), "sources": []}
try:
    context = new_background_tab(
        "https://api.github.com/repos/heygen-com/hyperframes/git/trees/main?recursive=1"
    )
    if js("document.hasFocus()") is not False:
        raise RuntimeError("배경 탭 포커스 안전성 검사에 실패했습니다.")
    tree = json.loads(js("document.body.innerText"))
    needles = (
        "mask-reveal",
        "clip-wipe",
        "transitions-push",
        "svg-path-draw",
        "nudge-curve",
        "reactive-displacement",
        "motion-blur-streak",
        "scale-swap-transition",
    )
    for row in tree.get("tree", []):
        item_path = row.get("path", "")
        if row.get("type") != "blob":
            continue
        if any(needle in item_path.lower() for needle in needles):
            payload["sources"].append({
                "path": item_path,
                "url": "https://github.com/heygen-com/hyperframes/blob/main/" + item_path,
            })
finally:
    if context:
        close_background_tab(context)
    payload["recording_path"] = str(stop_recording())

print("__HYPERFRAMES_LEARNING_JSON__" + json.dumps(payload, ensure_ascii=False))
`,
});

function parseArgs(argv) {
  const parsed = {
    project: "",
    kind: null,
    max: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`지원하지 않는 인자입니다: ${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`값이 필요한 인자입니다: ${token}`);
    }
    parsed[key] = value;
    index += 1;
  }
  if (!Object.hasOwn(MARKERS, parsed.kind)) {
    throw new Error("--kind는 behance 또는 hyperframes여야 합니다.");
  }
  const fallbackMax = parsed.kind === "behance" ? 12 : 24;
  parsed.max = Number.parseInt(parsed.max ?? String(fallbackMax), 10);
  if (!Number.isInteger(parsed.max) || parsed.max < 1 || parsed.max > 100) {
    throw new Error("--max는 1 이상 100 이하 정수여야 합니다.");
  }
  return parsed;
}

function kstParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    timestamp:
      `${parts.year}-${parts.month}-${parts.day} ` +
      `${parts.hour}:${parts.minute}:${parts.second} +09:00`,
  };
}

function runBrowserHarness(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("browser-harness", [], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      return next.length > 4 * 1024 * 1024
        ? next.slice(-(4 * 1024 * 1024))
        : next;
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => {
      reject(
        new Error(
          error.code === "ENOENT"
            ? "browser-harness 실행 파일을 찾을 수 없습니다."
            : error.message,
        ),
      );
    });
    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Browser Harness가 종료 코드 ${code}로 실패했습니다.\n${stderr || stdout}`,
          ),
        );
        return;
      }
      resolve(`${stdout}\n${stderr}`);
    });
    child.stdin.end(script, "utf8");
  });
}

function parsePayload(output, marker) {
  const line = output
    .split(/\r?\n/u)
    .filter((candidate) => candidate.startsWith(marker))
    .at(-1);
  if (!line) {
    throw new Error(
      `Browser Harness 결과에서 JSON 표식을 찾지 못했습니다.\n${output}`,
    );
  }
  return JSON.parse(line.slice(marker.length));
}

function escapeCell(value, fallback) {
  return String(value || fallback)
    .trim()
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function renderBehance(payload, limit, time) {
  const rows = (payload.projects || []).slice(0, limit).map((project) => {
    const title = escapeCell(project.title, "제목 수동 확인");
    return `| [${title}](${project.href}) | 검토 대기 |`;
  });
  return {
    count: rows.length,
    inbox: [
      "# Behance 학습 후보 Inbox",
      "",
      `갱신 시각: ${time.timestamp}`,
      `Browser Harness 녹화 ID: \`${path.basename(payload.recording_path || "")}\``,
      `Browser Harness 원문 녹화: \`${payload.recording_path || ""}\``,
      "",
      "이 파일은 URL 후보만 저장한다. 후보 수집만으로 스킬 규칙은 업데이트되지 않는다.",
      "",
      "| 후보 | 상태 |",
      "| --- | --- |",
      ...rows,
      "",
      "## 다음 단계",
      "",
      "1. 실제 상품 상세페이지인지 확인한다.",
      "2. 작품 고유 색·서체·레이아웃을 제외하고 반복 원리만 관찰한다.",
      "3. 세 사례 이상에서 반복된 원리를 `reviewed.md`의 LEARN 블록으로 기록한다.",
      "4. 다른 상품 또는 회귀 테스트로 검증한 뒤에만 reference로 승격한다.",
      "5. commercial.md 승격 또는 기각 뒤 이 파일·reviewed.md·녹화 원문을 삭제한다.",
      "",
    ].join("\n"),
    reviewed: [
      "# Behance 검토 학습",
      "",
      "Inbox 후보를 실제로 열어 관찰한 뒤 아래 블록을 복사해 작성한다.",
      "",
      "### LEARN-BH-YYYYMMDD-001",
      "",
      "- `category`: commercial",
      "- `scope`: candidate-shared",
      "- `source_type`: behance",
      "- `source_urls`:",
      "- `observation`:",
      "- `evidence_paths`: inbox.md",
      "- `before_after`:",
      "- `risk_if_reused`:",
      "- `next_validation`:",
      "- `owner_reference`: commercial.md",
      `- \`updated_at\`: ${time.date}`,
      "- `promotion_status`: local",
      "",
    ].join("\n"),
    promotion: "references/commercial.md",
  };
}

function renderHyperframes(payload, limit, time) {
  const rows = (payload.sources || []).slice(0, limit).map((source) => {
    const sourcePath = escapeCell(source.path, "경로 수동 확인");
    return `| [${sourcePath}](${source.url}) | 검토 대기 |`;
  });
  return {
    count: rows.length,
    inbox: [
      "# HyperFrames GIF 학습 후보 Inbox",
      "",
      `갱신 시각: ${time.timestamp}`,
      `Browser Harness 녹화 ID: \`${path.basename(payload.recording_path || "")}\``,
      `Browser Harness 원문 녹화: \`${payload.recording_path || ""}\``,
      "공식 저장소: `heygen-com/hyperframes`",
      "",
      "이 파일은 공식 패턴 후보만 저장한다. 수집만으로 motion.md를 수정하지 않는다.",
      "",
      "| 후보 | 상태 |",
      "| --- | --- |",
      ...rows,
      "",
      "## 다음 단계",
      "",
      "1. 주장과 직접 연결할 수 있는 마스크·경로·슬라이드·단계 패턴만 고른다.",
      "2. 예제의 카피·색·좌표는 복사하지 않고 구현 원리만 reviewed.md에 기록한다.",
      "3. 실제 제품 GIF 1개 이상에서 strict·frame-check·첫/중간/끝 프레임을 검증한다.",
      "4. motion.md의 MR 규칙으로 승격하거나 기각한다.",
      "5. 승격 또는 기각 뒤 이 파일·reviewed.md·후보 보고서·녹화 원문을 삭제한다.",
      "",
    ].join("\n"),
    reviewed: [
      "# HyperFrames GIF 검토 학습",
      "",
      "공식 예제를 확인하고 현재 제품 GIF에서 검증한 뒤 아래 블록을 작성한다.",
      "",
      "### LEARN-GIF-YYYYMMDD-001",
      "",
      "- `category`: motion",
      "- `scope`: candidate-shared",
      "- `source_type`: hyperframes",
      "- `source_urls`:",
      "- `observation`:",
      "- `evidence_paths`: inbox.md",
      "- `before_after`:",
      "- `risk_if_reused`:",
      "- `next_validation`:",
      "- `owner_reference`: motion.md",
      `- \`updated_at\`: ${time.date}`,
      "- `promotion_status`: local",
      "",
    ].join("\n"),
    promotion: "references/motion.md",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!String(options.project || "").trim()) {
    throw new Error("--project <프로젝트 폴더>가 필요합니다.");
  }
  const projectRoot = path.resolve(options.project);
  const track = options.kind === "behance" ? "behance" : "gif";
  // 산출물 폴더 규약: 조사 산출물도 프로젝트 안에만 쌓는다.
  const learningRoot = path.join(
    projectRoot,
    ".detail-page",
    "learning",
    track,
  );
  const inboxPath = path.join(learningRoot, "inbox.md");
  const reviewedPath = path.join(learningRoot, "reviewed.md");
  const errorPath = path.join(learningRoot, "last-error.md");
  await mkdir(learningRoot, { recursive: true });

  try {
    const output = await runBrowserHarness(BROWSER_SCRIPTS[options.kind]);
    const payload = parsePayload(output, MARKERS[options.kind]);
    const time = kstParts();
    const rendered =
      options.kind === "behance"
        ? renderBehance(payload, options.max, time)
        : renderHyperframes(payload, options.max, time);
    await writeFile(inboxPath, rendered.inbox, "utf8");
    try {
      await writeFile(reviewedPath, rendered.reviewed, {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    await rm(errorPath, { force: true });
    console.log(`updated=${inboxPath}`);
    console.log(`review=${reviewedPath}`);
    console.log(`promotion=${rendered.promotion}`);
    console.log(`candidates=${rendered.count}`);
  } catch (error) {
    const time = kstParts();
    const owner =
      options.kind === "behance"
        ? "활성 reference와 승격 원장"
        : "motion.md와 승격 원장";
    const title =
      options.kind === "behance"
        ? "Behance 학습 후보 수집 실패"
        : "HyperFrames GIF 학습 후보 수집 실패";
    await writeFile(
      errorPath,
      [
        `# ${title}`,
        "",
        `실패 시각: ${time.timestamp}`,
        "",
        "```text",
        error.message,
        "```",
        "",
        `${owner}은 변경되지 않았다.`,
        "",
      ].join("\n"),
      "utf8",
    );
    throw error;
  }
}

await main();
