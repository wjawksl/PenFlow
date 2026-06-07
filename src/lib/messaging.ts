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
  | 'convert.htmlmd'
  | 'density.analyze'
  | 'insert.start'
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
}
export interface VisualComposeRes {
  visuals: Visual[];
} // ⑨→④: 마커와 순서·개수 일치

export interface InsertStartReq {
  payloadId: string;
} // ④→⑥: id만 전달(05 §5)
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
