import { describe, it, expect } from 'vitest';
import {
  analyzeDensity,
  countKeyword,
  countTokens,
  extractText,
} from '@/components/validator/density';
import { make } from '@/lib/markers';

describe('density (⑩ WP2 — 키워드 밀도)', () => {
  it('extractText: 마커·태그 제거 + 엔티티 복원 (DOM 불필요)', () => {
    const html = `<h2>캠핑 의자</h2>${make('AD')}<p>가볍고 &amp; 튼튼한 의자</p>`;
    expect(extractText(html)).toBe('캠핑 의자 가볍고 & 튼튼한 의자');
  });

  it('countKeyword: 조사 결합도 부분일치로 센다', () => {
    const text = '아이폰15 프로 카메라. 아이폰 추천!'; // "아이폰15", "아이폰 추천" 둘 다
    expect(countKeyword(text, '아이폰')).toBe(2);
  });

  it('countKeyword: 대소문자 무시', () => {
    expect(countKeyword('iPhone IPHONE iphone', 'iphone')).toBe(3);
  });

  it('countTokens: 공백 기준 단어 수', () => {
    expect(countTokens('가  나   다')).toBe(3);
    expect(countTokens('')).toBe(0);
  });

  it('analyzeDensity: 권장범위 기준 과다/적정/부족 판정 (R-8.2)', () => {
    // 본문 단어 10개, "캠핑" 3회 → 30% 과다.
    const html = '<p>캠핑 캠핑 캠핑 의자 가방 텐트 랜턴 코펠 버너 매트</p>';
    const r = analyzeDensity(html, ['캠핑', '의자', '없는말'], { min: 1, max: 3 });
    const m = Object.fromEntries(r.items.map((i) => [i.keyword, i]));
    expect(m['캠핑']!.count).toBe(3);
    expect(m['캠핑']!.verdict).toBe('high'); // 30% > 3%
    expect(m['의자']!.verdict).toBe('high'); // 10% > 3%
    expect(m['없는말']!.count).toBe(0);
    expect(m['없는말']!.verdict).toBe('low'); // 0% < 1%
  });

  it('analyzeDensity: 권장범위 안이면 ok', () => {
    // 단어 100개 중 "키워드" 2회 → 2% (1~3% 안).
    const body = ('키워드 ' + 'x '.repeat(49)).repeat(2).trim(); // 키워드 2 + x 98 = 100
    const r = analyzeDensity(`<p>${body}</p>`, ['키워드'], { min: 1, max: 3 });
    expect(r.items[0]!.count).toBe(2);
    expect(r.items[0]!.verdict).toBe('ok');
  });

  it('analyzeDensity: 마커 내부 텍스트는 세지 않는다', () => {
    const html = `<p>SHOP 안내</p>${make('SHOP', '1')}`;
    const r = analyzeDensity(html, ['SHOP'], { min: 0, max: 100 });
    expect(r.items[0]!.count).toBe(1); // 본문 1건만, 마커 내부 SHOP 제외
  });

  it('analyzeDensity: 중복 키워드는 한 번만(대소문자 무시)', () => {
    const r = analyzeDensity('<p>테스트</p>', ['테스트', '테스트', ' 테스트 '], { min: 1, max: 3 });
    expect(r.items.length).toBe(1);
  });
});
