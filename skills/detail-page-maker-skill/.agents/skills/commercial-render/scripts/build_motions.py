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
               o.get("beforeLabel", "설치 전"), o.get("afterLabel", "설치 후")))
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
        body += ('    <div class="mcard" id="mk%d" style="top:%dpx">'
                 '<b class="mv" id="mv%d">0%s</b>'
                 '<span class="ml">%s</span>%s</div>\n'
                 % (i, y, i, m.get("unit", ""), m.get("label", ""),
                    ('<span class="mc">%s</span>' % cond) if cond else ""))
        t = 0.3 + i * 0.5
        if i == 0:
            js += 'tl.set("#mk0", { opacity: 1 }, 0);\n'
        else:
            js += ('tl.to("#mk%d", { opacity: 1, duration: .35, ease: "power2.out" }, %.2f);\n'
                   % (i, t))
        js += ('(function(){ const o = { v: 0 };\n'
               '  tl.to(o, { v: %s, duration: 1.0, ease: "power2.out",\n'
               '    onUpdate: () => { document.getElementById("mv%d").textContent ='
               ' o.v.toFixed(%d) + "%s"; } }, %.2f); })();\n'
               % (m["value"], i, int(m.get("decimals", 0)), m.get("unit", ""), t + 0.1))
    js += 'tl.to(".mcard", { opacity: 0, duration: .4, ease: "power1.in" }, %.2f);\n' % (dur - 0.5)
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


KINDS = {
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
