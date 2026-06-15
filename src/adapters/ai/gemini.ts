// AI 본문 어댑터 — Gemini 직접 호출(03 생성 방식 A). 얇은 fetch 래퍼(04 §6).
// 키 순환·재시도는 상위(generateBody, R-0.2)가 처리. 어댑터는 단일 호출만 — 키 귀속 실패(429/403/400 무효키)를 AI_QUOTA 로 신호.
import type { AITextAdapter } from '@/adapters';
import { appError, ERR } from '@/lib/errors';
import { ok, err } from '@/types/common';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 60_000;

export const geminiTextAdapter: AITextAdapter = {
  async generate({ prompt, model, credential }) {
    const apiKey = credential.fields.apiKey?.trim();
    if (!apiKey) {
      return err(appError(ERR.NO_CREDENTIAL, 'AI 인증 키(apiKey)가 없습니다.'));
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(
        `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: ctrl.signal,
        },
      );

      if (!res.ok) {
        // 키 귀속 실패(429 한도·403 권한·400 무효키)는 다음 키로 전환(R-0.2). 사유 통지(R-2.3).
        // 400 은 모호 — 무효키 vs 잘못된 요청. Gemini 무효키 = INVALID_ARGUMENT "API key not valid".
        // 본문에 그 신호가 있을 때만 전환(잘못된 요청은 키 다 써도 똑같이 실패 → 낭비).
        const body = await res.text().catch(() => '');
        const badKey = res.status === 400 && /api[_ ]?key not valid/i.test(body);
        const rotate = res.status === 429 || res.status === 403 || badKey;
        return err(
          appError(
            rotate ? ERR.AI_QUOTA : ERR.AI_FORMAT,
            badKey ? 'API 키가 유효하지 않음 (HTTP 400)' : `AI 호출 실패 (HTTP ${res.status})`,
            { retriable: rotate },
          ),
        );
      }

      const json: unknown = await res.json();
      const text = extractText(json);
      if (!text) return err(appError(ERR.AI_EMPTY, 'AI 응답이 비어 있습니다.'));
      return ok(text);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      return err(
        appError(
          ERR.AI_FORMAT,
          aborted ? 'AI 호출 시간 초과' : `AI 호출 오류: ${String(e)}`,
          { retriable: true },
        ),
      );
    } finally {
      clearTimeout(timer);
    }
  },
};

function extractText(json: unknown): string {
  const j = json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}
