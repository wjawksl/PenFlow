// 공통 기본 타입 — 08 §1. 단일 출처.

/** 이미지 등 큰 바이너리: ⑤ 저장소 참조(id) 또는 인라인. 컨텍스트 간엔 ref만 전달(05 §5). */
export type BinaryOrRef =
  | { kind: 'ref'; id: string } // IndexedDB 레코드 키
  | { kind: 'inline'; dataUrl: string };

export type Duration = number; // ms
export type ISODateTime = string; // ISO 8601

/** 표준 결과 봉투: 성공/실패를 명시(에러 표준, 05 §7). */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export interface AppError {
  code: string; // 예: 'AI_QUOTA', 'EDITOR_NOT_FOUND'
  message: string; // 사용자 통지용
  failedStep?: string; // 실패 작업 명시(R-4.4)
  retriable?: boolean;
}

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = (error: AppError): Result<never> => ({ ok: false, error });
