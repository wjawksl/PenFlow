// ③ 본문 생성기 (M1: 직접 호출만) — WP2. 조립→호출→후처리→구조검사→HTML.
// 웹 자동화(B)·참고자료 크롤링·프롬프트 라이브러리·일괄생성은 이후 마일스톤.
import type { AITextAdapter } from '@/adapters';
import { appError, ERR } from '@/lib/errors';
import { progress } from '@/lib/logger';
import { assemblePrompt } from '@/lib/prompt';
import { make } from '@/lib/markers';
import { markdownToHtml } from '@/components/validator/convert';
import { ok, err, type Result } from '@/types/common';
import type { Credential, PayloadOptions, Prompt, Topic } from '@/types/models';
import { stripWrappers } from './postprocess';

export interface GenerateParams {
  topic: Topic;
  prompt: Prompt;
  reference?: string;
  options?: PayloadOptions; // 켜진 부가요소 마커를 프롬프트에 지시(M2)
  adapter: AITextAdapter;
  credential: Credential;
  model: string;
}

/** 생성 결과: 소제목(H2) 포함 본문 HTML. M1 마커 검사 = 소제목 1개 이상(구조 검사, 06 §5). */
export async function generateBody(params: GenerateParams): Promise<Result<string>> {
  const { topic, prompt, reference, options, adapter, credential, model } = params;

  progress('generate', 'AI 본문 생성 중…', { percent: 10 });
  const assembled = assemblePrompt(topic, prompt, reference, options);
  const res = await adapter.generate({ prompt: assembled, model, credential });
  if (!res.ok) {
    progress('generate', res.error.message, { level: 'error' });
    return res;
  }

  const body = stripWrappers(res.value);
  if (!body) return err(appError(ERR.AI_EMPTY, '후처리 후 본문이 비었습니다.'));

  const h2Count = countH2(body);
  if (h2Count < 1) {
    // 소제목 누락 → 재생성 후보(2-4, TC-GEN-04).
    return err(
      appError(ERR.MARKER_MISSING, '소제목(##)이 없습니다. 재생성이 필요합니다.', {
        retriable: true,
      }),
    );
  }

  progress('generate', '본문 생성 완료', { percent: 30 });
  // M3 WP1: marked 정식 변환(표·리스트·볼드 포함). 마커는 protect/restore 로 보존.
  let html = markdownToHtml(body);
  // M3 WP4: 소제목 썸네일 옵션 ON 이면 각 <h2> 뒤에 H2THUMB 마커 결정적 주입(R-7.3 1:1).
  if (options?.h2Thumbnail) html = injectH2ThumbMarkers(html);
  return ok(html);
}

const H2_RE = /^\s*##\s+.+$/gm;
function countH2(md: string): number {
  return (md.match(H2_RE) ?? []).length;
}

const H2_CLOSE_RE = /<\/h2>/gi;
const H2_TEXT_RE = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;

/** 각 </h2> 뒤에 [[PF:H2THUMB:n]](n=1..) 주입. 소제목 수와 썸네일 1:1 보장(R-7.3). */
export function injectH2ThumbMarkers(html: string): string {
  let n = 0;
  return html.replace(H2_CLOSE_RE, () => `</h2>\n${make('H2THUMB', String(++n))}`);
}

/** 소제목 텍스트를 등장 순서대로 추출(썸네일 캡션용). 태그 제거·공백 정리. */
export function extractH2Captions(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(H2_TEXT_RE)) {
    out.push(m[1]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  }
  return out;
}

/**
 * 소제목별 섹션(캡션 + 다음 소제목 전까지 본문)을 등장 순서대로 추출(⑨ 이미지 패널 맥락용).
 * 본문은 태그·마커 제거하고 공백 정리 — Gemini 프롬프트에 "이 소제목은 이런 내용" 맥락으로 동반한다.
 */
export function extractH2Sections(html: string): Array<{ caption: string; text: string }> {
  const matches = [...html.matchAll(H2_TEXT_RE)];
  return matches.map((m, i) => {
    const caption = m[1]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? html.length) : html.length;
    const text = html
      .slice(start, end)
      .replace(/\[\[PF:[^\]]+\]\]/g, ' ') // 마커 제거
      .replace(/<[^>]+>/g, ' ') // 태그 제거
      .replace(/\s+/g, ' ')
      .trim();
    return { caption, text };
  });
}

// 요약 호출에 넘기는 섹션 본문 발췌 상한(글자/섹션). 텍스트 LLM 요약 입력이라 넉넉히.
const IMG_SRC_MAX = 700;

/**
 * 선택한 소제목들(캡션+본문)을 인포그래픽 "레이아웃 명세"로 구조화(텍스트 LLM 1회).
 * 섹션마다 제목 → 핵심 수치 라벨 → 데이터 성격별 시각요소(표/차트/플로우)로 일정한 골격을 강제 —
 * 형식을 공통 템플릿처럼 재사용하기 위해 골격 + 퓨샷 예시 + 분기 규칙을 함께 준다(R-내용독립).
 * 내용 구조화에만 충실 — 색·폰트·톤 같은 스타일 지시는 넣지 않는다(그건 사용자 스타일 필드 몫).
 * 실패해도 본문 생성과 분리 — 빈 문자열 폴백.
 */
export async function composeImagePrompt(
  sections: Array<{ caption: string; text: string }>,
  adapter: AITextAdapter,
  credential: Credential,
  model: string,
): Promise<string> {
  if (sections.length === 0) return '';

  const list = sections
    .map((s, i) => `${i + 1}. ${s.caption} — ${s.text.slice(0, IMG_SRC_MAX)}`)
    .join('\n');
  const prompt = [
    '아래는 한국어 정보성 블로그 글의 소제목별 섹션이야. 이걸 인포그래픽 이미지로 그리기 위한 "레이아웃 명세"를 마크다운으로 작성해줘.',
    '각 소제목을 하나의 섹션 블록으로 만들고, 다음 골격을 반드시 따른다:',
    '',
    '## {번호}. {소제목을 다듬은 짧은 주제}',
    '- 제목: "{독자에게 묻는 듯한 한 줄 제목}"',
    '- 핵심 수치·사실을 짧은 "라벨"로 나열(아이콘과 함께 표시될 것).',
    '- 데이터 성격에 맞는 시각 요소를 골라 명시:',
    '  - 구간·등급·비교 수치 → 막대 차트 또는 표(각 항목을 "키: 값" 라벨로).',
    '  - 절차·단계 → 단계별 플로우 차트("1단계: …", "2단계: …").',
    '  - 단일 핵심 수치 → 강조 라벨.',
    '',
    '예시(형식만 참고, 내용 무시):',
    '## 1. 혜택 요약',
    '- 제목: "이 제도, 어떤 혜택이?"',
    '- 아이콘과 "최대 OO원 한도" 라벨.',
    '- 구간별 표:',
    '  - "A구간: 3.0%"',
    '  - "B구간: 2.5%"',
    '## 2. 신청 절차',
    '- 제목: "신청, 어떻게 하나요?"',
    '- 단계별 플로우 차트:',
    '  - "1단계: 상담"',
    '  - "2단계: 신청"',
    '',
    '규칙:',
    '- 본문에 나온 구체적 숫자·수치·구간·항목은 그대로 보존해 라벨로 옮긴다.',
    '- 내용 구조화에만 충실. 색·폰트·톤 같은 스타일 지시는 넣지 말 것(따로 처리).',
    '- 설명·머리말·코드펜스 없이 위 형식의 마크다운만 출력.',
    '',
    '[소제목 섹션]',
    list,
  ].join('\n');

  const res = await adapter.generate({ prompt, model, credential });
  if (!res.ok) {
    progress('generate', `레이아웃 명세 건너뜀: ${res.error.message}`, { level: 'warn' });
    return '';
  }
  return stripWrappers(res.value).trim();
}

/** 본문에서 제목 추출(07 §7): 첫 H2 텍스트. 없으면 주제 키워드. */
export function extractTitle(contentHtml: string, fallback: string): string {
  const m = contentHtml.match(/<h2>(.*?)<\/h2>/);
  return m ? m[1]!.trim() : fallback;
}
