// ② 주제 소스 — 네이버 검색광고 키워드도구(M2 WP1 경로 A). seed → 연관키워드 + 검색량·경쟁도.
// GET /keywordstool?hintKeywords=&showDetail=1 (08 §5 TopicSourceAdapter). 중단 가능(R-1.2).
// CORS: api.naver.com 직접 호출은 background 에서만(content/sidepanel 은 차단). host_permissions 필요.
import type { TopicSourceAdapter } from '@/adapters';
import { appError, ERR } from '@/lib/errors';
import { signSearchAd } from '@/lib/naver-sign';
import { ok, err, type Result } from '@/types/common';
import type { Topic } from '@/types/models';

const BASE = 'https://api.searchad.naver.com';
const PATH = '/keywordstool';
const TIMEOUT = 15_000;

// compIdx(낮음/중간/높음) → Topic.metrics.competition 수치(1·2·3). UI 가 라벨로 환원.
const COMP_MAP: Record<string, number> = { 낮음: 1, 중간: 2, 높음: 3 };

interface KeywordRow {
  relKeyword: string;
  monthlyPcQcCnt: number | string; // 저빈도는 "< 10" 문자열로 옴
  monthlyMobileQcCnt: number | string;
  compIdx?: string;
}

/** "< 10" 같은 문자열도 숫자로(자릿수만 추출). 검색량 합산용. */
function parseCount(v: number | string | undefined): number {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export const searchAdAdapter: TopicSourceAdapter = {
  id: 'naver-searchad',
  async collect({ seed, credential, signal }): Promise<Result<Topic[]>> {
    const c = credential?.fields;
    if (!c?.apiKey || !c.secret || !c.customerId) {
      return err(
        appError(ERR.NO_CREDENTIAL, '검색광고 키(액세스 라이선스·비밀키·CustomerID)가 필요해요.'),
      );
    }
    const hint = seed.replace(/\s+/g, ''); // 검색광고는 공백 없는 키워드 기대
    if (!hint) return err(appError(ERR.NO_CREDENTIAL, '키워드를 입력해 주세요.'));

    const { timestamp, signature } = await signSearchAd(c.secret, 'GET', PATH);
    const url = `${BASE}${PATH}?hintKeywords=${encodeURIComponent(hint)}&showDetail=1`;

    // 자체 타임아웃 + 외부 중단(R-1.2) 병합.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    signal?.addEventListener('abort', () => ctrl.abort());
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': c.apiKey,
          'X-Customer': c.customerId,
          'X-Signature': signature,
        },
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 403) {
        return err(
          appError(ERR.KEYWORD_AUTH, '검색광고 인증 실패. 키 또는 PC 시계 오차를 확인하세요(R-0.5).'),
        );
      }
      if (!res.ok) {
        return err(
          appError(ERR.KEYWORD_FAILED, `검색광고 API 오류 (${res.status})`, {
            retriable: res.status >= 500,
          }),
        );
      }
      const data = (await res.json()) as { keywordList?: KeywordRow[] };
      const topics: Topic[] = (data.keywordList ?? []).map((r, i) => ({
        id: `kw_${timestamp}_${i}`,
        keyword: r.relKeyword,
        metrics: {
          volume: parseCount(r.monthlyPcQcCnt) + parseCount(r.monthlyMobileQcCnt),
          competition: r.compIdx ? (COMP_MAP[r.compIdx] ?? 0) : 0,
        },
      }));
      return ok(topics);
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      return err(
        appError(
          ERR.KEYWORD_FAILED,
          aborted ? '검색이 취소되었거나 시간이 초과됐어요.' : `네트워크 오류: ${String(e)}`,
          { retriable: true },
        ),
      );
    } finally {
      clearTimeout(timer);
    }
  },
};
