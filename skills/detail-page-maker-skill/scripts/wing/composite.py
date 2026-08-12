"""섹션 스크린샷의 애니메이션 자리에 원본 프레임을 합성해 780px 완성형 WebP를 만든다.

애니메이션 img 를 서로 다른 두 단색 C1=#FF00FF, C2=#00FF00 으로 칠해 두 번 캡처하면
  A = a*C1 + rest,  B = a*C2 + rest
이므로 a = (A - B) / (C1 - C2), rest = A - a*C1 로 알파와 배경을 정확히 분리한다.
경계 안티앨리어싱과 위에 겹친 반투명 요소까지 그대로 보존된다. (PIL 만 사용)
"""
import json, os, sys
from PIL import Image, ImageChops

SECTIONS = sys.argv[1] if len(sys.argv) > 1 else "sections"
MEDIA = sys.argv[2] if len(sys.argv) > 2 else "wing-upload"


def load_frames(path):
    im = Image.open(path)
    frames, dur = [], im.info.get("duration", 100)
    try:
        while True:
            frames.append(im.convert("RGB").copy())
            im.seek(im.tell() + 1)
    except EOFError:
        pass
    return frames, dur


def fit(frame, w, h, mode):
    """CSS object-fit 재현."""
    if mode == "fill":
        return frame.resize((w, h), Image.LANCZOS)
    sw, sh = frame.size
    scale = max(w / sw, h / sh) if mode == "cover" else min(w / sw, h / sh)
    nw, nh = max(1, round(sw * scale)), max(1, round(sh * scale))
    r = frame.resize((nw, nh), Image.LANCZOS)
    if mode == "contain":
        canvas = Image.new("RGB", (w, h), (255, 255, 255))
        canvas.paste(r, ((w - nw) // 2, (h - nh) // 2))
        return canvas
    left, top = (nw - w) // 2, (nh - h) // 2
    return r.crop((left, top, left + w, top + h))


def matte(a_png, b_png):
    """알파(L 이미지)와 배경 rest(RGB 채널 튜플)를 복원한다."""
    ar, ag, ab = Image.open(a_png).convert("RGB").split()
    br, bg, bb = Image.open(b_png).convert("RGB").split()
    # C1-C2 = (+255, -255, +255) 이므로 양의 방향인 R, B 채널 두 개를 평균낸다
    alpha = ImageChops.add(ImageChops.subtract(ar, br),
                           ImageChops.subtract(ab, bb), scale=2)
    rest = (ImageChops.subtract(ar, alpha), ag, ImageChops.subtract(ab, alpha))
    return alpha, rest


def build_section(sec, step=1):
    name = sec["name"]
    if not sec["boxes"]:
        return Image.open(f"{SECTIONS}/{name}.png").convert("RGB"), None

    alpha, rest = matte(f"{SECTIONS}/{name}-m1.png", f"{SECTIONS}/{name}-m2.png")
    W, H = alpha.size

    layers = []
    for b in sec["boxes"]:
        # 미디어가 media/gifs, media/images 하위에 있으므로 src 상대경로를 그대로 쓴다
        frames, dur = load_frames(f"{MEDIA}/{b['src']}")
        layers.append((b, frames[::step], dur * step))
    n = max(len(f) for _, f, _ in layers)
    duration = layers[0][2]

    out = []
    for i in range(n):
        canvas = Image.new("RGB", (W, H), (0, 0, 0))
        for b, frames, _ in layers:
            canvas.paste(fit(frames[i % len(frames)], round(b["w"]), round(b["h"]), b["fit"]),
                         (round(b["x"]), round(b["y"])))
        # merged = alpha*fg + rest  (multiply 는 a*b/255 이므로 그대로 alpha 배가 된다)
        chans = [ImageChops.add(ImageChops.multiply(c, alpha), r)
                 for c, r in zip(canvas.split(), rest)]
        out.append(Image.merge("RGB", chans))
    return out, duration
