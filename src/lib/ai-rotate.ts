// 복수 API 키 순환(R-0.1·R-0.2) — 단일 호출을 키 순서대로 시도, 키 귀속 실패(AI_QUOTA)면 다음 키로 전환.
// 본문 생성·어투 분석·이미지 프롬프트 등 텍스트 LLM 호출이 공유한다. AI_QUOTA 외 오류는 즉시 반환(키 문제 아님).
import { appError, ERR } from '@/lib/errors';
import { err, type Result } from '@/types/common';
import type { Credential } from '@/types/models';

/**
 * `call`(자격증명 1개 받아 Result 반환)을 키 목록으로 순환 실행.
 * 첫 키로 호출 → AI_QUOTA(429/403/무효키 400)면 다음 키 재시도 → 다 떨어지면 마지막 에러.
 * @param onRotate 다음 키로 넘어갈 때(2번째부터) 호출 — 진행 메시지용. attempt = 1-based 키 순번.
 */
export async function callWithKeyRotation<T>(
  credentials: Credential[],
  call: (credential: Credential) => Promise<Result<T>>,
  onRotate?: (attempt: number) => void,
): Promise<Result<T>> {
  if (credentials.length === 0) return err(appError(ERR.NO_CREDENTIAL, 'AI 인증 키가 없습니다.'));
  let res = await call(credentials[0]!);
  for (let i = 1; i < credentials.length && !res.ok && res.error.code === ERR.AI_QUOTA; i++) {
    onRotate?.(i + 1);
    res = await call(credentials[i]!);
  }
  return res;
}
