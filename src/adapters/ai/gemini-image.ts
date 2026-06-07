// AI 이미지 어댑터 — Gemini 이미지 생성(⑨, 10.2 AI 모드). 얇은 fetch 래퍼(04 §6).
// 본문 어댑터(gemini.ts)와 같은 endpoint·키 인증. 응답의 inlineData(base64)를 dataUrl 로 반환.
// 큰 바이너리지만 어댑터는 inline 으로 돌려주고, 저장(Dexie ref)은 호출부(background)가 처리(05 §5).
import type { AIImageAdapter } from '@/adapters';
import { appError, ERR } from '@/lib/errors';
import { ok, err, type BinaryOrRef } from '@/types/common';
import type { ModelReference } from '@/types/models';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 120_000; // 이미지 생성은 본문보다 오래 걸린다

export const geminiImageAdapter: AIImageAdapter = {
  async generate({ prompt, model, credential, modelRef }) {
    const apiKey = credential.fields.apiKey?.trim();
    if (!apiKey) {
      return err(appError(ERR.NO_CREDENTIAL, 'AI 이미지 인증 키(apiKey)가 없습니다.'));
    }

    const parts: Array<Record<string, unknown>> = [{ text: prompt }];
    const ref = modelRefPart(modelRef); // R-7.7 — 참조 이미지 동반(WP6, 있을 때만)
    if (ref) parts.push(ref);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(
        `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
          signal: ctrl.signal,
        },
      );

      if (!res.ok) {
        const quota = res.status === 429 || res.status === 403;
        return err(
          appError(quota ? ERR.AI_QUOTA : ERR.AI_FORMAT, `AI 이미지 호출 실패 (HTTP ${res.status})`, {
            retriable: quota,
          }),
        );
      }

      const json: unknown = await res.json();
      const dataUrl = extractImageDataUrl(json);
      if (!dataUrl) return err(appError(ERR.AI_EMPTY, 'AI 이미지 응답에 이미지가 없습니다.'));
      return ok<BinaryOrRef>({ kind: 'inline', dataUrl });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      return err(
        appError(ERR.AI_FORMAT, aborted ? 'AI 이미지 호출 시간 초과' : `AI 이미지 호출 오류: ${String(e)}`, {
          retriable: true,
        }),
      );
    } finally {
      clearTimeout(timer);
    }
  },
};

// 참조 이미지를 inlineData 파트로(WP6). dataUrl(`data:<mime>;base64,<data>`) 만 지원 — ref 해석은 호출부 몫.
function modelRefPart(modelRef?: ModelReference): Record<string, unknown> | null {
  if (modelRef?.image.kind !== 'inline') return null;
  const m = /^data:([^;]+);base64,(.+)$/.exec(modelRef.image.dataUrl);
  if (!m) return null;
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

// 응답 parts 중 첫 이미지(inlineData)를 dataUrl 로. candidates[0].content.parts[].inlineData.{mimeType,data}.
function extractImageDataUrl(json: unknown): string | null {
  const j = json as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
  };
  for (const part of j.candidates?.[0]?.content?.parts ?? []) {
    const img = part.inlineData;
    if (img?.data) return `data:${img.mimeType ?? 'image/png'};base64,${img.data}`;
  }
  return null;
}
