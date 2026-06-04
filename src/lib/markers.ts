// 펜플로우 마커 단일 출처 — 06 + 08 §3. 모든 컴포넌트는 여기만 import 한다.
// 생성기(③)·비주얼(⑨)·합성기(④)·검증기(⑩)가 전부 이 규약에 의존한다.
import type { InsertTaskType, VisualRole } from '@/types/models';

export const MARKER_TYPES = [
  'H1THUMB',
  'H2THUMB',
  'IMG',
  'PRODUCT',
  'SHOP',
  'BACKLINK',
  'CTA',
  'SOURCE',
  'AD',
] as const;
export type MarkerType = (typeof MARKER_TYPES)[number];

const MARKER_TYPE_SET = new Set<string>(MARKER_TYPES);
const isMarkerType = (s: string): s is MarkerType => MARKER_TYPE_SET.has(s);

// 전체 스캔 정규식 — 06 §2.1. 한 번에 모든 마커를 스캔한다.
export const MARKER_RE = /\[\[PF:([A-Z0-9]+):([A-Za-z0-9_-]+)\]\]/g;

export interface Marker {
  type: MarkerType;
  key: string;
  index: number; // 본문 내 등장 순서(0-base)
  raw: string; // 원본 토큰 문자열
}

/** 06 2.5 — 마커 토큰 ↔ 02 InsertTask.type. 변환은 여기 한 곳에서만. */
export const MARKER_TO_INSERT_TASK: Record<MarkerType, InsertTaskType | null> = {
  H1THUMB: 'image',
  H2THUMB: 'image',
  IMG: 'image',
  PRODUCT: 'productTable',
  SHOP: 'shoppingLink',
  BACKLINK: 'backlink',
  CTA: 'ctaButton',
  AD: 'adNotice',
  SOURCE: null, // 02엔 위치 개념 없음(전역 옵션의 확장)
};

/** 06 2.5 — 이미지 계열 마커 ↔ 02 Visual.role. */
export const MARKER_TO_VISUAL_ROLE: Partial<Record<MarkerType, VisualRole>> = {
  H1THUMB: 'H1_THUMB',
  H2THUMB: 'H2_THUMB',
  IMG: 'BODY_IMAGE',
};

export const make = (type: MarkerType, key = '0'): string => `[[PF:${type}:${key}]]`;

/** 본문에서 마커를 등장 순서대로 수집. 알 수 없는 TYPE 은 무시한다. */
export function scan(body: string): Marker[] {
  const out: Marker[] = [];
  let order = 0;
  for (const m of body.matchAll(MARKER_RE)) {
    const type = m[1]!;
    if (!isMarkerType(type)) continue;
    out.push({ type, key: m[2]!, index: order++, raw: m[0] });
  }
  return out;
}

/** 모든 마커 제거(미리보기용). 원본은 보존하고 결과만 반환. */
export function strip(body: string): string {
  return body.replace(MARKER_RE, '');
}
