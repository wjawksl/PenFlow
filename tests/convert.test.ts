import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, markdownToHtml } from '@/components/validator/convert';
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
