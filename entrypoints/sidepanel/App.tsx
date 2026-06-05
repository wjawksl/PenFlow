// Side Panel 메인 UI — 09 S0. M1: 단일 플로우(주제→생성→삽입→임시저장).
// 입력·표시만 담당, 무거운 로직은 Background(05 §2).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { strip } from '@/lib/markers';
import type { GenerateReq, TopicCollectReq, TopicCollectRes } from '@/lib/messaging';
import { DEFAULT_PROMPT } from '@/lib/prompt';
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
  const [topics, setTopics] = useState<Topic[]>([]); // ② 키워드 분석 결과
  const [analyzing, setAnalyzing] = useState(false);
  const [topicMsg, setTopicMsg] = useState('');
  const payloadId = useRef<string | null>(null);

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
    setTopics([]);
    const req: TopicCollectReq = { path: 'A', input: { seed: keyword.trim() } };
    const res = await sendCmd<TopicCollectReq, TopicCollectRes>('topic.collect', req);
    setAnalyzing(false);
    if (!res.ok) {
      setTopicMsg(res.error.message);
      return;
    }
    setTopics(res.value.topics);
    setTopicMsg(res.value.topics.length ? '' : '결과 없음');
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
          <label className="mb-1 block text-xs text-gray-500">주제</label>
          <div className="flex gap-2">
            <input
              className="w-full rounded border px-2 py-1"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="예: 캠핑 초보 장비"
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
          {topicMsg && <p className="mt-1 text-xs text-gray-500">{topicMsg}</p>}
          {topics.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-2 py-1 text-left font-normal">키워드</th>
                    <th className="px-2 py-1 text-right font-normal">검색량</th>
                    <th className="px-2 py-1 text-center font-normal">경쟁도</th>
                  </tr>
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
                      title="클릭하면 이 키워드를 주제로 확정"
                    >
                      <td className="px-2 py-1">{t.keyword}</td>
                      <td className="px-2 py-1 text-right">
                        {t.metrics?.volume?.toLocaleString() ?? '-'}
                      </td>
                      <td className="px-2 py-1 text-center">
                        {t.metrics?.competition ? (COMP_LABEL[t.metrics.competition] ?? '-') : '-'}
                      </td>
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
