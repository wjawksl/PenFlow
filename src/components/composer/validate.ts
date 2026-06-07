// ④ 합성 진입 전 정합성 검사 — 06 §6 / 16장 계약2.
// 이미지는 opt-in(수동 삽입)으로 바뀌어 "이미지 마커↔Visual 강제차단"(R-7.6)은 폐기.
// 남은 안전망: 광고문구 누락 금지(R-3.4) + 소제목↔썸네일 1:1(R-7.3, WP7). 순서=큐순서는 scan() 이 보장.
import type { Marker } from '@/lib/markers';
import { appError } from '@/lib/errors';
import { ok, err, type Result } from '@/types/common';
import type { PayloadOptions } from '@/types/models';

const H2_RE = /<h2[^>]*>/gi;
const countH2 = (html: string): number => (html.match(H2_RE) ?? []).length;

export function validateComposition(
  markers: Marker[],
  options: PayloadOptions,
  contentHtml = '',
): Result<void> {
  // R-3.4 — 광고/협찬 옵션 ON(adNotice 지정)이면 본문에 AD 마커가 1개 이상 있어야 한다.
  const adOptionOn = !!options.adNotice;
  const hasAdMarker = markers.some((m) => m.type === 'AD');
  if (adOptionOn && !hasAdMarker) {
    return err(
      appError(
        'AD_MISSING',
        '광고/협찬 문구 옵션이 켜져 있지만 본문에 광고 마커가 없어요. 합성을 중단합니다.',
        { failedStep: '정합성 검사' },
      ),
    );
  }

  // R-7.3 — 소제목 썸네일 옵션 ON 이면 <h2> 수와 H2THUMB 마커 수가 1:1 이어야 한다.
  // injectH2ThumbMarkers 는 결정적이지만, 생성/편집 단계에서 어긋나면 여기서 차단(안전망).
  if (options.h2Thumbnail) {
    const h2Count = countH2(contentHtml);
    const h2ThumbCount = markers.filter((m) => m.type === 'H2THUMB').length;
    if (h2Count !== h2ThumbCount) {
      return err(
        appError(
          'H2THUMB_MISMATCH',
          `소제목(${h2Count}개)과 썸네일 마커(${h2ThumbCount}개) 수가 맞지 않아요. 합성을 중단합니다.`,
          { failedStep: '정합성 검사' },
        ),
      );
    }
  }

  return ok(undefined);
}
