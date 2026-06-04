import { describe, it, expect } from 'vitest';
import { make, scan, strip } from '@/lib/markers';

describe('markers', () => {
  it('scan 은 등장 순서대로 마커를 수집한다', () => {
    const body = `## 소제목\n${make('IMG', '1')}\n본문\n${make('SHOP', 'a')}\n${make('AD')}`;
    const ms = scan(body);
    expect(ms.map((m) => m.type)).toEqual(['IMG', 'SHOP', 'AD']);
    expect(ms.map((m) => m.index)).toEqual([0, 1, 2]);
  });

  it('알 수 없는 TYPE 은 무시한다', () => {
    const ms = scan('[[PF:UNKNOWN:1]] [[PF:CTA:1]]');
    expect(ms.map((m) => m.type)).toEqual(['CTA']);
  });

  it('strip 은 모든 마커를 제거한다(미리보기용)', () => {
    const body = `텍스트${make('IMG', '1')}더${make('AD')}`;
    expect(strip(body)).toBe('텍스트더');
  });
});
