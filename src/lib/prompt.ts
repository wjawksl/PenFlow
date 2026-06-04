// 프롬프트 조립 — 06 §4. M1: 소제목(##) 구조 강제, 직접 호출 방식만.
import type { Prompt, Topic } from '@/types/models';

// 시스템 지시(고정) — 06 §4.2. M1 은 이미지/부가 마커를 요구하지 않고 소제목 구조만 강제한다.
const SYSTEM_INSTRUCTION = [
  '너는 한국어 네이버 블로그 글을 쓰는 작가다.',
  '규칙:',
  '1. 소제목은 마크다운 H2(`## 제목`)로 구분한다. 최소 2개 이상.',
  '2. 출력은 본문 텍스트만. 코드펜스(```)·"다음은 글입니다" 같은 머리말/꼬리말 금지.',
  '3. 자연스러운 한국어 문단으로 작성한다.',
].join('\n');

// 06 §4.1 — [시스템 지시] + [사용자 프롬프트] + [주제] + (선택)[참고 자료]
export function assemblePrompt(topic: Topic, prompt: Prompt, reference?: string): string {
  const parts = [
    SYSTEM_INSTRUCTION,
    `\n[사용자 지시]\n${prompt.body}`,
    `\n[주제]\n${topic.title ?? topic.keyword}`,
  ];
  if (reference?.trim()) parts.push(`\n[참고 자료]\n${reference}`);
  return parts.join('\n');
}

// M1 기본 프롬프트(프롬프트 라이브러리 R-2.1 은 M2). 사용자가 비우면 이걸 쓴다.
export const DEFAULT_PROMPT: Prompt = {
  name: '기본',
  body: '주어진 주제로 정보성 네이버 블로그 글을 작성해줘. 소제목으로 단락을 나눠줘.',
};
