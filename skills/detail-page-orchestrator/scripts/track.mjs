#!/usr/bin/env node
// 트래커. 어디까지 왔는지 전체 맵에서 보여준다 — docs/adr/0006
//
// 두 가지를 지킨다.
//   1. 상태를 만들지 않는다. gates.json 을 읽기만 한다. 쓰면 상태가 두 곳에 생겨 갈린다.
//   2. 막지 않는다. 예산 초과를 표시하되 게이트가 아니다. 막으면 "시간 때문에 검사를
//      건너뛴다" 가 정당화된다.

import http from "node:http";
import { watch } from "node:fs";
import path from "node:path";

import { runCheck } from "./lib/check.mjs";
import { readEnvLock } from "./lib/env.mjs";
import { PASSED, evaluate, loadState, statePath } from "./lib/gates-state.mjs";
import { budgetTotalMin, gate, layers } from "./lib/gates.mjs";
import { resolveProject, resolveWorkspace } from "./lib/project.mjs";

const BASE_PORT = Number(process.env.DETAIL_PAGE_TRACK_PORT ?? 9310);

const workspace = resolveWorkspace();
const project = resolveProject(workspace);

async function snapshot() {
  const lock = await readEnvLock(workspace);
  const state = await loadState(project);
  const rows = await evaluate(state, { workspace, project });

  return {
    project: state.project,
    target: lock?.policy?.wallclock_target_min ?? 95,
    budget: budgetTotalMin(),
    spent: rows.reduce((sum, row) => sum + (row.elapsedMin ?? 0), 0),
    passed: rows.filter((row) => row.status === PASSED).length,
    total: rows.length,
    layers: layers(),
    gates: rows.map((row) => ({
      id: row.gate.id,
      title: row.gate.title,
      summary: row.gate.summary,
      actor: row.gate.actor,
      skill: row.gate.skill,
      deps: row.gate.deps.filter((dep) => dep !== "INIT"),
      budget: row.gate.budgetMin,
      status: row.status,
      reason: row.reason,
      blockedBy: row.blockedBy,
      elapsed: row.elapsedMin,
      over: row.elapsedMin !== null && row.gate.budgetMin ? row.elapsedMin > row.gate.budgetMin : false,
      rejected: row.entry?.rejected?.reasons ?? null,
    })),
  };
}

const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>detail-page tracker</title>
<style>
:root{--bg:#fdfdfd;--fg:#0f2642;--dim:#7b8794;--line:#dde3ec;--brand:#3189fd;
      --ok:#0b52b3;--warn:#c98a00;--bad:#c0392b;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0d1520;--fg:#e8eef6;--dim:#8b98a8;
      --line:#22303f;--card:#131e2b}}
*{box-sizing:border-box}
body{margin:0;padding:22px;background:var(--bg);color:var(--fg);
     font:14px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif}
header{display:flex;gap:18px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px}
h1{font-size:17px;margin:0;font-weight:650}
.meta{color:var(--dim);font-variant-numeric:tabular-nums}
.meta b{color:var(--fg);font-weight:600}
.wrap{position:relative;overflow-x:auto;padding:26px 2px 8px}
#map{position:relative;display:flex;gap:46px;min-width:max-content}
.col{display:flex;flex-direction:column;gap:14px;justify-content:center}
.node{position:relative;z-index:1;width:186px;padding:11px 13px;border-radius:13px;
      border:1.5px solid var(--line);background:var(--card);cursor:pointer;
      transition:border-color .15s,box-shadow .15s}
.node:hover{border-color:var(--brand)}
.node .id{font-weight:700;font-size:12px;letter-spacing:.04em}
.node .t{font-size:13px;margin-top:1px}
.node .s{font-size:11px;color:var(--dim);margin-top:4px;font-variant-numeric:tabular-nums}
.node[data-s=PENDING]{opacity:.62;border-style:dashed}
.node[data-s=PASSED]{border-color:var(--ok)}
.node[data-s=PASSED] .id{color:var(--ok)}
.node[data-s=STALE]{border-color:var(--warn);background:color-mix(in srgb,var(--warn) 7%,var(--card))}
.node[data-s=REJECTED]{border-color:var(--bad)}
.node[data-s=RUNNING]{border-color:var(--brand);animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--brand) 55%,transparent)}
                 50%{box-shadow:0 0 0 9px color-mix(in srgb,var(--brand) 0%,transparent)}}
.node .over{color:var(--warn);font-weight:600}
svg#edges{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
#panel{margin-top:18px;padding:14px 16px;border:1.5px solid var(--line);border-radius:13px;
       background:var(--card);min-height:74px}
#panel h2{margin:0 0 3px;font-size:14px}
#panel .sum{color:var(--dim);font-size:12.5px}
#panel ul{margin:9px 0 0;padding-left:19px}
#panel li{font-size:12.5px;margin:2px 0}
#panel code{background:color-mix(in srgb,var(--fg) 8%,transparent);padding:1px 5px;border-radius:5px}
.hint{color:var(--dim);font-size:12px;margin-top:9px}
</style>
<header>
  <h1 id="name">…</h1>
  <div class="meta">경과 <b id="spent">–</b> / 목표 <b id="target">–</b>
    · 예산 합계 <b id="budget">–</b> · <b id="count">–</b></div>
</header>
<div class="wrap"><div id="map"></div><svg id="edges"></svg></div>
<div id="panel"><div class="sum">노드를 클릭하면 그 게이트의 부족한 것을 보여준다.</div></div>
<p class="hint">예산 초과는 표시만 한다. 막지 않는다 — 막으면 시간 때문에 검사를 건너뛰게 된다.</p>
<script>
const SYM={PENDING:"✗",RUNNING:"⟨⟨ ⟩⟩",PASSED:"○",STALE:"⚠",REJECTED:"⛔"};
const map=document.getElementById("map"),edges=document.getElementById("edges");
let current=null;

function minutes(v){return v===null||v===undefined?"–":v.toFixed(0)+"분"}

function render(data){
  document.getElementById("name").textContent=data.project;
  document.getElementById("spent").textContent=minutes(data.spent);
  document.getElementById("target").textContent=data.target+"분";
  document.getElementById("budget").textContent=data.budget+"분";
  document.getElementById("count").textContent=data.passed+"/"+data.total;

  const by=Object.fromEntries(data.gates.map(g=>[g.id,g]));
  map.textContent="";
  for(const layer of data.layers){
    const col=document.createElement("div");col.className="col";
    for(const id of layer){
      const g=by[id];if(!g)continue;
      const el=document.createElement("div");
      el.className="node";el.dataset.s=g.status;el.id="n-"+id;
      el.innerHTML='<div class="id">'+SYM[g.status]+" "+g.id+'</div>'+
        '<div class="t">'+g.title+'</div>'+
        '<div class="s">'+(g.budget?g.budget+"분":"—")+
        (g.elapsed!==null?' · '+(g.over?'<span class="over">':'<span>')+minutes(g.elapsed)+
          (g.over?" 초과":"")+'</span>':'')+'</div>';
      el.onclick=()=>select(g);
      col.appendChild(el);
    }
    map.appendChild(col);
  }
  drawEdges(data,by);
  if(current&&by[current])select(by[current],true);
}

function drawEdges(data,by){
  const box=map.getBoundingClientRect();
  edges.setAttribute("viewBox","0 0 "+map.scrollWidth+" "+map.offsetHeight);
  edges.style.width=map.scrollWidth+"px";edges.style.height=map.offsetHeight+"px";
  let paths="";
  for(const g of data.gates){
    const to=document.getElementById("n-"+g.id);if(!to)continue;
    for(const dep of g.deps){
      const from=document.getElementById("n-"+dep);if(!from)continue;
      const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
      const x1=a.right-box.left,y1=a.top-box.top+a.height/2;
      const x2=b.left-box.left,y2=b.top-box.top+b.height/2;
      const mid=(x1+x2)/2;
      const bad=by[dep]&&by[dep].status!=="PASSED";
      paths+='<path d="M'+x1+' '+y1+'C'+mid+' '+y1+' '+mid+' '+y2+' '+x2+' '+y2+
        '" fill="none" stroke="'+(bad?"var(--warn)":"var(--line)")+
        '" stroke-width="'+(bad?2:1.5)+'"/>';
    }
  }
  edges.innerHTML=paths;
}

async function select(g,keep){
  current=g.id;
  const panel=document.getElementById("panel");
  const actor={agent:"에이전트",script:"스크립트",mixed:"혼합"}[g.actor];
  let html="<h2>"+SYM[g.status]+" "+g.id+" "+g.title+"</h2>"+
    '<div class="sum">'+g.summary+" · 주체 "+actor+
    (g.skill?' · <code>'+g.skill+"</code>":"")+"</div>";
  if(g.reason)html+="<ul><li>"+g.reason+"</li></ul>";
  if(g.blockedBy&&g.blockedBy.length)html+="<ul><li>선행 미통과: "+g.blockedBy.join(", ")+"</li></ul>";
  if(g.rejected)html+="<ul>"+g.rejected.map(r=>"<li>"+r+"</li>").join("")+"</ul>";
  panel.innerHTML=html+'<div class="sum" style="margin-top:8px">검사 중…</div>';
  if(g.status==="PASSED"){panel.querySelector(".sum:last-child").textContent="통과했다.";return}
  const res=await fetch("/check/"+g.id).then(r=>r.json()).catch(()=>null);
  const tail=panel.querySelector(".sum:last-child");
  if(!res){tail.textContent="검사를 돌릴 수 없다.";return}
  if(res.ok){tail.textContent="검사 통과. gate "+g.id+" --pass 로 기록한다.";return}
  tail.outerHTML="<div class=\\"sum\\" style=\\"margin-top:8px\\">남은 검사 "+res.reasons.length+
    "건</div><ul>"+res.reasons.map(r=>"<li>"+r+"</li>").join("")+"</ul>";
}

const load=()=>fetch("/state").then(r=>r.json()).then(render);
load();
new EventSource("/events").onmessage=load;
addEventListener("resize",load);
</script>
`;

function json(response, body, status = 200) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(text);
}

const clients = new Set();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");

  if (url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(PAGE);
    return;
  }

  if (url.pathname === "/state") {
    try {
      json(response, await snapshot());
    } catch (error) {
      json(response, { error: error.message }, 500);
    }
    return;
  }

  if (url.pathname.startsWith("/check/")) {
    const id = url.pathname.slice("/check/".length);
    try {
      gate(id);
      json(response, await runCheck(id, { workspace, project }));
    } catch (error) {
      json(response, { ok: false, reasons: [error.message] }, 200);
    }
    return;
  }

  if (url.pathname === "/events") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write(": connected\n\n");
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  response.writeHead(404).end();
});

function notify() {
  for (const client of clients) client.write("data: change\n\n");
}

// 폴링하지 않는다. 파일이 바뀔 때만 밀어 준다.
let timer = null;
for (const target of [statePath(project), path.join(workspace, "work", "env.lock.json")]) {
  try {
    watch(target, () => {
      clearTimeout(timer);
      timer = setTimeout(notify, 120);
    });
  } catch {
    // 아직 없는 파일은 감시하지 않는다
  }
}

function listen(port, attempt = 0) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attempt < 20) {
      listen(port + 1, attempt + 1);
      return;
    }
    throw error;
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `트래커  http://127.0.0.1:${port}\n프로젝트  ${path.relative(workspace, project)}\nCtrl+C 로 끈다. 이 서버는 gates.json 을 쓰지 않는다.\n`,
    );
  });
}

listen(BASE_PORT);
