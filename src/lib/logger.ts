// 관측성 단일 채널 — 05 §7 + 03 공통 기반. 모든 단계가 progress 이벤트를 발신.
// → UI 진행 패널 + 콘솔 로그 양쪽(R-6.3). Background 가 UI 로 브로드캐스트한다.
import type { ProgressEvt } from './messaging';

type ProgressSink = (evt: ProgressEvt) => void;

// 기본 싱크는 콘솔. Background 에서 chrome.runtime 브로드캐스트 싱크로 교체한다.
let sink: ProgressSink = (evt) => {
  const fn = evt.level === 'error' ? console.error : evt.level === 'warn' ? console.warn : console.info;
  fn(`[PenFlow:${evt.stage}] ${evt.message}`, evt.percent ?? '');
};

export function setProgressSink(next: ProgressSink): void {
  sink = next;
}

export function progress(
  stage: string,
  message: string,
  opts?: { percent?: number; level?: ProgressEvt['level'] },
): void {
  sink({ stage, message, percent: opts?.percent, level: opts?.level ?? 'info' });
}
