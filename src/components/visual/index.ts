// ⑨ 비주얼 생성기 (M3 WP4) — 05 §3. 컨텍스트 독립 로직(오프스크린이 호출).
// 현재 슬라이스: H2 썸네일만(배경 생성 + 텍스트). 업로드/AI/외부 소스는 후속.
// 큰 바이너리는 RecordStore(IndexedDB)에 넣고 Visual.data 엔 ref(id)만 둔다(05 §5).
import type { RecordStore } from '@/adapters';
import type { VisualSpec } from '@/lib/messaging';
import type { Visual } from '@/types/models';
import { DEFAULT_THUMB_STYLE, renderH2Thumbnail, type ThumbStyle } from './thumbnail';

type Renderer = (caption: string, style: ThumbStyle) => Promise<Blob>;

/**
 * spec 목록 → Visual[]. role 별로 이미지 생성 후 store 에 저장, ref 만 담아 반환.
 * render 주입 가능(테스트 시 가짜 렌더). 마커와 순서·개수 일치(R-7.6)는 호출부(specs 순서)가 보장.
 */
export async function composeVisuals(
  specs: VisualSpec[],
  store: RecordStore,
  style: ThumbStyle = DEFAULT_THUMB_STYLE,
  render: Renderer = renderH2Thumbnail,
): Promise<Visual[]> {
  const visuals: Visual[] = [];
  for (const spec of specs) {
    if (spec.role !== 'H2_THUMB') continue; // 이번 슬라이스는 소제목 썸네일만
    const blob = await render(spec.h2Caption ?? '', style);
    const id = crypto.randomUUID();
    await store.put({ id, blob, meta: { role: spec.role, caption: spec.h2Caption } });
    visuals.push({
      role: spec.role,
      source: spec.source,
      data: { kind: 'ref', id },
      dedupApplied: false, // 중복 회피는 WP5
      h2Caption: spec.h2Caption,
    });
  }
  return visuals;
}
