// ⑥ 삽입 엔진 DOM 헬퍼 — 07 §3·§4. 폴백 셀렉터 해석 + 폴링.
// 스파이크 실측: 본문은 iframe[name=mainFrame](same-origin) 안. content script 를 all_frames 로
// 주입해 그 iframe 안에서 직접 실행 → own document 로 조작(isolated world cross-frame 접근 회피).

/** 폴백 배열을 우선순위대로 시도. 처음 매칭되는 요소 반환. */
export function resolveEl(
  selectors: readonly string[],
  doc: Document = document,
): HTMLElement | null {
  for (const sel of selectors) {
    const el = doc.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** 셀렉터가 잡힐 때까지 폴링(타임아웃) — R-4.1. 늦게 렌더돼도 잡아냄. */
export async function waitForEl(
  selectors: readonly string[],
  timeoutMs: number,
  intervalMs: number,
): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const el = resolveEl(selectors);
    if (el) return el;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

/** 이 프레임(문서)에 편집기 본문이 있는지 — insert.start 라우팅 게이트용. */
export function hasEditorHere(): boolean {
  return !!(
    document.querySelector('.se-canvas') ||
    document.querySelector('[contenteditable="true"]')
  );
}

// 자체 컴포넌트가 돼야 하는 구조 블록 — 따로 paste 해야 SE 가 표/리스트 컴포넌트로 만든다.
const SE_STRUCTURAL = new Set(['TABLE', 'UL', 'OL', 'HR', 'BLOCKQUOTE', 'PRE']);

// 문단 사이 공백 줄 — 인접 문단마다 빈 문단을 끼워 한 줄 띄운다(가독성).
const PARA_SPACER = '<p><br></p>';

/**
 * 본문 HTML 을 SmartEditor paste 단위로 분할.
 * 실측(에디터 DOM 덤프, 2026-06): SE 는 (1) 따로 paste 한 텍스트 블록을 현재 문단에 합치고,
 * (2) heading 으로 시작하는 텍스트런에 heading 서식(볼드·큰 글씨)을 런 전체에 번지게 한다.
 * 해결: 연속 텍스트(p/heading)는 한 번에 묶어 paste(=SE 가 한 paste 안의 <p> 경계로 문단 생성),
 * heading 은 <p><strong> 으로 강등(볼드 트리거 제거, 볼드는 소제목 글자에만 국한),
 * 표·리스트 등 구조 블록만 별도 paste(독립 컴포넌트화).
 * 문단 사이는 PARA_SPACER(빈 문단)로 한 줄 띄운다.
 */
export function splitForSe(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  let parts: string[] = []; // 누적 중인 텍스트런 문단들(빈 문단으로 이어 붙임)
  const flush = (): void => {
    if (parts.length) out.push(parts.join(PARA_SPACER));
    parts = [];
  };
  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (SE_STRUCTURAL.has(el.tagName)) {
        flush();
        out.push(el.outerHTML); // 표/리스트 등은 독립 paste
      } else {
        parts.push(demoteHeading(el)); // p·heading 등은 텍스트런으로 누적
      }
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      parts.push(`<p>${node.textContent.trim()}</p>`); // 블록 밖 맨 텍스트 → 문단
    }
  }
  flush();
  return out.length ? out : [html];
}

/**
 * heading(h1~h4) → 평문 <p> 강등. 실측: 문단 첫머리 볼드(<strong>/heading)면 SE 가 그 문단을
 * 볼드로 잡고 다음 문단까지 합쳐 먹는다 → paste 로 볼드 넣는 길 자체가 막힘. 그래서 볼드 없이.
 * (소제목 굵기/크기는 SE 툴바 조작 후속 WP. H2THUMB 썸네일이 시각적 구획 역할.)
 */
function demoteHeading(el: Element): string {
  if (/^H[1-4]$/.test(el.tagName)) return `<p>${el.innerHTML}</p>`;
  return el.outerHTML;
}

/** 본문 맨 앞 제목 heading 제거(제목칸과 중복 방지). 첫 블록이 title 과 같은 heading 일 때만. */
export function stripLeadingTitle(html: string, title: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const first = doc.body.firstElementChild;
  if (first && /^H[1-4]$/.test(first.tagName) && first.textContent?.trim() === title.trim()) {
    first.remove();
    return doc.body.innerHTML;
  }
  return html;
}

/**
 * contenteditable/입력 요소에 HTML 붙여넣기 — 07 §6(paste 우선, execCommand 폴백).
 * 스파이크 검증(2026-06-04): SmartEditor 가 합성 paste 를 가로채 처리(dispatchEvent→false) → 1차 기법 성공.
 */
export function pasteHtml(target: HTMLElement, html: string): boolean {
  target.focus();
  const doc = target.ownerDocument;
  try {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    // text/plain 은 "지금 붙이는 내용"의 평문이어야 한다(이전엔 에디터 기존 텍스트를 넣는 버그).
    dt.setData('text/plain', htmlToPlain(html));
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    const notCancelled = target.dispatchEvent(ev);
    // 에디터가 paste 를 직접 처리하면(이벤트 취소) 여기서 끝. 아니면 execCommand 폴백.
    if (!notCancelled) return true;
  } catch {
    /* DataTransfer/ClipboardEvent 미지원 시 폴백 */
  }
  // 폴백: execCommand insertHTML (deprecated 이나 contenteditable 에서 광범위 동작).
  const okCmd = doc.execCommand('insertHTML', false, html);
  if (okCmd) return true;
  // 최종 폴백: 직접 삽입 + input 이벤트.
  target.innerHTML += html;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/** HTML → 평문(태그 제거). text/plain 폴백·줄바꿈 판단용. */
function htmlToPlain(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
}

/**
 * 제목 입력 — 스파이크 실측(2026-06-04): SmartEditor 제목은 contenteditable 밖 컴포넌트.
 * 제목 span 클릭 시 SE 가 제목을 활성화하고 focus 를 중첩 iframe body(contenteditable)로 옮긴다.
 * 그 body 에 paste(text/plain) 하면 SE 가 활성 컴포넌트(제목)에 반영한다.
 * (textContent/execCommand 직접 조작은 SE 모델을 깨뜨려 작게 들어가고 지워지지 않음.)
 */
export async function insertTitle(titleEl: HTMLElement, text: string): Promise<boolean> {
  const doc = titleEl.ownerDocument;
  const span = (titleEl.querySelector<HTMLElement>('span.__se-node')) ?? titleEl;
  for (const t of ['mousedown', 'mouseup', 'click'] as const) {
    span.dispatchEvent(
      new MouseEvent(t, { bubbles: true, cancelable: true, view: doc.defaultView ?? undefined }),
    );
  }
  await sleep(150); // SE 가 중첩 iframe 으로 focus 옮길 시간

  let target: HTMLElement = span;
  const active = doc.activeElement;
  if (active instanceof HTMLIFrameElement && active.contentDocument?.body) {
    target = active.contentDocument.body;
  }
  target.focus();
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  return target.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
  );
}
