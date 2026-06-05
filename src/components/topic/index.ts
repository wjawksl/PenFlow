// ② 주제 선정기 (M2 WP1) — 경로별 소스 어댑터 선택 → Topic[] 수렴(R-1.1).
// 경로 A: 네이버 검색광고 키워드도구. 경로 B/C 는 어댑터 추가 시 분기 확장(R-1.3).
import type { TopicSourceAdapter } from '@/adapters';
import { blogTitlesAdapter } from '@/adapters/topic/blogtitles';
import { searchAdAdapter } from '@/adapters/topic/searchad';
import { appError, ERR } from '@/lib/errors';
import type { TopicCollectReq } from '@/lib/messaging';
import { err, type Result } from '@/types/common';
import type { Credential, Topic } from '@/types/models';

// 경로 → 어댑터. C 는 어댑터 구현 후 추가.
// A: seed=키워드, B: seed=blogId(+count). 둘 다 Topic[] 로 수렴(R-1.1).
const ADAPTERS: Partial<Record<TopicCollectReq['path'], TopicSourceAdapter>> = {
  A: searchAdAdapter,
  B: blogTitlesAdapter,
};

export async function collectTopics(
  req: TopicCollectReq,
  credential?: Credential,
  signal?: AbortSignal,
): Promise<Result<Topic[]>> {
  const adapter = ADAPTERS[req.path];
  if (!adapter) {
    return err(appError('TOPIC_PATH_UNSUPPORTED', `경로 ${req.path} 는 아직 지원되지 않아요.`));
  }
  const seed = String(req.input.seed ?? '').trim();
  if (!seed) {
    const what = req.path === 'B' ? '블로그 아이디' : '키워드';
    return err(appError(ERR.NO_CREDENTIAL, `${what}를 입력해 주세요.`));
  }
  const count = Number(req.input.count);
  return adapter.collect({
    seed,
    credential,
    signal,
    ...(Number.isFinite(count) ? { count } : {}),
  });
}
