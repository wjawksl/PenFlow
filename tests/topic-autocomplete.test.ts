import { describe, it, expect } from 'vitest';
import { naverAcAdapter, googleAcAdapter, youtubeAcAdapter } from '@/adapters/topic/autocomplete';

describe('자동완성 어댑터(경로 C) 가드', () => {
  it('소스 id 노출', () => {
    expect(naverAcAdapter.id).toBe('naver');
    expect(googleAcAdapter.id).toBe('google');
    expect(youtubeAcAdapter.id).toBe('youtube');
  });

  it('빈 seed 거부(네트워크 전)', async () => {
    for (const a of [naverAcAdapter, googleAcAdapter, youtubeAcAdapter]) {
      const r = await a.collect({ seed: '  ' });
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error.code).toBe('NO_CREDENTIAL');
    }
  });
});
