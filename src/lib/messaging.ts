// 컴포넌트 계약 = 메시지 단일 출처 — 02 16장 + 05 §4 + 08 §4.
// 컨텍스트가 분리돼 있어 16장의 전달물은 곧 메시지 페이로드가 된다.
import type { AppError } from '@/types/common';
import type {
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
  requestId?: string; // cmd 응답 매칭
  payload: T;
}

export type ChannelName =
  | 'topic.collect'
  | 'generate.run'
  | 'visual.compose'
  | 'convert.htmlmd'
  | 'body.replace'
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

export interface BodyReplaceReq {
  payloadId: string;
  find: string;
  replace: string;
} // ⑩ 찾기·바꾸기(WP3): 저장된 본문을 치환(R-8.3)
export interface BodyReplaceRes {
  count: number;
} // 치환 개수만 반환(본문은 payload 에 덮어씀, UI 미노출)

export interface VisualSpec {
  role: VisualRole;
  source: VisualSource;
  h2Caption?: string;
}
export interface VisualComposeReq {
  contentHtml: string;
  specs: VisualSpec[];
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
