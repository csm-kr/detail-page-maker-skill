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


def click_button(name_fragment, pause=0.35):
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
            time.sleep(pause)
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


url = "http://127.0.0.1:8920/studio.html"
output_dir = r"C:\Users\csm81\Desktop\detail-page-maker-skill\.scratch\studio-v1-asset-approval"
recording_dir = start_recording(
    "studio-v1-real-approval-action",
    title="Studio v1 real approval action QA",
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
    time.sleep(0.8)
    click_button("\uc5d0\uc14b \uc2b9\uc778")
    time.sleep(0.8)

    before = js("""
    (() => ({
      pending: document.querySelector('#pendingAssetCount').textContent,
      title: document.querySelector('.asset-card h2')?.textContent || '',
      approvalButton: document.querySelector('.asset-card .approve')?.textContent || '',
      gateLocked: document.querySelector('#exportHtml').disabled,
    }))()
    """)
    js("window.confirm = () => true")
    click_button("\uc774 \uc5d0\uc14b \uc2b9\uc778", pause=0.1)
    time.sleep(1.2)

    click_button("\ucd5c\uc885 \ucd9c\ub825")
    time.sleep(0.45)
    after = js("""
    (() => ({
      pending: document.querySelector('#pendingAssetCount').textContent,
      approved: document.querySelector('#approvedAssetCount').textContent,
      exportDisabled: document.querySelector('#exportHtml').disabled,
      gateCopy: document.querySelector('#outputGate').textContent.trim(),
      status: document.querySelector('#status').textContent,
    }))()
    """)
    print(json.dumps({
        "recording_dir": recording_dir,
        "focus": False,
        "before": before,
        "after": after,
    }, ensure_ascii=True))
finally:
    stop_recording()
    close_background_tab(context)
