import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
);
const repositoryRoot = path.dirname(testsRoot);
const suite = String(process.argv[2] || "").trim();
if (!/^[a-z0-9-]+$/u.test(suite)) {
  throw new Error("테스트 suite 이름이 필요합니다.");
}
const suiteRoot = path.join(testsRoot, suite);
const files = (await readdir(suiteRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => path.join(suiteRoot, entry.name))
  .sort((left, right) => left.localeCompare(right, "en"));
if (files.length === 0) {
  throw new Error(`테스트 파일이 없습니다: ${suiteRoot}`);
}

const child = spawn(process.execPath, ["--test", ...files], {
  cwd: repositoryRoot,
  env: process.env,
  shell: false,
  stdio: "inherit",
  windowsHide: true,
});
child.once("error", (error) => {
  throw error;
});
child.once("close", (code, signal) => {
  if (signal) {
    process.stderr.write(`테스트가 signal ${signal}로 종료됐습니다.\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
