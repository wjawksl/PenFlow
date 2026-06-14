// 어댑터 인터페이스 단일 출처 — 04·05 §7 + 08 §5. 이식성(비기능).
// 벤더 교체가 가능하도록 컴포넌트는 아래 인터페이스에만 의존한다.
import type { BinaryOrRef, Duration, Result } from '@/types/common';
import type { Credential, Topic } from '@/types/models';

// ── AI 본문 (③) ─ 키 순환·재시도는 상위(오케스트레이터)가 처리, 어댑터는 단일 호출 ──
export interface AITextAdapter {
  generate(req: {
    prompt: string;
    model: string;
    credential: Credential;
  }): Promise<Result<string>>;
}

// ── 외부 이미지 소스 (⑨) ────────────────────────────────────
export interface ImageSourceAdapter {
  search(req: {
    query: string;
    credential?: Credential;
    delayMs?: Duration;
  }): Promise<Result<BinaryOrRef[]>>; // 지연(R-7.5)
}

// ── 주제 소스 (②) ─ 네이버·구글·동영상 등 추가/교체(R-1.3) ──
export interface TopicSourceAdapter {
  readonly id: string;
  collect(req: {
    seed: string; // 경로 A: 키워드, 경로 B: blogId
    credential?: Credential;
    signal?: AbortSignal;
    count?: number; // 경로 B: 수집할 게시물 개수(경로 A 는 무시)
  }): Promise<Result<Topic[]>>; // 중단 가능(R-1.2)
}

// ── 저장소 (⑤/① 추상화) ─ 벤더 교체 가능(03 공통 기반) ──
export interface KvStore {
  // chrome.storage 계열: 설정·세션·프롬프트
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface RecordStore {
  // IndexedDB 계열: Payload·이미지
  put(record: {
    id: string;
    blob: Blob | ArrayBuffer;
    meta?: Record<string, unknown>;
  }): Promise<void>;
  get(
    id: string,
  ): Promise<{ blob: Blob | ArrayBuffer; meta?: Record<string, unknown> } | null>;
  delete(id: string): Promise<void>;
  estimateUsage(): Promise<{ usage: number; quota: number }>; // 용량 미터(비기능)
}
