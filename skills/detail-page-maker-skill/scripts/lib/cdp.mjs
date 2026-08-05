// 로컬 Chrome 의 CDP endpoint 를 찾는다.
// G1.5 Design Reference 단계가 ChatGPT 를 브라우저로 조작하므로 이 endpoint 가 필요하다.
// 어느 포트가 열려 있는지는 호스트마다 달라서 순서대로 두드려 보고 첫 응답을 채택한다.

const DEFAULT_ENDPOINTS = ["http://127.0.0.1:9222", "http://127.0.0.1:9223"];
const DEFAULT_TIMEOUT_MS = 1500;

export async function probeCdp({
  endpoints,
  environment = {},
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const list = [];
  if (environment.BU_CDP_URL) list.push(String(environment.BU_CDP_URL).replace(/\/+$/, ""));
  for (const e of endpoints || DEFAULT_ENDPOINTS) {
    const clean = String(e).replace(/\/+$/, "");
    if (!list.includes(clean)) list.push(clean);
  }

  const tried = [];
  for (const base of list) {
    tried.push(base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${base}/json/version`, { signal: controller.signal });
      if (!response?.ok) continue;
      const payload = await response.json();
      return {
        ok: true,
        endpoint: base,
        browser: payload.Browser || null,
        tried,
        hint: null,
      };
    } catch {
      // 다음 endpoint 로 넘어간다
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    endpoint: null,
    browser: null,
    tried,
    hint:
      `CDP endpoint 에 닿지 못했습니다 (${tried.join(", ")}). ` +
      "Chrome 을 원격 디버깅이 켜진 상태로 띄우고, 다른 포트를 쓰면 BU_CDP_URL 로 알려 주세요.",
  };
}
