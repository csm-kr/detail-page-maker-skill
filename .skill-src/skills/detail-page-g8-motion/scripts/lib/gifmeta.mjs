// 구운 GIF 를 **열어서** 프레임마다의 지연을 읽는다.
//
// 계획이 아니라 결과를 잰다. 3회차에 브리프에는 "천천히 드러난다" 라고 적혀 있었고
// 실제 파일은 0.48초에 세 장면이 지나갔다. 브리프를 읽는 검사로는 못 잡는다.
//
// GIF89a 블록을 직접 걷는다. ffprobe 에 기대지 않는 이유는 두 가지다 —
// 게이트가 외부 실행 파일 없이 돌아야 하고, 단위 테스트가 바이트로 재현돼야 한다.

/** 그래픽 제어 확장의 지연은 1/100초 단위다. */
const CS_TO_MS = 10;

/**
 * @returns {{frames:number, delaysMs:number[], totalMs:number, firstMs:number, lastMs:number}}
 */
export function readGifTiming(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length < 13 || bytes.subarray(0, 3).toString("ascii") !== "GIF") {
    throw new Error("NOT_A_GIF 앞 세 바이트가 GIF 가 아니다");
  }

  let at = 6;
  const packed = bytes[at + 4];
  at += 7;
  if (packed & 0x80) at += 3 * 2 ** ((packed & 0x07) + 1); // 전역 색표

  /** 서브블록 사슬을 지나간다. 길이 0 바이트가 끝이다. */
  const skipSubBlocks = () => {
    while (at < bytes.length) {
      const size = bytes[at++];
      if (size === 0) return;
      at += size;
    }
  };

  const delaysMs = [];
  let pending = null; // 바로 뒤 이미지에 붙을 지연

  while (at < bytes.length) {
    const marker = bytes[at++];

    if (marker === 0x3b) break; // 종료

    if (marker === 0x21) {
      const label = bytes[at++];
      if (label === 0xf9) {
        const size = bytes[at++];
        pending = size >= 4 ? bytes.readUInt16LE(at + 1) * CS_TO_MS : 0;
        at += size;
        skipSubBlocks();
      } else {
        skipSubBlocks(); // 주석·응용(NETSCAPE 반복)·평문 — 프레임이 아니다
      }
      continue;
    }

    if (marker === 0x2c) {
      const local = bytes[at + 8];
      at += 9;
      if (local & 0x80) at += 3 * 2 ** ((local & 0x07) + 1); // 지역 색표
      at += 1; // LZW 최소 코드 크기
      skipSubBlocks();
      delaysMs.push(pending ?? 0);
      pending = null;
      continue;
    }

    break; // 모르는 바이트. 여기서 멈춘다 — 추측해서 세지 않는다
  }

  return {
    frames: delaysMs.length,
    delaysMs,
    totalMs: delaysMs.reduce((sum, ms) => sum + ms, 0),
    firstMs: delaysMs[0] ?? 0,
    lastMs: delaysMs[delaysMs.length - 1] ?? 0,
  };
}
