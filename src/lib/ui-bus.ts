// UI → BG 커맨드 송신 + 이벤트 구독 — 05 §4. Side Panel 에서 사용.
import type { ChannelName, Msg, ProgressEvt, StepDoneEvt } from './messaging';
import type { Result } from '@/types/common';

/** cmd 송신 후 응답(Result) 수신. */
export async function sendCmd<TReq, TRes>(
  name: ChannelName,
  payload: TReq,
): Promise<Result<TRes>> {
  const msg: Msg<TReq> = { kind: 'cmd', name, payload };
  return (await chrome.runtime.sendMessage(msg)) as Result<TRes>;
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
