// ② 주제 소스 — 자동완성/연관검색(M2 WP3 경로 C). 네이버·구글·유튜브. 키 불필요.
// background fetch 로 호출(host_permissions: ac.search.naver.com, suggestqueries.google.com).
// 각 어댑터는 seed → 연관/자동완성 키워드 Topic[](source 태그). 중단 가능(R-1.2).
import type { TopicSourceAdapter } from '@/adapters';
import { appError, ERR } from '@/lib/errors';
import { ok, err, type Result } from '@/types/common';
import type { Topic } from '@/types/models';

const TIMEOUT = 10_000;

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// 단어 목록 → 중복 제거 Topic[]. source 태그로 출처 구분.
function toTopics(words: string[], source: string): Topic[] {
  const seen = new Set<string>();
  const out: Topic[] = [];
  for (const w of words) {
    const k = w.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ id: `ac_${source}_${out.length}`, keyword: k, source });
  }
  return out;
}

function acErr(e: unknown): Result<Topic[]> {
  const aborted = (e as Error)?.name === 'AbortError';
  return err(
    appError(ERR.KEYWORD_FAILED, aborted ? '취소되었거나 시간 초과' : `자동완성 실패: ${String(e)}`, {
      retriable: true,
    }),
  );
}

function guardSeed(seed: string): string | null {
  const q = seed.trim();
  return q || null;
}

// ── 네이버 자동완성 — ac.search.naver.com (items[*][0] = 추천어) ──
export const naverAcAdapter: TopicSourceAdapter = {
  id: 'naver',
  async collect({ seed, signal }): Promise<Result<Topic[]>> {
    const q = guardSeed(seed);
    if (!q) return err(appError(ERR.NO_CREDENTIAL, '키워드를 입력해 주세요.'));
    try {
      const url =
        `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(q)}` +
        `&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&st=100`;
      const data = JSON.parse(await fetchText(url, signal)) as { items?: string[][][] };
      const words = (data.items ?? []).flat().map((e) => e?.[0] ?? '');
      return ok(toTopics(words, 'naver'));
    } catch (e) {
      return acErr(e);
    }
  },
};

// ── 구글 계열 — suggestqueries.google.com (client=firefox → [query, [추천어…]]) ──
function googleLike(source: string, ds: string): TopicSourceAdapter {
  return {
    id: source,
    async collect({ seed, signal }): Promise<Result<Topic[]>> {
      const q = guardSeed(seed);
      if (!q) return err(appError(ERR.NO_CREDENTIAL, '키워드를 입력해 주세요.'));
      try {
        const url =
          `https://suggestqueries.google.com/complete/search?client=firefox&hl=ko` +
          `${ds ? `&ds=${ds}` : ''}&q=${encodeURIComponent(q)}`;
        const arr = JSON.parse(await fetchText(url, signal)) as [string, string[]];
        return ok(toTopics(arr[1] ?? [], source));
      } catch (e) {
        return acErr(e);
      }
    },
  };
}

export const googleAcAdapter = googleLike('google', '');
export const youtubeAcAdapter = googleLike('youtube', 'yt'); // 동영상(유튜브) 자동완성
