// 데이터 모델 — 02 15장 / 08 §2. 단일 출처. 필드명은 02 15장과 1:1 일치.
import type { BinaryOrRef, Duration, ISODateTime } from './common';

// ── 인증 (① 설정) ───────────────────────────────────────────
/** 벤더마다 필드가 달라(검색광고=key/secret/customerId 등) 유연한 형태로 둔다(이식성). */
export interface Credential {
  id: string;
  kind: 'ai_text' | 'ai_image' | 'image_source' | 'keyword_tool' | 'affiliate';
  label?: string;
  fields: Record<string, string>; // apiKey, secret, customerId 등
}

export interface Settings {
  aiTextCredentials: Credential[]; // 복수 등록·한도 초과 시 순환(R-0.1, R-0.2)
  aiModel: string;
  aiImageCredential?: Credential;
  imageSourceCredential?: Credential;
  keywordToolCredential?: Credential;
  affiliateCredential?: Credential;
  format: FormatPrefs; // 삽입 시 일괄 적용(12.2-5)
}

export interface FormatPrefs {
  lineHeight?: string;
  fontFamily?: string;
  fontSize?: string;
}

export interface Prompt {
  name: string;
  body: string;
} // 이름 저장/불러오기(R-2.1)

// ── 주제 (② 선정) ───────────────────────────────────────────
export interface Topic {
  id: string;
  keyword: string;
  title?: string;
  source?: string; // ② 경로 C: 단일 출처(naver/google/youtube)
  sources?: string[]; // ② 경로 C: 교차 등장 출처 목록(여러 소스에 동시 등장 시)
  metrics?: { volume?: number; competition?: number };
}

// ── 검증 (⑩) ────────────────────────────────────────────────
export interface DensityReport {
  items: Array<{
    keyword: string;
    count: number;
    density: number;
    verdict: 'ok' | 'high' | 'low';
  }>;
}

// ── 비주얼 (⑨) ──────────────────────────────────────────────
export type VisualRole = 'H1_THUMB' | 'H2_THUMB' | 'BODY_IMAGE';
export type VisualSource = 'AI' | 'EXTERNAL' | 'UPLOAD' | 'DEFAULT' | 'CLIPBOARD';

export interface Visual {
  role: VisualRole;
  source: VisualSource;
  data: BinaryOrRef;
  dedupApplied: boolean; // 중복 회피(R-7.4)
  h2Caption?: string; // 소제목 썸네일 텍스트
  modelRefApplied?: boolean; // 모델 참조 동반(R-7.7)
}

export interface ModelReference {
  image: BinaryOrRef;
} // 모든 AI 이미지에 동반

// ── 페이로드 (⑤) ────────────────────────────────────────────
export type PublishOption = 'TEMP_SAVE' | 'PUBLISH'; // 기본 TEMP_SAVE(R-5.1)

export interface PayloadOptions {
  shoppingLink?: { url: string; positions: number[] };
  productTable?: { html: string; autoUpdate: boolean }; // 최신 데이터(R-3.5)
  ctaButton?: string; // html
  backlinkBlock?: string; // html
  adNotice?: { text: string; position: string }; // 광고/협찬(R-3.4)
  includeSourceLink: boolean;
}

export interface Payload {
  id: string; // insert.start는 이 id만 전달(05 §5)
  contentHtml: string; // 마커 포함, 검증·편집 반영본
  visuals: Visual[]; // 마커와 순서·개수 일치(16장 계약2)
  insertQueue?: InsertQueue; // ④ 합성 결과(M2). 없으면 ⑥은 contentHtml 직접 삽입(M1 호환)
  options: PayloadOptions;
  publishOption: PublishOption;
}

// ── 삽입 큐 (④→⑥) ──────────────────────────────────────────
export type InsertTaskType =
  | 'text'
  | 'image'
  | 'shoppingLink'
  | 'productTable'
  | 'backlink'
  | 'ctaButton'
  | 'adNotice'; // 02 어휘(06 2.5 매핑)

export interface InsertTask {
  type: InsertTaskType;
  content: unknown; // 타입별 페이로드(텍스트/BinaryOrRef/html 등)
  link?: string; // 썸네일·쇼핑 링크 부착용
}
export type InsertQueue = InsertTask[]; // 순서 보장(R-3.2)

// ── 자동화 세션 (⑧) ─────────────────────────────────────────
export type SessionState = 'IDLE' | 'RUNNING' | 'STEP_DONE'; // 05 XState / 14.2
export type PostOrder = 'LIST' | 'REVERSE'; // R-6.7

export interface AutoPostSession {
  state: SessionState;
  items: Topic[];
  currentIndex: number;
  order: PostOrder;
  scheduleTime?: ISODateTime; // 예약(R-6.5)
  postIntervalMin: Duration; // 무작위 간격 하한(R-6.6, 계정 보호)
  postIntervalMax: Duration; // 상한
  options: PayloadOptions;
}
