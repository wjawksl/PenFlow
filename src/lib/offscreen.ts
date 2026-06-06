// Offscreen 문서 수명관리 — 05 §1·§2·§8(WP0). 서비스워커엔 DOM/Canvas 가 없으므로
// ⑩ 변환(turndown/DOMPurify)·⑨ 이미지 합성(Canvas)을 오프스크린 문서에서 처리한다.
// 단일 인스턴스 보장(중복 생성 방지) + 위임 호출(callOffscreen) 단일 경로.
import { appError } from './errors';
import type { ChannelName, Msg } from './messaging';
import { err, type Result } from '@/types/common';

// WXT: entrypoints/offscreen/index.html → 빌드 결과 루트의 offscreen.html.
const OFFSCREEN_URL = 'offscreen.html';

let creating: Promise<void> | null = null; // 동시 호출 시 createDocument 중복 방지

async function exists(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  return contexts.length > 0;
}

/** 필요 시 오프스크린 문서 생성. 이미 있으면 no-op, 동시 호출은 직렬화(중복 생성 방지). */
export async function ensureOffscreen(): Promise<void> {
  if (await exists()) return;
  if (creating) return creating;
  creating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'HTML↔Markdown 변환·이미지 합성(서비스워커엔 DOM/Canvas 없음)',
    })
    .finally(() => {
      creating = null;
    });
  return creating;
}

/** 유휴 시 종료(리소스 누수 방지). 문서가 없으면 no-op. */
export async function closeOffscreen(): Promise<void> {
  if (await exists()) await chrome.offscreen.closeDocument();
}

/**
 * BG→Offscreen 위임 호출. 오프스크린 보장 후 cmd 송신, Result 수신.
 * 미응답(생성 실패·문서 종료 등)이어도 예외 대신 Result 에러로 수렴한다(ui-bus.sendCmd 와 동일 패턴).
 */
export async function callOffscreen<TReq, TRes>(
  name: ChannelName,
  payload: TReq,
): Promise<Result<TRes>> {
  await ensureOffscreen();
  const msg: Msg<TReq> = { kind: 'cmd', target: 'offscreen', name, payload };
  try {
    const res = (await chrome.runtime.sendMessage(msg)) as Result<TRes> | undefined;
    if (!res || typeof (res as { ok?: unknown }).ok !== 'boolean') {
      return err(appError('NO_RESPONSE', '오프스크린 응답이 없어요. 확장을 새로고침해 주세요.'));
    }
    return res;
  } catch (e) {
    return err(appError('NO_RESPONSE', `오프스크린 연결 실패: ${String(e)}`));
  }
}
