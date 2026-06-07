import { describe, it, expect } from 'vitest';
import { compose } from '@/components/composer';
import { make } from '@/lib/markers';
import type { PayloadOptions, Visual } from '@/types/models';

const baseOpts: PayloadOptions = { includeSourceLink: false };

const visual = (id: string, h2Caption?: string): Visual => ({
  role: 'H2_THUMB',
  source: 'DEFAULT',
  data: { kind: 'ref', id },
  dedupApplied: false,
  h2Caption,
});

describe('composer.compose', () => {
  it('마커 순서대로 InsertQueue 를 만든다 (R-3.2/R-3.3)', () => {
    const html = `<p>앞</p>${make('SHOP', 'a')}<p>중간</p>${make('CTA')}<p>뒤</p>`;
    const opts: PayloadOptions = {
      ...baseOpts,
      shoppingLink: { url: 'https://x.test', positions: [] },
      ctaButton: '<button>구매</button>',
    };
    const r = compose(html, opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((t) => t.type)).toEqual([
      'text',
      'shoppingLink',
      'text',
      'ctaButton',
      'text',
    ]);
    expect(r.value[1]).toMatchObject({ type: 'shoppingLink', link: 'https://x.test' });
  });

  it('리소스 없는 일반 마커는 스킵한다 (R-3.1)', () => {
    const html = `<p>본문</p>${make('PRODUCT', 'p1')}`;
    const r = compose(html, baseOpts); // productTable 옵션 없음
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((t) => t.type)).toEqual(['text']); // PRODUCT 스킵
  });

  it('비주얼이 없으면 이미지 마커는 스킵한다 (R-3.1)', () => {
    const html = `${make('H2THUMB', '1')}<p>본문</p>${make('IMG', '1')}`;
    const r = compose(html, baseOpts); // visuals 없음
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((t) => t.type)).toEqual(['text']);
  });

  it('이미지 마커는 등장 순서대로 visuals 와 매칭해 image 작업을 만든다 (R-7.6, M3 WP4)', () => {
    const html = `<h2>A</h2>${make('H2THUMB', '1')}<p>본문</p><h2>B</h2>${make('H2THUMB', '2')}`;
    const r = compose(html, baseOpts, [visual('id-1', 'A'), visual('id-2', 'B')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const images = r.value.filter((t) => t.type === 'image');
    expect(images).toHaveLength(2);
    expect(images[0]!.content).toEqual({ kind: 'ref', id: 'id-1' }); // 순서 보존
    expect(images[1]!.content).toEqual({ kind: 'ref', id: 'id-2' });
  });

  it('비주얼이 마커보다 적으면 남는 마커는 스킵한다 (R-3.1)', () => {
    const html = `${make('H2THUMB', '1')}<p>x</p>${make('H2THUMB', '2')}`;
    const r = compose(html, baseOpts, [visual('only-1')]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.filter((t) => t.type === 'image')).toHaveLength(1);
  });

  it('광고 옵션 ON 인데 AD 마커 없으면 합성 차단 (R-3.4)', () => {
    const html = `<p>본문</p>${make('CTA')}`;
    const opts: PayloadOptions = { ...baseOpts, adNotice: { text: '협찬 표기', position: 'top' } };
    const r = compose(html, opts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('AD_MISSING');
  });

  it('광고 옵션 ON + AD 마커 있으면 adNotice 작업이 들어간다 (R-3.4)', () => {
    const html = `${make('AD')}<p>본문</p>`;
    const opts: PayloadOptions = { ...baseOpts, adNotice: { text: '협찬 표기', position: 'top' } };
    const r = compose(html, opts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]).toMatchObject({ type: 'adNotice', content: '협찬 표기' });
  });
});
