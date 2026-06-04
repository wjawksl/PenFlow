# 펜플로우 (PenFlow) — 인터페이스·데이터 스키마 규격

> 기준 문서: `02-functional-design.md`(15장 데이터 모델, 16장 계약), `05-architecture.md`(§4 메시지, §7 어댑터), `06-marker-prompt-spec.md`(2.5 매핑), `04-tech-stack.md`(이식성·어댑터)
> 목적: 위 문서들의 **개념적 모델·계약**을 컴파일되는 **TypeScript 타입**으로 확정한다. M1 착수를 막는 마지막 명세.
> 형태: **코드가 본체**다. 단일 출처는 아래 코드 블록(=실제 `src/types/`·`src/lib/`·`src/adapters/` 파일)이며, 문서는 배치와 의도만 설명한다. 드리프트를 막기 위해 설명을 코드와 중복시키지 않는다.

> 파일 배치(05 §8): 데이터 모델 → `src/types/models.ts` · 계약/메시지 → `src/lib/messaging.ts` · 마커 → `src/lib/markers.ts` · 어댑터 → `src/adapters/*`.

---

## 1. 공통 기본 타입 (`src/types/common.ts`)

```ts
/** 이미지 등 큰 바이너리: ⑤ 저장소 참조(id) 또는 인라인. 컨텍스트 간엔 ref만 전달(05 §5). */
export type BinaryOrRef =
  | { kind: 'ref'; id: string }        // IndexedDB 레코드 키
  | { kind: 'inline'; dataUrl: string };

export type Duration = number;          // ms
export type ISODateTime = string;       // ISO 8601

/** 표준 결과 봉투: 성공/실패를 명시(에러 표준, 05 §7). */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export interface AppError {
  code: string;                         // 예: 'AI_QUOTA', 'EDITOR_NOT_FOUND'
  message: string;                      // 사용자 통지용
  failedStep?: string;                  // 실패 작업 명시(R-4.4)
  retriable?: boolean;
}
```

---

## 2. 데이터 모델 (`src/types/models.ts`) — 02 15장

```ts
// ── 인증 (① 설정) ───────────────────────────────────────────
/** 벤더마다 필드가 달라(검색광고=key/secret/customerId 등) 유연한 형태로 둔다(이식성). */
export interface Credential {
  id: string;
  kind: 'ai_text' | 'ai_image' | 'image_source' | 'keyword_tool' | 'affiliate';
  label?: string;
  fields: Record<string, string>;       // apiKey, secret, customerId 등
}

export interface Settings {
  aiTextCredentials: Credential[];       // 복수 등록·한도 초과 시 순환(R-0.1, R-0.2)
  aiModel: string;
  aiImageCredential?: Credential;
  imageSourceCredential?: Credential;
  keywordToolCredential?: Credential;
  affiliateCredential?: Credential;
  format: FormatPrefs;                   // 삽입 시 일괄 적용(12.2-5)
}

export interface FormatPrefs {
  lineHeight?: string;
  fontFamily?: string;
  fontSize?: string;
}

export interface Prompt { name: string; body: string; }   // 이름 저장/불러오기(R-2.1)

// ── 주제 (② 선정) ───────────────────────────────────────────
export interface Topic {
  id: string;
  keyword: string;
  title?: string;
  metrics?: { volume?: number; competition?: number };
}

// ── 검증 (⑩) ────────────────────────────────────────────────
export interface DensityReport {
  items: Array<{ keyword: string; count: number; density: number; verdict: 'ok' | 'high' | 'low' }>;
}

// ── 비주얼 (⑨) ──────────────────────────────────────────────
export type VisualRole = 'H1_THUMB' | 'H2_THUMB' | 'BODY_IMAGE';
export type VisualSource = 'AI' | 'EXTERNAL' | 'UPLOAD' | 'DEFAULT' | 'CLIPBOARD';

export interface Visual {
  role: VisualRole;
  source: VisualSource;
  data: BinaryOrRef;
  dedupApplied: boolean;                 // 중복 회피(R-7.4)
  h2Caption?: string;                    // 소제목 썸네일 텍스트
  modelRefApplied?: boolean;             // 모델 참조 동반(R-7.7)
}

export interface ModelReference { image: BinaryOrRef; }   // 모든 AI 이미지에 동반

// ── 페이로드 (⑤) ────────────────────────────────────────────
export type PublishOption = 'TEMP_SAVE' | 'PUBLISH';      // 기본 TEMP_SAVE(R-5.1)

export interface PayloadOptions {
  shoppingLink?: { url: string; positions: number[] };
  productTable?: { html: string; autoUpdate: boolean };  // 최신 데이터(R-3.5)
  ctaButton?: string;                                     // html
  backlinkBlock?: string;                                 // html
  adNotice?: { text: string; position: string };         // 광고/협찬(R-3.4)
  includeSourceLink: boolean;
}

export interface Payload {
  id: string;                            // insert.start는 이 id만 전달(05 §5)
  contentHtml: string;                   // 마커 포함, 검증·편집 반영본
  visuals: Visual[];                     // 마커와 순서·개수 일치(16장 계약2)
  options: PayloadOptions;
  publishOption: PublishOption;
}

// ── 삽입 큐 (④→⑥) ──────────────────────────────────────────
export type InsertTaskType =
  | 'text' | 'image' | 'shoppingLink' | 'productTable'
  | 'backlink' | 'ctaButton' | 'adNotice';               // 02 어휘(06 2.5 매핑)

export interface InsertTask {
  type: InsertTaskType;
  content: unknown;                      // 타입별 페이로드(텍스트/BinaryOrRef/html 등)
  link?: string;                         // 썸네일·쇼핑 링크 부착용
}
export type InsertQueue = InsertTask[];  // 순서 보장(R-3.2)

// ── 자동화 세션 (⑧) ─────────────────────────────────────────
export type SessionState = 'IDLE' | 'RUNNING' | 'STEP_DONE';   // 05 XState / 14.2
export type PostOrder = 'LIST' | 'REVERSE';                    // R-6.7

export interface AutoPostSession {
  state: SessionState;
  items: Topic[];
  currentIndex: number;
  order: PostOrder;
  scheduleTime?: ISODateTime;            // 예약(R-6.5)
  postIntervalMin: Duration;             // 무작위 간격 하한(R-6.6, 계정 보호)
  postIntervalMax: Duration;             // 상한
  options: PayloadOptions;
}
```

---

## 3. 마커 (`src/lib/markers.ts`) — 06 + 2.5 매핑

```ts
export const MARKER_TYPES = [
  'H1THUMB', 'H2THUMB', 'IMG',
  'PRODUCT', 'SHOP', 'BACKLINK', 'CTA', 'SOURCE', 'AD',
] as const;
export type MarkerType = typeof MARKER_TYPES[number];

export const MARKER_RE = /\[\[PF:([A-Z0-9]+):([A-Za-z0-9_-]+)\]\]/g;

export interface Marker { type: MarkerType; key: string; index: number; raw: string; }

/** 06 2.5 — 마커 토큰 ↔ 02 InsertTask.type. 변환은 여기 한 곳에서만. */
export const MARKER_TO_INSERT_TASK: Record<MarkerType, InsertTaskType | null> = {
  H1THUMB: 'image', H2THUMB: 'image', IMG: 'image',
  PRODUCT: 'productTable', SHOP: 'shoppingLink', BACKLINK: 'backlink',
  CTA: 'ctaButton', AD: 'adNotice',
  SOURCE: null,                          // 02엔 위치 개념 없음(전역 옵션의 확장)
};

/** 06 2.5 — 이미지 계열 마커 ↔ 02 Visual.role. */
export const MARKER_TO_VISUAL_ROLE: Partial<Record<MarkerType, VisualRole>> = {
  H1THUMB: 'H1_THUMB', H2THUMB: 'H2_THUMB', IMG: 'BODY_IMAGE',
};

export const make = (type: MarkerType, key = '0') => `[[PF:${type}:${key}]]`;
export declare function scan(body: string): Marker[];   // 등장 순서대로
export declare function strip(body: string): string;     // 미리보기용 제거
```

> `InsertTaskType`·`VisualRole`은 2장에서 import. 마커 토큰과 데이터 모델 이름의 변환은 위 두 상수 외 어디서도 하지 않는다(06 2.5 단일 출처 원칙).

---

## 4. 컴포넌트 계약 = 메시지 (`src/lib/messaging.ts`) — 02 16장 + 05 §4

컨텍스트가 분리돼 있어, 16장의 컴포넌트 간 전달물은 곧 **메시지 페이로드**가 된다.

```ts
// ── 봉투(05 §4) ─────────────────────────────────────────────
export interface Msg<T = unknown> {
  kind: 'cmd' | 'event';
  name: ChannelName;
  requestId?: string;                    // cmd 응답 매칭
  payload: T;
}

export type ChannelName =
  | 'topic.collect' | 'generate.run' | 'visual.compose' | 'convert.htmlmd'
  | 'insert.start' | 'publish.do' | 'step.done' | 'progress';

// ── 채널별 요청/응답 (16장 계약을 타입으로) ──────────────────
export interface TopicCollectReq { path: 'A' | 'B' | 'C'; input: Record<string, unknown>; }
export interface TopicCollectRes { topics: Topic[]; }                  // ②→③: 1건으로 수렴(R-1.1)

export interface GenerateReq {
  topic: Topic; prompt: Prompt; reference?: string;
  method: 'direct' | 'web';                                            // 03 생성 방식 A/B
  options: PayloadOptions;
}
export interface GenerateRes { contentHtml: string; }                  // ③→⑩: 약속된 마커 포함

export interface ConvertReq { direction: 'html2md' | 'md2html'; content: string; }
export interface ConvertRes { content: string; }                       // ⑩: 마커 보존(R-8.4)

export interface VisualComposeReq { contentHtml: string; specs: VisualSpec[]; }
export interface VisualComposeRes { visuals: Visual[]; }               // ⑨→④: 마커와 순서·개수 일치
export interface VisualSpec { role: VisualRole; source: VisualSource; h2Caption?: string; }

export interface InsertStartReq { payloadId: string; }                 // ④→⑥: id만 전달(05 §5)
export interface PublishReq { payloadId: string; publishOption: PublishOption; }

// ── 이벤트(BG→UI) ───────────────────────────────────────────
export interface StepDoneEvt { topicId: string; status: 'done' | 'failed'; error?: AppError; }   // ⑦→⑧(R-5.2, R-6.2)
export interface ProgressEvt { stage: string; percent?: number; message: string; level: 'info' | 'warn' | 'error'; }  // R-6.3
```

> 정합성 검사(06 §6, 16장 계약2)는 `VisualComposeRes`→`Payload` 조립 직전에 수행: `이미지 마커 수 === visuals.length`, `H2 수 === H2THUMB 수`, 광고문구 옵션 ON이면 `AD` 마커 ≥ 1. 위반 시 `Result<…>`의 실패로 합성 차단.

---

## 5. 어댑터 인터페이스 (`src/adapters/*`) — 이식성(04·05 §7)

벤더 교체가 가능하도록 컴포넌트는 아래 인터페이스에만 의존한다.

```ts
// ── AI 본문 (③) ─ 키 순환·재시도는 상위(오케스트레이터)가 처리, 어댑터는 단일 호출 ──
export interface AITextAdapter {
  generate(req: { prompt: string; model: string; credential: Credential }): Promise<Result<string>>;
}

export interface AIImageAdapter {
  generate(req: { prompt: string; credential: Credential; modelRef?: ModelReference }): Promise<Result<BinaryOrRef>>;
}

// ── 외부 이미지 소스 (⑨) ────────────────────────────────────
export interface ImageSourceAdapter {
  search(req: { query: string; credential?: Credential; delayMs?: Duration }): Promise<Result<BinaryOrRef[]>>;  // 지연(R-7.5)
}

// ── 주제 소스 (②) ─ 네이버·구글·동영상 등 추가/교체(R-1.3) ──
export interface TopicSourceAdapter {
  readonly id: string;
  collect(req: { seed: string; credential?: Credential; signal?: AbortSignal }): Promise<Result<Topic[]>>;     // 중단 가능(R-1.2)
}

// ── 저장소 (⑤/① 추상화) ─ 벤더 교체 가능(03 공통 기반) ──
export interface KvStore {                 // chrome.storage 계열: 설정·세션·프롬프트
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface RecordStore {             // IndexedDB 계열: Payload·이미지
  put(record: { id: string; blob: Blob | ArrayBuffer; meta?: Record<string, unknown> }): Promise<void>;
  get(id: string): Promise<{ blob: Blob | ArrayBuffer; meta?: Record<string, unknown> } | null>;
  delete(id: string): Promise<void>;
  estimateUsage(): Promise<{ usage: number; quota: number }>;   // 용량 미터(비기능)
}
```

---

## 6. 완료 기준 (DoD)

- 위 타입으로 `tsc`가 통과한다(빈 구현 스텁 + `declare`로 컴파일 검증).
- 06의 `markers.ts`, 05의 `messaging.ts`가 본 규격을 그대로 가져다 쓴다(중복 정의 0).
- 어댑터 인터페이스에 대해 **목(mock) 구현 1개씩**을 만들어 M1 단위 테스트를 붙일 수 있다.
- 데이터 모델 필드명이 02 15장과 1:1 일치(린트/리뷰로 확인).

---

## 7. 열린 항목

- `Credential.fields`를 자유 맵으로 둘지, 벤더별 구체 타입(유니온)으로 좁힐지(유연성 vs 타입 안전).
- `InsertTask.content`의 타입별 구체화(현재 `unknown`) — 타입별 판별 유니온으로 좁힐지.
- 저장소 스키마 버전/마이그레이션 규칙(여기엔 미포함 — 08 외부연동·운영 가이드와 함께 정할지).
