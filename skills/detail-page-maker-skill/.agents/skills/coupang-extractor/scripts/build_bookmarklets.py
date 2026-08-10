from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
from urllib.parse import quote

from capture_tools import utc_now, write_json_atomic


SCRIPT_DIR = Path(__file__).resolve().parent
COLLECTORS = {
    "thumbnail": ("thumbnail-collector.js", "CoupangExtractorThumbnail", {"maxItems": 50, "itemTimeoutMs": 5000}),
    "detail": ("detail-collector.js", "CoupangExtractorDetail", {"maxSteps": 75, "maxMs": 60000}),
    "reviews": (
        "review-collector.js",
        "CoupangExtractorReviews",
        {
            "maxLatestPages": 12,
            "maxSupplementPages": 24,
            "latestReviews": 100,
            "supplementReviews": 100,
            "pageTimeoutMs": 7000,
        },
    ),
}


def _manual_wrapper(common: str, collector: str, global_name: str, options: dict, kind: str) -> str:
    option_json = json.dumps(options, ensure_ascii=False, separators=(",", ":"))
    return f"""(async()=>{{
{common}
{collector}
const result=await globalThis.{global_name}.collect({option_json});
const text=JSON.stringify(result,null,2);
const product=(result.product&&result.product.product_id)||'unknown';
const item=(result.product&&result.product.item_id)||'unknown';
const filename=`coupang-${{product}}-${{item}}-{kind}.json`;
let delivered='clipboard';
try{{
  if(text.length>500000) throw new Error('PAYLOAD_TOO_LARGE');
  await navigator.clipboard.writeText(text);
}}catch(_error){{
  delivered='file';
  const blob=new Blob([text],{{type:'application/json;charset=utf-8'}});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}}
alert(`쿠팡 {kind} 수집 완료: ${{result.status}} (${{delivered==='clipboard'?'클립보드 복사':'JSON 파일 저장'}})`);
return result;
}})()"""


def build_bookmarklets(output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    common = (SCRIPT_DIR / "browser-common.js").read_text(encoding="utf-8")
    entries = []
    for kind, (filename, global_name, options) in COLLECTORS.items():
        collector = (SCRIPT_DIR / filename).read_text(encoding="utf-8")
        source = _manual_wrapper(common, collector, global_name, options, kind)
        href = "javascript:" + quote(source, safe="")
        txt_path = output_dir / f"coupang-{kind}-bookmarklet.txt"
        txt_path.write_text(href + "\n", encoding="utf-8", newline="\n")
        entries.append(
            {
                "kind": kind,
                "label": {"thumbnail": "쿠팡 썸네일 추출", "detail": "쿠팡 상세 추출", "reviews": "쿠팡 후기 추출"}[kind],
                "href": href,
                "href_length": len(href),
                "file": txt_path.name,
            }
        )
    links = "\n".join(
        f'<li><a href="{html.escape(entry["href"], quote=True)}">{html.escape(entry["label"])}</a> '
        f'<small>({entry["href_length"]:,} chars)</small></li>'
        for entry in entries
    )
    page = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>쿠팡 추출 북마클릿</title>
<style>body{{font:16px/1.6 system-ui;max-width:760px;margin:48px auto;padding:0 20px}}li{{margin:18px 0}}a{{font-weight:700}}code{{background:#f2f4f7;padding:2px 5px}}</style></head>
<body><h1>쿠팡 추출 북마클릿</h1>
<p>아래 링크 세 개를 Chrome 북마크바로 끌어 놓으세요. 같은 직접 상품 URL에서 썸네일 → 상세 → 후기 순서로 각각 한 번 실행합니다.</p>
<ol>{links}</ol>
<p>작은 결과는 클립보드에 복사되고 큰 결과는 JSON 파일로 저장됩니다. CAPTCHA·로그인·Access Denied가 보이면 중단하세요.</p>
</body></html>
"""
    (output_dir / "coupang-bookmarklets.html").write_text(page, encoding="utf-8", newline="\n")
    manifest = {"generated_at": utc_now(), "entries": [{k: v for k, v in entry.items() if k != "href"} for entry in entries]}
    write_json_atomic(output_dir / "bookmarklets-manifest.json", manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="쿠팡 썸네일·상세·후기 북마클릿 설치 페이지를 만듭니다.")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = build_bookmarklets(args.output.resolve())
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
