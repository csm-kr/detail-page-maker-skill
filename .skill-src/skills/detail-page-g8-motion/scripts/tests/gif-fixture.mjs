// 지연이 주어진 1×1 GIF 를 바이트로 만든다. 테스트 전용.
//
// 픽스처가 `"GIF89a\n"` 같은 흉내였을 때는 속도를 잴 수 없었다. 게이트가 파일을
// 실제로 열어 재는 이상, 픽스처도 실제 GIF 여야 한다.

import { framePacing } from "../lib/gifasm.mjs";

/** @param delaysCs 프레임마다의 지연 (1/100초) */
export function fakeGif(delaysCs) {
  const bytes = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00, // 1×1
    0x80, 0x00, 0x00, // 전역 색표 있음(2색)
    0xff, 0xff, 0xff, 0x00, 0x00, 0x00,
  ];
  for (const cs of delaysCs) {
    bytes.push(0x21, 0xf9, 0x04, 0x00, cs & 0xff, (cs >> 8) & 0xff, 0x00, 0x00);
    bytes.push(0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00);
    bytes.push(0x02, 0x02, 0x4c, 0x01, 0x00);
  }
  bytes.push(0x3b);
  return Buffer.from(bytes);
}

/**
 * 정상 경로 픽스처. **우리 조립기가 실제로 내는 지연**을 그대로 쓴다 —
 * 손으로 고른 숫자를 두면 조립기와 하한이 갈렸을 때 테스트가 알려주지 않는다.
 * 장면 기준으로 만들어 보간·장면 양쪽 잣대를 모두 통과한다.
 */
export const PACED_GIF = fakeGif(
  framePacing(6, { scenes: true }).map((ms) => Math.round(ms / 10)),
);
