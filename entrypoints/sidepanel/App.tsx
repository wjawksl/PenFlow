// Side Panel 메인 UI — 09 S0. M1: 단일 플로우(주제→생성→삽입→임시저장).
// 입력·표시만 담당, 무거운 로직은 Background(05 §2).
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { strip } from '@/lib/markers';
import type { GenerateReq, TopicCollectReq, TopicCollectRes } from '@/lib/messaging';
import { DEFAULT_PROMPT } from '@/lib/prompt';
import { downloadTopicsXlsx, parseTopicsFromBuffer } from '@/lib/sheet';
import { sendCmd, subscribeEvents } from '@/lib/ui-bus';
import type { PayloadOptions, Topic } from '@/types/models';

// 경쟁도 수치(1·2·3) → 라벨. searchad 어댑터 COMP_MAP 역환원.
const COMP_LABEL: Record<number, string> = { 1: '낮음', 2: '중간', 3: '높음' };

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
  const [preview, setPreview] = useState('');
  const [topicPath, setTopicPath] = useState<'A' | 'B'>('A'); // ② 경로 A 키워드 / B 블로그제목
  const [blogId, setBlogId] = useState(''); // 경로 B: 대상 블로그
  const [postCount, setPostCount] = useState(30); // 경로 B: 수집 개수
  const [topics, setTopics] = useState<Topic[]>([]); // ② 수집 결과(A=키워드, B=제목)
  const [analyzing, setAnalyzing] = useState(false);
  const [topicMsg, setTopicMsg] = useState('');
  const [clockWarn, setClockWarn] = useState(false); // 검색광고 서명 인증 실패 = 시계 오차 의심(R-0.5)
  const payloadId = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null); // 키워드 목록 업로드(1-5)

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

  // ② 경로 A: 키워드 검색량·경쟁도 분석(R-1.1). 행 클릭으로 주제 확정.
  async function onAnalyze() {
    if (!keyword.trim()) return;
    setAnalyzing(true);
    setTopicMsg('분석 중…');
    setClockWarn(false);
    setTopics([]);
    const req: TopicCollectReq = { path: 'A', input: { seed: keyword.trim() } };
    const res = await sendCmd<TopicCollectReq, TopicCollectRes>('topic.collect', req);
    setAnalyzing(false);
    if (!res.ok) {
      // 서명 인증 실패(KEYWORD_AUTH)는 키 오류 또는 PC 시계 오차 → 전용 배너로 안내(R-0.5, 1-3).
      if (res.error.code === 'KEYWORD_AUTH') {
        setClockWarn(true);
        setTopicMsg('');
      } else {
        setTopicMsg(res.error.message);
      }
      return;
    }
    setTopics(res.value.topics);
    setTopicMsg(res.value.topics.length ? '' : '결과 없음');
  }

  // 경로 B: 현재 보고 있는 탭 URL 에서 blogId 자동 인식(2-1).
  async function onDetectBlog() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const id = parseBlogId(tab?.url ?? '');
    if (id) {
      setBlogId(id);
      setTopicMsg(`인식: ${id}`);
    } else {
      setTopicMsg('현재 탭에서 블로그 아이디를 찾지 못했어요.');
    }
  }

  // 경로 B: 블로그 게시물 제목 N건 수집(2-2). 제목 행 클릭 → 주제 확정(2-3).
  async function onCollectTitles() {
    if (!blogId.trim()) return;
    setAnalyzing(true);
    setTopicMsg('제목 수집 중…');
    setClockWarn(false);
    setTopics([]);
    const req: TopicCollectReq = {
      path: 'B',
      input: { seed: blogId.trim(), count: postCount },
    };
    const res = await sendCmd<TopicCollectReq, TopicCollectRes>('topic.collect', req);
    setAnalyzing(false);
    if (!res.ok) {
      setTopicMsg(res.error.message);
      return;
    }
    setTopics(res.value.topics);
    setTopicMsg(res.value.topics.length ? '' : '제목 없음');
  }

  // 1-5 내보내기: 분석 결과 키워드 목록을 xlsx 로 저장.
  function onExport() {
    if (!topics.length) return;
    const base = keyword.trim().replace(/\s+/g, '_') || 'keywords';
    downloadTopicsXlsx(topics, `${base}.xlsx`);
  }

  // 1-5 가져오기: xlsx/csv 파일 → Topic[] 로드(왕복).
  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 허용
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const loaded = parseTopicsFromBuffer(buf);
      setClockWarn(false);
      setTopics(loaded);
      setTopicMsg(loaded.length ? `${loaded.length}건 불러옴` : '불러올 키워드 없음');
    } catch (err) {
      setTopicMsg(`불러오기 실패: ${String(err)}`);
    }
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
    setPreview('');
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
          {/* ② 주제 선정 경로 선택 — A 키워드 분석 / B 경쟁 블로그 제목 */}
          <div className="mb-2 flex gap-1">
            <PathTab label="🔍 키워드" on={topicPath === 'A'} onClick={() => setTopicPath('A')} />
            <PathTab label="📋 블로그 제목" on={topicPath === 'B'} onClick={() => setTopicPath('B')} />
          </div>

          {topicPath === 'A' ? (
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
                  onClick={onAnalyze}
                  disabled={analyzing || !keyword.trim()}
                  type="button"
                  title="검색광고 키워드 분석(검색량·경쟁도)"
                >
                  {analyzing ? '분석 중…' : '🔍 키워드 분석'}
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  onClick={() => fileInput.current?.click()}
                  type="button"
                >
                  ⬆ 가져오기
                </button>
                <button
                  className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  onClick={onExport}
                  disabled={!topics.length}
                  type="button"
                >
                  ⬇ 엑셀 내보내기
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={onImport}
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
            </>
          )}

          {topicMsg && <p className="mt-1 text-xs text-gray-500">{topicMsg}</p>}
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
          {topics.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-gray-500">
                  {topicPath === 'A' ? (
                    <tr>
                      <th className="px-2 py-1 text-left font-normal">키워드</th>
                      <th className="px-2 py-1 text-right font-normal">검색량</th>
                      <th className="px-2 py-1 text-center font-normal">경쟁도</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="px-2 py-1 text-left font-normal">제목 (클릭해 주제 확정)</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {topics.map((t) => (
                    <tr
                      key={t.id}
                      className="cursor-pointer border-t hover:bg-blue-50"
                      onClick={() => {
                        setKeyword(t.keyword);
                        setTopics([]);
                        setTopicMsg(`주제 확정: ${t.keyword}`);
                      }}
                      title="클릭하면 주제로 확정"
                    >
                      <td className="px-2 py-1">{t.keyword}</td>
                      {topicPath === 'A' && (
                        <>
                          <td className="px-2 py-1 text-right">
                            {t.metrics?.volume?.toLocaleString() ?? '-'}
                          </td>
                          <td className="px-2 py-1 text-center">
                            {t.metrics?.competition ? (COMP_LABEL[t.metrics.competition] ?? '-') : '-'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

        {preview && (
          <div className="rounded border bg-gray-50 p-2 text-xs whitespace-pre-wrap">
            {strip(preview)}
          </div>
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
