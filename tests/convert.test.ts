import { describe, it, expect } from 'vitest';
import {
  htmlToMarkdown,
  markdownToHtml,
  replaceInBody,
  sanitizeHtml,
} from '@/components/validator/convert';
import { make, scan } from '@/lib/markers';

describe('convert (⑩ WP1)', () => {
  it('Markdown 표/리스트/볼드를 HTML 로 변환한다 (사용자 표 깨짐 해결)', () => {
    const md = '## 제목\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- 항목1\n- 항목2\n\n**굵게**';
    const html = markdownToHtml(md);
    expect(html).toContain('<h2>제목</h2>');
    expect(html).toContain('<table>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<strong>굵게</strong>');
  });

  it('마커는 HTML→MD→HTML 왕복 후에도 개수가 불변이다 (R-8.4 왕복 DoD)', () => {
    const html = `<h2>제목</h2>${make('AD')}<p>본문</p>${make('SHOP', '1')}<p>끝</p>${make('CTA')}`;
    const before = scan(html).length;
    const round = markdownToHtml(htmlToMarkdown(html));
    expect(scan(round).length).toBe(before);
    expect(scan(round).map((m) => m.type)).toEqual(['AD', 'SHOP', 'CTA']);
  });

  it('단독 마커 문단은 <p> 로 감싸지 않는다 (compose 슬라이스 안전)', () => {
    const html = markdownToHtml(`${make('AD')}\n\n## 소제목\n\n본문`);
    expect(html).not.toContain(`<p>${make('AD')}</p>`);
    expect(html).toContain(make('AD'));
  });
});

describe('sanitizeHtml (⑩ WP1 1-2 — 삽입 직전 정제)', () => {
  it('script·이벤트 핸들러를 제거한다 (XSS 방어)', () => {
    const dirty = '<p onclick="alert(1)">본문</p><script>alert(2)</script>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('본문');
  });

  it('표·리스트·링크·강조 등 본문 서식은 통과시킨다', () => {
    const html =
      '<h2>제목</h2><table><tr><td>A</td></tr></table><ul><li>x</li></ul><strong>굵게</strong><a href="https://x.test">링크</a>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('<h2>제목</h2>');
    expect(clean).toContain('<table>');
    expect(clean).toContain('<li>x</li>');
    expect(clean).toContain('<strong>굵게</strong>');
    expect(clean).toContain('href="https://x.test"');
  });

  it('javascript: 링크는 href 가 제거된다', () => {
    const clean = sanitizeHtml('<a href="javascript:alert(1)">위험</a>');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('위험');
  });

  it('마커는 정제 후에도 보존된다 (R-8.3)', () => {
    const html = `<p>앞</p>${make('SHOP', '1')}<script>bad()</script><p>뒤</p>`;
    const clean = sanitizeHtml(html);
    expect(scan(clean).map((m) => m.type)).toEqual(['SHOP']);
    expect(clean).not.toContain('<script');
  });
});

describe('replaceInBody (⑩ WP3 — 찾기·바꾸기)', () => {
  it('일괄 치환하고 치환 개수를 센다 (3-1)', () => {
    const r = replaceInBody('<p>아이폰 좋다. 아이폰 최고. 아이폰!</p>', '아이폰', 'iPhone');
    expect(r.count).toBe(3);
    expect(r.html).toBe('<p>iPhone 좋다. iPhone 최고. iPhone!</p>');
  });

  it('일치 없으면 count 0, 본문 불변', () => {
    const html = '<p>본문</p>';
    const r = replaceInBody(html, '없는말', 'x');
    expect(r.count).toBe(0);
    expect(r.html).toBe(html);
  });

  it('빈 find 는 아무것도 하지 않는다', () => {
    const html = '<p>본문</p>';
    const r = replaceInBody(html, '', 'x');
    expect(r.count).toBe(0);
    expect(r.html).toBe(html);
  });

  it('마커는 치환에 휩쓸리지 않는다 (3-2, R-8.3)', () => {
    const html = `<p>SHOP 안내</p>${make('SHOP', '1')}<p>SHOP 끝</p>`;
    const r = replaceInBody(html, 'SHOP', '쇼핑');
    expect(r.count).toBe(2); // 본문 텍스트 2건만, 마커 내부 SHOP 은 제외
    expect(scan(r.html).map((m) => m.type)).toEqual(['SHOP']); // 마커 보존
    expect(r.html).toContain('쇼핑 안내');
    expect(r.html).toContain('쇼핑 끝');
  });
});
