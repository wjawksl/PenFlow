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

/** 본문에서 제목 추출(07 §7): 첫 H2 텍스트. 없으면 주제 키워드. */
export function extractTitle(contentHtml: string, fallback: string): string {
  const m = contentHtml.match(/<h2>(.*?)<\/h2>/);
  return m ? m[1]!.trim() : fallback;
}
