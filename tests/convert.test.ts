import { describe, it, expect } from 'vitest';
import {
  htmlToMarkdown,
  markdownToHtml,
  sanitizeHtml,
} from '@/components/validator/convert';
import { make, scan, MARKER_TYPES } from '@/lib/markers';

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

  it('전 마커 타입이 표·리스트·링크 섞인 본문 왕복 후 순서·타입 불변이다 (R-8.4 전수)', () => {
    // 모든 MarkerType 을 본문 곳곳(소제목/문단/표/리스트 경계)에 박아 turndown/marked 가
    // 어떤 타입도 코드·링크로 오인하거나 블록 경계에서 삼키지 않음을 보장한다.
    const mk = MARKER_TYPES.map((t, i) => make(t, String(i)));
    const html =
      `<h2>제목${mk[0]}</h2>` +
      `<p>본문 앞${mk[1]} 가운데 <strong>굵게</strong> ${mk[2]} 뒤</p>` +
      `${mk[3]}` +
      `<ul><li>항목 ${mk[4]}</li><li>${mk[5]} 항목</li></ul>` +
      `<table><thead><tr><th>A</th><th>B</th></tr></thead>` +
      `<tbody><tr><td>1 ${mk[6]}</td><td>2</td></tr></tbody></table>` +
      `<p><a href="https://x.test">링크${mk[7]}</a></p>` +
      `${mk[8]}`;
    const before = scan(html);
    expect(before.map((m) => m.type)).toEqual([...MARKER_TYPES]);

    const round = markdownToHtml(htmlToMarkdown(html));
    const after = scan(round);
    expect(after.length).toBe(before.length);
    // 등장 순서·타입·키 모두 보존
    expect(after.map((m) => m.type)).toEqual(before.map((m) => m.type));
    expect(after.map((m) => m.key)).toEqual(before.map((m) => m.key));
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
