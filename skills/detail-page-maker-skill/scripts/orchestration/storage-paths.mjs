import path from "node:path";

export const WORKFLOW_STORAGE_SEGMENTS = Object.freeze([
  ".detail-page",
  "workflow",
]);

export const WORKFLOW_STORAGE_LOCATOR = ".detail-page/workflow";

export function resolveWorkflowStorage(projectRoot, ...segments) {
  return path.resolve(
    projectRoot,
    ...WORKFLOW_STORAGE_SEGMENTS,
    ...segments,
  );
}
