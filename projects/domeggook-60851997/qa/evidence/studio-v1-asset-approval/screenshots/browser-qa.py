import base64
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


def click_button(name_fragment):
    nodes = cdp("Accessibility.getFullAXTree")["nodes"]
    for node in nodes:
        role = (node.get("role") or {}).get("value", "")
        name = (node.get("name") or {}).get("value", "")
        if role == "button" and name_fragment in name:
            backend_id = node.get("backendDOMNodeId")
            if not backend_id:
                continue
            quad = cdp("DOM.getBoxModel", backendNodeId=backend_id)["model"]["content"]
            x = sum(quad[0::2]) / 4
            y = sum(quad[1::2]) / 4
            click_at_xy(x, y)
            time.sleep(0.45)
            return name
    raise RuntimeError(f"button not found: {name_fragment}")


def capture_lightweight(path):
    result = cdp(
        "Page.captureScreenshot",
        format="jpeg",
        quality=62,
        fromSurface=True,
        captureBeyondViewport=False,
    )
    with open(path, "wb") as output:
        output.write(base64.b64decode(result["data"]))


url = "http://127.0.0.1:8898/studio.html"
output_dir = r"C:\Users\csm81\Desktop\detail-page-maker-skill\.scratch\studio-v1-asset-approval"
recording_dir = start_recording(
    "domeggook-60851997-studio-v1-approval",
    title="Novaface Studio v1 asset approval QA",
)
context = new_background_tab(url)

try:
    if js("document.hasFocus()"):
        raise RuntimeError("focus-safety failure: background target became focused")

    cdp(
        "Emulation.setDeviceMetricsOverride",
        width=1200,
        height=760,
        deviceScaleFactor=1,
        mobile=False,
        screenWidth=1200,
        screenHeight=760,
    )
    time.sleep(1.2)

    edit = js("""
    (() => {
      const frame = document.querySelector('#preview');
      const doc = frame.contentDocument;
      const rect = frame.getBoundingClientRect();
      return {
        title: document.title,
        previewWidth: Math.round(rect.width),
        previewHeight: Math.round(rect.height),
        nav: [...document.querySelectorAll('[data-studio-view]')].map((el) => el.textContent.trim()),
        pageTitle: doc?.title || '',
        pageSections: doc?.querySelectorAll('[data-section]').length || 0,
        pageImages: doc?.images.length || 0,
        bodyTextIncludesUserCopy: (doc?.body?.innerText || '').includes('\\uc785\\uccb4 \\uc5d0\\uc5b4\\uc140'),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    })()
    """)
    capture_lightweight(f"{output_dir}\\studio-v1-edit.jpg")

    click_button("\uc5d0\uc14b \uc2b9\uc778")
    approval = js("""
    (() => ({
      view: document.querySelector('.app').querySelector('[data-workspace="approval"]').hidden ? 'hidden' : 'approval',
      emptyCopy: document.querySelector('#assetReviewGrid').innerText.trim(),
      pending: document.querySelector('#pendingAssetCount').textContent,
      approved: document.querySelector('#approvedAssetCount').textContent,
      rejected: document.querySelector('#rejectedAssetCount').textContent,
      status: document.querySelector('#status').textContent,
    }))()
    """)
    capture_lightweight(f"{output_dir}\\studio-v1-approval.jpg")

    click_button("\ucd5c\uc885 \ucd9c\ub825")
    time.sleep(0.5)
    output = js("""
    (() => ({
      view: document.querySelector('[data-workspace="output"]').hidden ? 'hidden' : 'output',
      gateCopy: document.querySelector('#outputGate').textContent.trim(),
      exportDisabled: document.querySelector('#exportHtml').disabled,
      summary: document.querySelector('#outputSummary').innerText.trim(),
    }))()
    """)
    capture_lightweight(f"{output_dir}\\studio-v1-output.jpg")

    print(json.dumps({
        "recording_dir": recording_dir,
        "focus": False,
        "edit": edit,
        "approval": approval,
        "output": output,
    }, ensure_ascii=False))
finally:
    stop_recording()
    close_background_tab(context)
