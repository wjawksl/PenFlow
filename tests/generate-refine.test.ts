import { describe, it, expect, vi } from 'vitest';
import { refineBody } from '@/components/generator';
import { assembleRefinePrompt } from '@/lib/prompt';
import type { AITextAdapter } from '@/adapters';
import { appError, ERR } from '@/lib/errors';
import { ok, err } from '@/types/common';
import type { Credential, VoiceProfile } from '@/types/models';

// 대화형 생성(B) — refineBody 가 기존 본문+지시로 재작성하고, 키 순환·검사는 생성과 공유한다.

const cred = (n: number): Credential => ({ id: `k${n}`, kind: 'ai_text', fields: { apiKey: `key${n}` } });
const QUOTA = err(appError(ERR.AI_QUOTA, '한도', { retriable: true }));
const REFINED = ok('## 소제목\n\n더 길어진 본문 내용입니다.');
const NO_H2 = ok('소제목 없는 그냥 문단.');

function adapterReturning(...results: unknown[]): { adapter: AITextAdapter; calls: () => number } {
  let i = 0;
  const gen = vi.fn(async () => results[i++] as Awaited<ReturnType<AITextAdapter['generate']>>);
  return { adapter: { generate: gen }, calls: () => gen.mock.calls.length };
}

const base = { currentMd: '## 소제목\n\n원래 본문.', instruction: '더 길게', model: 'm' };

describe('refineBody (대화형 생성 B)', () => {
  it('지시대로 다듬어 새 본문 HTML 반환', async () => {
    const { adapter } = adapterReturning(REFINED);
    const res = await refineBody({ ...base, adapter, credentials: [cred(1)] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toContain('<h2>소제목</h2>');
  });

  it('첫 키 한도 초과 → 다음 키로 전환해 성공', async () => {
    const { adapter, calls } = adapterReturning(QUOTA, REFINED);
    const res = await refineBody({ ...base, adapter, credentials: [cred(1), cred(2)] });
    expect(res.ok).toBe(true);
    expect(calls()).toBe(2);
  });

  it('소제목 누락 → MARKER_MISSING', async () => {
    const { adapter } = adapterReturning(NO_H2);
    const res = await refineBody({ ...base, adapter, credentials: [cred(1)] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ERR.MARKER_MISSING);
  });

  it('키 배열 비면 NO_CREDENTIAL(호출 안 함)', async () => {
    const { adapter, calls } = adapterReturning();
    const res = await refineBody({ ...base, adapter, credentials: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ERR.NO_CREDENTIAL);
    expect(calls()).toBe(0);
  });
});

describe('assembleRefinePrompt', () => {
  const voice: VoiceProfile = { name: '내말투', spec: '친근한 반말', excerpts: ['예시 문장'] };

  it('기존 글·수정 지시 파트를 포함', () => {
    const p = assembleRefinePrompt('## 글\n본문', '더 길게');
    expect(p).toContain('[기존 글]');
    expect(p).toContain('## 글\n본문');
    expect(p).toContain('[수정 지시]');
    expect(p).toContain('더 길게');
  });

  it('어투·마커 지침을 주입', () => {
    const p = assembleRefinePrompt('## 글', '톤 바꿔', { includeSourceLink: false, ctaButton: '<button>버튼</button>' }, voice);
    expect(p).toContain('[어투 지침]');
    expect(p).toContain('친근한 반말');
    expect(p).toContain('PF:CTA:0');
  });
});
