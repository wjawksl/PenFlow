import { describe, it, expect, vi, afterEach } from 'vitest';
import { geminiTextAdapter } from '@/adapters/ai/gemini';
import { ERR } from '@/lib/errors';
import type { Credential } from '@/types/models';

// gemini 어댑터 HTTP→에러 매핑 — 키 귀속 실패는 AI_QUOTA(상위 generateBody 가 전환, R-0.2).

const cred: Credential = { id: 'k1', kind: 'ai_text', fields: { apiKey: 'key1' } };
const params = { prompt: '써줘', model: 'm', credential: cred };

function mockFetch(status: number, body: unknown) {
  const isObj = typeof body === 'object';
  global.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (isObj ? JSON.stringify(body) : String(body)),
    json: async () => body,
  })) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe('geminiTextAdapter 에러 매핑', () => {
  it('apiKey 없으면 NO_CREDENTIAL (네트워크 전)', async () => {
    const r = await geminiTextAdapter.generate({ ...params, credential: { ...cred, fields: {} } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ERR.NO_CREDENTIAL);
  });

  it('400 + "API key not valid" → AI_QUOTA(전환 신호)', async () => {
    mockFetch(400, { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } });
    const r = await geminiTextAdapter.generate(params);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ERR.AI_QUOTA);
      expect(r.error.retriable).toBe(true);
    }
  });

  it('400 (잘못된 요청, 키와 무관) → AI_FORMAT(전환 안 함)', async () => {
    mockFetch(400, { error: { status: 'INVALID_ARGUMENT', message: 'Request contains an invalid argument.' } });
    const r = await geminiTextAdapter.generate(params);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ERR.AI_FORMAT);
      expect(r.error.retriable).toBeFalsy();
    }
  });

  it('429 한도 → AI_QUOTA', async () => {
    mockFetch(429, { error: { status: 'RESOURCE_EXHAUSTED' } });
    const r = await geminiTextAdapter.generate(params);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ERR.AI_QUOTA);
  });

  it('403 권한 → AI_QUOTA', async () => {
    mockFetch(403, { error: { status: 'PERMISSION_DENIED' } });
    const r = await geminiTextAdapter.generate(params);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ERR.AI_QUOTA);
  });

  it('200 정상 → 본문 텍스트', async () => {
    mockFetch(200, { candidates: [{ content: { parts: [{ text: '## 소제목\n본문' }] } }] });
    const r = await geminiTextAdapter.generate(params);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toContain('소제목');
  });

  it('200 이지만 빈 응답 → AI_EMPTY', async () => {
    mockFetch(200, { candidates: [] });
    const r = await geminiTextAdapter.generate(params);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ERR.AI_EMPTY);
  });
});
