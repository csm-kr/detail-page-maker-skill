"""섹션을 합성·인코딩하고, 이미지를 전부 data: URI 로 박은 단독 실행 HTML 을 만든다."""
import base64, io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from composite import build_section
from PIL import Image

SECTIONS = sys.argv[1]
MEDIA = sys.argv[2]
OUT_HTML = sys.argv[3]
ANIM_Q = int(sys.argv[4])
STATIC_Q = int(sys.argv[5])
KEEP_DIR = sys.argv[6] if len(sys.argv) > 6 else None

TITLE = "프레손 PRESSON 2L 압축분무기"
DESC = "한 번 펌프질로 손가락 통증 없이 연속 분사되는 2L 압축분무기"

man = json.load(open(f"{SECTIONS}/manifest.json"))
parts, total = [], 0

for sec in man:
    res, dur = build_section(sec)
    buf = io.BytesIO()
    if dur is None:
        res.save(buf, format="WEBP", quality=STATIC_Q, method=6)
        size = res.size
        kind = "정적"
    else:
        res[0].save(buf, format="WEBP", save_all=True, append_images=res[1:],
                    duration=dur, loop=0, quality=ANIM_Q, method=4, minimize_size=True)
        size = res[0].size
        kind = f"ANIM {len(res)}f"
    data = buf.getvalue()
    total += len(data)
    if KEEP_DIR:
        os.makedirs(KEEP_DIR, exist_ok=True)
        open(f"{KEEP_DIR}/{sec['name']}.webp", "wb").write(data)
    b64 = base64.b64encode(data).decode()
    parts.append(f'<img src="data:image/webp;base64,{b64}" '
                 f'width="{size[0]}" height="{size[1]}" alt="" loading="eager">')
    print(f"{sec['name']:24} {kind:12} {size[0]}x{size[1]:<6} {len(data)/1048576:5.2f}MB")

html = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{TITLE}</title>
<meta name="description" content="{DESC}">
<style>
html{{background:#fff}}
body{{margin:0}}
.detail{{width:780px;max-width:100%;margin:0 auto;background:#fff;font-size:0}}
.detail img{{display:block;width:100%;height:auto}}
</style>
</head>
<body>
<div class="detail">
{chr(10).join(parts)}
</div>
</body>
</html>
"""
open(OUT_HTML, "w", encoding="utf-8").write(html)
hs = os.path.getsize(OUT_HTML)
print(f"\n이미지 원본 합계 {total/1048576:.2f}MB")
print(f"{OUT_HTML}  {hs/1048576:.2f}MB / 10MB  {'OK' if hs <= 10*1024*1024 else '초과'}")
