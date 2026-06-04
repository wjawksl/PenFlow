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
    dt.setData('text/plain', target.textContent ?? '');
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
