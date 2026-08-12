// 섹션을 780px 완성형 이미지로 평탄화하기 위한 캡처 단계.
// 애니메이션 img 는 #FF00FF 로 칠해 마스크를 만들고, 합성은 Pillow 가 맡는다.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE = process.argv[2];
const OUT = process.argv[3];
const PORT = 9347;   // 다른 프로젝트의 잔여 인스턴스와 겹치지 않게 전용 포트
const DPR = 1;              // 디자인 자연 폭이 780 CSS px 이므로 1배로 캡처한다
const VIEWPORT = 780;
const FILLS = ['#FF00FF', '#00FF00'];   // 두 배경색 매팅으로 안티앨리어싱까지 정확히 분리한다

mkdirSync(OUT, { recursive: true });

// 사용자의 Chrome 이 이미 떠 있으면 새 프로세스가 기존 인스턴스에 붙어버려
// 디버그 포트가 열리지 않는다. 전용 프로필로 독립 인스턴스를 띄운다.
// 경로가 길면 AF_UNIX 소켓 생성이 실패하므로 짧은 경로를 쓴다.
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars',
  '--user-data-dir=/tmp/wingcap', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check', '--allow-file-access-from-files',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 남아 있는 다른 탭(다른 프로젝트의 헤드리스 Chrome 등)에 붙으면 엉뚱한 문서를
// 캡처하게 된다. 목록에서 고르지 말고 우리 탭을 새로 만들어 그 탭에만 붙는다.
async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
      const t = await r.json();
      if (t?.webSocketDebuggerUrl) return t.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome DevTools 연결 실패');
}

const ws = new WebSocket(await findTarget());
await new Promise(r => ws.addEventListener('open', r, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id; pending.set(n, { res, rej });
  ws.send(JSON.stringify({ id: n, method, params }));
});

const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

const step=(m)=>process.stderr.write(m+'\n');
step('CDP 연결됨');
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', {
  width: VIEWPORT, height: 1200, deviceScaleFactor: DPR, mobile: false,
});

step('페이지 이동');
await cdp('Page.navigate', { url: 'file://' + resolve(PAGE) });
await sleep(2500);
// 모든 이미지 디코드 완료까지 대기
await evalJs(`Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,8000))]).then(()=>1)`);
await sleep(800);

// 배경·그림자만 정리한다. 폭은 디자인 자연값(780px)을 그대로 쓴다.
await evalJs(`
  document.documentElement.style.background='#fff';
  document.body.style.margin='0';
  document.querySelector(".page").style.boxShadow='none';
  for (const d of document.querySelectorAll('details')) d.open=true;
  1
`);
await sleep(500);

step('섹션 수집');
const sections = await evalJs(`
  (() => Array.from(document.querySelectorAll('.page > section')).map((s, i) => {
    const anim = Array.from(s.querySelectorAll('img'))
      .filter(im => /\\.webp$/i.test(im.getAttribute('src') || ''))
      .map(im => ({ src: im.getAttribute('src') }));
    return { index: i, id: s.dataset.section || ('section-' + i), imgs: anim };
  }))()
`);

// 애니메이션 파일 목록을 밖에서 받아 어떤 img 가 움직이는지 판별
const ANIMATED = new Set(JSON.parse(process.env.ANIMATED_JSON || '[]'));

const manifest = [];
for (const sec of sections) {
  const animSrcs = sec.imgs.map(x => x.src).filter(s => ANIMATED.has(s.split('/').pop()));

  // 대상 섹션만 보이게 하고 높이를 잰다
  const geo = await evalJs(`
    (() => {
      const list = Array.from(document.querySelectorAll('.page > section'));
      list.forEach((s, i) => { s.style.display = (i === ${sec.index}) ? '' : 'none'; });
      const s = list[${sec.index}];
      window.scrollTo(0, 0);
      const r = s.getBoundingClientRect();
      const boxes = ${JSON.stringify(animSrcs)}.map(src => {
        const im = s.querySelector('img[src="' + src + '"]');
        const b = im.getBoundingClientRect();
        const cs = getComputedStyle(im);
        return { src, x: b.x - r.x, y: b.y - r.y, w: b.width, h: b.height,
                 fit: cs.objectFit, radius: cs.borderRadius };
      });
      return { w: Math.round(r.width), h: Math.round(r.height), boxes };
    })()
  `);

  const paint = (fill) => evalJs(`
    (() => {
      const s = document.querySelectorAll('.page > section')[${sec.index}];
      for (const src of ${JSON.stringify(animSrcs)}) {
        const im = s.querySelector('img[src="' + src + '"]') || s.querySelector('img[data-orig="' + src + '"]');
        im.dataset.orig = src;
        // 원본과 같은 intrinsic 크기여야 레이아웃·object-fit·radius 가 그대로 유지된다
        const c = document.createElement('canvas');
        c.width = im.naturalWidth || 780; c.height = im.naturalHeight || 780;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '${fill}';
        ctx.fillRect(0, 0, c.width, c.height);
        im.src = c.toDataURL();
      }
      return 1;
    })()
  `);

  await cdp('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT, height: Math.ceil(geo.h), deviceScaleFactor: DPR, mobile: false,
  });
  await sleep(200);

  const name = String(sec.index + 1).padStart(2, '0') + '-' + sec.id;
  const grab = async () => {
    const s = await cdp('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: geo.w, height: geo.h, scale: 1 },
    });
    return Buffer.from(s.data, 'base64');
  };

  if (!animSrcs.length) {
    writeFileSync(`${OUT}/${name}.png`, await grab());
  } else {
    for (let k = 0; k < FILLS.length; k++) {
      await paint(FILLS[k]);
      await sleep(200);
      writeFileSync(`${OUT}/${name}-m${k + 1}.png`, await grab());
    }
  }

  manifest.push({ name, id: sec.id, cssW: geo.w, cssH: geo.h, dpr: DPR, boxes: geo.boxes });
  process.stdout.write(`${name}  ${geo.w}x${Math.round(geo.h)}css  anim=${animSrcs.length}\n`);

  // 다음 섹션을 위해 원본 상태로 되돌린다
  await cdp('Page.navigate', { url: 'file://' + resolve(PAGE) });
  await sleep(1200);
  await evalJs(`Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(r=>setTimeout(r,8000))]).then(()=>1)`);
  await evalJs(`
    document.body.style.margin='0';
    document.querySelector(".page").style.boxShadow='none';
    for (const d of document.querySelectorAll('details')) d.open=true; 1
  `);
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`\n섹션 ${manifest.length}개 캡처 완료`);
ws.close();
chrome.kill();
process.exit(0);
