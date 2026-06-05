// ② 주제 선정기 (M2 WP1) — 경로별 소스 어댑터 선택 → Topic[] 수렴(R-1.1).
// 경로 A: 네이버 검색광고 키워드도구. 경로 B/C 는 어댑터 추가 시 분기 확장(R-1.3).
import type { TopicSourceAdapter } from '@/adapters';
import {
  googleAcAdapter,
  naverAcAdapter,
  youtubeAcAdapter,
} from '@/adapters/topic/autocomplete';
import { blogTitlesAdapter } from '@/adapters/topic/blogtitles';
import { searchAdAdapter } from '@/adapters/topic/searchad';
import { appError, ERR } from '@/lib/errors';
import type { TopicCollectReq } from '@/lib/messaging';
import { ok, err, type Result } from '@/types/common';
import type { Credential, Topic } from '@/types/models';

// 단일 어댑터 경로. A: seed=키워드, B: seed=blogId(+count). Topic[] 로 수렴(R-1.1).
const ADAPTERS: Partial<Record<'A' | 'B', TopicSourceAdapter>> = {
  A: searchAdAdapter,
  B: blogTitlesAdapter,
};

// 경로 C 다중 소스(R-1.3) — 소스별 on/off 로 선택 수집.
const C_SOURCES: Record<string, TopicSourceAdapter> = {
  naver: naverAcAdapter,
  google: googleAcAdapter,
  youtube: youtubeAcAdapter,
};

export async function collectTopics(
  req: TopicCollectReq,
  credential?: Credential,
  signal?: AbortSignal,
): Promise<Result<Topic[]>> {
  const seed = String(req.input.seed ?? '').trim();
  if (!seed) {
    const what = req.path === 'B' ? '블로그 아이디' : '키워드';
    return err(appError(ERR.NO_CREDENTIAL, `${what}를 입력해 주세요.`));
  }

  if (req.path === 'C') return collectMultiSource(seed, req.input.sources, signal);

  const adapter = ADAPTERS[req.path as 'A' | 'B'];
  if (!adapter) {
    return err(appError('TOPIC_PATH_UNSUPPORTED', `경로 ${req.path} 는 아직 지원되지 않아요.`));
  }
  const count = Number(req.input.count);
  return adapter.collect({
    seed,
    credential,
    signal,
    ...(Number.isFinite(count) ? { count } : {}),
  });
}

// 경로 C: 선택 소스 병렬 수집 → 출처별 중복 제거 병합. 일부 소스 실패는 무시(나머지로 진행).
async function collectMultiSource(
  seed: string,
  rawSources: unknown,
  signal?: AbortSignal,
): Promise<Result<Topic[]>> {
  const names = Array.isArray(rawSources) ? (rawSources as string[]) : ['naver'];
  const picked = names.map((n) => C_SOURCES[n]).filter(Boolean) as TopicSourceAdapter[];
  if (!picked.length) {
    return err(appError('TOPIC_NO_SOURCE', '소스를 1개 이상 선택해 주세요.'));
  }
  const results = await Promise.all(picked.map((a) => a.collect({ seed, signal })));
  // 키워드 기준 병합. 각 소스의 등장 위치(상위일수록 높은 점수)도 누적.
  // rankScore += (그 소스 결과 수 - 위치) → 자동완성 상위(위치 작음)일수록 큰 점수.
  const agg = new Map<string, { sources: Set<string>; rankScore: number }>();
  for (const r of results) {
    if (!r.ok) continue;
    const len = r.value.length;
    r.value.forEach((t, idx) => {
      const cur = agg.get(t.keyword) ?? { sources: new Set<string>(), rankScore: 0 };
      cur.sources.add(t.source ?? '?');
      cur.rankScore += len - idx;
      agg.set(t.keyword, cur);
    });
  }
  if (!agg.size) {
    return err(appError(ERR.KEYWORD_FAILED, '연관 검색어를 가져오지 못했어요.'));
  }
  // 정렬: ① 등장 플랫폼 수 내림차순 ② 동수면 순위 점수 합 내림차순(더 상위 노출 우선).
  const merged: Topic[] = [...agg.entries()]
    .sort(
      ([, a], [, b]) => b.sources.size - a.sources.size || b.rankScore - a.rankScore,
    )
    .map(([keyword, v], i) => ({ id: `c_${i}`, keyword, sources: [...v.sources] }));
  return ok(merged);
}
