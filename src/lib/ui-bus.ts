// UI → BG 커맨드 송신 + 이벤트 구독 — 05 §4. Side Panel 에서 사용.
import { appError } from './errors';
import type { ChannelName, Msg, ProgressEvt, StepDoneEvt } from './messaging';
import { err, type Result } from '@/types/common';

/**
 * cmd 송신 후 응답(Result) 수신.
 * background 미응답(핸들러 없음·SW 재시작·포트 종료)이어도 예외를 던지지 않고
 * Result 에러로 수렴 — 호출부가 `res.ok` 분기만 하면 UI 가 멈추지 않는다.
 */
export async function sendCmd<TReq, TRes>(
  name: ChannelName,
  payload: TReq,
): Promise<Result<TRes>> {
  const msg: Msg<TReq> = { kind: 'cmd', name, payload };
  try {
    const res = (await chrome.runtime.sendMessage(msg)) as Result<TRes> | undefined;
    if (!res || typeof (res as { ok?: unknown }).ok !== 'boolean') {
      return err(appError('NO_RESPONSE', '백그라운드 응답이 없어요. 확장을 새로고침한 뒤 다시 시도해 주세요.'));
    }
    return res;
  } catch (e) {
    return err(appError('NO_RESPONSE', `백그라운드 연결 실패: ${String(e)}. 확장을 새로고침해 주세요.`));
  }
}

type EventHandlers = {
  onProgress?: (e: ProgressEvt) => void;
  onStepDone?: (e: StepDoneEvt) => void;
};

/** 이벤트 구독. 반환 함수로 해제. */
export function subscribeEvents(h: EventHandlers): () => void {
  const listener = (msg: Msg) => {
    if (msg.kind !== 'event') return;
    if (msg.name === 'progress') h.onProgress?.(msg.payload as ProgressEvt);
    else if (msg.name === 'step.done') h.onStepDone?.(msg.payload as StepDoneEvt);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
