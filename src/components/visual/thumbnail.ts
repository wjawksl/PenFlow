// ⑨ 소제목(H2) 썸네일 Canvas 합성 (M3 WP4, 10.3). 배경 위에 소제목 텍스트 합성.
// 텍스트 줄바꿈은 순수 함수(wrapLines)로 분리해 테스트 가능하게 두고,
// 실제 픽셀 렌더(renderH2Thumbnail)는 DOM/Canvas 필요 → 오프스크린에서만 호출한다.

export interface ThumbStyle {
  bg: string;
  fg: string;
}
export const DEFAULT_THUMB_STYLE: ThumbStyle = { bg: '#1f2937', fg: '#f9fafb' };

// 재인코딩 옵션(WP5). quality=JPEG 압축률(10.6), dedup=중복 회피 노이즈(R-7.4).
export interface RenderOpts {
  quality?: number; // 0~1, 없으면 DEFAULT_QUALITY
  dedup?: boolean; // 기본 ON — 매 렌더 고유 바이트(네이버 중복 이미지 회피)
}
export const DEFAULT_QUALITY = 0.85;

export const THUMB_W = 800;
export const THUMB_H = 420;

/**
 * 공백 단위 단어를 fits(line)==true 인 동안 모아 줄로 만든다. 순수 함수(fits 주입 → 테스트 용이).
 * 한 단어가 단독으로도 안 맞으면 그 단어만으로 한 줄(그대로 오버플로 허용).
 */
export function wrapLines(text: string, fits: (line: string) => boolean): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && !fits(next)) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob 실패'))),
      'image/jpeg',
      quality,
    );
  });
}

// #rrggbb → [r,g,b]. 파싱 실패 시 어두운 회색 폴백.
function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x1f2937;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 중복 회피(R-7.4) — 모서리(배경 영역) 픽셀 1개에 배경색 ±3 변이를 준다.
 * 육안 비구분이지만 JPEG DCT 블록이 바뀌어 같은 캡션·스타일도 매 렌더 고유 바이트가 된다.
 * (Canvas 재인코딩 자체가 EXIF 등 메타데이터를 제거하므로 별도 처리 불필요.)
 */
function applyDedupNoise(ctx: CanvasRenderingContext2D, bg: string): void {
  const [r, g, b] = parseHex(bg);
  const clamp = (v: number): number => Math.max(0, Math.min(255, v));
  const jitter = (): number => Math.floor(Math.random() * 7) - 3; // -3..3
  ctx.fillStyle = `rgb(${clamp(r + jitter())},${clamp(g + jitter())},${clamp(b + jitter())})`;
  ctx.fillRect(Math.floor(Math.random() * 8), Math.floor(Math.random() * 8), 1, 1);
}

/** 배경색 채우고 소제목 텍스트를 중앙 정렬·줄바꿈해 합성 → JPEG Blob. DOM 필요(오프스크린 전용). */
export async function renderH2Thumbnail(
  caption: string,
  style: ThumbStyle,
  opts: RenderOpts = {},
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d 컨텍스트를 얻지 못했습니다.');

  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  const pad = 56;
  const fontSize = 46;
  ctx.fillStyle = style.fg;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxW = THUMB_W - pad * 2;
  const lines = wrapLines(caption, (l) => ctx.measureText(l).width <= maxW);
  const lineH = fontSize * 1.35;
  let y = THUMB_H / 2 - ((lines.length - 1) * lineH) / 2;
  for (const line of lines) {
    ctx.fillText(line, THUMB_W / 2, y);
    y += lineH;
  }

  if (opts.dedup !== false) applyDedupNoise(ctx, style.bg);
  return canvasToBlob(canvas, opts.quality ?? DEFAULT_QUALITY);
}
