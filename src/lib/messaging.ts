// 컴포넌트 계약 = 메시지 단일 출처 — 02 16장 + 05 §4 + 08 §4.
// 컨텍스트가 분리돼 있어 16장의 전달물은 곧 메시지 페이로드가 된다.
import type { AppError } from '@/types/common';
import type {
  DensityReport,
  PayloadOptions,
  Prompt,
  PublishOption,
  Topic,
  Visual,
  VisualRole,
  VisualSource,
} from '@/types/models';

// ── 봉투(05 §4) ─────────────────────────────────────────────
export interface Msg<T = unknown> {
  kind: 'cmd' | 'event';
  name: ChannelName;
  target?: 'background' | 'offscreen'; // 생략 시 background. BG→Offscreen 위임 구분(05 §2 WP0)
  requestId?: string; // cmd 응답 매칭
  payload: T;
}

export type ChannelName =
  | 'topic.collect'
  | 'generate.run'
  | 'visual.compose'
  | 'visual.composeSelected'
  | 'visual.fetch'
  | 'gemini.run'
  | 'reference.fetch'
  | 'convert.htmlmd'
  | 'density.analyze'
  | 'insert.start'
  | 'image.insert'
  | 'publish.do'
  | 'step.done'
  | 'progress';

// ── 채널별 요청/응답 (16장 계약을 타입으로) ──────────────────
export interface TopicCollectReq {
  path: 'A' | 'B' | 'C';
  input: Record<string, unknown>;
}
export interface TopicCollectRes {
  topics: Topic[];
} // ②→③: 1건으로 수렴(R-1.1)

export interface GenerateReq {
  topic: Topic;
  prompt: Prompt;
  reference?: string;
  method: 'direct' | 'web'; // 03 생성 방식 A/B
  options: PayloadOptions;
}
export interface GenerateRes {
  contentHtml: string;
} // ③→⑩: 약속된 마커 포함

// ⑨ 소제목 1건 = 캡션 + 해당 섹션 본문 발췌. 생성 후 이미지 패널의 소제목 선택·맥락 동반에 쓰인다.
export interface H2Section {
  caption: string; // 소제목 텍스트
  text: string; // 다음 소제목 전까지 본문(태그·마커 제거, Gemini 프롬프트 맥락용)
}
// generate.run 응답(05 §3): 페이로드 id + (생성 시점엔 비어있는) 비주얼 + 소제목 목록.
export interface GenerateRunRes {
  payloadId: string;
  visuals: Visual[];
  sections: H2Section[]; // ⑨ 이미지 패널이 소제목별로 골라 생성하도록 동반
}

export interface ConvertReq {
  direction: 'html2md' | 'md2html';
  content: string;
}
export interface ConvertRes {
  content: string;
} // ⑩: 마커 보존(R-8.4)

export interface DensityAnalyzeReq {
  payloadId: string;
  keywords: string[]; // 메인 키워드 + 사용자 추가 키워드
  range: { min: number; max: number }; // 권장 밀도 범위(R-8.2)
} // ⑩ 키워드 밀도 검증(WP2)
export type DensityAnalyzeRes = DensityReport; // 횟수·밀도·판정 표(02 9.1)

export interface VisualSpec {
  role: VisualRole;
  source: VisualSource;
  h2Caption?: string;
}
export interface VisualComposeReq {
  specs: VisualSpec[];
  style?: { bg: string; fg: string }; // 썸네일 배경·글자색(없으면 기본)
  quality?: number; // JPEG 압축 품질 0~1(WP5 5-2)
  dedup?: boolean; // 중복 회피 노이즈(WP5 5-1, R-7.4). 기본 ON
}
export interface VisualComposeRes {
  visuals: Visual[];
} // ⑨→④: 마커와 순서·개수 일치

// ⑨ 사이드패널→BG: 생성 후 사용자가 고른 소제목들로 기본 카드(Canvas) 썸네일 합성. BG가 offscreen 위임.
export interface ComposeThumbsReq {
  captions: string[]; // 선택한 소제목 캡션들
  style: { bg: string; fg: string }; // 배경·글자색
  quality: number; // JPEG 압축 품질 0~1(WP5 5-2)
}

// ⑥ 삽입(WP8): content script(페이지 origin)는 Dexie 접근 불가 → ref 이미지를 background 경유로 인출.
export interface VisualFetchReq {
  id: string; // RecordStore(Dexie) 레코드 키
}
export interface VisualFetchRes {
  dataUrl: string; // base64 dataUrl (메시지로 안전 전달)
}

// ⑨ Gemini 웹 반자동(M3 스파이크): gemini.google.com 탭 CS 를 운전해 이미지 생성.
// 유료 API 폐기 대체 — 무료 웹 세션. 프롬프트 주입 → (반자동: 사용자가 전송) → 완료 폴링 → blob 스크랩.
export interface GeminiRunReq {
  prompt: string;
  autoSend?: boolean; // 기본 false = 반자동(사용자가 최종 전송). true 면 CS 가 전송 버튼 클릭.
  role?: VisualRole; // 저장될 Visual 역할(기본 BODY_IMAGE)
  h2Caption?: string; // 소제목 캡션(선택) — 미리보기/정합성용
}
// CS→BG 내부 응답: CS 는 Dexie 접근 불가라 dataUrl 만 돌려준다. BG 가 Dexie 저장 후 Visual 로 승격.
export interface GeminiScrapeRes {
  dataUrl: string; // 생성 이미지(blob: → dataUrl 로 안전 전달)
}
// BG→사이드패널 응답: Dexie ref 로 저장된 Visual — 기존 image.insert 삽입경로에 합류.
export interface GeminiRunRes {
  visual: Visual;
}

// 참조 바구니(WP — 참고자료 크롤링): 링크 1건을 background 가 fetch → 본문 텍스트 추출.
export interface ReferenceFetchReq {
  url: string;
}
export interface ReferenceFetchRes {
  title: string;
  text: string; // 마크다운 추출 본문(프롬프트 [참고 자료] 로 합쳐짐, 표시 한도로 잘린 값)
  truncated: boolean; // 한도 초과로 잘렸는지(안내용)
}

export interface InsertStartReq {
  payloadId: string;
} // ④→⑥: id만 전달(05 §5)
export interface ImageInsertReq {
  id: string; // ⑨ 비주얼 RecordStore(Dexie) ref id — 사이드패널이 골라 에디터 커서에 수동 삽입(WP8)
}
export interface PublishReq {
  payloadId: string;
  publishOption: PublishOption;
}

// ── 이벤트(BG→UI) ───────────────────────────────────────────
export interface StepDoneEvt {
  topicId: string;
  status: 'done' | 'failed';
  error?: AppError;
} // ⑦→⑧(R-5.2, R-6.2)
export interface ProgressEvt {
  stage: string;
  percent?: number;
  message: string;
  level: 'info' | 'warn' | 'error';
} // R-6.3
