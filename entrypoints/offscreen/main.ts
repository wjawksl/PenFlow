// Offscreen 문서 — DOM/Canvas 호스트(05 §2 WP0). 서비스워커가 못 하는
// ⑩ 변환(turndown/DOMPurify)·⑨ 합성(Canvas)을 여기서 실행한다.
// BG 가 target:'offscreen' cmd 를 보내면 처리 후 Result 로 응답.
import { htmlToMarkdown, markdownToHtml, sanitizeHtml } from '@/components/validator/convert';
import { appError } from '@/lib/errors';
import type { ConvertReq, ConvertRes, Msg } from '@/lib/messaging';
import type { Result } from '@/types/common';

const IDLE_MS = 30_000; // 유휴 종료(05 §2 0-3). 다음 호출 시 ensureOffscreen 이 재생성.
let idleTimer: ReturnType<typeof setTimeout> | undefined;
function touchIdle(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => window.close(), IDLE_MS);
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  if (msg.kind !== 'cmd' || msg.target !== 'offscreen') return false;
  touchIdle();

  if (msg.name === 'convert.htmlmd') {
    sendResponse(handleConvert(msg.payload as ConvertReq));
    return false; // 동기 응답
  }
  if (msg.name === 'visual.compose') {
    // ⑨ 이미지 합성은 WP4(Canvas)에서 구현. 라우트만 선점.
    sendResponse({ ok: false, error: appError('NOT_IMPLEMENTED', '비주얼 합성은 WP4에서 구현됩니다.') });
    return false;
  }
  return false;
});

// ⑩ HTML↔Markdown 변환. 마커 보존(R-8.4). turndown/DOMPurify 는 DOM 필요 → 오프스크린 전용.
function handleConvert(req: ConvertReq): Result<ConvertRes> {
  const content =
    req.direction === 'md2html'
      ? sanitizeHtml(markdownToHtml(req.content))
      : htmlToMarkdown(req.content);
  return { ok: true, value: { content } };
}

touchIdle();
