import { describe, it, expect } from 'vitest';
import { searchAdAdapter } from '@/adapters/topic/searchad';
import type { Credential } from '@/types/models';

const cred: Credential = {
  id: 'kw_1',
  kind: 'keyword_tool',
  fields: { apiKey: 'k', secret: 's', customerId: 'c' },
};

describe('searchAdAdapter.collect 가드(네트워크 전)', () => {
  it('자격증명 없으면 NO_CREDENTIAL', async () => {
    const r = await searchAdAdapter.collect({ seed: '캠핑' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('NO_CREDENTIAL');
  });

  it('자격증명 일부 누락도 NO_CREDENTIAL', async () => {
    const partial: Credential = { id: 'x', kind: 'keyword_tool', fields: { apiKey: 'k' } };
    const r = await searchAdAdapter.collect({ seed: '캠핑', credential: partial });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('NO_CREDENTIAL');
  });

  it('빈 seed 거부', async () => {
    const r = await searchAdAdapter.collect({ seed: '   ', credential: cred });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('NO_CREDENTIAL');
  });
});
