// 에러 표준 — 05 §7. "사용자 통지 + 안전 종료" 패턴 공통화.
// 컨텍스트 경계를 넘는 에러는 AppError 로 직렬화해 전달한다.
import type { AppError } from '@/types/common';

export function appError(
  code: string,
  message: string,
  extra?: { failedStep?: string; retriable?: boolean },
): AppError {
  return { code, message, ...extra };
}

// 자주 쓰는 코드 — 08 §1 예시 + 17장 엣지 케이스.
export const ERR = {
  AI_QUOTA: 'AI_QUOTA',
  AI_EMPTY: 'AI_EMPTY',
  AI_FORMAT: 'AI_FORMAT',
  MARKER_MISSING: 'MARKER_MISSING',
  EDITOR_NOT_FOUND: 'EDITOR_NOT_FOUND',
  EDITOR_NO_FOCUS: 'EDITOR_NO_FOCUS',
  INSERT_FAILED: 'INSERT_FAILED',
  EMPTY_PAYLOAD: 'EMPTY_PAYLOAD',
  NO_CREDENTIAL: 'NO_CREDENTIAL',
  KEYWORD_AUTH: 'KEYWORD_AUTH', // 검색광고 서명/키/시계 오차(R-0.5)
  KEYWORD_FAILED: 'KEYWORD_FAILED', // 검색광고 호출 실패(네트워크·타임아웃·서버)
} as const;
