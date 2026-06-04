// ③ 본문 생성기 (M1: 직접 호출만) — WP2. 조립→호출→후처리→구조검사→HTML.
// 웹 자동화(B)·참고자료 크롤링·프롬프트 라이브러리·일괄생성은 이후 마일스톤.
import type { AITextAdapter } from '@/adapters';
import { appError, ERR } from '@/lib/errors';
import { progress } from '@/lib/logger';
import { assemblePrompt } from '@/lib/prompt';
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
  return ok(markdownLiteToHtml(body));
}

const H2_RE = /^\s*##\s+.+$/gm;
function countH2(md: string): number {
  return (md.match(H2_RE) ?? []).length;
}

/** M1 경량 변환: ## → h2, 빈 줄 구분 문단 → p. 정식 변환(turndown/marked)은 ⑩(M3). */
export function markdownLiteToHtml(md: string): string {
  const blocks = md.split(/\n{2,}/);
  return blocks
    .map((b) => {
      const line = b.trim();
      if (!line) return '';
      const h2 = line.match(/^##\s+(.+)$/);
      if (h2) return `<h2>${escapeHtml(h2[1]!.trim())}</h2>`;
      return `<p>${escapeHtml(line).replace(/\n/g, '<br>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 본문에서 제목 추출(07 §7): 첫 H2 텍스트. 없으면 주제 키워드. */
export function extractTitle(contentHtml: string, fallback: string): string {
  const m = contentHtml.match(/<h2>(.*?)<\/h2>/);
  return m ? m[1]!.trim() : fallback;
}
