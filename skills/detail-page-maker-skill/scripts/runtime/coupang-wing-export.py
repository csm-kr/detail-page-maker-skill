"""Render the approved Studio page into a Coupang Wing asset package."""

import base64
import hashlib
import io
import json
import math
import os
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageChops, ImageDraw, features


PAGE_URL = os.environ["WING_PAGE_URL"]
OUTPUT_ROOT = Path(os.environ["WING_EXPORT_ROOT"]).resolve()
CDN_BASE_URL = os.environ["WING_CDN_BASE_URL"].rstrip("/")
EXPORT_ID = os.environ["WING_EXPORT_ID"]
PROJECT_KEY = os.environ["WING_PROJECT_KEY"]
PRODUCT_NAME = os.environ.get("WING_PRODUCT_NAME", "product").strip() or "product"
RECORDING_NAME = os.environ.get(
    "WING_RECORDING_NAME",
    "coupang-wing-export",
)
ASSET_ROOT = OUTPUT_ROOT / "assets"
VIEWPORT_WIDTH = 390
VIEWPORT_HEIGHT = 1200
DEVICE_SCALE_FACTOR = 2
OUTPUT_WIDTH = VIEWPORT_WIDTH * DEVICE_SCALE_FACTOR
MAX_ASSET_BYTES = 10 * 1024 * 1024
TRANSPARENT_PIXEL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4"
    "z8DwHwAFgAI/ScL+WQAAAABJRU5ErkJggg=="
)


def _attach_without_focus(target_id):
    wrapped = switch_tab
    inner = wrapped.__closure__[0].cell_contents if wrapped.__closure__ else wrapped
    private = inner.__globals__
    sid = cdp("Target.attachToTarget", targetId=target_id, flatten=True)["sessionId"]
    private["_send"](
        {
            "meta": "set_session",
            "session_id": sid,
            "target_id": target_id,
        }
    )
    private["_mark_tab"]()
    return sid


def new_background_tab(url="about:blank"):
    previous = current_tab()["targetId"]
    target_id = cdp(
        "Target.createTarget",
        url="about:blank",
        background=True,
    )["targetId"]
    _attach_without_focus(target_id)
    if url != "about:blank":
        goto_url(url)
        wait_for_load()
    return {"targetId": target_id, "previousTargetId": previous}


def close_background_tab(context):
    cdp("Target.closeTarget", targetId=context["targetId"])
    _attach_without_focus(context["previousTargetId"])


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_slug(value):
    slug = re.sub(r"[^a-z0-9-]+", "-", str(value).lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "section"


def read_url(url):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "DetailPageStudio-CoupangWing/1.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def load_animation(url):
    extension = Path(urlparse(url).path).suffix.lower()
    if extension not in {".gif", ".webp"}:
        return None
    body = read_url(url)
    with Image.open(io.BytesIO(body)) as source:
        frame_count = int(getattr(source, "n_frames", 1))
        if frame_count < 2:
            return None
        frames = []
        durations = []
        loop = int(source.info.get("loop", 0) or 0)
        for index in range(frame_count):
            source.seek(index)
            durations.append(max(20, int(source.info.get("duration", 100) or 100)))
            frames.append(source.convert("RGBA").copy())
    return {
        "url": url,
        "frames": frames,
        "durations": durations,
        "duration_ms": sum(durations),
        "loop": loop,
    }


def fit_frame(source, width, height, object_fit):
    source = source.convert("RGBA")
    if object_fit == "fill":
        return source.resize((width, height), Image.Resampling.LANCZOS)
    if object_fit == "none":
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.alpha_composite(
            source,
            ((width - source.width) // 2, (height - source.height) // 2),
        )
        return canvas
    scale_x = width / source.width
    scale_y = height / source.height
    scale = max(scale_x, scale_y) if object_fit == "cover" else min(scale_x, scale_y)
    if object_fit == "scale-down":
        scale = min(1.0, min(scale_x, scale_y))
    resized = source.resize(
        (
            max(1, round(source.width * scale)),
            max(1, round(source.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    if object_fit == "cover":
        left = max(0, (resized.width - width) // 2)
        top = max(0, (resized.height - height) // 2)
        return resized.crop((left, top, left + width, top + height))
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((width - resized.width) // 2, (height - resized.height) // 2),
    )
    return canvas


def rounded_mask(width, height, radii, opacity):
    mask = Image.new("L", (width, height), 255)
    draw = ImageDraw.Draw(mask)
    top_left, top_right, bottom_right, bottom_left = [
        max(0, min(round(radius), width // 2, height // 2))
        for radius in radii
    ]
    corners = (
        (
            top_left,
            (0, 0, top_left, top_left),
            (0, 0, top_left * 2, top_left * 2),
            (180, 270),
        ),
        (
            top_right,
            (width - top_right, 0, width, top_right),
            (width - top_right * 2, 0, width, top_right * 2),
            (270, 360),
        ),
        (
            bottom_right,
            (width - bottom_right, height - bottom_right, width, height),
            (
                width - bottom_right * 2,
                height - bottom_right * 2,
                width,
                height,
            ),
            (0, 90),
        ),
        (
            bottom_left,
            (0, height - bottom_left, bottom_left, height),
            (0, height - bottom_left * 2, bottom_left * 2, height),
            (90, 180),
        ),
    )
    for radius, square, circle, angles in corners:
        if radius:
            draw.rectangle(square, fill=0)
            draw.pieslice(circle, angles[0], angles[1], fill=255)
    if opacity < 1:
        mask = mask.point(lambda value: round(value * opacity))
    return mask


def composite_frame(base, animation_items, elapsed_ms):
    composed = base.convert("RGBA")
    for item in animation_items:
        animation = item["animation"]
        position = elapsed_ms % animation["duration_ms"]
        frame_index = 0
        cursor = 0
        for index, duration in enumerate(animation["durations"]):
            cursor += duration
            if position < cursor:
                frame_index = index
                break
        layout = item["layout"]
        if layout["transform"] not in {"", "none"}:
            raise RuntimeError(
                f"Animated image transforms are not supported: {layout['transform']}"
            )
        x = round(layout["x"] + layout["borderLeft"])
        y = round(layout["y"] + layout["borderTop"])
        width = max(
            1,
            round(
                layout["width"]
                - layout["borderLeft"]
                - layout["borderRight"]
            ),
        )
        height = max(
            1,
            round(
                layout["height"]
                - layout["borderTop"]
                - layout["borderBottom"]
            ),
        )
        radii = (
            layout["radiusTopLeft"]
            - max(layout["borderLeft"], layout["borderTop"]),
            layout["radiusTopRight"]
            - max(layout["borderRight"], layout["borderTop"]),
            layout["radiusBottomRight"]
            - max(layout["borderRight"], layout["borderBottom"]),
            layout["radiusBottomLeft"]
            - max(layout["borderLeft"], layout["borderBottom"]),
        )
        fitted = fit_frame(
            animation["frames"][frame_index],
            width,
            height,
            layout["objectFit"],
        )
        mask = ImageChops.multiply(
            fitted.getchannel("A"),
            rounded_mask(width, height, radii, layout["opacity"]),
        )
        composed.paste(fitted.convert("RGB"), (x, y), mask)
    return composed.convert("RGB")


def save_animated_webp(frames, durations, output_path):
    if not features.check("webp"):
        raise RuntimeError("Pillow does not support WebP")
    if len(frames) < 2 or len(frames) != len(durations):
        raise RuntimeError(
            "Animated WebP requires at least two frames with matching durations"
        )
    for quality in (82, 76, 70, 64):
        frames[0].save(
            output_path,
            format="WEBP",
            save_all=True,
            append_images=frames[1:],
            duration=durations,
            loop=0,
            quality=quality,
            method=6,
            minimize_size=True,
            allow_mixed=True,
        )
        with Image.open(output_path) as encoded:
            encoded_frame_count = int(getattr(encoded, "n_frames", 1))
        if encoded_frame_count < 2:
            raise RuntimeError(
                "Pillow flattened the animated WebP during encoding"
            )
        if output_path.stat().st_size < MAX_ASSET_BYTES:
            return quality
    raise RuntimeError(f"Animated WebP exceeds 10MiB: {output_path.name}")


def capture_viewport_png():
    last_error = None
    for _ in range(3):
        try:
            screenshot = cdp(
                "Page.captureScreenshot",
                format="png",
                fromSurface=True,
                captureBeyondViewport=False,
            )
            return Image.open(
                io.BytesIO(base64.b64decode(screenshot["data"]))
            ).convert("RGB")
        except Exception as error:
            last_error = error
            time.sleep(0.25)
    raise last_error


def capture_section(section_id):
    geometry = js(
        f"""(() => {{
          const page = document.querySelector('#detailPage');
          const sections = Array.from(
            page.querySelectorAll(':scope > section[data-section]')
          );
          for (const section of sections) {{
            section.style.display =
              section.dataset.section === {json.dumps(section_id)}
                ? ''
                : 'none';
          }}
          const section = sections.find(
            item => item.dataset.section === {json.dumps(section_id)}
          );
          section.hidden = false;
          section.style.width = '390px';
          section.style.maxWidth = '390px';
          section.style.boxSizing = 'border-box';
          for (const details of section.querySelectorAll('details')) {{
            details.open = true;
          }}
          window.scrollTo(0, 0);
          const rect = section.getBoundingClientRect();
          return {{
            left: rect.left + window.scrollX,
            top: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
            documentHeight: document.documentElement.scrollHeight
          }};
        }})()"""
    )
    width = round(geometry["width"])
    height = math.ceil(geometry["height"])
    if width != VIEWPORT_WIDTH:
        raise RuntimeError(
            f"Section width must be 780px, got {width}: {section_id}"
        )
    section_left = round(geometry["left"])
    section_top = round(geometry["top"])
    composite = Image.new(
        "RGB",
        (OUTPUT_WIDTH, height * DEVICE_SCALE_FACTOR),
    )
    for offset in range(0, height, VIEWPORT_HEIGHT):
        remaining = min(VIEWPORT_HEIGHT, height - offset)
        desired_y = section_top + offset
        current_document_height = int(
            js("document.documentElement.scrollHeight")
        )
        max_scroll = max(0, current_document_height - VIEWPORT_HEIGHT)
        scroll_y = min(max(0, desired_y), max_scroll)
        js(
            f"document.documentElement.style.scrollBehavior='auto';"
            f"window.scrollTo(0, {scroll_y}); window.scrollY;"
        )
        time.sleep(0.12)
        viewport = capture_viewport_png()
        crop_top = (desired_y - scroll_y) * DEVICE_SCALE_FACTOR
        crop_left = section_left * DEVICE_SCALE_FACTOR
        crop_width = VIEWPORT_WIDTH * DEVICE_SCALE_FACTOR
        crop_height = remaining * DEVICE_SCALE_FACTOR
        if (
            crop_left < 0
            or crop_left + crop_width > viewport.width
            or crop_top < 0
            or crop_top + crop_height > viewport.height
        ):
            raise RuntimeError(
                f"Screenshot crop is outside viewport: {section_id}"
            )
        crop = viewport.crop(
            (
                crop_left,
                crop_top,
                crop_left + crop_width,
                crop_top + crop_height,
            )
        )
        composite.paste(
            crop,
            (0, offset * DEVICE_SCALE_FACTOR),
        )
    return composite


def wing_html(assets, local=False):
    lines = ['<div align="center">']
    for asset in assets:
        source = (
            f"assets/{asset['filename']}"
            if local
            else asset["cdn_url"]
        )
        lines.append(
            f'  <img src="{source}" width="780" '
            f'alt="{asset["alt"]}"><br>'
        )
    lines.append("</div>")
    return "\n".join(lines) + "\n"


def main():
    if not CDN_BASE_URL.startswith("https://"):
        raise RuntimeError("WING_CDN_BASE_URL must start with https://")
    ASSET_ROOT.mkdir(parents=True, exist_ok=False)
    recording_active = False
    context = None
    try:
        recording = start_recording(
            RECORDING_NAME,
            title=f"{PRODUCT_NAME} Coupang Wing export",
        )
        recording_active = True
        context = new_background_tab(PAGE_URL)
        if js("document.hasFocus()"):
            raise RuntimeError("Focus safety failure")
        cdp(
            "Emulation.setDeviceMetricsOverride",
            width=VIEWPORT_WIDTH,
            height=VIEWPORT_HEIGHT,
            deviceScaleFactor=DEVICE_SCALE_FACTOR,
            mobile=False,
        )
        js(
            """(() => {
              document.documentElement.style.scrollBehavior = 'auto';
              document.documentElement.style.scrollbarWidth = 'none';
              const style = document.createElement('style');
              style.dataset.wingExport = 'true';
              style.textContent =
                'html::-webkit-scrollbar{display:none!important}' +
                'html,body{margin:0!important;padding:0!important;' +
                'width:390px!important;max-width:390px!important;' +
                'overflow-x:hidden!important}' +
                '#detailPage{margin:0!important;width:390px!important;' +
                'max-width:390px!important;box-shadow:none!important}';
              document.head.append(style);
            })()"""
        )
        loaded = False
        for _ in range(600):
            loaded = js(
                "Array.from(document.images).every("
                "image => image.complete && image.naturalWidth > 0)"
            )
            if loaded:
                break
            time.sleep(0.1)
        if not loaded:
            raise RuntimeError("Images did not finish loading")
        time.sleep(0.4)

        catalog = js(
            """(() => {
              const page = document.querySelector('#detailPage');
              return Array.from(
                page.querySelectorAll(':scope > section[data-section]')
              ).filter(section => {
                const style = getComputedStyle(section);
                return !section.hidden && style.display !== 'none';
              }).map((section, index) => ({
                order: index + 1,
                id: section.dataset.section || `section-${index + 1}`,
                heading:
                  section.querySelector('h1,h2,h3')?.textContent
                    .replace(/\\s+/g, ' ').trim() || '',
                images: Array.from(section.querySelectorAll('img')).map(
                  (image, imageIndex) => ({
                    imageIndex,
                    src: image.currentSrc || image.src,
                    alt: image.getAttribute('alt') || ''
                  })
                )
              }));
            })()"""
        )
        if not catalog:
            raise RuntimeError("No visible detail page sections found")

        url_cache = {}
        results = []
        for item in catalog:
            section_id = item["id"]
            js(
                f"""(() => {{
                  const page = document.querySelector('#detailPage');
                  for (const section of page.querySelectorAll(
                    ':scope > section[data-section]'
                  )) {{
                    section.style.display =
                      section.dataset.section === {json.dumps(section_id)}
                        ? ''
                        : 'none';
                  }}
                  const section = page.querySelector(
                    ':scope > section[data-section={json.dumps(section_id)}]'
                  );
                  section.hidden = false;
                  window.scrollTo(0, 0);
                }})()"""
            )
            animation_items = []
            for image in item["images"]:
                url = image["src"]
                if url not in url_cache:
                    url_cache[url] = load_animation(url)
                if url_cache[url]:
                    animation_items.append(
                        {
                            "imageIndex": image["imageIndex"],
                            "animation": url_cache[url],
                        }
                    )

            if animation_items:
                indices = [item["imageIndex"] for item in animation_items]
                layouts = js(
                    f"""(() => {{
                      const section = document.querySelector(
                        '#detailPage > section[data-section={json.dumps(section_id)}]'
                      );
                      const sectionRect = section.getBoundingClientRect();
                      const number = value => Number.parseFloat(value) || 0;
                      return {json.dumps(indices)}.map(imageIndex => {{
                        const image = section.querySelectorAll('img')[imageIndex];
                        const rect = image.getBoundingClientRect();
                        const style = getComputedStyle(image);
                        const originalStyle = image.getAttribute('style') || '';
                        image.dataset.wingOriginalStyle = originalStyle;
                        image.style.boxSizing = 'border-box';
                        image.style.width = `${{rect.width}}px`;
                        image.style.height = `${{rect.height}}px`;
                        return {{
                          imageIndex,
                          x: rect.left - sectionRect.left,
                          y: rect.top - sectionRect.top,
                          width: rect.width,
                          height: rect.height,
                          borderLeft: number(style.borderLeftWidth),
                          borderTop: number(style.borderTopWidth),
                          borderRight: number(style.borderRightWidth),
                          borderBottom: number(style.borderBottomWidth),
                          radiusTopLeft: number(style.borderTopLeftRadius),
                          radiusTopRight: number(style.borderTopRightRadius),
                          radiusBottomRight: number(
                            style.borderBottomRightRadius
                          ),
                          radiusBottomLeft: number(
                            style.borderBottomLeftRadius
                          ),
                          objectFit: style.objectFit || 'fill',
                          opacity: number(style.opacity) || 1,
                          transform: style.transform || 'none'
                        }};
                      }});
                    }})()"""
                )
                layout_map = {
                    layout["imageIndex"]: layout for layout in layouts
                }
                for animation_item in animation_items:
                    scaled_layout = layout_map[
                        animation_item["imageIndex"]
                    ]
                    for key in (
                        "x",
                        "y",
                        "width",
                        "height",
                        "borderLeft",
                        "borderTop",
                        "borderRight",
                        "borderBottom",
                        "radiusTopLeft",
                        "radiusTopRight",
                        "radiusBottomRight",
                        "radiusBottomLeft",
                    ):
                        scaled_layout[key] *= DEVICE_SCALE_FACTOR
                    animation_item["layout"] = scaled_layout
                js(
                    f"""(async () => {{
                      const section = document.querySelector(
                        '#detailPage > section[data-section={json.dumps(section_id)}]'
                      );
                      const indices = {json.dumps(indices)};
                      await Promise.all(indices.map(async imageIndex => {{
                        const image = section.querySelectorAll('img')[imageIndex];
                        image.src = {json.dumps(TRANSPARENT_PIXEL)};
                        await image.decode();
                      }}));
                    }})()"""
                )

            base = capture_section(section_id)
            output_filename = f"section-{item['order']:02d}.webp"
            output_path = ASSET_ROOT / output_filename
            if animation_items:
                master = max(
                    animation_items,
                    key=lambda animation_item: animation_item[
                        "animation"
                    ]["duration_ms"],
                )["animation"]
                elapsed = 0
                frames = []
                for duration in master["durations"]:
                    frames.append(
                        composite_frame(base, animation_items, elapsed)
                    )
                    elapsed += duration
                quality = save_animated_webp(
                    frames,
                    master["durations"],
                    output_path,
                )
                with Image.open(output_path) as encoded:
                    output_frames = int(getattr(encoded, "n_frames", 1))
                kind = "animated"
                duration_ms = sum(master["durations"])
                loop_count = 0
            else:
                base.save(
                    output_path,
                    format="WEBP",
                    quality=90,
                    method=6,
                )
                quality = 90
                output_frames = 1
                duration_ms = 0
                loop_count = None
                kind = "static"

            if output_path.stat().st_size >= MAX_ASSET_BYTES:
                raise RuntimeError(
                    f"WebP exceeds 10MiB: {output_filename}"
                )
            alt = (
                item["heading"]
                or next(
                    (
                        image["alt"]
                        for image in item["images"]
                        if image["alt"].strip()
                    ),
                    "",
                )
                or f"{PRODUCT_NAME} detail image {item['order']}"
            )
            alt = re.sub(r"\s+", " ", alt).strip()[:120]
            result = {
                "order": item["order"],
                "asset_id": section_id,
                "filename": output_filename,
                "kind": kind,
                "format": "webp",
                "mime_type": "image/webp",
                "width": OUTPUT_WIDTH,
                "height": base.height,
                "frames": output_frames,
                "duration_ms": duration_ms,
                "loop_count": loop_count,
                "quality": quality,
                "bytes": output_path.stat().st_size,
                "megabytes": round(
                    output_path.stat().st_size / 1024 / 1024,
                    3,
                ),
                "under_10mb": True,
                "sha256": sha256(output_path),
                "cdn_url": f"{CDN_BASE_URL}/{output_filename}",
                "alt": alt,
            }
            results.append(result)
            print(
                f"WING_ASSET_OK {item['order']:02d} {section_id} "
                f"{kind} {VIEWPORT_WIDTH}x{base.height}",
                flush=True,
            )

        production_html = wing_html(results, local=False)
        local_html = wing_html(results, local=True)
        (OUTPUT_ROOT / "coupang-wing-detail-780.html").write_text(
            production_html,
            encoding="utf-8",
        )
        (OUTPUT_ROOT / "preview-local-780.html").write_text(
            local_html,
            encoding="utf-8",
        )
        manifest = {
            "schema_version": "2.0",
            "export_id": EXPORT_ID,
            "project_key": PROJECT_KEY,
            "product": PRODUCT_NAME,
            "delivery_format": "coupang-wing-image-only-html",
            "cdn_base_url": CDN_BASE_URL,
            "generated_at": datetime.now(timezone.utc).isoformat(
                timespec="seconds"
            ),
            "assets": results,
            "local_qa": {
                "asset_count": len(results),
                "all_width_780": all(
                    asset["width"] == OUTPUT_WIDTH for asset in results
                ),
                "all_under_10mb": all(
                    asset["under_10mb"] for asset in results
                ),
                "wing_img_count": production_html.count("<img "),
                "wing_disallowed_markup_count": sum(
                    production_html.lower().count(token)
                    for token in (
                        "<style",
                        "<script",
                        "<svg",
                        "<iframe",
                        "<video",
                        "<canvas",
                        " class=",
                        " style=",
                    )
                ),
                "wing_non_https_image_count": sum(
                    not asset["cdn_url"].startswith("https://")
                    for asset in results
                ),
            },
            "remote_verification": {
                "status": "pending",
                "message": (
                    "Upload to the CDN, then verify HTTP, MIME, cache, and SHA-256."
                ),
            },
        }
        (OUTPUT_ROOT / "cdn-upload-manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        readme = f"""# {PRODUCT_NAME} Coupang Wing package

- Planned CDN URL: `{CDN_BASE_URL}`
- Assets: {len(results)} flattened WebP files
- Wing HTML: `coupang-wing-detail-780.html`
- Local preview: `preview-local-780.html`
- Remote verification: pending

Upload `assets/` to the planned CDN URL, then verify HTTP 200, `image/webp`,
immutable caching, and SHA-256 before publishing.
"""
        (OUTPUT_ROOT / "README.md").write_text(readme, encoding="utf-8")
        result = {
            "outputRoot": str(OUTPUT_ROOT),
            "assetCount": len(results),
            "staticCount": sum(
                asset["kind"] == "static" for asset in results
            ),
            "animatedCount": sum(
                asset["kind"] == "animated" for asset in results
            ),
            "cdnBaseUrl": CDN_BASE_URL,
            "recording": recording,
            "remoteVerification": "pending",
        }
        print(
            "WING_EXPORT_RESULT "
            + json.dumps(result, ensure_ascii=False),
            flush=True,
        )
    finally:
        if recording_active:
            stop_recording()
        if context is not None:
            close_background_tab(context)


main()
