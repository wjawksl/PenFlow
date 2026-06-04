// ④ 합성 진입 전 정합성 검사 — 06 §6 / 16장 계약2. M2 범위.
// M2 는 비주얼(이미지)이 없으므로 이미지 마커↔Visual 정합성(R-7.6)은 M3 로 미룬다.
// 여기선 광고문구 누락 금지(R-3.4)와 마커 타입 유효성을 본다. 순서=큐순서는 scan() 이 보장.
import type { Marker } from '@/lib/markers';
import { appError } from '@/lib/errors';
import { ok, err, type Result } from '@/types/common';
import type { PayloadOptions } from '@/types/models';

export function validateComposition(
  markers: Marker[],
  options: PayloadOptions,
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
  return ok(undefined);
}

// M3 에서 추가될 검사(자리표시): 이미지 마커 수 === Visual 수, H2 수 === H2THUMB 수.
export const PENDING_M3_CHECKS = ['IMG/H2THUMB↔Visual 개수', 'H2↔H2THUMB 개수'] as const;
