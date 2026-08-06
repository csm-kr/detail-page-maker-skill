// 후보 파일 찾기.
//
// 생성기가 쓰는 이름과 발행이 찾는 이름이 갈릴 수 있다 — 생성기는 순번(`frame-000.png`)으로,
// 발행은 컷 id(`cut-01.png`)로 부른다. 판정 기록이 실제로 연 파일의 경로를 들고 있으므로
// 그것을 1급으로 쓰고, 없을 때만 컷 id 규약으로 되돌아간다.

import path from "node:path";

/** 회차 폴더 기준 상대 경로를 준다. 회차 밖을 가리키면 거부한다. */
export function stillSource(entry, stageRel) {
  if (typeof entry.file !== "string" || entry.file.trim() === "") {
    return path.join(stageRel, `${entry.cut}.png`);
  }
  const rel = path.normalize(entry.file.split("/").join(path.sep));
  if (path.isAbsolute(rel) || rel.split(path.sep)[0] === "..") {
    throw new Error(`STILL_SOURCE_OUTSIDE ${entry.cut} 의 file 이 회차 밖을 가리킨다: ${entry.file}`);
  }
  return rel;
}
