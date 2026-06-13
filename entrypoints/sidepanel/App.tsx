// Side Panel 메인 UI — 09 S0. M1: 단일 플로우(주제→생성→삽입→임시저장).
// 입력·표시만 담당, 무거운 로직은 Background(05 §2).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadSettings, setDensityRange } from '@/components/settings';
import type {
  DensityAnalyzeReq,
  DensityAnalyzeRes,
  GeminiRunReq,
  GeminiRunRes,
  GenerateReq,
  ImageInsertReq,
  ReferenceFetchReq,
  ReferenceFetchRes,
  TopicCollectReq,
  TopicCollectRes,
} from '@/lib/messaging';
import { DEFAULT_PROMPT } from '@/lib/prompt';
import { extractFileText } from '@/components/reference/extract';
import { sendCmd, subscribeEvents } from '@/lib/ui-bus';
import { dexieRecordStore, refToObjectUrl } from '@/adapters/storage/record-store';
import type { DensityReport, PayloadOptions, Topic, Visual } from '@/types/models';

// 경쟁도 수치(1·2·3) → 라벨. searchad 어댑터 COMP_MAP 역환원.
const COMP_LABEL: Record<number, string> = { 1: '낮음', 2: '중간', 3: '높음' };
// 출처 코드 → 표시 라벨(연관 검색어 플랫폼 배지).
const SRC_LABEL: Record<string, string> = { naver: '네이버', google: '구글', youtube: '유튜브' };
// ⑩ 밀도 판정 → 라벨·색(권장범위 기준, R-8.2).
const VERDICT: Record<'ok' | 'high' | 'low', { label: string; cls: string }> = {
  ok: { label: '✅ 적정', cls: 'text-green-600' },
  high: { label: '⚠ 과다', cls: 'text-red-600' },
  low: { label: '△ 부족', cls: 'text-amber-600' },
};

type Phase = 'idle' | 'generating' | 'generated' | 'inserting' | 'done' | 'error';

// 참조 바구니 — 글 생성 시 [참고 자료] 로 합쳐지는 첨부파일/링크/텍스트 한 건.
interface RefItem {
  id: string;
  kind: 'link' | 'file' | 'text';
  label: string; // 링크=제목/주소, 파일=파일명, 텍스트='붙여넣기'
  text: string; // 추출/입력 본문(표시 한도로 잘린 값)
  status: 'loading' | 'ok' | 'error';
  truncated?: boolean; // 한도 초과로 잘렸는지(안내용)
}

// 참조 1건당 본문 글자수 표시 한도 — 넘으면 잘리고 안내(중요한 내용만 텍스트로).
const REF_MAX_CHARS = 50_000;

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
  thumbOn: boolean; // ⑨ 소제목(H2) 썸네일 자동 생성(R-7.3)
  thumbSource: 'DEFAULT' | 'AI'; // 생성 방식: 기본 Canvas 카드 / AI 이미지(A3)
  thumbBg: string; // 썸네일 배경색
  thumbQuality: number; // JPEG 압축 품질 0~1(WP5 5-2)
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
  thumbOn: false,
  thumbSource: 'DEFAULT',
  thumbBg: '#1f2937',
  thumbQuality: 0.85,
};

// 배경 밝기에 따라 가독성 좋은 글자색 선택(흰/검).
function pickFg(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#f9fafb';
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111111' : '#f9fafb';
}

function buildOptions(e: Extras): PayloadOptions {
  const o: PayloadOptions = { includeSourceLink: e.sourceOn };
  if (e.adOn && e.adText.trim()) o.adNotice = { text: e.adText.trim(), position: 'top' };
  if (e.shopOn && e.shopUrl.trim()) o.shoppingLink = { url: e.shopUrl.trim(), positions: [] };
  if (e.ctaOn && e.ctaText.trim()) o.ctaButton = `<a href="#">${e.ctaText.trim()}</a>`;
  if (e.backOn && e.backUrl.trim()) o.backlinkBlock = `<a href="${e.backUrl.trim()}">${e.backUrl.trim()}</a>`;
  if (e.thumbOn)
    o.h2Thumbnail = { bg: e.thumbBg, fg: pickFg(e.thumbBg), quality: e.thumbQuality, source: e.thumbSource };
  return o;
}

export function App() {
  const [keyword, setKeyword] = useState('');
  const [promptBody, setPromptBody] = useState(DEFAULT_PROMPT.body);
  const [references, setReferences] = useState<RefItem[]>([]); // 참조 바구니(첨부파일·링크·텍스트)
  const [refUrl, setRefUrl] = useState('');
  const [refText, setRefText] = useState('');
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
  const [densKeywords, setDensKeywords] = useState(''); // ⑩ 밀도(WP2) 추가 키워드(쉼표 구분)
  const [densMin, setDensMin] = useState(1); // 권장 밀도 하한(%)
  const [densMax, setDensMax] = useState(5); // 권장 밀도 상한(%)
  const [rangeOpen, setRangeOpen] = useState(false); // 권장범위 조정 펼침(평소 접힘, R-8.2)
  const [densReport, setDensReport] = useState<DensityReport | null>(null);
  const [densMsg, setDensMsg] = useState('');
  const [visuals, setVisuals] = useState<Visual[]>([]); // ⑨ 생성된 비주얼(썸네일)
  const [thumbUrls, setThumbUrls] = useState<string[]>([]); // 미리보기용 object URL
  const [imgInserting, setImgInserting] = useState<number | null>(null); // 수동 삽입 중인 썸네일 index
  const [imgMsg, setImgMsg] = useState(''); // 썸네일 삽입 결과 메시지
  const [geminiPrompt, setGeminiPrompt] = useState(''); // ⑨ Gemini 웹 반자동 이미지 프롬프트
  const [geminiBusy, setGeminiBusy] = useState(false); // Gemini 웹 생성 진행 중
  const [geminiMsg, setGeminiMsg] = useState(''); // Gemini 웹 생성 안내/결과 메시지
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number } | null>(null); // 용량 미터(WP5 5-3)
  const payloadId = useRef<string | null>(null);
  const setTopicsFor = (p: 'A' | 'B' | 'C', list: Topic[]) =>
    setTopicsMap((m) => ({ ...m, [p]: list }));
  const setMsgFor = (p: 'A' | 'B' | 'C', msg: string) => setMsgMap((m) => ({ ...m, [p]: msg }));

  // 저장된 권장 밀도 범위 불러오기(R-8.2).
  useEffect(() => {
    loadSettings().then((s) => {
      if (s.densityRange) {
        setDensMin(s.densityRange.min);
        setDensMax(s.densityRange.max);
      }
    });
  }, []);

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

  // 삽입 완료 후 자동 밀도 검사 — 에디터에 글이 올라간 뒤 검토(미리보기 없이 에디터=실제 화면).
  useEffect(() => {
    if (phase === 'done') onAnalyzeDensity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 용량 미터(WP5 5-3) — 마운트 시 + 비주얼 저장 후 갱신. 확장 origin 이라 Dexie 직접 조회.
  useEffect(() => {
    dexieRecordStore.estimateUsage().then(setStorageUsage).catch(() => setStorageUsage(null));
  }, [visuals]);

  // ⑨ 비주얼 ref → 미리보기 object URL. visuals 바뀌면 재생성, 언마운트/교체 시 revoke.
  useEffect(() => {
    let urls: string[] = [];
    let alive = true;
    Promise.all(
      visuals.map((v) => (v.data.kind === 'ref' ? refToObjectUrl(v.data.id) : Promise.resolve(v.data.dataUrl))),
    ).then((list) => {
      if (!alive) {
        list.forEach((u) => u && URL.revokeObjectURL(u));
        return;
      }
      urls = list.filter((u): u is string => !!u);
      setThumbUrls(urls);
    });
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [visuals]);

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

  // 참조 바구니: 링크 추가 → background fetch → 본문 텍스트 추출(로딩 상태 표시).
  async function onAddLink() {
    const url = refUrl.trim();
    if (!url) return;
    const id = crypto.randomUUID();
    setReferences((p) => [...p, { id, kind: 'link', label: url, text: '', status: 'loading' }]);
    setRefUrl('');
    const res = await sendCmd<ReferenceFetchReq, ReferenceFetchRes>('reference.fetch', { url });
    setReferences((p) =>
      p.map((r) =>
        r.id === id
          ? res.ok
            ? { ...r, label: res.value.title, text: res.value.text, status: 'ok', truncated: res.value.truncated }
            : { ...r, label: res.error.message, status: 'error' }
          : r,
      ),
    );
  }

  // 참조 바구니: 첨부파일 추가 → 형식별 본문 추출(텍스트·PDF·docx·hwpx, extract.ts).
  async function onAddFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      setReferences((p) => [...p, { id, kind: 'file', label: file.name, text: '', status: 'loading' }]);
      const res = await extractFileText(file);
      if (!res.ok || !res.text.trim()) {
        const label = res.reason ? `${file.name} — ${res.reason}` : file.name;
        setReferences((p) => p.map((r) => (r.id === id ? { ...r, label, status: 'error' } : r)));
        continue;
      }
      const full = res.text.trim();
      const text = full.slice(0, REF_MAX_CHARS);
      setReferences((p) =>
        p.map((r) =>
          r.id === id ? { ...r, text, status: 'ok', truncated: full.length > REF_MAX_CHARS } : r,
        ),
      );
    }
  }

  // 참조 바구니: 텍스트 직접 붙여넣기(중요한 내용만 추려 넣을 때).
  function onAddText() {
    const full = refText.trim();
    if (!full) return;
    const text = full.slice(0, REF_MAX_CHARS);
    setReferences((p) => [
      ...p,
      { id: crypto.randomUUID(), kind: 'text', label: '붙여넣기', text, status: 'ok', truncated: full.length > REF_MAX_CHARS },
    ]);
    setRefText('');
  }

  const onRemoveRef = (id: string) => setReferences((p) => p.filter((r) => r.id !== id));

  // 참조 바구니 → 프롬프트 [참고 자료] 문자열. 준비된(ok) 항목만, 출처(링크 제목/파일명) 머리말 부여.
  function buildReference(): string | undefined {
    const ready = references.filter((r) => r.status === 'ok' && r.text.trim());
    if (!ready.length) return undefined;
    const KIND = { link: '링크', file: '파일', text: '텍스트' } as const;
    return ready.map((r) => `## 참고(${KIND[r.kind]}): ${r.label}\n${r.text}`).join('\n\n---\n\n');
  }

  async function onGenerate() {
    setPhase('generating');
    setProgress('생성 중…');
    const req: GenerateReq = {
      topic: { id: crypto.randomUUID(), keyword },
      prompt: { name: DEFAULT_PROMPT.name, body: promptBody },
      reference: buildReference(), // 참조 바구니 동반(참고자료)
      method: 'direct',
      options: buildOptions(extras),
    };
    const res = await sendCmd<GenerateReq, { payloadId: string; visuals: Visual[] }>('generate.run', req);
    if (!res.ok) {
      setPhase('error');
      setProgress(res.error.message);
      return;
    }
    payloadId.current = res.value.payloadId;
    setVisuals(res.value.visuals ?? []); // ⑨ 생성된 썸네일 미리보기
    setPhase('generated');
    setProgress('생성 완료. 네이버 글쓰기 페이지를 열고 삽입하세요.');
    setDensReport(null); // 새 본문 → 이전 밀도 결과 초기화(밀도 검사는 삽입 후)
    setDensMsg('');
  }

  // ⑩ 키워드 밀도 검증(WP2): 메인 키워드 + 추가 키워드를 background 에서 집계.
  async function onAnalyzeDensity() {
    if (!payloadId.current) return;
    const extra = densKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const keywords = [keyword.trim(), ...extra].filter(Boolean);
    if (!keywords.length) {
      setDensMsg('검사할 키워드가 없어요.');
      return;
    }
    const min = Math.max(0, densMin);
    const max = Math.max(min, densMax);
    setDensMsg('분석 중…');
    const res = await sendCmd<DensityAnalyzeReq, DensityAnalyzeRes>('density.analyze', {
      payloadId: payloadId.current,
      keywords,
      range: { min, max },
    });
    if (!res.ok) {
      setDensMsg(res.error.message);
      return;
    }
    setDensReport(res.value);
    setDensMsg('');
    setDensityRange(min, max); // 권장범위 저장(다음 세션 유지, R-8.2)
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

  // ⑨ 수동 이미지 삽입: 고른 썸네일을 에디터 현재 커서에 넣는다(자동 삽입 안 함, 사용자 통제).
  async function onInsertImage(i: number) {
    const v = visuals[i];
    if (!v || v.data.kind !== 'ref') return;
    setImgInserting(i);
    setImgMsg('이미지 삽입 중… (에디터에서 넣을 위치를 먼저 클릭하세요)');
    const res = await sendCmd<ImageInsertReq, void>('image.insert', { id: v.data.id });
    setImgInserting(null);
    setImgMsg(res.ok ? `썸네일 ${i + 1} 삽입됨` : res.error.message);
  }

  // ⑨ Gemini 웹 반자동 이미지 생성 — gemini.google.com 탭을 운전(반자동: 사용자가 전송).
  // 결과 Visual(ref)을 visuals[]에 합류 → 위 썸네일 미리보기·삽입 경로를 그대로 탄다.
  async function onGeminiGenerate() {
    if (!geminiPrompt.trim() || geminiBusy) return;
    setGeminiBusy(true);
    setGeminiMsg('Gemini 탭에 프롬프트를 넣었어요. Gemini 화면에서 전송하면 자동으로 가져옵니다…');
    const res = await sendCmd<GeminiRunReq, GeminiRunRes>('gemini.run', {
      prompt: geminiPrompt.trim(),
      autoSend: false, // 반자동 — 사용자가 Gemini 화면에서 최종 전송
      role: 'BODY_IMAGE',
    });
    setGeminiBusy(false);
    if (res.ok) {
      setVisuals((prev) => [...prev, res.value.visual]); // 삽입경로 합류
      setGeminiMsg('이미지를 가져왔어요. 아래 썸네일에서 골라 삽입하세요.');
    } else {
      setGeminiMsg(res.error.message);
    }
  }

  const busy = phase === 'generating' || phase === 'inserting';

  return (
    <div className="flex h-screen flex-col bg-white text-sm text-gray-900">
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

        {/* 참조 바구니 — 첨부파일·링크를 모아 글 생성 시 [참고 자료] 로 동반. 두 컴포넌트로 분리. */}
        <fieldset className="space-y-3 rounded border p-2">
          <legend className="px-1 text-xs text-gray-500">참조 자료 (선택)</legend>

          {/* 첨부파일 — 텍스트·PDF·docx·hwpx 본문 추출 */}
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-gray-500">첨부파일</label>
            <input
              type="file"
              multiple
              accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.log,.yaml,.yml,.pdf,.docx,.hwpx,text/*,application/pdf"
              className="block w-full text-xs file:mr-2 file:rounded file:border file:bg-gray-50 file:px-2 file:py-1 file:text-xs"
              onChange={(e) => {
                void onAddFiles(e.target.files);
                e.target.value = ''; // 같은 파일 재선택 허용
              }}
            />
            <p className="text-[10px] text-gray-400">PDF·Word(docx)·한글(hwpx)·텍스트 지원. 구버전 .hwp 는 PDF/hwpx 로 저장해 첨부.</p>
            <RefList items={references.filter((r) => r.kind === 'file')} onRemove={onRemoveRef} />
          </div>

          {/* 링크 */}
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-gray-500">링크</label>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
                placeholder="참고 링크 (https://…)"
                value={refUrl}
                onChange={(e) => setRefUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onAddLink();
                }}
              />
              <button
                className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                onClick={onAddLink}
                disabled={!refUrl.trim()}
                type="button"
              >
                ＋ 링크
              </button>
            </div>
            <RefList items={references.filter((r) => r.kind === 'link')} onRemove={onRemoveRef} />
          </div>

          {/* 텍스트 붙여넣기 — 한도 초과분이나 핵심만 직접 입력 */}
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-gray-500">텍스트 붙여넣기</label>
            <textarea
              className="h-16 w-full rounded border px-2 py-1 text-xs"
              placeholder="참고할 내용을 직접 붙여넣기 (긴 자료는 핵심만)"
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
            />
            <button
              className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
              onClick={onAddText}
              disabled={!refText.trim()}
              type="button"
            >
              ＋ 텍스트 추가
            </button>
            <RefList items={references.filter((r) => r.kind === 'text')} onRemove={onRemoveRef} />
          </div>

          <p className="text-[10px] text-gray-400">
            항목당 {REF_MAX_CHARS.toLocaleString()}자까지 반영돼요. 넘으면 잘리니 중요한 내용만 텍스트로 붙여넣으세요.
          </p>
        </fieldset>

        {/* ⑩ 키워드 밀도(WP2) — 항상 표시(최소 크기→데이터 시 확장). 검사는 에디터 삽입 후(done)에만. R-8.2 */}
        <fieldset className="space-y-2 rounded border p-2">
          <legend className="px-1 text-xs text-gray-500">키워드 밀도</legend>
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
              placeholder="추가 키워드 (쉼표 구분, 메인은 자동 포함)"
              value={densKeywords}
              onChange={(e) => setDensKeywords(e.target.value)}
            />
            <button
              className="shrink-0 rounded border px-2 py-1 text-xs disabled:opacity-50"
              onClick={onAnalyzeDensity}
              disabled={busy || phase !== 'done'}
              type="button"
              title={phase === 'done' ? '키워드 출현 횟수·밀도 다시 검사' : '에디터에 삽입한 뒤 검사할 수 있어요'}
            >
              밀도 검사
            </button>
          </div>

          {/* 권장범위(R-8.2): 평소 접힘 — 대부분 기본값이면 충분. 누르면 펼쳐 조정. */}
          {rangeOpen ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>권장</span>
              <input
                className="w-14 rounded border px-1 py-1 text-right"
                type="number"
                min={0}
                step={0.1}
                value={densMin}
                onChange={(e) => setDensMin(Number(e.target.value) || 0)}
              />
              <span>~</span>
              <input
                className="w-14 rounded border px-1 py-1 text-right"
                type="number"
                min={0}
                step={0.1}
                value={densMax}
                onChange={(e) => setDensMax(Number(e.target.value) || 0)}
              />
              <span>%</span>
              <button
                className="ml-auto text-[11px] text-gray-400 hover:text-gray-600"
                onClick={() => setRangeOpen(false)}
                type="button"
              >
                접기
              </button>
            </div>
          ) : (
            <button
              className="text-[11px] text-gray-400 hover:text-gray-600"
              onClick={() => setRangeOpen(true)}
              type="button"
            >
              권장 {densMin}~{densMax}% · 조정
            </button>
          )}
          {phase !== 'done' && !densReport && (
            <p className="text-[11px] text-gray-400">에디터에 삽입한 뒤 검사할 수 있어요.</p>
          )}
          {densMsg && <p className="text-xs text-gray-500">{densMsg}</p>}
          {densReport && densReport.items.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="px-1 py-1 text-left font-normal">키워드</th>
                  <th className="px-1 py-1 text-right font-normal">횟수</th>
                  <th className="px-1 py-1 text-right font-normal">밀도</th>
                  <th className="px-1 py-1 text-center font-normal">판정</th>
                </tr>
              </thead>
              <tbody>
                {densReport.items.map((it) => (
                  <tr key={it.keyword} className="border-t">
                    <td className="px-1 py-1">{it.keyword}</td>
                    <td className="px-1 py-1 text-right">{it.count}</td>
                    <td className="px-1 py-1 text-right">{it.density.toFixed(1)}%</td>
                    <td className={`px-1 py-1 text-center ${VERDICT[it.verdict].cls}`}>
                      {VERDICT[it.verdict].label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </fieldset>

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

          {/* ⑨ 소제목 썸네일(WP4) — 소제목 수만큼 배경+텍스트 카드 자동 생성(R-7.3) */}
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={extras.thumbOn}
                onChange={(e) => setExtras((s) => ({ ...s, thumbOn: e.target.checked }))}
              />
              소제목 썸네일 자동 생성
            </label>
            {extras.thumbOn && (
              <div className="space-y-1.5">
                {/* 생성 방식(A3) — 기본 카드(Canvas) / AI 이미지(Gemini, 설정 키 필요). */}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="shrink-0">방식</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="thumbSource"
                      checked={extras.thumbSource === 'DEFAULT'}
                      onChange={() => setExtras((s) => ({ ...s, thumbSource: 'DEFAULT' }))}
                    />
                    기본 카드
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="thumbSource"
                      checked={extras.thumbSource === 'AI'}
                      onChange={() => setExtras((s) => ({ ...s, thumbSource: 'AI' }))}
                    />
                    AI 이미지
                  </label>
                </div>
                {extras.thumbSource === 'AI' ? (
                  <p className="text-[11px] text-gray-400">
                    설정의 AI 이미지 키로 소제목마다 일러스트를 생성합니다. 키가 없으면 기본 카드로 만듭니다.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>배경색</span>
                      <input
                        type="color"
                        className="h-6 w-10 rounded border"
                        value={extras.thumbBg}
                        onChange={(e) => setExtras((s) => ({ ...s, thumbBg: e.target.value }))}
                      />
                      <span className="text-[11px] text-gray-400">소제목 개수만큼 1:1 생성</span>
                    </div>
                    {/* 압축 품질(WP5 5-2) — 낮을수록 용량↓·화질↓. 중복 회피 노이즈는 항상 적용(R-7.4). */}
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="shrink-0">압축 품질</span>
                      <input
                        type="range"
                        min={0.3}
                        max={1}
                        step={0.05}
                        value={extras.thumbQuality}
                        onChange={(e) => setExtras((s) => ({ ...s, thumbQuality: Number(e.target.value) }))}
                        className="flex-1"
                      />
                      <span className="w-8 shrink-0 text-right tabular-nums">
                        {Math.round(extras.thumbQuality * 100)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </fieldset>

        {/* ⑨ Gemini 웹 반자동 이미지 생성 — 무료 웹 세션 운전(API 폐기 대체). 결과는 아래 썸네일에 합류. */}
        <fieldset className="space-y-2 rounded border p-2">
          <legend className="px-1 text-xs text-gray-500">Gemini 웹 이미지(반자동)</legend>
          <p className="text-[11px] text-gray-400">
            gemini.google.com 에 로그인한 탭을 열어 두세요. 프롬프트를 넣어 두면 Gemini 화면에서 직접 전송 →
            생성되면 자동으로 가져옵니다.
          </p>
          <textarea
            className="w-full resize-y rounded border p-2 text-xs"
            rows={2}
            placeholder="예) 밝고 단순한 고양이 일러스트, 텍스트 없이, 가로형"
            value={geminiPrompt}
            onChange={(e) => setGeminiPrompt(e.target.value)}
          />
          <button
            className="w-full rounded bg-gray-900 py-1.5 text-xs text-white disabled:opacity-50"
            onClick={onGeminiGenerate}
            disabled={geminiBusy || !geminiPrompt.trim()}
            type="button"
          >
            {geminiBusy ? '생성 대기 중… (Gemini에서 전송하세요)' : '🎨 Gemini 웹으로 생성'}
          </button>
          {geminiMsg && <p className="text-xs text-gray-500">{geminiMsg}</p>}
        </fieldset>

        {/* ⑨ 비주얼 미리보기(WP4/WP8) — 생성 썸네일. 자동 삽입 안 함, 골라서 커서에 수동 삽입. */}
        {thumbUrls.length > 0 && (
          <fieldset className="space-y-2 rounded border p-2">
            <legend className="px-1 text-xs text-gray-500">썸네일 ({thumbUrls.length}) · 골라서 삽입</legend>
            <p className="text-[11px] text-gray-400">
              에디터에서 넣을 위치를 클릭한 뒤 아래 “삽입”을 누르세요.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {thumbUrls.map((url, i) => (
                <figure key={url} className="overflow-hidden rounded border">
                  <img src={url} alt={visuals[i]?.h2Caption ?? `썸네일 ${i + 1}`} className="w-full" />
                  <figcaption className="truncate px-1 pt-0.5 text-[10px] text-gray-500">
                    {visuals[i]?.h2Caption ?? ''}
                  </figcaption>
                  <button
                    className="w-full border-t py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => onInsertImage(i)}
                    disabled={imgInserting !== null}
                    type="button"
                  >
                    {imgInserting === i ? '삽입 중…' : '＋ 삽입'}
                  </button>
                </figure>
              ))}
            </div>
            {imgMsg && <p className="text-xs text-gray-500">{imgMsg}</p>}
            {storageUsage && storageUsage.quota > 0 && <StorageMeter usage={storageUsage} />}
          </fieldset>
        )}

      </main>

      {/* 하단 고정 액션 바 — 스크롤과 무관하게 생성·삽입 버튼 항상 노출 */}
      <div className="space-y-2 border-t bg-white p-3">
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
      </div>

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

// 참조 항목 리스트 — 첨부파일·링크 공용. 상태(로딩/글자수/실패) + 제거.
function RefList(props: { items: RefItem[]; onRemove: (id: string) => void }) {
  if (!props.items.length) return null;
  return (
    <ul className="space-y-1">
      {props.items.map((r) => (
        <li key={r.id} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
          <span className="shrink-0 text-gray-400">
            {r.kind === 'link' ? '🔗' : r.kind === 'file' ? '📄' : '📝'}
          </span>
          <span className="min-w-0 flex-1 truncate" title={r.label}>
            {r.status === 'loading' ? '불러오는 중…' : r.label}
          </span>
          <span className="shrink-0 text-[10px]">
            {r.status === 'ok' ? (
              <span className={r.truncated ? 'text-amber-600' : 'text-gray-400'}>
                {r.text.length.toLocaleString()}자{r.truncated ? ' (잘림)' : ''}
              </span>
            ) : r.status === 'error' ? (
              <span className="text-red-500">실패</span>
            ) : (
              ''
            )}
          </span>
          <button
            className="shrink-0 text-gray-400 hover:text-red-500"
            onClick={() => props.onRemove(r.id)}
            type="button"
            title="제거"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

// 용량 미터(WP5 5-3) — 저장된 이미지 등 확장 origin 사용량/할당량 표시.
function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
function StorageMeter(props: { usage: { usage: number; quota: number } }) {
  const { usage, quota } = props.usage;
  const pct = Math.min(100, (usage / quota) * 100);
  return (
    <div className="space-y-0.5 text-[11px] text-gray-400">
      <div className="flex justify-between">
        <span>저장 용량</span>
        <span className="tabular-nums">
          {formatMB(usage)} / {formatMB(quota)}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded bg-gray-100">
        <div className="h-full bg-gray-400" style={{ width: `${pct}%` }} />
      </div>
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
  // 항상 최소 크기로 표시(검색 전엔 헤더만), 데이터 생기면 표로 확장.

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
      {topics.length === 0 && !msg && (
        <p className="px-2 py-1 text-xs text-gray-300">검색 전</p>
      )}
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
