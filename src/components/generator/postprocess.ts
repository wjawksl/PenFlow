// ③ 응답 후처리 — 06 §5 / 8.2-3 / WP2-3. 코드펜스·설명 래퍼 제거.
const FENCE_OPEN = /^\s*```[a-zA-Z]*\s*\n?/;
const FENCE_CLOSE = /\n?```\s*$/;
const LEAD_LABELS = /^\s*(다음은[^\n]*\n|본문\s*[:：]\s*\n?|제목\s*[:：][^\n]*\n)/;

export function stripWrappers(raw: string): string {
  let s = raw.trim();
  s = s.replace(FENCE_OPEN, '').replace(FENCE_CLOSE, '');
  s = s.replace(LEAD_LABELS, '');
  return s.trim();
}
