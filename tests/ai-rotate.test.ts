import { describe, it, expect, vi } from 'vitest';
import { callWithKeyRotation } from '@/lib/ai-rotate';
import { appError, ERR } from '@/lib/errors';
import { ok, err } from '@/types/common';
import type { Credential } from '@/types/models';

// 복수 키 순환 공용 헬퍼(R-0.2) — generateBody·어투·이미지 경로 공유.

const cred = (n: number): Credential => ({ id: `k${n}`, kind: 'ai_text', fields: { apiKey: `key${n}` } });
const QUOTA = err(appError(ERR.AI_QUOTA, '한도', { retriable: true }));
const FORMAT = err(appError(ERR.AI_FORMAT, '형식'));

describe('callWithKeyRotation', () => {
  it('첫 키 성공 → 1회 호출, 전환 없음', async () => {
    const call = vi.fn(async () => ok('done'));
    const onRotate = vi.fn();
    const res = await callWithKeyRotation([cred(1), cred(2)], call, onRotate);
    expect(res.ok).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
    expect(onRotate).not.toHaveBeenCalled();
  });

  it('첫 키 AI_QUOTA → 다음 키로 전환해 성공(onRotate 2 통지)', async () => {
    const call = vi.fn().mockResolvedValueOnce(QUOTA).mockResolvedValueOnce(ok('done'));
    const onRotate = vi.fn();
    const res = await callWithKeyRotation([cred(1), cred(2)], call, onRotate);
    expect(res.ok).toBe(true);
    expect(call).toHaveBeenCalledTimes(2);
    expect(onRotate).toHaveBeenCalledWith(2);
  });

  it('모든 키 AI_QUOTA → 마지막 에러 반환(키 수만큼 호출)', async () => {
    const call = vi.fn(async () => QUOTA);
    const res = await callWithKeyRotation([cred(1), cred(2), cred(3)], call);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ERR.AI_QUOTA);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('AI_QUOTA 외 오류는 전환 안 함(1회)', async () => {
    const call = vi.fn(async () => FORMAT);
    const res = await callWithKeyRotation([cred(1), cred(2)], call);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ERR.AI_FORMAT);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('빈 키 배열 → NO_CREDENTIAL(호출 안 함)', async () => {
    const call = vi.fn(async () => ok('x'));
    const res = await callWithKeyRotation([], call);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ERR.NO_CREDENTIAL);
    expect(call).not.toHaveBeenCalled();
  });
});
