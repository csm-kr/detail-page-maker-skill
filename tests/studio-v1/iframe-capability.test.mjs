import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const PARENT_RUNTIME = new URL(
  "../../skills/detail-page-maker-skill/assets/studio-v1-runtime/studio-v1.js",
  import.meta.url,
);

async function createSaveRelayFixture() {
  const source = await readFile(PARENT_RUNTIME, "utf8");
  const start = source.indexOf("let pendingSaveRequest = null;");
  const end = source.indexOf("function renderEditingState()");
  assert.ok(start >= 0 && end > start, "save relay source must be present");
  const relaySource = source.slice(start, end);
  const posted = [];
  const apiCalls = [];
  const scheduled = new Map();
  let timerId = 0;
  const context = vm.createContext({
    Uint8Array,
    Array,
    Date,
    String,
    crypto: {
      getRandomValues(bytes) {
        bytes.forEach((_value, index) => {
          bytes[index] = index + 1;
        });
        return bytes;
      },
    },
    preview: {
      contentWindow: {
        postMessage(message) {
          posted.push(structuredClone(message));
        },
      },
    },
    saveButton: { disabled: false },
    statusNode: { textContent: "" },
    setTimeout(callback) {
      timerId += 1;
      scheduled.set(timerId, callback);
      return timerId;
    },
    clearTimeout(id) {
      scheduled.delete(id);
    },
    async api(pathname, options) {
      apiCalls.push({
        pathname,
        options: structuredClone(options),
      });
      return {
        backup_id: "backup-1",
        wing_export_required: true,
      };
    },
  });
  vm.runInContext(relaySource, context);
  return { context, posted, apiCalls, scheduled };
}

test("child serialization은 사용자 Save가 만든 exact one-time nonce가 있을 때만 parent API를 호출한다", async () => {
  const fixture = await createSaveRelayFixture();
  const html =
    "<!doctype html><html><body><main id=\"detailPage\">수정본</main></body></html>";
  const savedAt = "2026-07-30T03:00:00.000Z";

  await vm.runInContext(
    `saveSerializedAuthoring(${JSON.stringify({
      nonce: "a".repeat(48),
      html,
      savedAt,
    })})`,
    fixture.context,
  );
  assert.equal(fixture.apiCalls.length, 0);

  vm.runInContext("requestAuthoringSave()", fixture.context);
  assert.equal(fixture.posted.length, 1);
  assert.equal(
    fixture.posted[0].type,
    "DETAIL_SERIALIZE_REQUEST",
  );
  assert.match(fixture.posted[0].nonce, /^[a-f0-9]{48}$/);
  assert.equal(fixture.context.saveButton.disabled, true);
  const nonce = fixture.posted[0].nonce;

  await vm.runInContext(
    `saveSerializedAuthoring(${JSON.stringify({
      nonce: "f".repeat(48),
      html,
      savedAt,
    })})`,
    fixture.context,
  );
  assert.equal(fixture.apiCalls.length, 0);

  await vm.runInContext(
    `saveSerializedAuthoring(${JSON.stringify({
      nonce,
      html,
      savedAt,
    })})`,
    fixture.context,
  );
  assert.equal(fixture.apiCalls.length, 1);
  assert.equal(
    fixture.apiCalls[0].pathname,
    "/api/v1/output/save",
  );
  assert.deepEqual(
    JSON.parse(fixture.apiCalls[0].options.body),
    { html },
  );
  assert.equal(fixture.context.saveButton.disabled, false);
  assert.equal(fixture.posted.at(-1).type, "DETAIL_SAVE_RESULT");
  assert.equal(fixture.posted.at(-1).nonce, nonce);
  assert.equal(fixture.posted.at(-1).ok, true);

  await vm.runInContext(
    `saveSerializedAuthoring(${JSON.stringify({
      nonce,
      html: html.replace("수정본", "재전송"),
      savedAt,
    })})`,
    fixture.context,
  );
  assert.equal(fixture.apiCalls.length, 1);
});
