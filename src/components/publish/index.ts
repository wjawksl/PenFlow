// ⑦ 발행 처리기 (M1: 임시저장만) — WP5. 삽입 완료 후 임시저장 + 완료 신호.
// 발행(PUBLISH) 경로는 이후 마일스톤. 기본값 임시저장(R-5.1).
import { appError, ERR } from '@/lib/errors';
import { progress } from '@/lib/logger';
import { SEL } from '@/lib/selectors';
import { ok, err, type Result } from '@/types/common';
import { resolveEl, sleep } from '@/components/insert/dom';

export async function tempSave(): Promise<Result<void>> {
  progress('publish', '임시저장 중…', { percent: 92 });
  // 저장 버튼도 editor iframe(mainFrame) 안 — all_frames 주입이라 own document 에서 조회.
  const btn = resolveEl(SEL.saveDraft);
  if (!btn) {
    // 저장 버튼 미발견 → 폴백/오류 통지, 안전 종료 — TC-PUB-03, R-4.1.
    const e = appError(ERR.EDITOR_NOT_FOUND, '임시저장 버튼을 찾지 못했어요.', {
      failedStep: '임시저장',
    });
    progress('publish', e.message, { level: 'error' });
    return err(e);
  }
  btn.click();
  await sleep(500);
  progress('publish', '임시저장했어요', { percent: 100 });
  return ok(undefined); // "삽입 완료" 신호는 호출부(CS)가 step.done 으로 발신(R-5.2)
}
