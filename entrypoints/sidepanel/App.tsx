// Side Panel 메인 UI — 09 S0. M1: 단일 플로우(주제→생성→삽입→임시저장).
// 입력·표시만 담당, 무거운 로직은 Background(05 §2).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  GenerateReq,
  TopicCollectReq,
  TopicCollectRes,
} from '@/lib/messaging';
import { DEFAULT_PROMPT } from '@/lib/prompt';
import { sendCmd, subscribeEvents } from '@/lib/ui-bus';
import type { PayloadOptions, Topic } from '@/types/models';

// 경쟁도 수치(1·2·3) → 라벨. searchad 어댑터 COMP_MAP 역환원.
const COMP_LABEL: Record<number, string> = { 1: '낮음', 2: '중간', 3: '높음' };
// 출처 코드 → 표시 라벨(연관 검색어 플랫폼 배지).
const SRC_LABEL: Record<string, string> = { naver: '네이버', google: '구글', youtube: '유튜브' };

type Phase = 'idle' | 'generating' | 'generated' | 'inserting' | 'done' | 'error';

// 부가요소(④) 입력 상태 — 09 S3. 켜진 항목만 마커 emit + 합성.
interface Extras {
  adOn: boolean;
  adText: string;
  shopOn: boolean;
  shopUrl: string;
  ctaOn: boolean;
  ctaText: string;
  backOn: boolean;
  backUrl: string;
  sourceOn: boolean;
}
const EXTRAS_INIT: Extras = {
  adOn: false,
  adText: '이 글은 협찬을 받아 작성되었습니다.',
  shopOn: false,
  shopUrl: '',
  ctaOn: false,
  ctaText: '자세히 보기',
  backOn: false,
  backUrl: '',
  sourceOn: false,
};

function buildOptions(e: Extras): PayloadOptions {
  const o: PayloadOptions = { includeSourceLink: e.sourceOn };
  if (e.adOn && e.adText.trim()) o.adNotice = { text: e.adText.trim(), position: 'top' };
  if (e.shopOn && e.shopUrl.trim()) o.shoppingLink = { url: e.shopUrl.trim(), positions: [] };
  if (e.ctaOn && e.ctaText.trim()) o.ctaButton = `<a href="#">${e.ctaText.trim()}</a>`;
  if (e.backOn && e.backUrl.trim()) o.backlinkBlock = `<a href="${e.backUrl.trim()}">${e.backUrl.trim()}</a>`;
  return o;
}

export function App() {
  const [keyword, setKeyword] = useState('');
  const [promptBody, setPromptBody] = useState(DEFAULT_PROMPT.body);
  const [extras, setExtras] = useState<Extras>(EXTRAS_INIT);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  const [topicTab, setTopicTab] = useState<'kw' | 'blog'>('kw'); // 키워드(검색량+연관) / 블로그 제목
  const [blogId, setBlogId] = useState(''); // 블로그 제목: 대상 블로그
  const [postCount, setPostCount] = useState(30); // 블로그 제목: 수집 개수
  const [srcC, setSrcC] = useState({ naver: true, google: true, youtube: false }); // 연관 검색어 소스 on/off
  // 결과·메시지는 경로별(A 검색량 / B 제목 / C 연관)로 보관.
  const [topicsMap, setTopicsMap] = useState<Record<'A' | 'B' | 'C', Topic[]>>({ A: [], B: [], C: [] });
  const [msgMap, setMsgMap] = useState<Record<'A' | 'B' | 'C', string>>({ A: '', B: '', C: '' });
  const [analyzing, setAnalyzing] = useState(false);
  const [clockWarn, setClockWarn] = useState(false); // 검색광고 서명 인증 실패 = 시계 오차 의심(R-0.5)
  const payloadId = useRef<string | null>(null);
  const setTopicsFor = (p: 'A' | 'B' | 'C', list: Topic[]) =>
    setTopicsMap((m) => ({ ...m, [p]: list }));
  const setMsgFor = (p: 'A' | 'B' | 'C', msg: string) => setMsgMap((m) => ({ ...m, [p]: msg }));

  useEffect(
    () =>
      subscribeEvents({
        onProgress: (e) => setProgress(`${e.percent ?? ''} ${e.message}`.trim()),
        onStepDone: (e) => {
          if (e.status === 'done') setPhase('done');
          else {
            setPhase('error');
            setProgress(e.error?.message ?? '실패');
          }
        },
      }),
    [],
  );

  // 키워드 검색: 검색량·경쟁도(A)와 연관 검색어(C)를 한 번에 수집해 같은 화면에 노출.
  async function onKeywordSearch() {
    if (!keyword.trim()) return;
    const seed = keyword.trim();
    const sources = Object.entries(srcC)
      .filter(([, on]) => on)
      .map(([k]) => k);
    setAnalyzing(true);
    setClockWarn(false);
    setMsgFor('A', '검색량 분석 중…');
    setMsgFor('C', sources.length ? '연관 검색어 수집 중…' : '소스 미선택');
    setTopicsFor('A', []);
    setTopicsFor('C', []);

    const aReq = sendCmd<TopicCollectReq, TopicCollectRes>('topic.collect', {
      path: 'A',
      input: { seed },
    });
    const cReq = sources.length
      ? sendCmd<TopicCollectReq, TopicCollectRes>('topic.collect', { path: 'C', input: { seed, sources } })
      : Promise.resolve(null);
    const [aRes, cRes] = await Promise.all([aReq, cReq]);
    setAnalyzing(false);

    // 검색량(A) — 인증 실패는 시계 오차 배너로(R-0.5, 1-3).
    if (!aRes.ok) {
      if (aRes.error.code === 'KEYWORD_AUTH') {
        setClockWarn(true);
        setMsgFor('A', '');
      } else {
        setMsgFor('A', aRes.error.message);
      }
    } else {
      setTopicsFor('A', aRes.value.topics);
      setMsgFor('A', aRes.value.topics.length ? '' : '검색량 결과 없음');
    }

    // 연관 검색어(C) — 키 불필요, A 실패와 무관하게 표시.
    if (cRes) {
      if (!cRes.ok) setMsgFor('C', cRes.error.message);
      else {
        setTopicsFor('C', cRes.value.topics);
        setMsgFor('C', cRes.value.topics.length ? '' : '연관 검색어 없음');
      }
    }
  }

  // 블로그 제목: 현재 보고 있는 탭 URL 에서 blogId 자동 인식(2-1).
  async function onDetectBlog() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const id = parseBlogId(tab?.url ?? '');
    if (id) {
      setBlogId(id);
      setMsgFor('B', `인식: ${id}`);
    } else {
      setMsgFor('B', '현재 탭에서 블로그 아이디를 찾지 못했어요.');
    }
  }

  // 경로 B: 블로그 게시물 제목 N건 수집(2-2). 제목 행 클릭 → 주제 확정(2-3).
  async function onCollectTitles() {
    if (!blogId.trim()) return;
    setAnalyzing(true);
    setMsgFor('B', '제목 수집 중…');
    setClockWarn(false);
    setTopicsFor('B', []);
    const req: TopicCollectReq = {
      path: 'B',
      input: { seed: blogId.trim(), count: postCount },
    };
    const res = await sendCmd<TopicCollectReq, TopicCollectRes>('topic.collect', req);
    setAnalyzing(false);
    if (!res.ok) {
      setMsgFor('B', res.error.message);
      return;
    }
    setTopicsFor('B', res.value.topics);
    setMsgFor('B', res.value.topics.length ? '' : '제목 없음');
  }

  async function onGenerate() {
    setPhase('generating');
    setProgress('생성 중…');
    const req: GenerateReq = {
      topic: { id: crypto.randomUUID(), keyword },
      prompt: { name: DEFAULT_PROMPT.name, body: promptBody },
      method: 'direct',
      options: buildOptions(extras),
    };
    const res = await sendCmd<GenerateReq, { payloadId: string }>('generate.run', req);
    if (!res.ok) {
      setPhase('error');
      setProgress(res.error.message);
      return;
    }
    payloadId.current = res.value.payloadId;
    setPhase('generated');
    setProgress('생성 완료. 네이버 글쓰기 페이지를 열고 삽입하세요.');
  }

  async function onInsert() {
    if (!payloadId.current) return;
    setPhase('inserting');
    setProgress('삽입 시작…');
    const res = await sendCmd<{ payloadId: string }, void>('insert.start', {
      payloadId: payloadId.current,
    });
    if (!res.ok) {
      setPhase('error');
      setProgress(res.error.message);
    }
    // 성공 시 step.done 이벤트로 phase=done 처리.
  }

  const busy = phase === 'generating' || phase === 'inserting';

  return (
    <div className="flex min-h-screen flex-col bg-white text-sm text-gray-900">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-bold">펜플로우</span>
        <button
          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
          onClick={() => chrome.runtime.openOptionsPage()}
          type="button"
        >
          ⚙ 설정
        </button>
      </header>

      <main className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          {/* ② 주제 선정 — 키워드(검색량+연관) / 블로그 제목 */}
          <div className="mb-2 flex gap-1">
            <PathTab label="🔍 키워드" on={topicTab === 'kw'} onClick={() => setTopicTab('kw')} />
            <PathTab label="📋 블로그 제목" on={topicTab === 'blog'} onClick={() => setTopicTab('blog')} />
          </div>

          {topicTab === 'kw' ? (
            <>
              <label className="mb-1 block text-xs text-gray-500">주제 (키워드)</label>
              <div className="flex gap-2">
                <input
                  className="w-full rounded border px-2 py-1"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="예: 캠핑"
                />
                <button
                  className="shrink-0 rounded border px-2 py-1 text-xs disabled:opacity-50"
                  onClick={onKeywordSearch}
                  disabled={analyzing || !keyword.trim()}
                  type="button"
                  title="검색량·경쟁도 + 연관 검색어 한 번에 조회"
                >
                  {analyzing ? '검색 중…' : '🔍 검색'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-[11px] text-gray-400">연관 소스</span>
                <SrcToggle label="네이버" on={srcC.naver} onToggle={(v) => setSrcC((s) => ({ ...s, naver: v }))} />
                <SrcToggle label="구글" on={srcC.google} onToggle={(v) => setSrcC((s) => ({ ...s, google: v }))} />
                <SrcToggle label="유튜브" on={srcC.youtube} onToggle={(v) => setSrcC((s) => ({ ...s, youtube: v }))} />
              </div>

              {clockWarn && (
                <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-semibold">⏰ 검색광고 인증 실패</p>
                  <p className="mt-1">
                    키가 맞아도 <b>PC 시계가 틀어지면</b> 서명이 거부됩니다(R-0.5). Windows{' '}
                    <b>설정 → 시간 및 언어 → 날짜 및 시간</b>에서 “지금 동기화”를 누른 뒤 다시 시도하세요.
                    계속 실패하면 설정에서 검색광고 키 3개(액세스 라이선스·Secret·CustomerID)를 확인하세요.
                  </p>
                </div>
              )}

              <div className="mt-3 space-y-3">
                <ResultTable
                  title="검색량·경쟁도"
                  kind="metrics"
                  topics={topicsMap.A}
                  msg={msgMap.A}
                  onPick={(k) => {
                    setKeyword(k);
                    setMsgFor('A', `주제 확정: ${k}`);
                  }}
                />
                <ResultTable
                  title="연관 검색어"
                  kind="related"
                  topics={topicsMap.C}
                  msg={msgMap.C}
                  onPick={(k) => {
                    setKeyword(k);
                    setMsgFor('C', `주제 확정: ${k}`);
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <label className="mb-1 block text-xs text-gray-500">대상 블로그 아이디</label>
              <div className="flex gap-2">
                <input
                  className="w-full rounded border px-2 py-1"
                  value={blogId}
                  onChange={(e) => setBlogId(e.target.value)}
                  placeholder="예: naver_blog_id"
                />
                <button
                  className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-gray-50"
                  onClick={onDetectBlog}
                  type="button"
                  title="현재 보고 있는 탭에서 블로그 아이디 인식"
                >
                  현재 탭
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-gray-500">개수</label>
                <input
                  className="w-16 rounded border px-2 py-1 text-xs"
                  type="number"
                  min={1}
                  max={100}
                  value={postCount}
                  onChange={(e) => setPostCount(Number(e.target.value) || 1)}
                />
                <button
                  className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                  onClick={onCollectTitles}
                  disabled={analyzing || !blogId.trim()}
                  type="button"
                >
                  {analyzing ? '수집 중…' : '📋 제목 수집'}
                </button>
              </div>
              <div className="mt-3">
                <ResultTable
                  title="게시물 제목"
                  kind="titles"
                  topics={topicsMap.B}
                  msg={msgMap.B}
                  onPick={(k) => {
                    setKeyword(k);
                    setMsgFor('B', `주제 확정: ${k}`);
                  }}
                />
              </div>
            </>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">프롬프트</label>
          <textarea
            className="h-24 w-full rounded border px-2 py-1"
            value={promptBody}
            onChange={(e) => setPromptBody(e.target.value)}
          />
        </div>

        {/* 부가요소 (선택) — 09 S3. 켜진 항목만 마커 emit + 합성 */}
        <fieldset className="space-y-2 rounded border p-3">
          <legend className="px-1 text-xs text-gray-500">부가요소 (선택)</legend>

          <ExtraRow
            label="광고/협찬 문구 (정책)"
            on={extras.adOn}
            onToggle={(v) => setExtras((s) => ({ ...s, adOn: v }))}
          >
            <input
              className="w-full rounded border px-2 py-1 text-xs"
              value={extras.adText}
              onChange={(e) => setExtras((s) => ({ ...s, adText: e.target.value }))}
              placeholder="협찬 표기 문구"
            />
          </ExtraRow>

          <ExtraRow
            label="쇼핑/제휴 링크"
            on={extras.shopOn}
            onToggle={(v) => setExtras((s) => ({ ...s, shopOn: v }))}
          >
            <input
              className="w-full rounded border px-2 py-1 text-xs"
              value={extras.shopUrl}
              onChange={(e) => setExtras((s) => ({ ...s, shopUrl: e.target.value }))}
              placeholder="https://링크"
            />
          </ExtraRow>

          <ExtraRow
            label="CTA 버튼"
            on={extras.ctaOn}
            onToggle={(v) => setExtras((s) => ({ ...s, ctaOn: v }))}
          >
            <input
              className="w-full rounded border px-2 py-1 text-xs"
              value={extras.ctaText}
              onChange={(e) => setExtras((s) => ({ ...s, ctaText: e.target.value }))}
              placeholder="버튼 문구"
            />
          </ExtraRow>

          <ExtraRow
            label="백링크"
            on={extras.backOn}
            onToggle={(v) => setExtras((s) => ({ ...s, backOn: v }))}
          >
            <input
              className="w-full rounded border px-2 py-1 text-xs"
              value={extras.backUrl}
              onChange={(e) => setExtras((s) => ({ ...s, backUrl: e.target.value }))}
              placeholder="https://백링크"
            />
          </ExtraRow>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={extras.sourceOn}
              onChange={(e) => setExtras((s) => ({ ...s, sourceOn: e.target.checked }))}
            />
            출처 링크 포함
          </label>
        </fieldset>

        <button
          className="w-full rounded bg-gray-900 py-2 text-white disabled:opacity-50"
          onClick={onGenerate}
          disabled={busy || !keyword.trim()}
          type="button"
        >
          {phase === 'generating' ? '생성 중…' : '✍ API 글 생성'}
        </button>

        {(phase === 'generated' || phase === 'inserting' || phase === 'done') && (
          <button
            className="w-full rounded border border-gray-900 py-2 disabled:opacity-50"
            onClick={onInsert}
            disabled={busy}
            type="button"
          >
            {phase === 'inserting' ? '삽입 중…' : '네이버 에디터에 삽입 (임시저장)'}
          </button>
        )}
      </main>

      <footer className="border-t px-4 py-2 text-xs">
        <span
          className={
            phase === 'error' ? 'text-red-600' : phase === 'done' ? 'text-green-600' : 'text-gray-500'
          }
        >
          {phase === 'done' ? '✅ 임시저장 완료' : progress || '대기 중'}
        </span>
      </footer>
    </div>
  );
}

// ② 경로 탭 버튼.
function PathTab(props: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      className={`rounded px-2 py-1 text-xs ${
        props.on ? 'bg-gray-900 text-white' : 'border text-gray-600 hover:bg-gray-50'
      }`}
      onClick={props.onClick}
      type="button"
    >
      {props.label}
    </button>
  );
}

// 결과 테이블 컬럼 정의 — 정렬값(sortVal) + 셀 렌더(cell).
interface ResultCol {
  id: string;
  label: string;
  align: 'left' | 'right' | 'center';
  sortVal: (t: Topic) => string | number;
  cell: (t: Topic) => ReactNode;
}

function colsFor(kind: 'metrics' | 'related' | 'titles'): ResultCol[] {
  const keywordCol: ResultCol = {
    id: 'keyword',
    label: kind === 'titles' ? '제목' : kind === 'related' ? '검색어' : '키워드',
    align: 'left',
    sortVal: (t) => t.keyword,
    cell: (t) => t.keyword,
  };
  if (kind === 'metrics') {
    return [
      keywordCol,
      {
        id: 'vol',
        label: '검색량',
        align: 'right',
        sortVal: (t) => t.metrics?.volume ?? -1,
        cell: (t) => t.metrics?.volume?.toLocaleString() ?? '-',
      },
      {
        id: 'comp',
        label: '경쟁도',
        align: 'center',
        sortVal: (t) => t.metrics?.competition ?? 0,
        cell: (t) => (t.metrics?.competition ? (COMP_LABEL[t.metrics.competition] ?? '-') : '-'),
      },
    ];
  }
  if (kind === 'related') {
    return [
      keywordCol,
      {
        id: 'plat',
        label: '플랫폼',
        align: 'left',
        sortVal: (t) => t.sources?.length ?? 0,
        cell: (t) => (
          <span className="flex flex-wrap gap-1">
            {(t.sources ?? []).map((s) => (
              <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                {SRC_LABEL[s] ?? s}
              </span>
            ))}
          </span>
        ),
      },
    ];
  }
  return [keywordCol];
}

// ② 결과 테이블 — 검색량(metrics)·연관(related)·제목(titles).
// 다중 정렬: 헤더 클릭 순서 = 우선순위, 클릭마다 ▲→▼→해제.
function ResultTable(props: {
  title: string;
  subtitle?: string;
  kind: 'metrics' | 'related' | 'titles';
  topics: Topic[];
  msg: string;
  onPick: (keyword: string) => void;
}) {
  const { title, subtitle, kind, topics, msg, onPick } = props;
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 }[]>([]);
  if (!topics.length && !msg) return null; // 검색 전엔 숨김

  const cols = colsFor(kind);
  // 다중 정렬: sort 배열 순서대로 첫 비교에서 갈리면 결정.
  const sorted = sort.length
    ? [...topics].sort((a, b) => {
        for (const s of sort) {
          const col = cols.find((c) => c.id === s.id);
          if (!col) continue;
          const av = col.sortVal(a);
          const bv = col.sortVal(b);
          if (av < bv) return -s.dir;
          if (av > bv) return s.dir;
        }
        return 0;
      })
    : topics;

  // 헤더 클릭: 없으면 ▲ 추가 → ▼ 전환 → 해제. 클릭 순서가 정렬 우선순위.
  const toggleSort = (id: string) =>
    setSort((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i < 0) return [...prev, { id, dir: 1 }];
      if (prev[i]!.dir === 1) return prev.map((s) => (s.id === id ? { id, dir: -1 as const } : s));
      return prev.filter((s) => s.id !== id);
    });
  const sortMark = (id: string) => {
    const i = sort.findIndex((s) => s.id === id);
    if (i < 0) return '';
    const arrow = sort[i]!.dir === 1 ? ' ▲' : ' ▼';
    return sort.length > 1 ? `${arrow}${i + 1}` : arrow; // 다중이면 우선순위 번호
  };
  const align = (a: ResultCol['align']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="rounded border">
      <div className="flex items-center gap-2 border-b bg-gray-50 px-2 py-1">
        <span className="text-xs font-semibold text-gray-700">
          {title}
          {topics.length > 0 && <span className="ml-1 text-[10px] text-gray-400">({topics.length})</span>}
          {subtitle && <span className="ml-1 text-[10px] font-normal text-gray-400">· {subtitle}</span>}
        </span>
      </div>
      {msg && <p className="px-2 py-1 text-xs text-gray-500">{msg}</p>}
      {topics.length > 0 && (
        <div className="max-h-44 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-white text-gray-500">
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.id}
                    className={`cursor-pointer select-none px-2 py-1 font-normal hover:text-gray-800 ${align(c.align)}`}
                    onClick={() => toggleSort(c.id)}
                    title="클릭: 정렬 추가 → 방향전환 → 해제 (클릭 순서 = 우선순위)"
                  >
                    {c.label}
                    {sortMark(c.id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer border-t hover:bg-blue-50"
                  onClick={() => onPick(t.keyword)}
                  title="클릭하면 주제로 확정"
                >
                  {cols.map((c) => (
                    <td key={c.id} className={`px-2 py-1 ${align(c.align)}`}>
                      {c.cell(t)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ② 연관 검색어 소스 on/off 토글.
function SrcToggle(props: { label: string; on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <input type="checkbox" checked={props.on} onChange={(e) => props.onToggle(e.target.checked)} />
      {props.label}
    </label>
  );
}

// 네이버 블로그 URL 에서 blogId 추출(2-1). blog.naver.com/{id}, ?blogId=, m.blog, {id}.blog.me.
function parseBlogId(url: string): string {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('blogId');
    if (q) return q;
    if (/(^|\.)blog\.naver\.com$/.test(u.hostname)) {
      const seg = u.pathname.split('/').filter(Boolean);
      if (seg[0] && !seg[0].endsWith('.naver')) return seg[0];
    }
    const me = u.hostname.match(/^([^.]+)\.blog\.me$/);
    if (me?.[1]) return me[1];
  } catch {
    /* 잘못된 URL */
  }
  return '';
}

// 부가요소 한 줄: 체크박스 + 켜졌을 때만 입력칸 노출.
function ExtraRow(props: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={props.on} onChange={(e) => props.onToggle(e.target.checked)} />
        {props.label}
      </label>
      {props.on && props.children}
    </div>
  );
}
