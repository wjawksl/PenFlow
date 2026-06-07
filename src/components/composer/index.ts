// ④ 부가요소 합성기 — 11.3 의사코드 / 06 §6. 본문 마커를 순서대로 InsertQueue 로.
// M2: 링크·표·CTA·백링크·광고문구. 이미지(H1THUMB/H2THUMB/IMG)는 비주얼(⑨, M3) 도착 전이라 스킵.
import { MARKER_RE, MARKER_TYPES } from '@/lib/markers';
import type { MarkerType } from '@/lib/markers';
import { ok, type Result } from '@/types/common';
import type { InsertQueue, InsertTask, PayloadOptions, Visual } from '@/types/models';
import { validateComposition } from './validate';

const MARKER_TYPE_SET = new Set<string>(MARKER_TYPES);
const isMarkerType = (s: string): s is MarkerType => MARKER_TYPE_SET.has(s);
const IMAGE_MARKERS = new Set<MarkerType>(['H1THUMB', 'H2THUMB', 'IMG']);

/**
 * 본문 HTML(마커 포함) + 옵션 (+M3 비주얼) → 순서 보장 InsertQueue. 정합성 위반 시 차단.
 * 이미지 마커(H1THUMB/H2THUMB/IMG)는 등장 순서대로 visuals 와 1:1 매칭(R-7.6). 비주얼 없으면 스킵(R-3.1).
 */
export function compose(
  contentHtml: string,
  options: PayloadOptions,
  visuals: Visual[] = [],
): Result<InsertQueue> {
  // scan 과 동일한 순서로 마커 수집(정합성 입력) — 여기선 char 위치가 필요해 matchAll 직접 사용.
  const matches = [...contentHtml.matchAll(MARKER_RE)].filter((m) => isMarkerType(m[1]!));
  const markers = matches.map((m, i) => ({
    type: m[1] as MarkerType,
    key: m[2]!,
    index: i,
    raw: m[0],
  }));

  const v = validateComposition(markers, options, contentHtml);
  if (!v.ok) return v;

  const queue: InsertQueue = [];
  let cursor = 0;
  let visualIdx = 0; // 이미지 마커 등장 순서 ↔ visuals 인덱스
  for (const m of matches) {
    const pos = m.index ?? 0;
    // 마커 이전 일반 텍스트 → text 작업(R-3.2 순서 보존).
    const pre = contentHtml.slice(cursor, pos);
    if (pre.trim()) queue.push({ type: 'text', content: pre });

    const type = m[1] as MarkerType;
    if (IMAGE_MARKERS.has(type)) {
      const v = visuals[visualIdx++]; // 순서대로 소비
      if (v) queue.push({ type: 'image', content: v.data }); // 없으면 스킵(R-3.1, 비주얼 미생성)
    } else {
      const task = markerToTask(type, options);
      if (task) queue.push(task); // 리소스 없으면 스킵(R-3.1), AD 누락은 위 정합성에서 차단(R-3.4)
    }

    cursor = pos + m[0].length;
  }
  const tail = contentHtml.slice(cursor);
  if (tail.trim()) queue.push({ type: 'text', content: tail });

  return ok(queue);
}

function markerToTask(type: MarkerType, o: PayloadOptions): InsertTask | null {
  // 이미지 마커(IMAGE_MARKERS)는 compose 본문에서 visuals 와 매칭 처리 → 여기 도달 안 함.
  switch (type) {
    case 'AD':
      return o.adNotice ? { type: 'adNotice', content: o.adNotice.text } : null;
    case 'PRODUCT':
      return o.productTable ? { type: 'productTable', content: o.productTable.html } : null;
    case 'SHOP':
      return o.shoppingLink
        ? { type: 'shoppingLink', content: '', link: o.shoppingLink.url }
        : null;
    case 'CTA':
      return o.ctaButton ? { type: 'ctaButton', content: o.ctaButton } : null;
    case 'BACKLINK':
      return o.backlinkBlock ? { type: 'backlink', content: o.backlinkBlock } : null;
    case 'SOURCE':
      return null; // 02 모델에 위치 개념 없음(06 2.5). includeSourceLink 는 전역 옵션 → M2 미배치
    default:
      return null;
  }
}
