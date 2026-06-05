import { describe, it, expect } from 'vitest';
import { blogTitlesAdapter } from '@/adapters/topic/blogtitles';

describe('blogTitlesAdapter.collect 가드(네트워크 전)', () => {
  it('blogId 비면 NO_CREDENTIAL', async () => {
    const r = await blogTitlesAdapter.collect({ seed: '   ' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('NO_CREDENTIAL');
  });

  it('id 노출', () => {
    expect(blogTitlesAdapter.id).toBe('naver-blog-titles');
  });
});
