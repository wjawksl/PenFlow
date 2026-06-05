import { describe, it, expect } from 'vitest';
import { topicsToRows, rowsToTopics } from '@/lib/sheet';
import type { Topic } from '@/types/models';

const topics: Topic[] = [
  { id: 'a', keyword: '캠핑', metrics: { volume: 1200, competition: 3 } },
  { id: 'b', keyword: '캠핑의자', metrics: { volume: 30, competition: 1 } },
  { id: 'c', keyword: '경량텐트' }, // metrics 없음
];

describe('sheet 입출력(1-5)', () => {
  it('Topic → 행: 경쟁도 라벨 변환', () => {
    const rows = topicsToRows(topics);
    expect(rows[0]).toEqual({ 키워드: '캠핑', 검색량: 1200, 경쟁도: '높음', 출처: '' });
    expect(rows[1]?.경쟁도).toBe('낮음');
    expect(rows[2]).toEqual({ 키워드: '경량텐트', 검색량: '', 경쟁도: '', 출처: '' });
  });

  it('출처(source) 보존 왕복', () => {
    const back = rowsToTopics(topicsToRows([{ id: 'x', keyword: '캠핑카', source: 'youtube' }]));
    expect(back[0]?.source).toBe('youtube');
  });

  it('행 → Topic 왕복: 키워드·검색량·경쟁도 보존', () => {
    const back = rowsToTopics(topicsToRows(topics));
    expect(back.map((t) => t.keyword)).toEqual(['캠핑', '캠핑의자', '경량텐트']);
    expect(back[0]?.metrics?.volume).toBe(1200);
    expect(back[0]?.metrics?.competition).toBe(3);
    expect(back[1]?.metrics?.competition).toBe(1);
  });

  it('빈 키워드 행은 버린다', () => {
    const back = rowsToTopics([{ 키워드: '', 검색량: 10, 경쟁도: '중간' }]);
    expect(back).toHaveLength(0);
  });
});
