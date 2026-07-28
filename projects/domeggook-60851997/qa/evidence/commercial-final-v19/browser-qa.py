import json
import time


def _attach_without_focus(target_id):
    wrapped = switch_tab
    inner = wrapped.__closure__[0].cell_contents if wrapped.__closure__ else wrapped
    private = inner.__globals__
    sid = cdp("Target.attachToTarget", targetId=target_id, flatten=True)["sessionId"]
    private["_send"]({
        "meta": "set_session",
        "session_id": sid,
        "target_id": target_id,
    })
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


url = "http://127.0.0.1:8765/prototypes/domeggook-60851997/detail-page/index.html?v=20"
out_dir = r"C:\Users\csm81\Desktop\detail-page-maker-skill\.scratch\qa\v19-three-fixes\browser-360"
recording_dir = start_recording("novaface-v19-three-fixes", title="노바페이스 구조 모션 v19 360px QA")
context = new_background_tab(url)

try:
    focused = js("document.hasFocus()")
    if focused:
        raise RuntimeError("focus-safety failure: background target became focused")

    cdp(
        "Emulation.setDeviceMetricsOverride",
        width=360,
        height=800,
        deviceScaleFactor=1,
        mobile=True,
        screenWidth=360,
        screenHeight=800,
    )
    js("document.documentElement.style.scrollBehavior='auto'; document.body.style.scrollBehavior='auto'")
    time.sleep(1)

    diagnostics = js("""
    (() => {
      const ids = ['GIF-AIR-CELL', 'GIF-FLEX', 'GIF-ARCH-SUPPORT'];
      const images = ids.map((id) => {
        const el = document.querySelector(`[data-asset-id="${id}"]`);
        const section = el?.closest('[data-section]');
        return {
          id,
          src: el?.getAttribute('src') || '',
          currentSrc: el?.currentSrc || '',
          complete: Boolean(el?.complete),
          naturalWidth: el?.naturalWidth || 0,
          naturalHeight: el?.naturalHeight || 0,
          section: section?.dataset.section || '',
          sectionTop: section ? Math.round(section.offsetTop) : -1,
          sectionHeight: section ? Math.round(section.offsetHeight) : -1,
          overflowX: section ? section.scrollWidth - section.clientWidth : 0,
        };
      });
      return {
        viewport: { width: innerWidth, height: innerHeight },
        pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        images,
      };
    })()
    """)

    for item in diagnostics["images"]:
        section_id = item["section"]
        js(f"""
        (() => {{
          const el = document.querySelector('[data-section="{section_id}"]');
          window.scrollTo(0, Math.max(0, el.offsetTop - 12));
        }})()
        """)
        time.sleep(0.9)
        capture_screenshot(fr"{out_dir}\{section_id}-a.png")
        time.sleep(1.2)
        capture_screenshot(fr"{out_dir}\{section_id}-b.png")

    print(json.dumps({
        "recording_dir": recording_dir,
        "focused": focused,
        "diagnostics": diagnostics,
    }, ensure_ascii=False))
finally:
    stop_recording()
    close_background_tab(context)
