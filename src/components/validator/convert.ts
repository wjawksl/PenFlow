// ⑩ 검증·편집기 — HTML↔Markdown 변환 (M3 WP1). 06 §7 마커 보존.
// 마커 [[PF:...]] 를 변환 동안 안전한 placeholder 로 치환→변환→복원해 turndown/marked 가
// 링크·코드로 오인하지 않게 한다(왕복 후 scan() 개수 불변 보장, R-8.4).
// marked 는 순수 JS(SW 가능). turndown 은 DOM 필요 → 호출 시 지연 생성(SW 에선 미사용).
import { marked } from 'marked';
import TurndownService from 'turndown';
import { MARKER_RE } from '@/lib/markers';

const PH = (i: number) => `PFMK${i}MKPF`; // 영숫자만 — 마크다운/HTML 특수문자 없음

function protect(s: string): { text: string; map: string[] } {
  const map: string[] = [];
  const text = s.replace(MARKER_RE, (raw) => {
    const ph = PH(map.length);
    map.push(raw);
    return ph;
  });
  return { text, map };
}

function restore(s: string, map: string[]): string {
  let out = s;
  map.forEach((raw, i) => {
    out = out.split(PH(i)).join(raw); // 전역 치환(정규식 escape 불필요)
  });
  return out;
}

// 단독 마커가 <p> 로 감싸진 경우 풀어 준다 → ④ compose 가 블록 경계에서 깔끔히 슬라이스.
const SOLITARY_MARKER_P = /<p>\s*(\[\[PF:[A-Z0-9]+:[A-Za-z0-9_-]+\]\])\s*<\/p>/g;

/** Markdown → HTML. 마커 보존. marked 동기 파싱. */
export function markdownToHtml(md: string): string {
  const { text, map } = protect(md);
  const html = marked.parse(text, { async: false }) as string;
  return restore(html, map).replace(SOLITARY_MARKER_P, '$1');
}

let turndown: TurndownService | null = null;
function getTurndown(): TurndownService {
  // DOM 필요 → UI/Offscreen 컨텍스트에서만 호출. 1회 생성 재사용.
  turndown ??= new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  return turndown;
}

/** HTML → Markdown. 마커 보존. DOM 있는 컨텍스트(UI/Offscreen)에서 호출. */
export function htmlToMarkdown(html: string): string {
  const { text, map } = protect(html);
  const md = getTurndown().turndown(text);
  return restore(md, map);
}
