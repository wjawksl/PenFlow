// 이벤트 브로드캐스트 — 05 §4. BG·CS 가 UI 로 progress/step.done 를 발신.
import { setProgressSink } from './logger';
import type { Msg, ProgressEvt, StepDoneEvt } from './messaging';

function emit<T>(name: Msg['name'], payload: T): void {
  const msg: Msg<T> = { kind: 'event', name, payload };
  // UI 가 닫혀 있으면 수신자 없음 → 조용히 무시.
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/** logger.progress() 를 runtime 브로드캐스트로 연결. BG·CS main 에서 1회 호출. */
export function wireProgressBroadcast(): void {
  setProgressSink((evt: ProgressEvt) => {
    const fn =
      evt.level === 'error' ? console.error : evt.level === 'warn' ? console.warn : console.info;
    fn(`[PenFlow:${evt.stage}] ${evt.message}`, evt.percent ?? '');
    emit<ProgressEvt>('progress', evt);
  });
}

export function emitStepDone(evt: StepDoneEvt): void {
  emit<StepDoneEvt>('step.done', evt);
}
