import { describe, it, expect, vi } from 'vitest';
import { generateBody } from '@/components/generator';
import type { AITextAdapter } from '@/adapters';
import { appError, ERR } from '@/lib/errors';
import { ok, err } from '@/types/common';
import type { Credential, Topic } from '@/types/models';

// 복수 키 순환(R-0.1·R-0.2) 단위 테스트 — generateBody 가 AI_QUOTA 면 다음 키로 전환한다.

const topic: Topic = { id: 't1', keyword: '테스트' };
const prompt = { name: '기본', body: '써줘' };
const cred = (n: number): Credential => ({ id: `k${n}`, kind: 'ai_text', fields: { apiKey: `key${n}` } });
const QUOTA = err(appError(ERR.AI_QUOTA, '한도', { retriable: true }));
const FORMAT = err(appError(ERR.AI_FORMAT, '형식'));
const BODY = ok('## 소제목\n\n본문 내용입니다.');

function adapterReturning(...results: ReturnType<typeof ok>[] | unknown[]): {
  adapter: AITextAdapter;
  calls: () => number;
} {
  let i = 0;
  const gen = vi.fn(async () => results[i++] as Awaited<ReturnType<AITextAdapter['generate']>>);
  return { adapter: { generate: gen }, calls: () => gen.mock.calls.length };
}

describe('복수 키 순환 (R-0.2)', () => {
  it('첫 키 한도 초과 → 다음 키로 전환해 성공', async () => {
    const { adapter, calls } = adapterReturning(QUOTA, BODY);
    const res = await generateBody({
      topic, prompt, adapter, credentials: [cred(1), cred(2)], model: 'm',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toContain('<h2>소제목</h2>');
    expect(calls()).toBe(2); // 1번 실패 → 2번 시도
  });

  it('모든 키 한도 초과 → AI_QUOTA 반환(키 수만큼 시도)', async () => {
    const { adapter, calls } = adapterReturning(QUOTA, QUOTA, QUOTA);
    const res = await generateBody({
      topic, prompt, adapter, credentials: [cred(1), cred(2), cred(3)], model: 'm',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ERR.AI_QUOTA);
    expect(calls()).toBe(3);
  });

  it('한도 외 오류(AI_FORMAT)는 순환하지 않고 즉시 반환', async () => {
    const { adapter, calls } = adapterReturning(FORMAT, BODY);
    const res = await generateBody({
      topic, prompt, adapter, credentials: [cred(1), cred(2)], model: 'm',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ERR.AI_FORMAT);
    expect(calls()).toBe(1); // 전환 안 함
  });

  it('키 배열 비면 NO_CREDENTIAL', async () => {
    const { adapter, calls } = adapterReturning();
    const res = await generateBody({ topic, prompt, adapter, credentials: [], model: 'm' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ERR.NO_CREDENTIAL);
    expect(calls()).toBe(0); // 호출 자체 안 함
  });
});
