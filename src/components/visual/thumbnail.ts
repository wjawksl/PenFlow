// ⑨ 소제목(H2) 썸네일 Canvas 합성 (M3 WP4, 10.3). 배경 위에 소제목 텍스트 합성.
// 텍스트 줄바꿈은 순수 함수(wrapLines)로 분리해 테스트 가능하게 두고,
// 실제 픽셀 렌더(renderH2Thumbnail)는 DOM/Canvas 필요 → 오프스크린에서만 호출한다.

export interface ThumbStyle {
  bg: string;
  fg: string;
}
export const DEFAULT_THUMB_STYLE: ThumbStyle = { bg: '#1f2937', fg: '#f9fafb' };

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

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob 실패'))),
      'image/jpeg',
      0.9,
    );
  });
}

/** 배경색 채우고 소제목 텍스트를 중앙 정렬·줄바꿈해 합성 → JPEG Blob. DOM 필요(오프스크린 전용). */
export async function renderH2Thumbnail(caption: string, style: ThumbStyle): Promise<Blob> {
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
  return canvasToBlob(canvas);
}
