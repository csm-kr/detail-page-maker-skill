"""도매꾹 상품 하나를 수집하는 Browser Harness 실행 코드다.

CDP 도우미가 미리 주입된 browser-harness 안에서 이 파일을 실행한다.
"""

import base64
import io
import json
import math
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


config_path = os.environ.get("DMK_CAPTURE_CONFIG")
if not config_path:
    raise RuntimeError("DMK_CAPTURE_CONFIG가 필요합니다.")
config = json.loads(Path(config_path).read_text(encoding="utf-8"))
sys.path.insert(0, config["skill_scripts_dir"])
from gif_frames import MAX_GIF_BYTES, extract_gif_frames, is_gif_bytes

PRODUCT_URL = config["product_url"]
PRODUCT_ID = config["product_id"]
OUTPUT_ROOT = Path(config["output_root"])
RESULT_PATH = Path(config["result_path"])
REVIEW_LIMIT = int(config.get("review_limit") or 0)
THUMBNAIL_PATH = OUTPUT_ROOT / "thumbnail" / "thumbnail.png"
DETAIL_PATH = OUTPUT_ROOT / "detail" / "detail-page.png"
DETAIL_ASSETS_ROOT = OUTPUT_ROOT / "detail" / "assets"
PAGE_JSON_PATH = OUTPUT_ROOT / "page.json"
REVIEWS_JSON_PATH = OUTPUT_ROOT / "reviews" / "reviews.json"


def atomic_write_bytes(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def atomic_write_json(path, data):
    atomic_write_bytes(path, (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def ax_value(node, key):
    return (node.get(key) or {}).get("value") or ""


def find_ax_node(name_fragment=None, preferred_role=None):
    candidates = []
    for node in cdp("Accessibility.getFullAXTree").get("nodes", []):
        if not node.get("backendDOMNodeId"):
            continue
        if name_fragment and name_fragment not in ax_value(node, "name"):
            continue
        candidates.append(node)
    if preferred_role:
        preferred = [node for node in candidates if ax_value(node, "role") == preferred_role]
        if preferred:
            return preferred[0]
    return candidates[0] if candidates else None


def click_ax_node(node):
    backend_id = node["backendDOMNodeId"]
    cdp("DOM.scrollIntoViewIfNeeded", backendNodeId=backend_id)
    time.sleep(0.4)
    quad = cdp("DOM.getBoxModel", backendNodeId=backend_id)["model"]["content"]
    click_at_xy(sum(quad[0::2]) / 4, sum(quad[1::2]) / 4)


def lazy_scroll_to_bottom():
    initial = js("({height:document.documentElement.scrollHeight,viewport:window.innerHeight})")
    previous_height = int(initial["height"])
    stable_rounds = 0
    steps = 0
    while stable_rounds < 3 and steps < 120:
        current = js("({height:document.documentElement.scrollHeight,viewport:window.innerHeight,y:window.scrollY})")
        height = int(current["height"])
        viewport = int(current["viewport"])
        y = int(current["y"])
        next_y = min(y + max(700, int(viewport * 0.8)), max(0, height - viewport))
        js(f"window.scrollTo(0,{next_y})")
        time.sleep(0.2)
        steps += 1
        after = js("({height:document.documentElement.scrollHeight,viewport:window.innerHeight,y:window.scrollY})")
        after_height = int(after["height"])
        at_bottom = int(after["y"]) + int(after["viewport"]) >= after_height - 5
        if at_bottom:
            time.sleep(0.6)
            settled = int(js("document.documentElement.scrollHeight"))
            if settled == previous_height:
                stable_rounds += 1
            else:
                stable_rounds = 0
                previous_height = settled
        else:
            stable_rounds = 0
            previous_height = after_height
    final = js("({height:document.documentElement.scrollHeight,viewport:window.innerHeight,y:window.scrollY})")
    if stable_rounds < 3:
        raise RuntimeError("LAZY_LOAD_UNSTABLE: 제한된 스크롤 안에 문서가 안정되지 않았습니다.")
    return {
        "initial_document_height_px": int(initial["height"]),
        "document_height_px": int(final["height"]),
        "viewport_height_px": int(final["viewport"]),
        "final_scroll_y_px": int(final["y"]),
        "scroll_steps": steps,
        "stable_rounds": stable_rounds,
    }


def capture_png(clip):
    response = cdp("Page.captureScreenshot", format="png", fromSurface=True, captureBeyondViewport=True, clip=clip)
    return base64.b64decode(response["data"])


def capture_region_tiled(x, y, width, height, tile_height=7000):
    if width * height > 180_000_000:
        raise RuntimeError(f"DETAIL_TOO_LARGE: 캡처 픽셀 수가 안전 한도를 넘습니다: {width}x{height}")
    canvas = Image.new("RGB", (width, height), (255, 255, 255))
    tiles = []
    offset = 0
    while offset < height:
        current_height = min(tile_height, height - offset)
        png = capture_png({"x": float(x), "y": float(y + offset), "width": float(width), "height": float(current_height), "scale": 1})
        with Image.open(io.BytesIO(png)) as opened:
            tile = opened.convert("RGB")
            if tile.size != (width, current_height):
                raise RuntimeError(f"CAPTURE_VALIDATION_FAILED: 타일 크기 불일치 {tile.size} != {(width, current_height)}")
            canvas.paste(tile, (0, offset))
        tiles.append({"source_y": y + offset, "output_y": offset, "height": current_height})
        offset += current_height
    output = io.BytesIO()
    canvas.save(output, format="PNG", optimize=True)
    return output.getvalue(), tiles


def image_metrics():
    return js("""
    (() => {
      const image=document.querySelector('img');
      if(!image) return {found:false};
      const rect=image.getBoundingClientRect();
      return {found:image.complete&&image.naturalWidth>0,url:location.href,content_type:document.contentType,
        natural_width:image.naturalWidth,natural_height:image.naturalHeight,
        rendered_width:Math.round(rect.width),rendered_height:Math.round(rect.height),
        x:Math.round(rect.left+scrollX),y:Math.round(rect.top+scrollY)};
    })()
    """)


def read_current_gif_bytes(url, content_type):
    suspected = "image/gif" in str(content_type or "").casefold() or url.split("?", 1)[0].casefold().endswith(".gif")
    if not suspected:
        return None
    meta = js("""
    (async () => {
      const response=await fetch(location.href,{credentials:'same-origin'});
      if(!response.ok)return {ok:false,status:response.status,mime:response.headers.get('content-type')||''};
      const bytes=new Uint8Array(await response.arrayBuffer());
      window.__dmkGifBytes=bytes;
      return {ok:true,status:response.status,mime:response.headers.get('content-type')||'',size:bytes.length,
        magic:String.fromCharCode(...bytes.slice(0,6))};
    })()
    """)
    if not meta.get("ok"):
        raise RuntimeError(f"GIF_SOURCE_FETCH_FAILED: GIF 원본 응답을 읽지 못했습니다: {meta}")
    size = int(meta.get("size") or 0)
    if size < 6 or size > MAX_GIF_BYTES:
        js("delete window.__dmkGifBytes")
        raise RuntimeError(f"GIF_TOO_LARGE: GIF 원본 크기가 허용 범위를 벗어납니다: {size}")
    chunks = []
    try:
        for start in range(0, size, 256 * 1024):
            end = min(start + 256 * 1024, size)
            encoded = js(f"""
            (() => {{
              const bytes=window.__dmkGifBytes.subarray({start},{end});let binary='';
              for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
              return btoa(binary);
            }})()
            """)
            chunks.append(base64.b64decode(encoded))
    finally:
        js("delete window.__dmkGifBytes")
    data = b"".join(chunks)
    if len(data) != size or not is_gif_bytes(data):
        raise RuntimeError(f"GIF_SOURCE_INVALID: GIF 바이트 검증에 실패했습니다: size={len(data)}, meta={meta}")
    return {"bytes": data, "mime_type": str(meta.get("mime") or "image/gif"), "magic": data[:6].decode("ascii")}


def open_image_source_and_capture(url, expected_width, expected_height, *, split_detail_gif=False):
    new_tab(url)
    wait_for_load()
    time.sleep(1.0)
    metrics = image_metrics()
    opened_directly = bool(metrics.get("found"))
    if not opened_directly:
        new_tab("about:blank")
        wait_for_load()
        js("""
        (() => {
          document.documentElement.style.margin='0';document.body.style.margin='0';document.body.style.background='#fff';
          const image=document.createElement('img');image.src=%s;image.style.display='block';image.style.margin='0';document.body.appendChild(image);return true;
        })()
        """ % json.dumps(url))
        for _ in range(40):
            metrics = image_metrics()
            if metrics.get("found"):
                break
            time.sleep(0.2)
    if not metrics.get("found"):
        raise RuntimeError(f"원본 이미지를 렌더링하지 못했습니다: {url}")
    if int(metrics["natural_width"]) != int(expected_width) or int(metrics["natural_height"]) != int(expected_height):
        raise RuntimeError(f"CAPTURE_VALIDATION_FAILED: DOM과 원본 이미지 크기가 다릅니다: {metrics}")
    if int(metrics["rendered_width"]) != int(expected_width) or int(metrics["rendered_height"]) != int(expected_height):
        image_node = find_ax_node(preferred_role="image")
        if image_node:
            click_ax_node(image_node)
            time.sleep(0.7)
    js("window.scrollTo(0,0)")
    final = image_metrics()
    if int(final["rendered_width"]) != int(expected_width) or int(final["rendered_height"]) != int(expected_height):
        raise RuntimeError(f"CAPTURE_VALIDATION_FAILED: 이미지를 자연 크기로 열지 못했습니다: {final}")
    gif_source = read_current_gif_bytes(url, final.get("content_type")) if split_detail_gif else None
    if gif_source:
        final["source_asset_opened_directly"] = opened_directly
        final["tiles"] = []
        return None, final, gif_source
    png, tiles = capture_region_tiled(int(final["x"]), int(final["y"]), int(final["rendered_width"]), int(final["rendered_height"]))
    final["source_asset_opened_directly"] = opened_directly
    final["tiles"] = tiles
    return png, final, None


def choose_thumbnail(images):
    ranked = []
    for item in images:
        if not item.get("visible"):
            continue
        nw, nh = int(item.get("natural_width") or 0), int(item.get("natural_height") or 0)
        dw, dh = int(item.get("display_width") or 0), int(item.get("display_height") or 0)
        if min(nw, nh, dw, dh) < 250:
            continue
        joined = " ".join((item.get("alt") or "", item.get("src") or "", item.get("ancestor_hint") or "")).casefold()
        score = 0
        if "상품 섬네일 이미지" in joined or "상품 썸네일 이미지" in joined:
            score += 150
        score += 18 * sum(token in joined for token in ("thumblightbox", "gallery", "main", "product", "item", "goods", "thumb"))
        if PRODUCT_ID in joined:
            score += 25
        ratio = dw / max(dh, 1)
        if 0.8 <= ratio <= 1.25:
            score += 25
        score -= 90 * sum(token in joined for token in ("banner", "logo", "icon", "recommend", "notice", "공지", "렌즈", "광고"))
        ranked.append((score, item))
    ranked.sort(key=lambda row: row[0], reverse=True)
    if not ranked or ranked[0][0] < 60:
        raise RuntimeError("THUMBNAIL_NOT_FOUND: 대표 갤러리 원본을 확정하지 못했습니다.")
    return ranked[0][1]


def choose_detail_images(images):
    selected = []
    seen = set()
    excluded = ("notice", "policy", "공지", "배송안내", "교환", "반품", "recommend", "추천", "review", "후기", "위너", "banner", "logo")
    for item in sorted(images, key=lambda value: int(value.get("top") or 0)):
        src = str(item.get("src") or "")
        if not src or src in seen:
            continue
        width, height = int(item.get("natural_width") or 0), int(item.get("natural_height") or 0)
        joined = " ".join((item.get("alt") or "", src, item.get("ancestor_hint") or "")).casefold()
        if any(token in joined for token in excluded):
            continue
        inside = bool(item.get("within_detail_root"))
        if inside and width >= 500 and height >= 400:
            selected.append(item)
            seen.add(src)
    if not selected:
        for item in sorted(images, key=lambda value: int(value.get("top") or 0)):
            src = str(item.get("src") or "")
            width, height = int(item.get("natural_width") or 0), int(item.get("natural_height") or 0)
            joined = " ".join((item.get("alt") or "", src, item.get("ancestor_hint") or "")).casefold()
            if src and src not in seen and width >= 600 and height >= 1200 and int(item.get("top") or 0) >= 1500 and not any(token in joined for token in excluded):
                selected.append(item)
                seen.add(src)
    if not selected:
        raise RuntimeError("DETAIL_ASSET_NOT_FOUND: 판매자 상세설명 원본을 확정하지 못했습니다.")
    if sum(int(item.get("natural_height") or 0) for item in selected) > 120_000:
        raise RuntimeError("DETAIL_TOO_LARGE: 상세설명 총 높이가 안전 한도를 넘습니다.")
    return selected


def fetch_reviews(total):
    target = total if REVIEW_LIMIT == 0 else min(total, REVIEW_LIMIT)
    if target > 5000:
        raise RuntimeError("REVIEW_FETCH_FAILED: 후기 수가 5,000건을 넘어 명시적 제한이 필요합니다.")
    reviews = []
    pages = math.ceil(target / 10) if target else 0
    for page in range(1, pages + 1):
        payload = js("""
        (async () => {
          const u=new URL('/main/item/itemView/reviewAjax.php',location.origin);
          const params=%s;Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
          const response=await fetch(u,{credentials:'same-origin'});
          if(!response.ok) return {ok:false,status:response.status,content_type:response.headers.get('content-type')||''};
          const rows=await response.json();
          const clean=(value)=>{if(!value)return '';const e=document.createElement('div');e.innerHTML=String(value);return (e.innerText||e.textContent||'').replace(/\\s+/g,' ').trim();};
          const urls=(value)=>{const out=[];const walk=(v)=>{if(typeof v==='string'&&/^https?:\\/\\//i.test(v))out.push(v);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(value);return [...new Set(out)];};
          const rating={A:5,B:4,C:3,D:2,E:1};
          return {ok:true,status:response.status,rows:Array.isArray(rows)?rows.map(x=>({rating:rating[x.score]||null,content:clean(x.review),seller_reply:clean(x.reply)||null,date:String(x.date||''),premium:x.isPremium==='t',image_urls:urls(x.files)})):null};
        })()
        """ % json.dumps({"mode": "review", "itemNo": PRODUCT_ID, "sz": 10, "total": total, "pg": page}, ensure_ascii=False))
        if not payload.get("ok") or not isinstance(payload.get("rows"), list):
            raise RuntimeError(f"REVIEW_FETCH_FAILED: 후기 {page}페이지 응답이 올바르지 않습니다: {payload}")
        reviews.extend(payload["rows"])
        time.sleep(0.15)
    reviews = reviews[:target]
    if len(reviews) != target:
        raise RuntimeError(f"REVIEW_FETCH_FAILED: 표시 {total}건 중 목표 {target}건과 수집 {len(reviews)}건이 다릅니다.")
    for index, review in enumerate(reviews, 1):
        review["evidence_id"] = f"REVIEW-{index:04d}"
    return reviews


def fetch_score_summary(total):
    if total == 0:
        return {"average": None, "distribution_percent": {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0}}
    payload = js("""
    (async () => {
      const u=new URL('/main/item/itemView/reviewAjax.php',location.origin);
      const params=%s;Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
      const response=await fetch(u,{credentials:'same-origin'});if(!response.ok)return {ok:false,status:response.status};
      return {ok:true,body:await response.json()};
    })()
    """ % json.dumps({"mode": "score", "itemNo": PRODUCT_ID, "total": total}))
    if not payload.get("ok") or not isinstance(payload.get("body"), dict):
        raise RuntimeError(f"REVIEW_FETCH_FAILED: 별점 요약 응답이 올바르지 않습니다: {payload}")
    body = payload["body"]
    percent = lambda key: int(re.sub(r"[^0-9]", "", str(body.get(key) or "0")) or 0)
    return {"average": float(body["avr"]) if body.get("avr") else None, "distribution_percent": {"5": percent("percentA"), "4": percent("percentB"), "3": percent("percentC"), "2": percent("percentD"), "1": percent("percentE")}}


def assemble_detail_assets(captured):
    opened = []
    max_width = 0
    total_height = 0
    for item in captured:
        image = Image.open(io.BytesIO(item["png"])).convert("RGB")
        opened.append(image)
        max_width = max(max_width, image.width)
        total_height += image.height
    if max_width * total_height > 180_000_000:
        raise RuntimeError("DETAIL_TOO_LARGE: 조립 이미지 픽셀 수가 안전 한도를 넘습니다.")
    canvas = Image.new("RGB", (max_width, total_height), (255, 255, 255))
    y = 0
    for image in opened:
        canvas.paste(image, ((max_width - image.width) // 2, y))
        y += image.height
    output = io.BytesIO()
    canvas.save(output, format="PNG", optimize=True)
    return output.getvalue(), max_width, total_height


def relative_recording_path(recording_dir):
    try:
        return Path(recording_dir).resolve().relative_to(OUTPUT_ROOT.resolve()).as_posix()
    except ValueError:
        return str(recording_dir)


def run_capture(recording_dir):
    new_tab(PRODUCT_URL)
    wait_for_load()
    time.sleep(2.5)
    before = js("({url:location.href,title:document.title,height:document.documentElement.scrollHeight,body:(document.body.innerText||'').slice(0,7000)})")
    lowered = (before["title"] + " " + before["body"]).casefold()
    if any(token in lowered for token in ("access denied", "captcha", "접근이 제한", "로그인이 필요")):
        raise RuntimeError(f"PAGE_BLOCKED: 공개 상품 상세 접근이 제한되었습니다: {before['url']}")
    if PRODUCT_ID not in before["url"] or PRODUCT_ID not in before["body"]:
        raise RuntimeError(f"NOT_PRODUCT_DETAIL: 상품번호가 일치하는 상세페이지가 아닙니다: {before['url']}")

    expand_node = find_ax_node("상품상세 더보기", preferred_role="link")
    detail_expand = {"control_found": bool(expand_node), "clicked": False, "expanded": False, "before_document_height_px": int(before["height"])}
    if expand_node:
        click_ax_node(expand_node)
        time.sleep(1.5)
        after_height = int(js("document.documentElement.scrollHeight"))
        collapse_node = find_ax_node("상품상세 접기", preferred_role="link")
        detail_expand.update({"clicked": True, "expanded": bool(collapse_node) or after_height > int(before["height"]) + 50, "after_click_document_height_px": after_height, "collapse_label_found": bool(collapse_node)})
        if not detail_expand["expanded"]:
            raise RuntimeError("DETAIL_EXPAND_FAILED: 상품상세 더보기 확장을 검증하지 못했습니다.")

    scroll_metrics = lazy_scroll_to_bottom()
    js("window.scrollTo(0,0)")
    time.sleep(0.4)
    structured = js(r"""
    (() => {
      const text=e=>(e?.innerText||e?.textContent||'').trim();
      const absoluteTop=e=>Math.round(e.getBoundingClientRect().top+scrollY);
      const detailRoots=Array.from(document.querySelectorAll('#lInfoView .lInfoViewItemContents,#lInfoViewItemContents,[class~="lInfoViewItemContents"]'));
      const images=Array.from(document.images).map((element,index)=>{
        const rect=element.getBoundingClientRect();const ancestors=[];let current=element.parentElement;
        for(let i=0;current&&i<6;i++,current=current.parentElement)ancestors.push(`${current.tagName}#${current.id||''}.${String(current.className||'')}`);
        return {index,alt:element.alt||'',src:element.currentSrc||element.src||'',natural_width:element.naturalWidth||0,natural_height:element.naturalHeight||0,
          display_width:Math.round(rect.width),display_height:Math.round(rect.height),top:Math.round(rect.top+scrollY),visible:rect.width>0&&rect.height>0,
          ancestor_hint:ancestors.join(' '),within_detail_root:detailRoots.some(root=>root.contains(element))};
      }).filter(item=>item.src);
      const sticky=Array.from(document.querySelectorAll('#lStickyTabList a,a')).map(text).find(value=>/^구매후기\s*\([0-9,]+\)/.test(value))||'';
      const match=sticky.match(/구매후기\s*\(([0-9,]+)\)/);
      const body=(document.body.innerText||'');
      const permission=body.match(/상세설명 이미지 사용여부\s*\n?\s*([^\n]+)/);
      const productName=(document.querySelector('h1')&&text(document.querySelector('h1'))) || document.title.replace(/\s*\|.*$/,'').trim();
      return {url:location.href,title:document.title,lang:document.documentElement.lang||null,product_name:productName,images,
        review_total:match?parseInt(match[1].replace(/,/g,''),10):0,detail_root_count:detailRoots.length,
        image_usage_observation:permission?permission[1].trim():null};
    })()
    """)
    if not detail_expand["control_found"]:
        has_large_detail = any(bool(item.get("within_detail_root")) and int(item.get("natural_height") or 0) >= 1000 for item in structured["images"])
        if not has_large_detail:
            raise RuntimeError("DETAIL_EXPAND_FAILED: 더보기 제어도 없고 펼친 상세설명도 확인되지 않았습니다.")
        detail_expand["expanded"] = True
        detail_expand["reason"] = "control_absent_but_expanded_detail_present"

    thumbnail_source = choose_thumbnail(structured["images"])
    detail_sources = choose_detail_images(structured["images"])
    review_total = int(structured["review_total"])
    reviews = fetch_reviews(review_total)
    score_summary = fetch_score_summary(review_total)
    target_reviews = review_total if REVIEW_LIMIT == 0 else min(review_total, REVIEW_LIMIT)
    reviews_payload = {"schema_version": "1.0", "product_id": PRODUCT_ID, "source_page_url": structured["url"],
        "scope": "public_purchase_reviews_recent_six_months", "visible_review_count": review_total,
        "requested_review_limit": REVIEW_LIMIT, "captured_review_count": len(reviews), "complete": len(reviews) == target_reviews,
        "author_identifiers_removed": True, "rating_summary": score_summary, "reviews": reviews}
    atomic_write_json(REVIEWS_JSON_PATH, reviews_payload)

    thumbnail_png, thumbnail_metrics, _ = open_image_source_and_capture(
        thumbnail_source["src"],
        thumbnail_source["natural_width"],
        thumbnail_source["natural_height"],
        split_detail_gif=False,
    )
    atomic_write_bytes(THUMBNAIL_PATH, thumbnail_png)

    captured_detail = []
    detail_metadata = []
    animated_gif_count = 0
    total_gif_frames = 0
    for index, source in enumerate(detail_sources, 1):
        is_strict_detail_asset = bool(source.get("within_detail_root"))
        png, metrics, gif_source = open_image_source_and_capture(
            source["src"],
            source["natural_width"],
            source["natural_height"],
            split_detail_gif=is_strict_detail_asset,
        )
        animation = None
        if gif_source:
            asset_path = DETAIL_ASSETS_ROOT / f"detail-{index:02d}.gif"
            atomic_write_bytes(asset_path, gif_source["bytes"])
            animation = extract_gif_frames(
                gif_source["bytes"],
                OUTPUT_ROOT / "detail" / "gif-frames" / f"detail-{index:02d}",
                OUTPUT_ROOT,
                filename_prefix="frame",
            )
            png = animation.pop("first_frame_png")
            animation.update({"mime_type": gif_source["mime_type"], "magic": gif_source["magic"]})
            animated_gif_count += 1
            total_gif_frames += int(animation["frame_count"])
        else:
            asset_path = DETAIL_ASSETS_ROOT / f"detail-{index:02d}.png"
            atomic_write_bytes(asset_path, png)
        captured_detail.append({"png": png})
        detail_metadata.append({"order": index, "source_asset_url": source["src"], "width_px": int(metrics["natural_width"]),
            "height_px": int(metrics["natural_height"]), "source_asset_opened_directly": bool(metrics["source_asset_opened_directly"]),
            "media_type": "image/gif" if gif_source else "image/png", "animated_gif": bool(gif_source),
            "tile_count": len(metrics["tiles"]), "tiles": metrics["tiles"], "path": asset_path.relative_to(OUTPUT_ROOT).as_posix(),
            "animation": animation})
    detail_png, detail_width, detail_height = assemble_detail_assets(captured_detail)
    atomic_write_bytes(DETAIL_PATH, detail_png)

    captured_at = datetime.now(timezone.utc).isoformat()
    page_payload = {"schema_version": "1.0", "source_id": f"DMK-{PRODUCT_ID}", "requested_url": PRODUCT_URL,
        "final_url": structured["url"], "product_id": PRODUCT_ID, "page_type": "product_detail", "opened_detail_page": True,
        "title": structured["title"], "product_name": structured["product_name"], "lang": structured["lang"], "captured_at": captured_at,
        "browser_mode": "isolated_headless_browser_harness", "browser_harness_recording_dir": relative_recording_path(recording_dir),
        "detail_expand": detail_expand, "lazy_load_scroll_completed": True, "scroll_metrics": scroll_metrics,
        "image_usage_observation": structured["image_usage_observation"],
        "thumbnail_source": {"source_region": "detail_page_primary_gallery", "source_asset_url": thumbnail_source["src"],
            "width_px": int(thumbnail_metrics["natural_width"]), "height_px": int(thumbnail_metrics["natural_height"]),
            "source_asset_opened_directly": bool(thumbnail_metrics["source_asset_opened_directly"]), "page_ui_overlay_excluded": True,
            "gif_frame_split_applied": False},
        "detail_content_capture": {"capture_scope": "expanded_seller_product_detail", "asset_count": len(detail_metadata),
            "assembled_path": DETAIL_PATH.relative_to(OUTPUT_ROOT).as_posix(), "assembled_width_px": detail_width,
            "assembled_height_px": detail_height, "page_chrome_excluded": True, "assets": detail_metadata},
        "animation_summary": {"target_scope": "expanded_seller_product_detail_only",
            "animated_gif_count": animated_gif_count,
            "detail_animated_gif_count": animated_gif_count,
            "numbered_frame_count": total_gif_frames},
        "review_capture": {"visible_review_count": review_total, "captured_review_count": len(reviews), "complete": len(reviews) == target_reviews,
            "author_identifiers_removed": True, "path": REVIEWS_JSON_PATH.relative_to(OUTPUT_ROOT).as_posix()}}
    atomic_write_json(PAGE_JSON_PATH, page_payload)
    result = {"status": "SUCCESS", "captured_at": captured_at, "final_url": structured["url"], "product_id": PRODUCT_ID,
        "recording_dir": relative_recording_path(recording_dir), "visible_review_count": review_total,
        "captured_review_count": len(reviews), "review_complete": len(reviews) == target_reviews,
        "animated_gif_count": animated_gif_count,
        "numbered_gif_frame_count": total_gif_frames}
    atomic_write_json(RESULT_PATH, result)
    print(json.dumps(result, ensure_ascii=False))


OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
recording_dir = start_recording(f"dmk-{PRODUCT_ID}-extract", title=f"도매꾹 {PRODUCT_ID} 썸네일·상세페이지·후기 추출")
try:
    run_capture(recording_dir)
except Exception as exc:
    atomic_write_json(RESULT_PATH, {"status": "FAILURE", "product_id": PRODUCT_ID, "failed_at": datetime.now(timezone.utc).isoformat(), "reason": str(exc)})
    raise
finally:
    try:
        stop_recording()
    except Exception as stop_error:
        print(f"recording cleanup warning: {stop_error}")
