import { describe, it, expect } from 'vitest';
import { extractH2Captions, injectH2ThumbMarkers } from '@/components/generator';
import { composeVisuals } from '@/components/visual';
import { wrapLines } from '@/components/visual/thumbnail';
import { scan } from '@/lib/markers';
import type { RecordStore } from '@/adapters';
import type { VisualSpec } from '@/lib/messaging';

// ⑨ 소제목 썸네일 슬라이스(M3 WP4) — 마커 주입·캡션 추출·합성·줄바꿈.

describe('H2THUMB 마커 주입 (R-7.3)', () => {
  it('각 </h2> 뒤에 H2THUMB:n 을 1:1 로 주입한다', () => {
    const html = '<h2>가</h2><p>본문</p><h2>나</h2><p>끝</p>';
    const out = injectH2ThumbMarkers(html);
    const thumbs = scan(out).filter((m) => m.type === 'H2THUMB');
    expect(thumbs.map((m) => m.key)).toEqual(['1', '2']); // 순번 1..n
    expect(out.indexOf('[[PF:H2THUMB:1]]')).toBeGreaterThan(out.indexOf('<h2>가</h2>') - 1);
  });

  it('h2 가 없으면 주입하지 않는다', () => {
    const html = '<p>소제목 없는 글</p>';
    expect(injectH2ThumbMarkers(html)).toBe(html);
  });
});

describe('extractH2Captions', () => {
  it('소제목 텍스트를 순서대로, 태그 제거해 뽑는다', () => {
    const html = '<h2>첫 <strong>제목</strong></h2><p>x</p><h2>둘째</h2>';
    expect(extractH2Captions(html)).toEqual(['첫 제목', '둘째']);
  });
});

describe('wrapLines (텍스트 줄바꿈, 순수)', () => {
  const fits = (line: string) => line.length <= 6; // 6자 이하면 한 줄
  it('폭에 맞춰 단어를 줄로 나눈다', () => {
    expect(wrapLines('aa bb cc dd', fits)).toEqual(['aa bb', 'cc dd']);
  });
  it('한 단어가 폭을 넘어도 단독 줄로 둔다', () => {
    expect(wrapLines('verylongword x', fits)).toEqual(['verylongword', 'x']);
  });
  it('빈 문자열은 빈 줄 하나', () => {
    expect(wrapLines('', fits)).toEqual(['']);
  });
});

describe('composeVisuals', () => {
  function fakeStore() {
    const puts: { id: string }[] = [];
    const store: RecordStore = {
      async put(r) {
        puts.push({ id: r.id });
      },
      async get() {
        return null;
      },
      async delete() {},
      async estimateUsage() {
        return { usage: 0, quota: 0 };
      },
    };
    return { store, puts };
  }
  const fakeRender = async () => new Blob(['x'], { type: 'image/jpeg' });

  it('H2_THUMB spec 마다 렌더·저장 후 ref Visual 을 반환한다', async () => {
    const { store, puts } = fakeStore();
    const specs: VisualSpec[] = [
      { role: 'H2_THUMB', source: 'DEFAULT', h2Caption: 'A' },
      { role: 'H2_THUMB', source: 'DEFAULT', h2Caption: 'B' },
    ];
    const visuals = await composeVisuals(specs, store, undefined, fakeRender);
    expect(visuals).toHaveLength(2);
    expect(puts).toHaveLength(2);
    expect(visuals[0]).toMatchObject({ role: 'H2_THUMB', h2Caption: 'A', dedupApplied: true });
    expect(visuals[0]!.data.kind).toBe('ref');
  });

  it('H2_THUMB 가 아닌 role 은 건너뛴다 (이번 슬라이스 범위)', async () => {
    const { store } = fakeStore();
    const specs: VisualSpec[] = [{ role: 'BODY_IMAGE', source: 'AI' }];
    const visuals = await composeVisuals(specs, store, undefined, fakeRender);
    expect(visuals).toHaveLength(0);
  });

  // WP5 — 압축 품질·중복 회피 옵션 전달(R-7.4).
  it('opts 를 렌더러에 전달하고 dedup 여부를 Visual 에 반영한다', async () => {
    const { store } = fakeStore();
    const seen: Array<unknown> = [];
    const spyRender = async (_c: string, _s: { bg: string; fg: string }, opts?: unknown) => {
      seen.push(opts);
      return new Blob(['x'], { type: 'image/jpeg' });
    };
    const specs: VisualSpec[] = [{ role: 'H2_THUMB', source: 'DEFAULT', h2Caption: 'A' }];
    const visuals = await composeVisuals(specs, store, undefined, spyRender, {
      quality: 0.5,
      dedup: false,
    });
    expect(seen[0]).toEqual({ quality: 0.5, dedup: false });
    expect(visuals[0]!.dedupApplied).toBe(false); // dedup:false 면 미적용 표시
  });
});
