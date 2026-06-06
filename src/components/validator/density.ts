// ⑩ 키워드 밀도 검증(M3 WP2) — 02 9.1 / R-8.2.
// 경량 구현: 형태소 분석기(Kiwi WASM) 대신 정규화 카운트.
// 근거(스파이크 2026-06-06): Kiwi base 모델이 cong.mdl 75MB 필수 → 최소 ~94MB.
//   타깃 키워드는 이미 아는 명사(topic.keyword+연관)라 정규화 substring 카운트로
//   동일 결과("아이폰15"·"아이폰 추천" 모두 부분일치). 효용 대비 용량 과해 보류.
//   토큰화 인터페이스는 추후 Kiwi 교체 가능하게 단순 유지.
import { strip } from '@/lib/markers';
import type { DensityReport } from '@/types/models';

export interface DensityRange {
  min: number; // 권장 밀도 하한(%) — 설정 가능(R-8.2)
  max: number; // 권장 밀도 상한(%)
}
export const DEFAULT_DENSITY_RANGE: DensityRange = { min: 1, max: 3 };

const TAG_RE = /<[^>]+>/g;
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** 본문 HTML → 가시 텍스트. 마커 제거 → 태그 제거 → 엔티티 복원 → 공백 정리. DOM 불필요(SW 가능). */
export function extractText(html: string): string {
  const noMarker = strip(html);
  const noTag = noMarker.replace(TAG_RE, ' ');
  const decoded = noTag.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
  return decoded.replace(/\s+/g, ' ').trim();
}

/** 분모용 단어 수 — 공백 기준 토큰. (형태소 아님, 밀도는 가이드값) */
export function countTokens(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** 키워드 출현 횟수 — 대소문자 무시 리터럴 부분일치(비중첩). 한국어 조사 결합도 부분일치로 포착. */
export function countKeyword(text: string, keyword: string): number {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return 0;
  return text.toLowerCase().split(kw).length - 1;
}

/** 본문·키워드·권장범위 → DensityReport. 권장범위 벗어난 키워드는 verdict high/low(R-8.2). */
export function analyzeDensity(
  html: string,
  keywords: string[],
  range: DensityRange = DEFAULT_DENSITY_RANGE,
): DensityReport {
  const text = extractText(html);
  const total = countTokens(text);
  // 중복·공백 키워드 제거(입력 순서 보존).
  const seen = new Set<string>();
  const uniq = keywords
    .map((k) => k.trim())
    .filter((k) => k && !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()));

  const items = uniq.map((keyword) => {
    const count = countKeyword(text, keyword);
    const density = total > 0 ? (count / total) * 100 : 0;
    const verdict: 'ok' | 'high' | 'low' =
      density > range.max ? 'high' : density < range.min ? 'low' : 'ok';
    return { keyword, count, density, verdict };
  });
  return { items };
}
