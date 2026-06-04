// Side Panel 메인 UI — 09 S0. M1: 단일 플로우(주제→생성→삽입→임시저장).
// 입력·표시만 담당, 무거운 로직은 Background(05 §2).
import { useEffect, useRef, useState } from 'react';
import { strip } from '@/lib/markers';
import type { GenerateReq } from '@/lib/messaging';
import { DEFAULT_PROMPT } from '@/lib/prompt';
import { sendCmd, subscribeEvents } from '@/lib/ui-bus';

type Phase = 'idle' | 'generating' | 'generated' | 'inserting' | 'done' | 'error';

export function App() {
  const [keyword, setKeyword] = useState('');
  const [promptBody, setPromptBody] = useState(DEFAULT_PROMPT.body);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  const [preview, setPreview] = useState('');
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

  async function onGenerate() {
    setPhase('generating');
    setProgress('생성 중…');
    const req: GenerateReq = {
      topic: { id: crypto.randomUUID(), keyword },
      prompt: { name: DEFAULT_PROMPT.name, body: promptBody },
      method: 'direct',
      options: { includeSourceLink: false },
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
          <input
            className="w-full rounded border px-2 py-1"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="예: 캠핑 초보 장비"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">프롬프트</label>
          <textarea
            className="h-24 w-full rounded border px-2 py-1"
            value={promptBody}
            onChange={(e) => setPromptBody(e.target.value)}
          />
        </div>

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
