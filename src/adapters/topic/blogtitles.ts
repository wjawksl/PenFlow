// ② 주제 소스 — 네이버 블로그 게시물 제목 수집(M2 WP2 경로 B). blogId → 최근 글 제목 N건.
// blog.naver.com 의 PostTitleListAsync.naver JSON 사용(키 불필요). 제목 클릭 → Topic.title 로 ③ 전달.
// CORS: blog.naver.com host_permissions 보유, background fetch 로 호출.
import type { TopicSourceAdapter } from '@/adapters';
import { appError, ERR } from '@/lib/errors';
import { ok, err, type Result } from '@/types/common';
import type { Topic } from '@/types/models';

const BASE = 'https://blog.naver.com/PostTitleListAsync.naver';
const TIMEOUT = 15_000;
const MAX_COUNT = 100;

interface PostRow {
  logNo?: string;
  title?: string; // URL-encoded
  addDate?: string;
}

/** 네이버가 돌려주는 제목은 URL 인코딩(+ 공백). 안전 디코드. */
function decodeTitle(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
  } catch {
    return raw.replace(/\+/g, ' ').trim();
  }
}

export const blogTitlesAdapter: TopicSourceAdapter = {
  id: 'naver-blog-titles',
  async collect({ seed, count = 30, signal }): Promise<Result<Topic[]>> {
    const blogId = seed.trim();
    if (!blogId) return err(appError(ERR.NO_CREDENTIAL, '블로그 아이디를 입력해 주세요.'));
    const per = Math.min(Math.max(1, Math.floor(count)), MAX_COUNT);
    const url =
      `${BASE}?blogId=${encodeURIComponent(blogId)}` +
      `&viewdate=&currentPage=1&categoryNo=0&countPerPage=${per}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    signal?.addEventListener('abort', () => ctrl.abort());
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        return err(
          appError(ERR.KEYWORD_FAILED, `블로그 제목 수집 실패 (${res.status})`, {
            retriable: res.status >= 500,
          }),
        );
      }
      // 응답은 text(JSON). 표준 파싱 우선, 실패 시 정규식으로 title 만 추출(형식 변형 대비).
      const text = (await res.text()).trim();
      let rawTitles: string[];
      try {
        const data = JSON.parse(text) as { resultCode?: string; postList?: PostRow[] };
        if (data.resultCode && data.resultCode !== 'S') {
          return err(appError(ERR.KEYWORD_FAILED, '비공개이거나 존재하지 않는 블로그일 수 있어요.'));
        }
        rawTitles = (data.postList ?? []).map((p) => p.title ?? '');
      } catch {
        // title 값은 URL 인코딩이라 따옴표가 없어 정규식 추출이 안전.
        rawTitles = [...text.matchAll(/"title"\s*:\s*"([^"]*)"/g)].map((m) => m[1] ?? '');
        if (!rawTitles.length) {
          return err(appError(ERR.KEYWORD_FAILED, '블로그 응답을 해석하지 못했어요(형식 변경 가능).'));
        }
      }
      const topics: Topic[] = rawTitles
        .map(decodeTitle)
        .filter((t) => t.length > 0)
        .map((title, i) => ({ id: `bt_${blogId}_${i}`, keyword: title, title }));
      return ok(topics);
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      return err(
        appError(
          ERR.KEYWORD_FAILED,
          aborted ? '수집이 취소되었거나 시간이 초과됐어요.' : `네트워크 오류: ${String(e)}`,
          { retriable: true },
        ),
      );
    } finally {
      clearTimeout(timer);
    }
  },
};
