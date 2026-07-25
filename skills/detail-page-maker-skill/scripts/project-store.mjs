import {
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export function createProjectStore(projectRoot) {
  const root = path.resolve(projectRoot);
  const statePath = path.join(root, "project.json");
  const studioDir = path.join(root, ".studio");
  const eventsPath = path.join(studioDir, "events.ndjson");
  let queue = Promise.resolve();

  async function load() {
    const raw = await readFile(statePath, "utf8");
    const state = JSON.parse(raw);
    if (state.schemaVersion !== 1) {
      throw new Error(`지원하지 않는 project schema: ${state.schemaVersion}`);
    }
    return state;
  }

  async function persist(state) {
    await mkdir(studioDir, { recursive: true });
    const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempPath, statePath);
  }

  async function appendEvent(type, payload, state) {
    const event = {
      id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      projectId: state.id,
      revisionId: state.currentRevisionId,
      at: new Date().toISOString(),
    };
    await appendFile(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }

  function mutate(type, payload, command) {
    const operation = queue.then(async () => {
      const state = await load();
      const result = await command(state);
      await persist(state);
      const event = await appendEvent(type, payload, state);
      return { state, result, event };
    });
    queue = operation.catch(() => undefined);
    return operation;
  }

  async function snapshot() {
    const state = await load();
    return structuredClone(state);
  }

  return {
    root,
    load,
    mutate,
    snapshot,
  };
}
