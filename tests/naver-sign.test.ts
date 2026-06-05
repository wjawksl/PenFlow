import { describe, it, expect } from 'vitest';
import { signSearchAd } from '@/lib/naver-sign';

describe('naver-sign.signSearchAd', () => {
  it('동일 입력 → 동일 서명(결정성)', async () => {
    const a = await signSearchAd('secret', 'GET', '/keywordstool', '1700000000000');
    const b = await signSearchAd('secret', 'GET', '/keywordstool', '1700000000000');
    expect(a.signature).toBe(b.signature);
    expect(a.timestamp).toBe('1700000000000');
  });

  it('HMAC-SHA256 → 32바이트 base64(44자)', async () => {
    const { signature } = await signSearchAd('secret', 'GET', '/keywordstool', '1700000000000');
    expect(signature).toMatch(/^[A-Za-z0-9+/]{43}=$/); // 32바이트 base64
  });

  it('secret 다르면 서명 달라짐', async () => {
    const a = await signSearchAd('s1', 'GET', '/keywordstool', '1700000000000');
    const b = await signSearchAd('s2', 'GET', '/keywordstool', '1700000000000');
    expect(a.signature).not.toBe(b.signature);
  });
});
