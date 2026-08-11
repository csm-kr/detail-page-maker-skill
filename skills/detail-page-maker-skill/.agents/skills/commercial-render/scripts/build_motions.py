#!/usr/bin/env python3
"""Spec-driven HyperFrames commercial motion generator.

Reads a motions spec (JSON) and emits one HyperFrames project per slot whose
engine is "hyperframes". Slots routed to make-consistent-gif are skipped here
and reported so the caller runs that skill instead.

    python3 build_motions.py --spec motions.json --out ./projects
    python3 build_motions.py --schema
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import sys

SCHEMA = {
    "canvas": {"width": 780, "height": 780},
    "theme": {"scrim": "6,14,4", "accent": "#ffe14d", "lime": "#c8ff5a"},
    "motions": [{
        "id": "m01-example",
        "verb": "짚기",
        "engine": "hyperframes | make-consistent-gif",
        "template": "T3",
        "duration": 3.6,
        "eyebrow": "작은 라벨",
        "headline": ["첫 줄", "<em>강조 줄</em>"],
        "alt": "고객이 이해할 장면 설명",
        "assets": {"bg": "/abs/or/relative/path.png"},
        "overlay": {"kind": "swarm", "…": "kind별 파라미터는 references/composition.md"},
        "gif": {"fps": 12},
        "diversity": {"camera": "static", "change": "…", "transition": "hold", "graphic": "…"},
        "customer_question": "…",
        "visible_delta": "…",
        "evidence": "…",
    }],
}

FONT_FACE = (
    '@font-face { font-family:"CRKR"; font-weight:100 900;\n'
    '  src: local("Pretendard"), local("Apple SD Gothic Neo"),'
    ' local("AppleSDGothicNeo-Regular"),\n'
    '       local("Noto Sans KR"), local("Malgun Gothic"); }\n'
)

BASE_CSS = """
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:__W__px; height:__H__px; overflow:hidden; background:#000;
  font-family:"CRKR", sans-serif; -webkit-font-smoothing:antialiased; }
#root { position:relative; width:__W__px; height:__H__px; overflow:hidden; }
.stage { position:absolute; inset:0; overflow:hidden; background:#0b1207; }
.bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
.scrim-top { position:absolute; left:0; top:0; width:100%; height:330px;
  background:linear-gradient(180deg, rgba(__SCRIM__,.94) 0%, rgba(__SCRIM__,.78) 40%,
    rgba(__SCRIM__,.42) 70%, rgba(__SCRIM__,0) 100%); }
.scrim-bot { position:absolute; left:0; bottom:0; width:100%; height:220px;
  background:linear-gradient(0deg, rgba(__SCRIM__,.80) 0%, rgba(__SCRIM__,0) 100%); }
.head { position:absolute; left:0; top:34px; width:100%; padding:0 44px; text-align:center; }
.eyebrow { display:block; width:100%; font-size:25px; font-weight:800; letter-spacing:.02em;
  color:__ACCENT__; text-shadow:0 2px 10px rgba(0,0,0,.65); margin-bottom:12px; }
.hl { display:block; width:100%; font-size:54px; line-height:1.14; font-weight:900; color:#fff;
  text-shadow:0 4px 20px rgba(0,0,0,.78), 0 1px 2px rgba(0,0,0,.9); letter-spacing:-.02em; }
.hl em { font-style:normal; color:__ACCENT__; }
.dot { position:absolute; width:13px; height:13px; border-radius:50%;
  background:#1c1a12; box-shadow:0 0 0 2px rgba(0,0,0,.28); opacity:0; }
"""


# --------------------------------------------------------------- overlay kinds
def _dots(points, prefix="d", cls="dot", extra=""):
    return "\n".join(
        '    <div class="%s" id="%s%d" style="left:%dpx; top:%dpx;%s"></div>'
        % (cls, prefix, i, p[0], p[1], extra) for i, p in enumerate(points))


def ov_alert_ring(o, dur):
    x, y, s = o.get("x", 250), o.get("y", 250), o.get("size", 300)
    col = o.get("color", "rgba(255,86,86,.95)")
    css = (".ring { position:absolute; left:%dpx; top:%dpx; width:%dpx; height:%dpx;"
           " border-radius:50%%; border:5px solid %s;"
           " box-shadow:0 0 30px rgba(255,60,60,.55); opacity:0; }\n" % (x, y, s, s, col))
    body = '    <div class="ring" id="ring"></div>'
    js = ('tl.to("#ring", { opacity: 1, scale: 1.06, duration: .5, ease: "power2.out" }, .15);\n'
          'tl.to("#ring", { opacity: 0, scale: 1, duration: .45, ease: "power1.in" }, %.2f);\n'
          % (dur - 0.6))
    return css, body, js


def ov_dashed_zone(o, dur):
    x, y, w, h = o.get("x", 240), o.get("y", 560), o.get("w", 300), o.get("h", 150)
    col = o.get("color", "rgba(140,255,120,.9)")
    css = (".zone { position:absolute; left:%dpx; top:%dpx; width:%dpx; height:%dpx;"
           " border-radius:50%%; border:4px dashed %s; opacity:0; }\n" % (x, y, w, h, col))
    body = '    <div class="zone" id="zone"></div>'
    js = ('tl.to("#zone", { opacity: 1, scale: 1.05, duration: .45, ease: "power2.out" }, .2);\n'
          'tl.to("#zone", { scale: 1, duration: .7, yoyo: true, repeat: 1, ease: "sine.inOut" }, .9);\n'
          'tl.to("#zone", { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n' % (dur - 0.5))
    return css, body, js


def ov_swarm(o, dur):
    pts = o.get("points", [])
    mode = o.get("mode", "grow")
    seed = int(o.get("seed_visible", 0))
    css, body, js = "", "", ""
    for sub in ("ring", "zone"):
        if sub in o:
            f = ov_alert_ring if sub == "ring" else ov_dashed_zone
            c, b, j = f(o[sub], dur)
            css, body, js = css + c, body + b + "\n", js + j
    body += _dots(pts)
    if seed:
        js += 'tl.set([%s], { opacity: 1 }, 0);\n' % ", ".join(
            '"#d%d"' % i for i in range(min(seed, len(pts))))
    for i in range(len(pts)):
        t = 0.35 + i * 0.12
        js += 'tl.to("#d%d", { opacity: 1, duration: .22, ease: "power1.out" }, %.2f);\n' % (i, t)
        if mode == "rise":
            js += ('tl.to("#d%d", { y: %d, x: %d, duration: 2.0, ease: "sine.out" }, %.2f);\n'
                   % (i, -190 - i * 12, (i % 3 - 1) * 26, t))
            js += 'tl.to("#d%d", { opacity: 0, duration: .5, ease: "power1.in" }, %.2f);\n' % (
                i, min(dur - 0.4, t + 1.9))
        else:
            js += ('tl.to("#d%d", { y: %d, x: %d, duration: .8, yoyo: true, repeat: 1,'
                   ' ease: "sine.inOut" }, %.2f);\n' % (i, 7 if i % 2 else -7, (i % 3 - 1) * 6, t + .25))
    if mode != "rise":
        js += 'tl.to(".dot", { opacity: 0, duration: .45, ease: "power1.in" }, %.2f);\n' % (dur - 0.6)
    return css, body, js


def ov_load_arrow(o, dur):
    x, y, ln = o.get("x", 390), o.get("y", 430), o.get("len", 150)
    css = (".pull { position:absolute; left:%dpx; top:%dpx; width:6px; height:%dpx;"
           " background:linear-gradient(180deg, rgba(255,255,255,.95), rgba(255,255,255,.1));"
           " border-radius:6px; opacity:0; transform-origin:50%% 0%%; }\n"
           ".ahead { position:absolute; left:%dpx; top:%dpx; width:34px; height:34px;"
           " border-right:7px solid #fff; border-bottom:7px solid #fff; border-radius:4px;"
           " transform:rotate(45deg); opacity:0; }\n" % (x - 3, y, ln, x - 17, y + ln - 12))
    body = '    <div class="pull" id="pull"></div>\n    <div class="ahead" id="ahead"></div>'
    js = ('tl.to(["#pull", "#ahead"], { opacity: 1, duration: .3 }, .4);\n'
          'tl.to("#pull", { scaleY: 1.28, duration: .55, yoyo: true, repeat: 3, ease: "sine.inOut" }, .8);\n'
          'tl.to("#ahead", { y: 26, duration: .55, yoyo: true, repeat: 3, ease: "sine.inOut" }, .8);\n'
          'tl.to(["#pull", "#ahead"], { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n'
          % (dur - 0.5))
    return css, body, js


def ov_converge(o, dur):
    paths = o.get("paths", [])
    g = o.get("glow")
    css = (".fly { position:absolute; width:15px; height:15px; border-radius:50%;"
           " background:#181509; box-shadow:0 0 0 3px rgba(255,255,255,.30); opacity:0; }\n")
    body, js = "", ""
    if g:
        css += (".glow { position:absolute; left:%dpx; top:%dpx; width:%dpx; height:%dpx;"
                " border-radius:16px; box-shadow:0 0 0 4px rgba(255,225,77,.85),"
                " 0 0 60px rgba(255,225,77,.6); opacity:0; }\n"
                % (g["x"], g["y"], g["w"], g["h"]))
        body += '    <div class="glow" id="glow"></div>\n'
        js += 'tl.to("#glow", { opacity: 1, duration: .5, ease: "power2.out" }, .1);\n'
    for i, p in enumerate(paths):
        sx, sy = p["from"]
        tx, ty = p["to"]
        body += ('    <div class="fly" id="f%d" style="left:%dpx; top:%dpx"></div>\n'
                 % (i, sx, sy))
        t = 0.35 + i * 0.16
        js += ('tl.to("#f%d", { opacity: 1, duration: .25 }, %.2f);\n'
               'tl.to("#f%d", { x: %d, y: %d, duration: 1.5, ease: "power2.in" }, %.2f);\n'
               'tl.to("#f%d", { scale: .78, duration: .2, ease: "power1.out" }, %.2f);\n'
               % (i, t, i, tx - sx, ty - sy, t, i, t + 1.5))
    js += 'tl.to(".fly", { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n' % (dur - 0.55)
    if g:
        js += 'tl.to("#glow", { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n' % (dur - 0.5)
    return css, body, js


def ov_split_state(o, dur):
    lt = o.get("leftTint", "rgba(120,10,10,.42)")
    rt = o.get("rightTint", "rgba(40,140,30,.20)")
    css = (".half { position:absolute; top:0; width:50%%; height:100%%; opacity:0; }\n"
           ".half.l { left:0; background:%s; }\n"
           ".half.r { right:0; background:%s; }\n"
           ".mark { position:absolute; top:250px; width:132px; height:132px; opacity:0; }\n"
           ".mark.x { left:63px; } .mark.v { right:63px; }\n"
           ".bar { position:absolute; left:50%%; top:50%%; width:120px; height:15px;"
           " border-radius:8px; margin:-7px 0 0 -60px; display:block; }\n"
           ".x .bar:first-child { background:#ff5a5a; transform:rotate(45deg); }\n"
           ".x .bar:last-child  { background:#ff5a5a; transform:rotate(-45deg); }\n"
           ".v .bar:first-child { background:#8dff4d; width:60px; margin-left:-42px;"
           " margin-top:10px; transform:rotate(45deg); }\n"
           ".v .bar:last-child  { background:#8dff4d; width:112px; margin-left:-14px;"
           " transform:rotate(-45deg); }\n" % (lt, rt))
    body = ('    <div class="half l" id="hl"></div>\n    <div class="half r" id="hr"></div>\n'
            '    <div class="mark x" id="mx"><span class="bar"></span><span class="bar"></span></div>\n'
            '    <div class="mark v" id="mv"><span class="bar"></span><span class="bar"></span></div>')
    js = ('tl.to("#hl", { opacity: 1, duration: .5, ease: "power2.out" }, .25);\n'
          'tl.fromTo("#mx", { scale: .55 }, { scale: 1, opacity: 1, duration: .45,'
          ' ease: "back.out(2)" }, .45);\n'
          'tl.to("#hr", { opacity: 1, duration: .5, ease: "power2.out" }, 1.15);\n'
          'tl.fromTo("#mv", { scale: .55 }, { scale: 1, opacity: 1, duration: .5,'
          ' ease: "back.out(2)" }, 1.3);\n'
          'tl.to("#mv", { scale: 1.09, duration: .5, yoyo: true, repeat: 1, ease: "sine.inOut" }, 1.9);\n'
          'tl.to(["#hl", "#hr", "#mx", "#mv"], { opacity: 0, duration: .45,'
          ' ease: "power1.in" }, %.2f);\n' % (dur - 0.55))
    return css, body, js


def ov_runoff(o, dur):
    drops = o.get("streaks", [])
    sh = o.get("shield")
    css = (".streak { position:absolute; width:11px; height:118px; border-radius:9px;"
           " background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(210,240,255,.92));"
           " opacity:0; }\n"
           ".bead { position:absolute; width:26px; height:26px; border-radius:50%;"
           " background:radial-gradient(circle at 34% 30%, rgba(255,255,255,.95),"
           " rgba(190,225,255,.55)); box-shadow:0 0 12px rgba(255,255,255,.5); opacity:0; }\n")
    body, js = "", ""
    if sh:
        css += (".shield { position:absolute; left:%dpx; top:%dpx; width:%dpx; height:%dpx;"
                " border-radius:16px; border:4px solid rgba(150,225,255,.9);"
                " box-shadow:0 0 34px rgba(120,200,255,.5); opacity:0; }\n"
                % (sh["x"], sh["y"], sh["w"], sh["h"]))
        body += '    <div class="shield" id="shield"></div>\n'
        js += 'tl.to("#shield", { opacity: 1, duration: .45, ease: "power2.out" }, .15);\n'
    for i, (x, y) in enumerate(drops):
        body += '    <div class="streak" id="s%d" style="left:%dpx; top:%dpx"></div>\n' % (i, x, y)
        body += '    <div class="bead" id="b%d" style="left:%dpx; top:%dpx"></div>\n' % (
            i, x - 8, y + 250)
        t = 0.3 + i * 0.12
        js += ('tl.to("#s%d", { opacity: 1, duration: .18 }, %.2f);\n'
               'tl.to("#s%d", { y: 240, duration: 1.25, ease: "power1.in" }, %.2f);\n'
               'tl.to("#s%d", { opacity: 0, duration: .3 }, %.2f);\n'
               'tl.fromTo("#b%d", { scale: .3 }, { scale: 1, opacity: 1, duration: .4,'
               ' ease: "back.out(2)" }, %.2f);\n'
               % (i, t, i, t, i, t + 1.05, i, t + 1.2))
    js += 'tl.to(".bead", { opacity: 0, duration: .45, ease: "power1.in" }, %.2f);\n' % (dur - 0.55)
    if sh:
        js += 'tl.to("#shield", { opacity: 0, duration: .45, ease: "power1.in" }, %.2f);\n' % (dur - 0.55)
    return css, body, js


def ov_step_cuts(o, dur, assets):
    steps = o.get("steps", [])
    n = max(1, len(steps))
    # reserve a return window so the last frame equals the first (loop closure)
    ret = 0.45
    seg = (dur - ret) / n
    css = (".step { position:absolute; inset:0; opacity:0; }\n"
           ".step img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }\n"
           ".cap { position:absolute; left:0; bottom:140px; width:100%; text-align:center; opacity:0; }\n"
           ".cap b { display:inline-block; font-size:44px; font-weight:900; color:#fff;\n"
           "  background:rgba(7,20,5,.90); border-radius:16px; padding:14px 30px; }\n")
    body = ""
    for i, s in enumerate(steps):
        body += '    <div class="step" id="st%d"><img src="assets/step%d.png" alt="%s" /></div>\n' % (
            i, i, s.get("alt", s.get("caption", "")))
    body += "    __SCRIMS__\n"
    for i, s in enumerate(steps):
        body += '    <div class="cap" id="c%d"><b>%d · %s</b></div>\n' % (
            i, i + 1, s.get("caption", ""))
    js = 'tl.set("#st0", { opacity: 1 }, 0);\n'
    for i in range(n):
        t0 = i * seg
        if i > 0:
            js += 'tl.to("#st%d", { opacity: 1, duration: .3, ease: "power1.inOut" }, %.2f);\n' % (i, t0)
        js += 'tl.to("#c%d", { opacity: 1, duration: .3, ease: "power2.out" }, %.2f);\n' % (i, t0 + .25)
        js += 'tl.to("#c%d", { opacity: 0, duration: .25 }, %.2f);\n' % (i, t0 + seg - .35)
    js += 'tl.to([%s], { opacity: 0, duration: .30, ease: "power1.inOut" }, %.2f);\n' % (
        ", ".join('"#st%d"' % i for i in range(1, n)), dur - ret)
    return css, body, js


def ov_wipe_compare(o, dur, W):
    start = float(o.get("startRatio", 0.52))
    low = float(o.get("low", 0.10))
    css = (".layer { position:absolute; inset:0; overflow:hidden; }\n"
           ".layer img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }\n"
           ".divider { position:absolute; top:0; left:0; width:6px; height:100%; background:#c8ff5a;\n"
           "  box-shadow:0 0 22px rgba(200,255,90,.8); }\n"
           ".tag { position:absolute; top:300px; font-size:30px; font-weight:900; color:#0d2606;\n"
           "  background:#eafbdc; border-radius:999px; padding:9px 22px; }\n"
           ".tag.l { left:34px; } .tag.r { right:34px; background:#c8ff5a; }\n")
    body = ('    <div class="layer"><img src="assets/after.png" alt="%s" /></div>\n'
            '    <div class="layer" id="bw"><img id="bi" src="assets/before.png" alt="%s" /></div>\n'
            '    <div class="divider" id="dv"></div>\n'
            '    __SCRIMS__\n'
            '    <div class="tag l">%s</div>\n    <div class="tag r">%s</div>'
            % (o.get("afterAlt", ""), o.get("beforeAlt", ""),
               o.get("beforeLabel", "전"), o.get("afterLabel", "후")))
    js = ("const FULL = %d;\n"
          "function at(p) { return -FULL * (1 - p); }\n"
          'tl.set("#bw", { x: at(%.2f) }, 0);\n'
          'tl.set("#bi", { x: -at(%.2f) }, 0);\n'
          'tl.set("#dv", { x: FULL + at(%.2f) }, 0);\n'
          "function wipe(to, d, pos) {\n"
          '  tl.to("#bw", { x: at(to), duration: d, ease: "power2.inOut" }, pos);\n'
          '  tl.to("#bi", { x: -at(to), duration: d, ease: "power2.inOut" }, pos);\n'
          '  tl.to("#dv", { x: FULL + at(to), duration: d, ease: "power2.inOut" }, pos);\n'
          "}\n"
          "wipe(%.2f, %.2f, .55);\n"
          "wipe(%.2f, %.2f, %.2f);\n"
          % (W, start, start, start, low, (dur - 0.55) * 0.42,
             start, (dur - 0.55) * 0.38, 0.55 + (dur - 0.55) * 0.52))
    return css, body, js


def ov_size_cards(o, dur):
    cards = o.get("cards", [])
    bar = o.get("bar")
    n = max(1, len(cards))
    seg = (dur - 0.8) / n
    css = (".szcard { position:absolute; left:calc(50%% - 175px); top:%dpx; width:350px;\n"
           "  font-size:46px; font-weight:900; color:#12300a; background:#c8ff5a;\n"
           "  border-radius:16px; padding:14px 0; text-align:center;\n"
           "  box-shadow:0 12px 32px rgba(0,0,0,.35); opacity:0; }\n" % o.get("cardTop", 566))
    body = ""
    js = ""
    if bar:
        css += (".track { position:absolute; left:%dpx; top:%dpx; width:%dpx; height:14px;\n"
                "  border-radius:8px; background:rgba(255,255,255,.22); opacity:0; }\n"
                ".bar { position:absolute; left:0; top:0; height:100%%; width:100%%;\n"
                "  border-radius:8px; background:#c8ff5a; transform-origin:0%% 50%%;\n"
                "  transform:scaleX(0); }\n" % (bar["x"], bar["y"], bar["w"]))
        body += '    <div class="track" id="track"><span class="bar" id="bar"></span></div>\n'
        js += 'tl.to("#track", { opacity: 1, duration: .35, ease: "power2.out" }, .2);\n'
    for i, c in enumerate(cards):
        body += '    <div class="szcard" id="z%d">%s</div>\n' % (i, c["label"])
        t = 0.8 + i * seg
        js += ('tl.fromTo("#z%d", { y: -18 }, { y: 0, opacity: 1, duration: .35,'
               ' ease: "back.out(2)" }, %.2f);\n' % (i, t))
        if bar and "ratio" in c:
            js += 'tl.to("#bar", { scaleX: %.2f, duration: .45, ease: "power2.out" }, %.2f);\n' % (
                float(c["ratio"]), t)
        js += 'tl.to("#z%d", { opacity: 0, duration: .22 }, %.2f);\n' % (i, t + seg - .2)
    if bar:
        js += ('tl.to("#bar", { scaleX: 0, duration: .35, ease: "power2.inOut" }, %.2f);\n'
               'tl.to("#track", { opacity: 0, duration: .3, ease: "power1.in" }, %.2f);\n'
               % (dur - 0.6, dur - 0.5))
    return css, body, js



def ov_frame_sequence(o, dur, assets):
    """Play a generated frame sequence as hard cuts. Use for make-consistent-gif output."""
    frames = o.get("frames", [])
    n = max(1, len(frames))
    seg = dur / n
    css = (".seq { position:absolute; inset:0; opacity:0; }\n"
           ".seq img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }\n")
    body = "".join('    <div class="seq" id="sq%d"><img src="assets/seq%02d.png" alt="%s" /></div>\n'
                   % (i, i, o.get("alt", "")) for i in range(n))
    body += "    __SCRIMS__\n"
    js = ""
    for i in range(n):
        js += 'tl.set("#sq%d", { opacity: 1 }, %.3f);\n' % (i, i * seg)
        if i < n - 1:
            js += 'tl.set("#sq%d", { opacity: 0 }, %.3f);\n' % (i, (i + 1) * seg)
    # tl.set 만으로는 타임라인 길이가 0이라 check 의 seek 스윕이 sweep_static 으로 막는다.
    # 전 구간을 덮는 느린 push-in 을 하나 둬서 타임라인에 실제 길이를 준다.
    js += ('tl.fromTo(".seq", { scale: 1 }, { scale: 1.04, duration: %.3f,\n'
           '  transformOrigin: "50%% 50%%", ease: "none" }, 0);\n' % dur)
    return css, body, js



def ov_numbered_chapter(o, dur):
    """POINT 01 style chapter badge + rule. Seen on every Korean detail page studied."""
    num = o.get("number", "01")
    css = (".chapnum { position:absolute; left:calc(50%% - 54px); top:%dpx; width:108px; height:56px;"
           " border-radius:10px; background:%s; color:#12300a; font-size:34px; font-weight:900;"
           " display:flex; align-items:center; justify-content:center; opacity:0; }\n"
           ".chaprule { position:absolute; left:calc(50%% - 130px); top:%dpx; width:260px; height:4px;"
           " border-radius:3px; background:%s; transform-origin:50%% 50%%; transform:scaleX(0); opacity:0; }\n"
           % (o.get("top", 214), o.get("color", "#c8ff5a"),
              o.get("top", 214) + 74, o.get("color", "#c8ff5a")))
    body = ('    <div class="chapnum" id="chapnum">%s</div>\n'
            '    <div class="chaprule" id="chaprule"></div>' % num)
    js = ('tl.set(["#chapnum", "#chaprule"], { opacity: 1 }, 0);\n'
          'tl.set("#chaprule", { scaleX: 1 }, 0);\n'
          'tl.fromTo("#chapnum", { scale: 1 }, { scale: 1.10, duration: .45, yoyo: true,'
          ' repeat: 1, ease: "sine.inOut" }, .3);\n'
          'tl.fromTo("#chaprule", { scaleX: 1 }, { scaleX: 1.18, duration: .5, yoyo: true,'
          ' repeat: 1, ease: "sine.inOut" }, .5);\n'
          'tl.to(["#chapnum", "#chaprule"], { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n'
          % (dur - 0.55))
    return css, body, js


def ov_spec_grid(o, dur):
    """Icon/label spec grid that pops in with stagger. 3+ studied pages use this."""
    items = o.get("items", [])
    cols = int(o.get("cols", 3))
    top = int(o.get("top", 250))
    cell_w, cell_h, gap = 208, 108, 14
    n = max(1, len(items))
    rows = (n + cols - 1) // cols
    grid_w = cols * cell_w + (cols - 1) * gap
    left0 = (780 - grid_w) // 2
    css = (".cellx { position:absolute; width:%dpx; height:%dpx; border-radius:14px;"
           " background:rgba(255,255,255,.94); box-shadow:0 8px 22px rgba(0,0,0,.30);"
           " display:flex; flex-direction:column; align-items:center; justify-content:center;"
           " padding:8px; opacity:0; }\n"
           ".cellx b { display:block; font-size:26px; font-weight:900; color:#12300a;"
           " text-align:center; line-height:1.2; }\n"
           ".cellx span { display:block; font-size:21px; font-weight:700; color:#41503A;"
           " margin-top:4px; text-align:center; }\n" % (cell_w, cell_h))
    body = ""
    for i, it in enumerate(items):
        r, c = divmod(i, cols)
        x = left0 + c * (cell_w + gap)
        y = top + r * (cell_h + gap)
        sub = '<span>%s</span>' % it["sub"] if it.get("sub") else ""
        body += ('    <div class="cellx" id="cx%d" style="left:%dpx; top:%dpx">'
                 '<b>%s</b>%s</div>\n' % (i, x, y, it.get("label", ""), sub))
    js = 'tl.set("#cx0", { opacity: 1 }, 0);\n'
    for i in range(1, n):
        t = 0.28 + (i - 1) * 0.11
        js += ('tl.fromTo("#cx%d", { scale: .82, y: 10 }, { scale: 1, y: 0, opacity: 1,'
               ' duration: .34, ease: "back.out(1.8)" }, %.2f);\n' % (i, t))
    js += 'tl.to(".cellx", { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n' % (dur - 0.5)
    return css, body, js


def ov_free_from(o, dur):
    """無 / NO stamp badges. Negative claims are only safe when the absence is a product fact."""
    items = o.get("items", [])
    mark = o.get("mark", "無")
    n = max(1, len(items))
    size, gap = 186, 22
    total = n * size + (n - 1) * gap
    left0 = (780 - total) // 2
    top = int(o.get("top", 300))
    css = (".ffb { position:absolute; width:%dpx; height:%dpx; border-radius:50%%;"
           " border:6px solid %s; background:rgba(8,22,6,.62);"
           " display:flex; flex-direction:column; align-items:center; justify-content:center;"
           " opacity:0; }\n"
           ".ffb b { display:block; font-size:56px; font-weight:900; color:%s; line-height:1; }\n"
           ".ffb span { display:block; font-size:25px; font-weight:800; color:#fff; margin-top:6px; }\n"
           % (size, size, o.get("color", "#c8ff5a"), o.get("color", "#c8ff5a")))
    body = ""
    for i, label in enumerate(items):
        body += ('    <div class="ffb" id="ff%d" style="left:%dpx; top:%dpx">'
                 '<b>%s</b><span>%s</span></div>\n'
                 % (i, left0 + i * (size + gap), top, mark, label))
    js = 'tl.set("#ff0", { opacity: 1 }, 0);\n'
    for i in range(1, n):
        t = 0.3 + (i - 1) * 0.22
        js += ('tl.fromTo("#ff%d", { scale: 1.7, rotation: -8 }, { scale: 1, rotation: 0,'
               ' opacity: 1, duration: .38, ease: "back.out(2.2)" }, %.2f);\n' % (i, t))
    js += 'tl.to(".ffb", { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n' % (dur - 0.5)
    return css, body, js


def ov_metric_card(o, dur):
    """Big number count-up with an optional condition footnote.

    condition(대상·기간·측정조건)이 있으면 각주로 상시 노출한다. 없으면 각주 없이
    빌드하고 경고만 남긴다.
    """
    metrics = o.get("metrics", [])
    for m in metrics:
        if not m.get("condition"):
            sys.stderr.write(
                "WARN metric-card: '%s' 수치에 condition(대상·기간·측정조건)이 없습니다.\n"
                % m.get("label", "?"))
    n = max(1, len(metrics))
    top = int(o.get("top", 300))
    card_h = 148
    css = (".mcard { position:absolute; left:60px; width:660px; height:%dpx; border-radius:16px;"
           " background:rgba(255,255,255,.95); box-shadow:0 10px 28px rgba(0,0,0,.32);"
           " padding:16px 26px; opacity:0; }\n"
           ".mcard .mv { display:block; font-size:62px; font-weight:900; color:#12300a;"
           " line-height:1.05; }\n"
           ".mcard .ml { display:block; font-size:26px; font-weight:800; color:#1E5C10;"
           " margin-top:2px; }\n"
           ".mcard .mc { display:block; font-size:19px; font-weight:600; color:#41503A;"
           " margin-top:8px; line-height:1.35; }\n" % card_h)
    body, js = "", ""
    for i, m in enumerate(metrics):
        y = top + i * (card_h + 14)
        cond = m.get("condition", "")
        val = ("%." + str(int(m.get("decimals", 0))) + "f") % float(m["value"])
        body += ('    <div class="mcard" id="mk%d" style="top:%dpx">'
                 '<b class="mv" id="mv%d">%s%s</b>'
                 '<span class="ml">%s</span>%s</div>\n'
                 % (i, y, i, val, m.get("unit", ""), m.get("label", ""),
                    ('<span class="mc">%s</span>' % cond) if cond else ""))
        t = 0.3 + i * 0.5
        if i == 0:
            js += 'tl.set("#mk0", { opacity: 1 }, 0);\n'
        else:
            js += ('tl.fromTo("#mk%d", { opacity: 0, y: 16 }, { opacity: 1, y: 0,'
                   ' duration: .38, ease: "back.out(1.8)" }, %.2f);\n' % (i, t))
        # 확정 사양은 세지 않는다. 0 에서 올라가면 첫 프레임이 틀린 사양을 보여 준다.
        js += ('tl.fromTo("#mv%d", { scale: 1 }, { scale: 1.12, duration: .26, yoyo: true,'
               ' repeat: 1, transformOrigin: "0%% 50%%", ease: "sine.inOut" }, %.2f);\n'
               % (i, t + 0.12))
    # 첫 프레임 상태(mk0 노출 / 나머지 숨김)로 복귀시켜 루프를 닫는다
    for i in range(1, len(metrics)):
        js += ('tl.to("#mk%d", { opacity: 0, duration: .38, ease: "power1.in" }, %.2f);\n'
               % (i, dur - 0.5))
    return css, body, js



def ov_cert_badge(o, dur):
    """Certification / patent / test seals.

    issuer(발급기관)와 ref(등록·출원·시험번호)가 있으면 씰에 함께 새긴다.
    없으면 해당 줄만 빼고 빌드하고 경고만 남긴다.
    """
    items = o.get("items", [])
    for c in items:
        if not c.get("issuer") or not c.get("ref"):
            sys.stderr.write(
                "WARN cert-badge: '%s' 인증에 issuer(발급기관) 또는 "
                "ref(등록·출원·시험번호)가 없습니다.\n" % c.get("name", "?"))
    n = max(1, len(items))
    size, gap = 210, 20
    total = n * size + (n - 1) * gap
    left0 = (780 - total) // 2
    top = int(o.get("top", 296))
    css = (".seal { position:absolute; width:%dpx; border-radius:18px;"
           " background:rgba(255,255,255,.96); box-shadow:0 10px 26px rgba(0,0,0,.34);"
           " border:5px solid %s; padding:16px 12px; text-align:center; opacity:0; }\n"
           ".seal b { display:block; font-size:27px; font-weight:900; color:#12300a;"
           " line-height:1.22; }\n"
           ".seal .iss { display:block; font-size:20px; font-weight:800; color:#1E5C10;"
           " margin-top:6px; }\n"
           ".seal .ref { display:block; font-size:17px; font-weight:600; color:#41503A;"
           " margin-top:5px; line-height:1.3; }\n" % (size, o.get("color", "#1E5C10")))
    body = ""
    for i, c in enumerate(items):
        iss, ref = c.get("issuer", ""), c.get("ref", "")
        body += ('    <div class="seal" id="sl%d" style="left:%dpx; top:%dpx">'
                 '<b>%s</b>%s%s</div>\n'
                 % (i, left0 + i * (size + gap), top, c.get("name", ""),
                    ('<span class="iss">%s</span>' % iss) if iss else "",
                    ('<span class="ref">%s</span>' % ref) if ref else ""))
    js = 'tl.set("#sl0", { opacity: 1 }, 0);\n'
    for i in range(1, n):
        t = 0.3 + (i - 1) * 0.24
        js += ('tl.fromTo("#sl%d", { scale: 1.55, rotation: -6 }, { scale: 1, rotation: 0,'
               ' opacity: 1, duration: .40, ease: "back.out(2.2)" }, %.2f);\n' % (i, t))
    js += 'tl.to(".seal", { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n' % (dur - 0.5)
    return css, body, js


def ov_spread_bloom(o, dur):
    """한 점에서 기운이 번져 나간다. 냉감·온기·탈취·살균의 공통 은유.

    반지름을 트윈하지 않는다. 원 레이어를 scale 0 -> 1 로 키운다.
    숫자·눈금·범례는 붙이지 않는다. 붙이는 순간 계측 주장이 된다.
    """
    origins = o.get("origins", [[0.5, 0.5]])
    tint = o.get("tint", "#7ad3ff")
    size = int(o.get("size", 300))
    rings = int(o.get("rings", 3))
    css = (".bloom { position:absolute; border-radius:50%%; opacity:0;"
           " background:radial-gradient(circle, %s 0%%, rgba(255,255,255,0) 70%%); }\n"
           ".haze { position:absolute; inset:0; opacity:0; background:%s; }\n"
           % (tint, tint))
    body, js = "", ""
    n = 0
    for oi, (ox, oy) in enumerate(origins):
        for r in range(rings):
            body += ('    <div class="bloom" id="bl%d" style="left:%dpx; top:%dpx;'
                     ' width:%dpx; height:%dpx"></div>\n'
                     % (n, int(ox * 780 - size / 2), int(oy * 780 - size / 2), size, size))
            t = 0.15 + oi * 0.35 + r * 0.30
            js += ('tl.fromTo("#bl%d", { scale: .18, opacity: 0 },'
                   ' { scale: 1, opacity: .85, duration: 1.15, ease: "power2.out" }, %.2f);\n'
                   % (n, t))
            js += ('tl.to("#bl%d", { opacity: 0, duration: .55, ease: "power1.in" }, %.2f);\n'
                   % (n, t + 1.15))
            n += 1
    body += '    <div class="haze" id="hz"></div>\n'
    js += 'tl.set("#bl0", { opacity: .5, scale: .35 }, 0);\n'
    js += ('tl.fromTo("#hz", { opacity: 0 }, { opacity: .16, duration: %.2f,'
           ' yoyo: true, repeat: 1, ease: "sine.inOut" }, 0.10);\n' % (dur * 0.42))
    return css, body, js


# ------------------------------------------------------- 공통 배치·명암 헬퍼
# 오버레이를 화면 중앙에 강제하면 제품을 가린다. anchor 로 제품 부위에 붙인다.
# 색을 하드코딩하면 밝은 배경에서 check 명암비가 실패한다. tone 으로 팔레트를 뒤집는다.

TONE = {
    "dark":  {"fg": "#EAF7DF", "num": "#C8F531", "hit": "#FFE14D",
              "track": "rgba(255,255,255,.16)", "line": "rgba(255,255,255,.30)"},
    "light": {"fg": "#12300A", "num": "#2C7A1E", "hit": "#B25A00",
              "track": "rgba(0,0,0,.10)", "line": "rgba(0,0,0,.28)"},
}


def tone_of(o):
    """배경이 밝으면 'light' 를 준다. 기본은 dark."""
    return TONE.get(o.get("tone", "dark"), TONE["dark"])


def place(o, w, h, default=(0.5, 0.5)):
    """anchor(0~1 정규화) 를 780 캔버스 좌표로 바꾼다. align 으로 기준점을 옮긴다.

    중앙 강제 대신 이걸 쓴다. 제품 bbox 바깥의 빈 자리에 붙이는 것이 목적이다.
    """
    ax, ay = o.get("anchor", default)
    align = o.get("align", "center")
    x = ax * 780
    if align == "center":
        x -= w / 2
    elif align == "right":
        x -= w
    x = max(16, min(780 - w - 16, x))          # 캔버스 밖으로 나가지 않게 물린다
    y = max(16, min(780 - h - 16, ay * 780 - h / 2))
    return int(x), int(y)


def scrim_css(o):
    """밝은 제품 위 텍스트가 명암비를 못 넘길 때 뒤에 까는 패널."""
    if not o.get("scrim"):
        return "", ""
    t = tone_of(o)
    bg = "rgba(6,20,8,.62)" if o.get("tone", "dark") == "dark" else "rgba(255,255,255,.80)"
    css = (".ovscrim { position:absolute; border-radius:20px; background:%s;"
           " border:1px solid %s; }\n" % (bg, t["line"]))
    return css, "scrim"


def ov_count_pop(o, dur):
    """수량이 하나씩 쌓이며 숫자가 오르고, 목표에 닿는 순간 강조된다.

    `쌓기` 동사 전용이다. 누적 자체가 visible delta 이므로 여기서는 카운트업이
    정보다. 확정 사양(길이·용량)에는 쓰지 않는다. 거기서 0 부터 세면 첫 프레임이
    틀린 사양을 보여 준다 — 그건 `metric-card` 의 값 고정 방식을 쓴다.

    onUpdate 는 타임라인이 구동하므로 seek 해도 같은 값이 나온다.
    """
    frm = int(o.get("from", 1))
    to = int(o.get("to", 50))
    unit = o.get("unit", "개")
    label = o.get("label", "")
    color = o.get("color", "#C8F531")
    hit = o.get("hit_color", "#FFE14D")
    top = int(o.get("top", 250))
    grid = o.get("grid") or {}
    cols = int(grid.get("cols", 10))
    dot = int(grid.get("dot", 34))
    gap = int(grid.get("gap", 10))
    show_grid = bool(grid) and to <= 120
    rise = float(o.get("rise", 1.55))          # 카운트가 오르는 구간 길이
    t0 = 0.35

    css = (".cnum { position:absolute; left:0; right:0; text-align:center;"
           " font-size:132px; font-weight:900; line-height:1; color:%s;"
           " text-shadow:0 6px 30px rgba(0,0,0,.55); }\n"
           ".cunit { font-size:58px; font-weight:900; margin-left:8px; }\n"
           ".clab { position:absolute; left:0; right:0; text-align:center;"
           " font-size:29px; font-weight:800; color:#EAF7DF; opacity:0; }\n"
           ".cring { position:absolute; border-radius:50%%; border:7px solid %s;"
           " opacity:0; }\n"
           ".cdot { position:absolute; border-radius:50%%; background:%s; opacity:0; }\n"
           % (color, hit, color))

    body = ('    <div class="cnum" id="cnm" style="top:%dpx">%d<span class="cunit">%s</span></div>\n'
            % (top, frm, unit))
    body += ('    <div class="clab" id="clb" style="top:%dpx">%s</div>\n'
             % (top + 152, label))
    ring = 300
    body += ('    <div class="cring" id="crg" style="left:%dpx; top:%dpx;'
             ' width:%dpx; height:%dpx"></div>\n'
             % (390 - ring // 2, top + 66 - ring // 2, ring, ring))

    js = ""
    if show_grid:
        rows = (to + cols - 1) // cols
        gw = cols * dot + (cols - 1) * gap
        gx = (780 - gw) // 2
        gy = top + 210
        for i in range(to):
            x = gx + (i % cols) * (dot + gap)
            y = gy + (i // cols) * (dot + gap)
            body += ('    <div class="cdot" id="cd%d" style="left:%dpx; top:%dpx;'
                     ' width:%dpx; height:%dpx"></div>\n' % (i, x, y, dot, dot))
        span = max(1, to - frm)
        for i in range(to):
            at = t0 + rise * (max(0, i - frm + 1) / span)
            js += ('tl.set("#cd%d", { opacity: 1, scale: 1 }, %.3f);\n' % (i, at))
        # 첫 프레임에 이미 frm 개가 서 있어야 화면이 비지 않는다
        for i in range(frm):
            js += 'tl.set("#cd%d", { opacity: 1 }, 0);\n' % i

    js += ('(function(){ const o = { v: %d };\n'
           '  tl.to(o, { v: %d, duration: %.2f, ease: "power1.out",\n'
           '    onUpdate: () => { document.getElementById("cnm").innerHTML ='
           ' Math.round(o.v) + \'<span class="cunit">%s</span>\'; } }, %.2f); })();\n'
           % (frm, to, rise, unit, t0))
    # 목표 도달 순간의 강조
    hit_at = t0 + rise
    js += ('tl.to("#cnm", { scale: 1.22, color: "%s", duration: .26, yoyo: true,'
           ' repeat: 1, transformOrigin: "50%% 50%%", ease: "back.out(3)" }, %.2f);\n'
           % (hit, hit_at))
    js += ('tl.fromTo("#crg", { scale: .55, opacity: .95 }, { scale: 1.5, opacity: 0,'
           ' duration: .72, ease: "power2.out" }, %.2f);\n' % hit_at)
    js += ('tl.to("#clb", { opacity: 1, duration: .34, ease: "power2.out" }, %.2f);\n'
           % (hit_at + 0.10))
    # 루프 복귀 — 첫 프레임 상태로 되돌린다
    back = dur - 0.55
    js += ('tl.to("#clb", { opacity: 0, duration: .35, ease: "power1.in" }, %.2f);\n' % back)
    if show_grid:
        for i in range(frm, to):
            js += 'tl.set("#cd%d", { opacity: 0 }, %.3f);\n' % (i, back + 0.34)
    js += ('(function(){ const o = { v: %d };\n'
           '  tl.to(o, { v: %d, duration: .34, ease: "power1.in",\n'
           '    onUpdate: () => { document.getElementById("cnm").innerHTML ='
           ' Math.round(o.v) + \'<span class="cunit">%s</span>\'; } }, %.2f); })();\n'
           % (to, frm, unit, back + 0.02))
    return css, body, js


def ov_xray_reveal(o, dur):
    """겉면이 투시되어 속 구조가 드러난다. 뼈 정렬·내부 층·하중 경로.

    겉/속 두 레이어를 같은 좌표에 겹치고 opacity 만 교차시킨다.
    assets.inner 에 속 구조 이미지를 넣는다.
    """
    marks = o.get("marks", [])
    tint = o.get("tint", "#c8ff5a")
    css = (".inner { position:absolute; inset:0; width:100%%; height:100%%;"
           " object-fit:cover; opacity:0; }\n"
           ".xdot { position:absolute; width:26px; height:26px; border-radius:50%%;"
           " box-shadow:0 0 0 6px rgba(255,255,255,.22); opacity:0; }\n"
           ".xscan { position:absolute; left:0; right:0; height:5px; opacity:0;"
           " background:linear-gradient(90deg, rgba(255,255,255,0), %s, rgba(255,255,255,0)); }\n"
           % tint)
    body = '    <img class="inner" id="inr" src="assets/inner.png" alt="" />\n'
    body += '    <div class="xscan" id="xsc" style="top:0"></div>\n'
    for i, m in enumerate(marks):
        body += ('    <div class="xdot" id="xd%d" style="left:%dpx; top:%dpx;'
                 ' background:%s"></div>\n'
                 % (i, int(m[0] * 780 - 13), int(m[1] * 780 - 13), tint))
    js = 'tl.set("#inr", { opacity: 0 }, 0);\n'
    js += ('tl.fromTo("#xsc", { y: 60, opacity: 0 }, { y: 700, opacity: .95,'
           ' duration: 1.05, ease: "power1.inOut" }, 0.25);\n')
    js += 'tl.to("#inr", { opacity: .92, duration: .75, ease: "power2.out" }, 0.55);\n'
    for i in range(len(marks)):
        t = 1.25 + i * 0.28
        js += ('tl.fromTo("#xd%d", { scale: .4, opacity: 0 }, { scale: 1, opacity: 1,'
               ' duration: .34, ease: "back.out(2.4)" }, %.2f);\n' % (i, t))
    js += 'tl.to("#xsc", { opacity: 0, duration: .3 }, 1.35);\n'
    js += ('tl.to([".xdot", "#inr"], { opacity: 0, duration: .45, ease: "power1.in" }, %.2f);\n'
           % (dur - 0.55))
    return css, body, js


def ov_flow_arrows(o, dur):
    """화살표가 소재를 통과해 반대편으로 빠진다. 통기·순환·배수.

    좌표는 상수 배열이다. 시드 없는 난수를 쓰지 않는다.
    """
    lanes = o.get("lanes", [[0.30, 0.22], [0.50, 0.18], [0.70, 0.26]])
    color = o.get("color", "#c8ff5a")
    travel = int(o.get("travel", 300))
    css = (".flw { position:absolute; width:16px; height:64px; border-radius:9px;"
           " opacity:0; background:linear-gradient(180deg, rgba(255,255,255,0), %s); }\n"
           ".mem { position:absolute; left:120px; right:120px; height:5px; opacity:.75;"
           " border-radius:3px; background:repeating-linear-gradient(90deg,%s 0 14px,"
           " rgba(255,255,255,0) 14px 26px); }\n" % (color, color))
    body, js = "", ""
    for i, (lx, ly) in enumerate(lanes):
        body += ('    <div class="flw" id="fw%d" style="left:%dpx; top:%dpx"></div>\n'
                 % (i, int(lx * 780 - 8), int(ly * 780)))
    body += ('    <div class="mem" id="mem" style="top:%dpx"></div>\n'
             % int(o.get("membrane", 0.52) * 780))
    for i in range(len(lanes)):
        t = 0.12 + i * 0.20
        js += ('tl.fromTo("#fw%d", { y: 0, opacity: 0 }, { y: %d, opacity: .95,'
               ' duration: 1.25, ease: "power1.inOut" }, %.2f);\n' % (i, travel, t))
        js += ('tl.to("#fw%d", { opacity: 0, duration: .35 }, %.2f);\n' % (i, t + 1.05))
    js += 'tl.set("#fw0", { opacity: .6 }, 0);\n'
    js += ('tl.fromTo("#mem", { scaleX: .96 }, { scaleX: 1, duration: %.2f, yoyo: true,'
           ' repeat: 1, ease: "sine.inOut" }, 0);\n' % (dur * 0.45))
    return css, body, js


def ov_gauge_fill(o, dur):
    """게이지가 목표까지 찬다. 용량·잔량·진행·절약.

    width 트윈이 금지이므로 scaleY + transformOrigin 으로 만든다.
    눈금 숫자는 선택이며, 붙이면 근거가 필요하다.
    """
    bars = o.get("bars", [{"label": "", "to": 0.8}])
    t = tone_of(o)
    color = o.get("color", t["num"])
    top = int(o.get("top", 300))
    h = 210
    # 라벨은 배경 밝기를 예측할 수 없다. 불투명 pill 을 깔아 명암비를 고정한다.
    pill = "rgba(6,20,8,.86)" if o.get("tone", "dark") == "dark" else "rgba(255,255,255,.92)"
    css = (".gwrap { position:absolute; width:96px; height:%dpx; border-radius:14px;"
           " background:%s; border:2px solid %s; overflow:hidden; }\n"
           ".gfill { position:absolute; left:0; right:0; bottom:0; height:100%%;"
           " transform-origin:50%% 100%%; transform:scaleY(0); }\n"
           ".glab { position:absolute; width:150px; text-align:center; font-size:23px;"
           " font-weight:800; color:%s; opacity:0; background:%s; border-radius:999px;"
           " padding:8px 0; white-space:nowrap; }\n"
           % (h, t["track"], t["line"], t["fg"], pill))
    body, js = "", ""
    n = len(bars)
    gap = 46
    left0 = (780 - (n * 96 + (n - 1) * gap)) // 2
    for i, b in enumerate(bars):
        x = left0 + i * (96 + gap)
        body += ('    <div class="gwrap" style="left:%dpx; top:%dpx">'
                 '<div class="gfill" id="gf%d" style="background:%s"></div></div>\n'
                 % (x, top, i, b.get("color", color)))
        body += ('    <div class="glab" id="gl%d" style="left:%dpx; top:%dpx">%s</div>\n'
                 % (i, x - 27, top + h + 14, b.get("label", "")))
        t = 0.30 + i * 0.35
        js += ('tl.to("#gf%d", { scaleY: %.3f, duration: 1.05, ease: "power2.out" }, %.2f);\n'
               % (i, float(b.get("to", 0.8)), t))
        js += ('tl.to("#gl%d", { opacity: 1, duration: .3 }, %.2f);\n' % (i, t + 0.45))
    js += 'tl.set("#gf0", { scaleY: .10 }, 0);\n'
    js += 'tl.set("#gl0", { opacity: 1 }, 0);\n'
    js += ('tl.to([".gfill", ".glab"], { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n'
           % (dur - 0.5))
    return css, body, js


def ov_path_draw(o, dur):
    """선이 한쪽 끝에서 반대편까지 그려진다. 궤적·도달·동선·연결.

    stroke-dashoffset 은 결정론 트윈이다. 도달 지점에 끝점 링을 세운다.
    """
    pts = o.get("points", [[0.18, 0.72], [0.46, 0.34], [0.82, 0.24]])
    color = o.get("color", "#c8ff5a")
    d = "M %d %d" % (pts[0][0] * 780, pts[0][1] * 780)
    for p in pts[1:]:
        d += " L %d %d" % (p[0] * 780, p[1] * 780)
    css = (".pdsvg { position:absolute; inset:0; }\n"
           ".pdln { fill:none; stroke:%s; stroke-width:7; stroke-linecap:round;"
           " stroke-linejoin:round; stroke-dasharray:1600; stroke-dashoffset:1600; }\n"
           ".pdend { position:absolute; width:52px; height:52px; border-radius:50%%;"
           " border:5px solid %s; opacity:0; }\n" % (color, color))
    ex, ey = pts[-1]
    body = ('    <svg class="pdsvg" viewBox="0 0 780 780"><path class="pdln" id="pdl"'
            ' d="%s" /></svg>\n' % d)
    body += ('    <div class="pdend" id="pde" style="left:%dpx; top:%dpx"></div>\n'
             % (int(ex * 780 - 26), int(ey * 780 - 26)))
    js = 'tl.set("#pdl", { strokeDashoffset: 1450 }, 0);\n'
    js += ('tl.to("#pdl", { strokeDashoffset: 0, duration: 1.35, ease: "power2.inOut" }, 0.20);\n')
    js += ('tl.fromTo("#pde", { scale: .5, opacity: 0 }, { scale: 1, opacity: 1,'
           ' duration: .38, ease: "back.out(2.2)" }, 1.45);\n')
    js += ('tl.to("#pde", { scale: 1.16, duration: .45, yoyo: true, repeat: 1,'
           ' ease: "sine.inOut" }, 1.85);\n')
    js += ('tl.to(["#pdl", "#pde"], { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n'
           % (dur - 0.5))
    return css, body, js


def ov_state_swap(o, dur):
    """같은 중심에서 A 가 줄고 B 가 튀어나온다. 모드 전환·옵션 교체.

    두 라벨을 같은 좌표에 겹쳐 두고 scale + opacity 로 교차시킨다.
    """
    states = o.get("states", [{"label": "A"}, {"label": "B"}])
    color = o.get("color", "#c8ff5a")
    top = int(o.get("top", 330))
    css = (".sw { position:absolute; left:56px; right:56px; text-align:center;"
           " font-size:56px; font-weight:900; color:#12300A; opacity:0;"
           " background:%s; border-radius:20px; padding:22px 18px;"
           " white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n" % color)
    body, js = "", ""
    for i, s in enumerate(states):
        body += ('    <div class="sw" id="sw%d" style="top:%dpx">%s</div>\n'
                 % (i, top, s.get("label", "")))
    seg = max(0.9, (dur - 1.0) / max(1, len(states)))
    for i in range(len(states)):
        t = 0.25 + i * seg
        if i == 0:
            js += 'tl.set("#sw0", { opacity: 1, scale: 1 }, 0);\n'
        else:
            js += ('tl.fromTo("#sw%d", { scale: .62, opacity: 0 }, { scale: 1, opacity: 1,'
                   ' duration: .46, ease: "back.out(2)" }, %.2f);\n' % (i, t))
        if i < len(states) - 1:
            js += ('tl.to("#sw%d", { scale: .62, opacity: 0, duration: .40,'
                   ' ease: "power2.in" }, %.2f);\n' % (i, t + seg - 0.10))
    js += ('tl.fromTo("#sw0", { scale: .62, opacity: 0 }, { scale: 1, opacity: 1,'
           ' duration: .40, ease: "back.out(2)" }, %.2f);\n' % (dur - 0.55))
    return css, body, js


def ov_target_zoom(o, dur):
    """카메라가 특정 부위로 정확히 들어갔다 나온다. 부위 지목·마감·각인."""
    t = tone_of(o)
    tx, ty = o.get("target", [0.5, 0.5])
    z = float(o.get("zoom", 1.6))
    z = min(z, float(o.get("max_zoom", 1.8)))     # 소스 해상도 한계. 넘기면 뭉갠다
    label = o.get("label", "")
    dx, dy = (0.5 - tx) * 780 * z, (0.5 - ty) * 780 * z
    css = (".tzring { position:absolute; border-radius:50%%; border:6px solid %s;"
           " opacity:0; }\n"
           ".tzlab { position:absolute; left:0; right:0; text-align:center;"
           " font-size:34px; font-weight:900; color:%s; opacity:0; }\n"
           % (t["num"], t["fg"]))
    r = 240
    body = ('    <div class="tzring" id="tzr" style="left:%dpx; top:%dpx;'
            ' width:%dpx; height:%dpx"></div>\n'
            % (int(tx * 780 - r / 2), int(ty * 780 - r / 2), r, r))
    body += ('    <div class="tzlab" id="tzl" style="top:%dpx">%s</div>\n'
             % (int(min(700, ty * 780 + r / 2 + 26)), label))
    js = ('tl.fromTo("#tzr", { scale: 1.35, opacity: 0 }, { scale: 1, opacity: 1,'
          ' duration: .55, ease: "power2.out" }, 0.12);\n')
    js += ('tl.to(".bg", { scale: %.3f, x: %.1f, y: %.1f, duration: 1.15,'
           ' ease: "power2.inOut" }, 0.45);\n' % (z, dx, dy))
    js += 'tl.to("#tzl", { opacity: 1, duration: .34 }, 1.15);\n'
    js += ('tl.to(".bg", { scale: 1, x: 0, y: 0, duration: .85, ease: "power2.inOut" }, %.2f);\n'
           % (dur - 1.05))
    js += ('tl.to(["#tzr", "#tzl"], { opacity: 0, duration: .38 }, %.2f);\n' % (dur - 0.95))
    js += 'tl.set("#tzr", { opacity: .5 }, 0);\n'
    return css, body, js


def ov_rack_focus(o, dur):
    """앞이 풀리고 뒤가 잡힌다. 매크로 진입·주목 이동. assets.near 필요."""
    t = tone_of(o)
    label = o.get("label", "")
    css = (".rfnear { position:absolute; inset:0; width:100%%; height:100%%;"
           " object-fit:cover; filter:blur(0px); }\n"
           ".rflab { position:absolute; left:0; right:0; text-align:center;"
           " font-size:34px; font-weight:900; color:%s; opacity:0; }\n" % t["fg"])
    body = '    <img class="rfnear" id="rfn" src="assets/near.png" alt="" />\n'
    body += ('    <div class="rflab" id="rfl" style="top:%dpx">%s</div>\n'
             % (int(o.get("label_y", 0.80) * 780), label))
    js = 'tl.set("#rfn", { opacity: 1 }, 0);\n'
    js += ('tl.to("#rfn", { filter: "blur(16px)", opacity: .35, duration: .95,'
           ' ease: "power2.inOut" }, 0.35);\n')
    js += 'tl.to("#rfl", { opacity: 1, duration: .34 }, 1.10);\n'
    js += ('tl.to("#rfn", { filter: "blur(0px)", opacity: 1, duration: .80,'
           ' ease: "power2.inOut" }, %.2f);\n' % (dur - 1.0))
    js += 'tl.to("#rfl", { opacity: 0, duration: .32 }, %.2f);\n' % (dur - 0.9)
    return css, body, js


def ov_press_spring(o, dur):
    """눌렸다 튕겨 돌아온다. 버튼·촉감·쿠션·탄성."""
    t = tone_of(o)
    px, py = o.get("point", [0.5, 0.42])
    reps = int(o.get("reps", 2))
    css = (".psarrow { position:absolute; width:18px; border-radius:9px; opacity:0;"
           " background:linear-gradient(180deg, rgba(255,255,255,0), %s); }\n"
           ".psring { position:absolute; border-radius:50%%; border:5px solid %s;"
           " opacity:0; }\n" % (t["num"], t["num"]))
    body = ('    <div class="psarrow" id="psa" style="left:%dpx; top:%dpx;'
            ' height:150px"></div>\n' % (int(px * 780 - 9), int(py * 780 - 190)))
    body += ('    <div class="psring" id="psr" style="left:%dpx; top:%dpx;'
             ' width:160px; height:160px"></div>\n'
             % (int(px * 780 - 80), int(py * 780 - 80)))
    js = 'tl.set("#psa", { opacity: .9 }, 0);\n'
    seg = max(0.85, (dur - 0.8) / max(1, reps))
    for i in range(reps):
        t0 = 0.20 + i * seg
        js += ('tl.to("#psa", { y: 46, duration: .22, ease: "power2.in" }, %.2f);\n' % t0)
        js += ('tl.to(".bg", { scaleY: .985, duration: .20, ease: "power2.in" }, %.2f);\n' % t0)
        js += ('tl.to(".bg", { scaleY: 1, duration: .55, ease: "elastic.out(1,0.4)" }, %.2f);\n'
               % (t0 + 0.22))
        js += ('tl.to("#psa", { y: 0, duration: .42, ease: "power2.out" }, %.2f);\n' % (t0 + 0.24))
        js += ('tl.fromTo("#psr", { scale: .5, opacity: .9 }, { scale: 1.35, opacity: 0,'
               ' duration: .60, ease: "power2.out" }, %.2f);\n' % (t0 + 0.20))
    return css, body, js


def ov_container_morph(o, dur):
    """상자가 형태를 바꿔 실제를 드러낸다. 접힘·변신·화면 전환.

    width/height 트윈이 금지이므로 균일 scale + borderRadius 페인트로 만든다.
    """
    t = tone_of(o)
    pill = "rgba(6,20,8,.90)" if o.get("tone", "dark") == "dark" else "rgba(255,255,255,.94)"
    steps = o.get("steps", [{"label": "접은 상태", "scale": .55, "radius": 90},
                            {"label": "펼친 상태", "scale": 1.0, "radius": 22}])
    w, h = 520, 380
    x, y = place(o, w, h, (0.5, 0.46))
    css = (".cmbox { position:absolute; background:rgba(255,255,255,.10);"
           " border:3px solid %s; }\n"
           ".cmlab { position:absolute; left:0; right:0; text-align:center;"
           " font-size:32px; font-weight:900; color:%s; opacity:0; }\n"
           ".cmlab span { display:inline-block; padding:12px 26px; border-radius:999px;"
           " background:%s; white-space:nowrap; }\n"
           % (t["line"], t["fg"], pill))
    body = ('    <div class="cmbox" id="cmb" style="left:%dpx; top:%dpx;'
            ' width:%dpx; height:%dpx"></div>\n' % (x, y, w, h))
    for i, s in enumerate(steps):
        body += ('    <div class="cmlab" id="cml%d" style="top:%dpx"><span>%s</span></div>\n'
                 % (i, 690, s.get("label", "")))
    seg = max(0.9, (dur - 0.9) / max(1, len(steps)))
    js = ('tl.set("#cmb", { scale: %.3f, borderRadius: "%dpx" }, 0);\n'
          % (steps[0].get("scale", .55), steps[0].get("radius", 90)))
    js += 'tl.set("#cml0", { opacity: 1 }, 0);\n'
    for i, s in enumerate(steps):
        t0 = 0.25 + i * seg
        if i:
            js += ('tl.to("#cmb", { scale: %.3f, borderRadius: "%dpx", duration: .70,'
                   ' ease: "power2.inOut" }, %.2f);\n'
                   % (s.get("scale", 1.0), s.get("radius", 22), t0))
            js += 'tl.to("#cml%d", { opacity: 0, duration: .25 }, %.2f);\n' % (i - 1, t0)
            js += 'tl.to("#cml%d", { opacity: 1, duration: .30 }, %.2f);\n' % (i, t0 + 0.30)
    js += ('tl.to("#cmb", { scale: %.3f, borderRadius: "%dpx", duration: .55,'
           ' ease: "power2.inOut" }, %.2f);\n'
           % (steps[0].get("scale", .55), steps[0].get("radius", 90), dur - 0.60))
    js += 'tl.to("#cml%d", { opacity: 0, duration: .25 }, %.2f);\n' % (len(steps) - 1, dur - 0.60)
    js += 'tl.to("#cml0", { opacity: 1, duration: .25 }, %.2f);\n' % (dur - 0.32)
    return css, body, js


def ov_assemble(o, dur):
    """흩어진 요소가 자리를 찾아 정렬한다. 구성품·세트·스펙."""
    t = tone_of(o)
    items = o.get("items", [{"label": "본체"}, {"label": "부속"}, {"label": "설명서"}])
    n = len(items)
    cw, ch, gap = 190, 190, 22
    total = n * cw + (n - 1) * gap
    x0, y = place(o, total, ch, (0.5, 0.48))
    starts = [(-260, -180), (260, -220), (-300, 240), (300, 200), (0, -300), (0, 300)]
    css = (".asb { position:absolute; border-radius:22px; background:rgba(255,255,255,.12);"
           " border:2px solid %s; opacity:0; }\n"
           ".asl { position:absolute; text-align:center; font-size:25px; font-weight:800;"
           " color:%s; opacity:0; width:%dpx; }\n" % (t["line"], t["fg"], cw))
    body, js = "", ""
    for i, it in enumerate(items):
        cx = x0 + i * (cw + gap)
        body += ('    <div class="asb" id="ab%d" style="left:%dpx; top:%dpx;'
                 ' width:%dpx; height:%dpx"></div>\n' % (i, cx, y, cw, ch))
        body += ('    <div class="asl" id="al%d" style="left:%dpx; top:%dpx">%s</div>\n'
                 % (i, cx, y + ch + 12, it.get("label", "")))
        sx, sy = starts[i % len(starts)]
        t0 = 0.18 + i * 0.22
        js += ('tl.fromTo("#ab%d", { x: %d, y: %d, opacity: 0, scale: .7 },'
               ' { x: 0, y: 0, opacity: 1, scale: 1, duration: .70,'
               ' ease: "back.out(1.7)" }, %.2f);\n' % (i, sx, sy, t0))
        js += 'tl.to("#al%d", { opacity: 1, duration: .28 }, %.2f);\n' % (i, t0 + 0.45)
    js += 'tl.set("#ab0", { opacity: 1, scale: .85 }, 0);\n'
    js += ('tl.to([".asb", ".asl"], { opacity: 0, duration: .40, ease: "power1.in" }, %.2f);\n'
           % (dur - 0.5))
    return css, body, js


def ov_camera_push(o, dur):
    """상태 전환 지점에만 짧게 밀고 재고정한다. 리듬·강조 순간.

    상시 팬·줌은 정보를 늘리지 않아 coverage 로 세지 않는다. 그래서 구간을 짧게 둔다.
    """
    at = float(o.get("at", 0.45)) * dur
    z = float(o.get("zoom", 1.10))
    hold = float(o.get("hold", 0.9))
    css = ""
    body = ""
    js = ('tl.to(".bg", { scale: %.3f, duration: .55, ease: "power2.out" }, %.2f);\n'
          % (z, at))
    js += ('tl.to(".bg", { scale: 1, duration: .70, ease: "power2.inOut" }, %.2f);\n'
           % (at + 0.55 + hold))
    return css, body, js


KINDS = {
    "count-pop": lambda o, d, a, w: ov_count_pop(o, d),
    "target-zoom": lambda o, d, a, w: ov_target_zoom(o, d),
    "rack-focus": lambda o, d, a, w: ov_rack_focus(o, d),
    "press-spring": lambda o, d, a, w: ov_press_spring(o, d),
    "container-morph": lambda o, d, a, w: ov_container_morph(o, d),
    "assemble": lambda o, d, a, w: ov_assemble(o, d),
    "camera-push": lambda o, d, a, w: ov_camera_push(o, d),
    "spread-bloom": lambda o, d, a, w: ov_spread_bloom(o, d),
    "xray-reveal": lambda o, d, a, w: ov_xray_reveal(o, d),
    "flow-arrows": lambda o, d, a, w: ov_flow_arrows(o, d),
    "gauge-fill": lambda o, d, a, w: ov_gauge_fill(o, d),
    "path-draw": lambda o, d, a, w: ov_path_draw(o, d),
    "state-swap": lambda o, d, a, w: ov_state_swap(o, d),
    "alert-ring": lambda o, d, a, w: ov_alert_ring(o, d),
    "dashed-zone": lambda o, d, a, w: ov_dashed_zone(o, d),
    "swarm": lambda o, d, a, w: ov_swarm(o, d),
    "load-arrow": lambda o, d, a, w: ov_load_arrow(o, d),
    "converge": lambda o, d, a, w: ov_converge(o, d),
    "split-state": lambda o, d, a, w: ov_split_state(o, d),
    "runoff": lambda o, d, a, w: ov_runoff(o, d),
    "step-cuts": lambda o, d, a, w: ov_step_cuts(o, d, a),
    "wipe-compare": lambda o, d, a, w: ov_wipe_compare(o, d, w),
    "size-cards": lambda o, d, a, w: ov_size_cards(o, d),
    "frame-sequence": lambda o, d, a, w: ov_frame_sequence(o, d, a),
    "numbered-chapter": lambda o, d, a, w: ov_numbered_chapter(o, d),
    "spec-grid": lambda o, d, a, w: ov_spec_grid(o, d),
    "free-from": lambda o, d, a, w: ov_free_from(o, d),
    "metric-card": lambda o, d, a, w: ov_metric_card(o, d),
    "cert-badge": lambda o, d, a, w: ov_cert_badge(o, d),
}

SELF_BG = {"step-cuts", "wipe-compare", "frame-sequence"}  # these supply their own image layers


# ------------------------------------------------------------------- emitting
def check_square(mid, spec, assets, ov):
    """배경 소스 비율이 캔버스와 다르면 경고한다.

    `.bg` 는 object-fit: cover 라 비율이 다른 소스는 잘린다. 헤드라인이 약속한
    시각 근거가 그 잘린 영역에 있으면 렌더는 성공해도 증명이 사라진다.
    렌더 뒤 QA 로는 잡히지 않으므로 배정 단계인 여기서 알린다.
    """
    try:
        from PIL import Image
    except ImportError:
        return          # PIL 이 없으면 이 검사만 건너뛴다. 빌드를 막지 않는다.
    canvas = spec.get("canvas", {})
    cw, ch = canvas.get("width", 780), canvas.get("height", 780)
    want = cw / ch
    srcs = [("bg", assets["bg"])] if "bg" in assets else []
    srcs += [("frames[0]", ov["frames"][0])] if ov.get("frames") else []
    srcs += [(k, ov[k]) for k in ("before", "after") if ov.get(k)]
    for key, src in srcs:
        try:
            with Image.open(src) as im:
                w, h = im.size
        except Exception:
            continue
        ar = w / h
        if abs(ar - want) < 0.01:
            continue
        cut = (1 - want / ar) * 100 if ar > want else (1 - ar / want) * 100
        where = "좌우" if ar > want else "상하"
        sys.stderr.write(
            "WARN %s: %s 소스가 %dx%d (%.2f) 로 캔버스 %dx%d (%.2f) 와 달라 "
            "%s %.0f%% 가 잘립니다. 정방형 소스로 바꾸거나 재생성하세요.\n"
            % (mid, key, w, h, ar, cw, ch, want, where, cut))


def head_block(eyebrow, headline):
    lines = "".join('<span class="hl">%s</span>' % t for t in headline)
    eb = '<span class="eyebrow">%s</span>' % eyebrow if eyebrow else ""
    return '    <div class="head">%s%s</div>' % (eb, lines)


def emit(m, spec, outdir):
    W = spec.get("canvas", {}).get("width", 780)
    H = spec.get("canvas", {}).get("height", 780)
    theme = spec.get("theme", {})
    scrim = theme.get("scrim", "6,14,4")
    accent = theme.get("accent", "#ffe14d")
    dur = float(m["duration"])
    ov = m.get("overlay") or {"kind": "alert-ring"}
    kind = ov.get("kind")
    if kind not in KINDS:
        raise SystemExit("unknown overlay kind: %s" % kind)

    assets = m.get("assets", {})
    if kind not in SELF_BG and "bg" not in assets:
        raise SystemExit(
            "%s: overlay kind '%s' renders over a background image but assets.bg is missing"
            % (m["id"], kind))
    for key, src in assets.items():
        if not pathlib.Path(src).exists():
            raise SystemExit("%s: asset '%s' not found: %s" % (m["id"], key, src))

    check_square(m["id"], spec, assets, ov)

    proj = outdir / m["id"]
    (proj / "assets").mkdir(parents=True, exist_ok=True)
    for key, src in assets.items():
        shutil.copy(src, proj / "assets" / ("%s.png" % key))
    if kind == "step-cuts":
        for i, s in enumerate(ov.get("steps", [])):
            shutil.copy(s["img"], proj / "assets" / ("step%d.png" % i))
    if kind == "wipe-compare":
        shutil.copy(ov["before"], proj / "assets" / "before.png")
        shutil.copy(ov["after"], proj / "assets" / "after.png")
    if kind == "frame-sequence":
        for i, f in enumerate(ov.get("frames", [])):
            shutil.copy(f, proj / "assets" / ("seq%02d.png" % i))

    ov_css, ov_body, ov_js = KINDS[kind](ov, dur, assets, W)

    scrims = '<div class="scrim-top"></div><div class="scrim-bot"></div>'
    if kind in SELF_BG:
        ov_body = ov_body.replace("__SCRIMS__", scrims)
        bg_layer = ""
    else:
        bg_layer = '    <img class="bg" src="assets/bg.png" alt="%s" />\n    %s\n' % (
            m.get("alt", ""), scrims)

    css = (FONT_FACE
           + BASE_CSS.replace("__W__", str(W)).replace("__H__", str(H))
                     .replace("__SCRIM__", scrim).replace("__ACCENT__", accent)
           + ov_css)

    html = (
        '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="UTF-8" />\n'
        '<meta name="viewport" content="width=%d, height=%d" />\n<title>%s</title>\n'
        '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>\n'
        '<style>%s</style>\n</head>\n<body>\n'
        '<div id="root" data-composition-id="main" data-start="0" data-width="%d"'
        ' data-height="%d" data-duration="%s">\n'
        '  <section id="scene-main" class="stage clip" data-start="0" data-duration="%s"'
        ' data-track-index="1">\n%s%s\n%s\n  </section>\n</div>\n'
        '<script>\nwindow.__timelines = window.__timelines || {};\n'
        'const tl = gsap.timeline({ paused: true });\n%s'
        'window.__timelines["main"] = tl;\n</script>\n</body>\n</html>\n'
        % (W, H, m["id"], css, W, H, dur, dur, bg_layer, ov_body,
           head_block(m.get("eyebrow", ""), m.get("headline", [])), ov_js))

    (proj / "index.html").write_text(html, encoding="utf-8")
    (proj / "hyperframes.json").write_text(
        json.dumps({"name": m["id"], "width": W, "height": H, "fps": 25}, indent=2),
        encoding="utf-8")
    return proj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec")
    ap.add_argument("--out")
    ap.add_argument("--schema", action="store_true")
    a = ap.parse_args()
    if a.schema:
        print(json.dumps(SCHEMA, ensure_ascii=False, indent=2))
        return
    if not a.spec or not a.out:
        ap.error("--spec and --out are required")

    spec = json.loads(pathlib.Path(a.spec).read_text(encoding="utf-8"))
    outdir = pathlib.Path(a.out)
    outdir.mkdir(parents=True, exist_ok=True)

    built, delegated = [], []
    for m in spec["motions"]:
        if m.get("engine", "hyperframes") != "hyperframes":
            delegated.append((m["id"], m.get("engine"), m.get("verb")))
            continue
        emit(m, spec, outdir)
        built.append(m["id"])
        print("built %-28s %s  %ss" % (m["id"], m.get("verb", ""), m["duration"]))

    for mid, eng, verb in delegated:
        print("DELEGATE %-25s -> %s  (%s)" % (mid, eng, verb), file=sys.stderr)
    print("hyperframes slots: %d | delegated: %d" % (len(built), len(delegated)))


if __name__ == "__main__":
    main()
