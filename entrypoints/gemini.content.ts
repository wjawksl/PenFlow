// Gemini 웹 반자동 CS — ⑨ 이미지 생성(M3 스파이크). 유료 API 폐기 대체(무료 웹 세션).
// 흐름: 프롬프트 주입 → (반자동: 사용자가 전송 / autoSend: CS 가 전송 클릭) → 완료 폴링 → blob 이미지 스크랩.
// gemini.run 수신 → 결과 dataUrl 반환. 입력은 top 문서(rich-textarea), iframe 아님 → top 프레임만 처리.
import { wireProgressBroadcast } from '@/lib/bus';
import { appError } from '@/lib/errors';
import { progress } from '@/lib/logger';
import type { GeminiRunReq, GeminiScrapeRes, Msg } from '@/lib/messaging';
import { GEMINI, GEMINI_DEFAULTS } from '@/lib/selectors';
import { ok, err, type Result } from '@/types/common';

const G = GEMINI_DEFAULTS;

export default defineContentScript({
  matches: ['https://gemini.google.com/*'],
  main() {
    wireProgressBroadcast();
    console.info('[PenFlow] gemini CS 주입', location.href);

    chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
      if (msg.kind !== 'cmd' || msg.name !== 'gemini.run') return false;
      if (window.top !== window.self) return false; // 입력은 top 문서
      handleRun(msg.payload as GeminiRunReq).then(sendResponse);
      return true; // 비동기 응답
    });
  },
});

async function handleRun(req: GeminiRunReq): Promise<Result<GeminiScrapeRes>> {
  try {
    const input = resolve(GEMINI.promptInput);
    if (!input) {
      return err(appError('GEMINI_NO_INPUT', 'Gemini 입력칸을 찾지 못했어요. 대화 화면을 열어 주세요.'));
    }

    // 생성 전 기준 이미지 수 — 완료는 "새 이미지가 loaded 로 등장"으로 판정.
    const before = countImages();

    progress('gemini', '프롬프트 입력 중…', { percent: 20 });
    if (!setPrompt(input, req.prompt)) {
      return err(appError('GEMINI_INPUT_FAILED', '프롬프트 입력에 실패했어요. (Quill 주입 기법 재확인 필요)'));
    }
    await sleep(G.inputSettleMs);

    if (req.autoSend) {
      const sent = await clickSend();
      if (!sent) {
        return err(appError('GEMINI_NO_SEND', '전송 버튼을 찾지 못했어요. 직접 전송해 주세요.'));
      }
      progress('gemini', '전송됨 — 이미지 생성 대기 중…', { percent: 45 });
    } else {
      // 반자동: 사용자가 Gemini 화면에서 직접 전송.
      progress('gemini', 'Gemini 화면에서 전송 버튼을 눌러 주세요. 생성되면 자동으로 가져옵니다.', {
        percent: 40,
      });
    }

    const img = await waitForImage(before);
    if (!img) {
      return err(appError('GEMINI_TIMEOUT', '이미지 생성 결과를 받지 못했어요. (시간 초과 또는 전송 누락)'));
    }

    progress('gemini', '이미지 가져오는 중…', { percent: 85 });
    const dataUrl = await imgToDataUrl(img);
    if (!dataUrl) {
      return err(appError('GEMINI_SCRAPE_FAILED', '생성 이미지를 읽지 못했어요.'));
    }

    progress('gemini', '이미지 생성 완료', { percent: 100 });
    return ok({ dataUrl });
  } catch (e) {
    return err(appError('GEMINI_FAILED', `Gemini 운전 중 예외: ${String(e)}`));
  }
}

// ── DOM 헬퍼 ──────────────────────────────────────────────

function resolve(selectors: readonly string[]): HTMLElement | null {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Quill contenteditable 에 프롬프트 주입. ⚠️ 라이브 미검증 — 기법 우선순위(paste→insertText→textContent)로 시도.
 * Quill 은 내부 모델을 갖고 있어 textContent 직접 세팅만으론 인식 못 할 수 있다 → 입력 이벤트를 함께 발신.
 */
function setPrompt(input: HTMLElement, text: string): boolean {
  input.focus();
  // 1) paste — Quill 이 클립보드 paste 를 정상 처리(가장 안전).
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    input.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
    if ((input.textContent ?? '').includes(text)) return true;
  } catch {
    /* DataTransfer 미지원 → 폴백 */
  }
  // 2) execCommand insertText — contenteditable 광범위 동작, Quill 이 input 이벤트로 인식.
  try {
    const sel = window.getSelection();
    sel?.selectAllChildren(input);
    if (document.execCommand('insertText', false, text) && (input.textContent ?? '').includes(text)) {
      return true;
    }
  } catch {
    /* 폴백 */
  }
  // 3) 최종: textContent + input 이벤트.
  input.textContent = text;
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  return (input.textContent ?? '').includes(text);
}

/** (autoSend) 텍스트 입력 후 등장하는 전송 버튼을 폴링해 클릭. */
async function clickSend(): Promise<boolean> {
  const deadline = Date.now() + G.sendWaitTimeout;
  for (;;) {
    const btn = resolve(GEMINI.sendButton);
    if (btn && !(btn as HTMLButtonElement).disabled) {
      btn.click();
      return true;
    }
    if (Date.now() >= deadline) return false;
    await sleep(G.sendWaitPoll);
  }
}

function countImages(): number {
  return document.querySelectorAll('single-image img, generated-image img').length;
}

/**
 * 새 생성 이미지 대기 — img 수가 before 보다 늘고, 새 img 가 loaded(class) + naturalWidth>0 일 때까지.
 * 실측 주의: image-loading-overlay 는 로드 완료 후에도 DOM 에 남는다(Angular host 유지) → 존재 여부로 판정 금지.
 * 완료 신호는 img 의 'loaded' 클래스다. 반자동은 사용자 전송 대기 포함이라 타임아웃을 넉넉히(R-7.1).
 */
async function waitForImage(before: number): Promise<HTMLImageElement | null> {
  const deadline = Date.now() + G.resultTimeout;
  for (;;) {
    const imgs = Array.from(
      document.querySelectorAll<HTMLImageElement>('single-image img, generated-image img'),
    );
    const latest = imgs[imgs.length - 1];
    if (imgs.length > before && latest && latest.classList.contains('loaded') && latest.naturalWidth > 0) {
      return latest;
    }
    if (Date.now() >= deadline) return null;
    await sleep(G.resultPoll);
  }
}

/**
 * 생성 이미지(blob: src) → dataUrl. blob URL 은 문서와 같은 origin → CS 에서 fetch 가능.
 * CS 에는 FileReader 존재(SW 와 달리). 실패 시 canvas 폴백(blob 동일 origin 이라 taint 없음).
 */
async function imgToDataUrl(img: HTMLImageElement): Promise<string | null> {
  const src = img.currentSrc || img.src;
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await blobToDataUrl(blob);
  } catch {
    /* canvas 폴백 */
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
