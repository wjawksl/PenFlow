// 프롬프트 조립 — 06 §4. 소제목(##) 구조 강제 + (M2)부가요소 마커 지시.
import type { PayloadOptions, Prompt, Topic, VoiceProfile } from '@/types/models';

// 시스템 지시(고정) — 06 §4.2. M1 은 이미지/부가 마커를 요구하지 않고 소제목 구조만 강제한다.
const SYSTEM_INSTRUCTION = [
  '너는 한국어 네이버 블로그 글을 쓰는 작가다.',
  '규칙:',
  '1. 소제목은 마크다운 H2(`## 제목`)로 구분한다. 최소 2개 이상.',
  '2. 출력은 본문 텍스트만. 코드펜스(```)·"다음은 글입니다" 같은 머리말/꼬리말 금지.',
  '3. 자연스러운 한국어 문단으로 작성한다.',
].join('\n');

// 다듬기(대화형 생성 B) 시스템 지시 — 기존 글을 지시대로 고쳐 전체를 다시 출력.
// 핵심: [수정 지시]를 반드시 실제로 반영해야 한다(원문 그대로 반환 금지). 강조 안 하면 모델이 거의 안 고침.
const REFINE_INSTRUCTION = [
  '너는 한국어 네이버 블로그 글을 다듬는 작가다.',
  '아래 [기존 글]을 [수정 지시]대로 실제로 고쳐서 글 전체를 다시 출력한다.',
  '가장 중요한 규칙: [수정 지시]를 반드시 반영한다. 지시 내용이 글에 분명히 드러나야 한다. 원문을 거의 그대로 돌려주는 것은 실패다.',
  '그 밖의 규칙:',
  '1. 소제목은 마크다운 H2(`## 제목`)로 구분한다. 최소 2개 이상 유지한다.',
  '2. 기존 글에 있던 `[[PF:...]]` 마커는 위치를 유지한 채 그대로 보존한다.',
  '3. 출력은 본문 텍스트만. 코드펜스(```)·"다음은 글입니다" 같은 머리말/꼬리말 금지.',
  '4. 지시가 특정 부분만 가리키면 그 부분을 확실히 바꾸고 나머지는 자연스럽게 이어지도록 유지한다.',
].join('\n');

// 06 §4.1 — [시스템 지시] + [마커 지시] + (선택)[어투 지침] + [사용자 프롬프트] + [주제] + (선택)[참고 자료]
export function assemblePrompt(
  topic: Topic,
  prompt: Prompt,
  reference?: string,
  options?: PayloadOptions,
  voice?: VoiceProfile,
): string {
  const parts = [SYSTEM_INSTRUCTION];
  const markers = markerInstructions(options);
  if (markers) parts.push(markers);
  const voiceGuide = voiceInstructions(voice);
  if (voiceGuide) parts.push(voiceGuide);
  parts.push(`\n[사용자 지시]\n${prompt.body}`);
  parts.push(`\n[주제]\n${topic.title ?? topic.keyword}`);
  if (reference?.trim()) parts.push(`\n[참고 자료]\n${reference}`);
  return parts.join('\n');
}

// 대화형 생성(B) — 기존 본문(MD) + 수정 지시 → LLM 1회로 전체 본문 재작성.
// 마커·어투 주입은 생성과 동일(다듬어도 마커/말투 유지). 어댑터는 단일 프롬프트라 본문을 그대로 동봉한다.
export function assembleRefinePrompt(
  currentMd: string,
  instruction: string,
  options?: PayloadOptions,
  voice?: VoiceProfile,
): string {
  const parts = [REFINE_INSTRUCTION];
  const markers = markerInstructions(options);
  if (markers) parts.push(markers);
  const voiceGuide = voiceInstructions(voice);
  if (voiceGuide) parts.push(voiceGuide);
  parts.push(`\n[기존 글]\n${currentMd}`);
  parts.push(`\n[수정 지시]\n${instruction}`);
  return parts.join('\n');
}

// 활성 어투 프로필을 글 전체에 통일하도록 지시. 내용은 주제에 맞추되 '말투'만 이 스타일을 흉내내게 한다.
function voiceInstructions(voice?: VoiceProfile): string {
  if (!voice?.spec.trim()) return '';
  const lines = [
    '\n[어투 지침] 아래 어투로 글 전체를 통일해서 써라. 내용은 주제에 맞추되, 말투·문체만 이 스타일을 따른다:',
    voice.spec.trim(),
  ];
  const ex = voice.excerpts.filter((e) => e.trim());
  if (ex.length) {
    lines.push('참고할 어투 예시(문체만 흉내내고 내용은 베끼지 말 것):');
    ex.forEach((e) => lines.push(`"${e.trim()}"`));
  }
  return lines.join('\n');
}

// 켜진 부가요소만 마커를 emit 하도록 지시(06 §4.2). 마커는 ④ compose 가 옵션 리소스로 치환.
function markerInstructions(o?: PayloadOptions): string {
  if (!o) return '';
  const lines: string[] = [];
  if (o.adNotice) lines.push('- 본문 맨 위에 `[[PF:AD:0]]` 를 한 줄로 출력한다.');
  if (o.shoppingLink) lines.push('- 본문 중 관련 맥락 위치에 `[[PF:SHOP:1]]` 를 한 줄로 출력한다.');
  if (o.ctaButton) lines.push('- 본문 맨 끝에 `[[PF:CTA:0]]` 를 한 줄로 출력한다.');
  if (o.backlinkBlock) lines.push('- 본문 맨 끝에 `[[PF:BACKLINK:0]]` 를 한 줄로 출력한다.');
  if (lines.length === 0) return '';
  return ['\n[삽입 지점 마커 규칙] 아래 마커만 지정 위치에 정확히 출력(다른 마커 생성 금지):', ...lines].join('\n');
}

// 기본 프롬프트 — 라이브러리(R-2.1, prompt-library)에 저장된 게 없을 때의 시드. 사용자가 비우면 이걸 쓴다.
export const DEFAULT_PROMPT: Prompt = {
  name: '기본',
  body: '주어진 주제로 정보성 네이버 블로그 글을 작성해줘. 소제목으로 단락을 나눠줘.',
};
