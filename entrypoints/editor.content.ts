// Editor Content Script — ⑥ 삽입 엔진 + ⑦ 발행 — 05 §2 / 07.
// 스파이크 실측: 본문은 iframe[name=mainFrame] 안 → all_frames 로 주입해 그 iframe 안에서 직접 실행.
// insert.start 수신 → 페이로드 인출 → 삽입 → 임시저장 → step.done.
import { runInsert } from '@/components/insert/engine';
import { hasEditorHere } from '@/components/insert/dom';
import { getPayload } from '@/components/payload';
import { tempSave } from '@/components/publish';
import { loadSettings } from '@/components/settings';
import { emitStepDone, wireProgressBroadcast } from '@/lib/bus';
import { appError, ERR } from '@/lib/errors';
import type { InsertStartReq, Msg } from '@/lib/messaging';
import type { Result } from '@/types/common';

export default defineContentScript({
  matches: ['https://blog.naver.com/*'],
  allFrames: true, // 본문 iframe 안에서 실행되도록(05 §2, 스파이크)
  matchAboutBlank: true,
  main() {
    wireProgressBroadcast();
    const isTop = window.top === window.self;
    console.info(`[PenFlow] editor CS 주입 (frame: ${isTop ? 'top' : 'sub'}, url: ${location.href})`);

    chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
      if (msg.kind !== 'cmd' || msg.name !== 'insert.start') return false;
      // 본문은 sub-frame(iframe) 에 있음. top 프레임은 무시 → 본문 프레임만 응답.
      if (isTop || !hasEditorHere()) return false;
      handleInsert(msg.payload as InsertStartReq).then(sendResponse);
      return true; // 비동기 응답
    });
  },
});

async function handleInsert(req: InsertStartReq): Promise<Result<void>> {
  // 예외가 새어나가면 sendResponse·step.done 둘 다 누락 → 사이드패널 무한 대기.
  // 어떤 단계가 throw 해도 반드시 step.done(failed) + Result 로 안전 종료한다(R-4.4).
  try {
    const payload = await getPayload(req.payloadId);
    if (!payload) {
      // TC-PAY-02: 빈 페이로드 → 진행 중단.
      const e = appError(ERR.EMPTY_PAYLOAD, '삽입할 내용이 없어요.');
      emitStepDone({ topicId: req.payloadId, status: 'failed', error: e });
      return { ok: false, error: e };
    }

    const settings = await loadSettings();
    const insertRes = await runInsert(payload, settings.format, '제목 없음');
    if (!insertRes.ok) {
      emitStepDone({ topicId: payload.id, status: 'failed', error: insertRes.error });
      return insertRes;
    }

    // ⑦ 임시저장(M1) — publishOption 기본 TEMP_SAVE.
    const pubRes = await tempSave();
    if (!pubRes.ok) {
      emitStepDone({ topicId: payload.id, status: 'failed', error: pubRes.error });
      return pubRes;
    }

    emitStepDone({ topicId: payload.id, status: 'done' }); // "삽입 완료" 신호(R-5.2)
    return { ok: true, value: undefined };
  } catch (e) {
    const error = appError(ERR.INSERT_FAILED, `삽입 중 예외: ${String(e)}`, {
      failedStep: '삽입',
    });
    console.error('[PenFlow] handleInsert 예외', e);
    emitStepDone({ topicId: req.payloadId, status: 'failed', error });
    return { ok: false, error };
  }
}
