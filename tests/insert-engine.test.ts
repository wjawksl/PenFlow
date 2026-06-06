import { describe, it, expect } from 'vitest';
import { taskToHtml } from '@/components/insert/engine';
import type { InsertTask } from '@/types/models';

// WP6 정식화 TC — 스파이크 실측(표·링크 모두 HTML paste → SE 컴포넌트) 기반.
// taskToHtml 은 ⑥ 삽입엔진이 각 InsertTask 를 paste 할 HTML 조각으로 변환하는 순수 함수.
describe('insert engine — taskToHtml (M2 WP6)', () => {
  it('표(productTable)는 합성기가 만든 HTML table 을 그대로 paste 한다', () => {
    const table = '<table><tr><td>A</td><td>B</td></tr></table>';
    const task: InsertTask = { type: 'productTable', content: table };
    expect(taskToHtml(task)).toBe(table); // 변형 없이 통과 → SE .se-table 자동 변환
  });

  it('쇼핑 링크는 link 우선으로 <a href> 인라인 링크를 만든다', () => {
    const task: InsertTask = { type: 'shoppingLink', content: '쇼핑', link: 'https://x.test' };
    expect(taskToHtml(task)).toBe('<a href="https://x.test">https://x.test</a>');
  });

  it('쇼핑 링크에 link 가 없으면 content 의 URL 을 쓴다', () => {
    const task: InsertTask = { type: 'shoppingLink', content: 'https://y.test' };
    expect(taskToHtml(task)).toBe('<a href="https://y.test">https://y.test</a>');
  });

  it('URL 이 전혀 없으면 빈 문자열(스킵 대상)', () => {
    const task: InsertTask = { type: 'shoppingLink', content: '' };
    expect(taskToHtml(task)).toBe('');
  });

  it('백링크(backlink)·CTA 는 content HTML 을 그대로 통과시킨다', () => {
    expect(taskToHtml({ type: 'backlink', content: '<a href="/p">이전 글</a>' })).toBe(
      '<a href="/p">이전 글</a>',
    );
    expect(taskToHtml({ type: 'ctaButton', content: '<button>구매</button>' })).toBe(
      '<button>구매</button>',
    );
  });

  it('text 는 그대로, adNotice 는 <p> 로 감싼다', () => {
    expect(taskToHtml({ type: 'text', content: '<h2>제목</h2>' })).toBe('<h2>제목</h2>');
    expect(taskToHtml({ type: 'adNotice', content: '협찬 표기' })).toBe('<p>협찬 표기</p>');
  });

  it('이미지(image)는 M2 미지원 → 빈 문자열(삽입 루프에서 스킵)', () => {
    expect(taskToHtml({ type: 'image', content: 'ref' })).toBe('');
  });

  it('content 가 없으면 빈 문자열로 안전 처리', () => {
    expect(taskToHtml({ type: 'text', content: undefined as unknown as string })).toBe('');
  });
});
