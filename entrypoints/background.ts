// Background (Service Worker) — 두뇌·라우터 — 05 §2. M1: ③ 생성 + ⑤ 저장 + ⑥⑦ 라우팅.
import { geminiTextAdapter } from '@/adapters/ai/gemini';
import { dexieRecordStore } from '@/adapters/storage/record-store';
import { compose } from '@/components/composer';
import { composeImagePrompt, extractH2Sections, generateBody } from '@/components/generator';
import { buildPayload, getPayload, savePayload } from '@/components/payload';
import { analyzeDensity } from '@/components/validator/density';
import { getActiveCredential, loadSettings } from '@/components/settings';
import { collectTopics } from '@/components/topic';
import { wireProgressBroadcast } from '@/lib/bus';
import { appError, ERR } from '@/lib/errors';
import { progress } from '@/lib/logger';
import { callOffscreen } from '@/lib/offscreen';
import type {
  ChannelName,
  ComposeThumbsReq,
  ConvertReq,
  ConvertRes,
  DensityAnalyzeReq,
  DensityAnalyzeRes,
  GeminiRunReq,
  GeminiRunRes,
  GeminiScrapeRes,
  GenerateReq,
  GenerateRunRes,
  ImageInsertReq,
  ImagePromptReq,
  ImagePromptRes,
  InsertStartReq,
  Msg,
  ReferenceFetchReq,
  ReferenceFetchRes,
  TopicCollectReq,
  TopicCollectRes,
  VisualComposeReq,
  VisualComposeRes,
  VisualFetchReq,
  VisualFetchRes,
  VisualSpec,
} from '@/lib/messaging';
import type { AppError, BinaryOrRef, Result } from '@/types/common';
import type { Visual } from '@/types/models';

export default defineBackground(() => {
  wireProgressBroadcast();

  // action 아이콘 클릭으로 Side Panel 열기(Chromium 전용).
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error('[PenFlow] sidePanel behavior 설정 실패', e));

  chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
    if (msg.kind !== 'cmd') return false;
    if (msg.target === 'offscreen') return false; // 오프스크린 위임 메시지는 BG가 처리 안 함

    if (msg.name === 'topic.collect') {
      handleTopicCollect(msg.payload as TopicCollectReq).then(sendResponse);
      return true; // 비동기 응답
    }
    if (msg.name === 'generate.run') {
      handleGenerate(msg.payload as GenerateReq).then(sendResponse);
      return true; // 비동기 응답
    }
    if (msg.name === 'density.analyze') {
      handleDensity(msg.payload as DensityAnalyzeReq).then(sendResponse);
      return true;
    }
    if (msg.name === 'convert.htmlmd') {
      // ⑩ 변환은 DOM 필요 → 오프스크린에 위임(05 §2 WP0).
      callOffscreen<ConvertReq, ConvertRes>('convert.htmlmd', msg.payload as ConvertReq).then(
        sendResponse,
      );
      return true;
    }
    if (msg.name === 'visual.composeSelected') {
      // ⑨ 생성 후 사용자가 고른 소제목들 → 기본 카드(Canvas) 썸네일 합성(offscreen 위임).
      handleComposeThumbs(msg.payload as ComposeThumbsReq).then(sendResponse);
      return true;
    }
    if (msg.name === 'visual.fetch') {
      // ⑥ WP8: content script 가 ref 이미지 바이트 요청 → Dexie 읽어 dataUrl 반환.
      handleVisualFetch(msg.payload as VisualFetchReq).then(sendResponse);
      return true;
    }
    if (msg.name === 'gemini.run') {
      // ⑨ Gemini 웹 반자동: 탭 CS 로 운전(입력·전송·스크랩) → dataUrl → Dexie 저장 → Visual 승격.
      handleGeminiRun(msg.payload as GeminiRunReq).then(sendResponse);
      return true;
    }
    if (msg.name === 'image.prompt') {
      // ⑨ 선택 소제목들 → 1장짜리 이미지 생성 프롬프트 합성(텍스트 LLM, 종류별 규칙).
      handleImagePrompt(msg.payload as ImagePromptReq).then(sendResponse);
      return true;
    }
    if (msg.name === 'reference.fetch') {
      // 참조 바구니: 링크 fetch → 본문 텍스트 추출(CORS 회피 위해 background).
      handleReferenceFetch(msg.payload as ReferenceFetchReq).then(sendResponse);
      return true;
    }
    if (msg.name === 'insert.start') {
      handleInsert(msg.payload as InsertStartReq).then(sendResponse);
      return true;
    }
    if (msg.name === 'image.insert') {
      // ⑨ 수동 이미지 삽입: 사이드패널이 고른 비주얼을 에디터 탭 content script 로 전달.
      forwardToEditor('image.insert', msg.payload).then(sendResponse);
      return true;
    }
    return false;
  });
});

// ② 주제 수집(M2 WP1). api.naver.com CORS 회피 위해 background 에서 fetch.
async function handleTopicCollect(req: TopicCollectReq): Promise<Result<TopicCollectRes>> {
  const settings = await loadSettings();
  progress('topic', '키워드 분석 중…', { percent: 30 });
  const res = await collectTopics(req, settings.keywordToolCredential);
  if (!res.ok) {
    progress('topic', res.error.message, { level: 'error' });
    return res;
  }
  progress('topic', `키워드 ${res.value.length}건 수집`, { percent: 100 });
  return { ok: true, value: { topics: res.value } };
}

// ③ 생성 → ④ 합성 → ⑤ 저장. 이미지(⑨)는 생성 후 사용자가 소제목을 골라 별도로 만든다(이미지 패널).
// 복수 키 등록 시 한도 초과(AI_QUOTA)면 generateBody 가 다음 키로 자동 전환(R-0.2).
async function handleGenerate(req: GenerateReq): Promise<Result<GenerateRunRes>> {
  const settings = await loadSettings();
  const credentials = settings.aiTextCredentials;
  if (credentials.length === 0) {
    // 키 미설정 → 생성 차단(1-3, TC-SET-04).
    return failed(appError(ERR.NO_CREDENTIAL, '키를 먼저 등록해 주세요.'));
  }
  if (!req.topic.keyword.trim() && !req.topic.title?.trim()) {
    return failed(appError('TOPIC_EMPTY', '주제를 입력해 주세요.')); // TC-GEN-07
  }

  const res = await generateBody({
    topic: req.topic,
    prompt: req.prompt,
    reference: req.reference,
    options: req.options, // 부가요소 마커 지시(M2)
    adapter: geminiTextAdapter,
    credentials, // 복수 키 순환(R-0.2)
    model: settings.aiModel,
  });
  if (!res.ok) return res;

  // ④ 부가요소 합성: 본문 마커 → 순서 보장 InsertQueue. 이미지는 생성 후 선택식이라 여기선 비주얼 없음.
  const composed = compose(res.value, req.options, []);
  if (!composed.ok) {
    progress('compose', composed.error.message, { level: 'error' });
    return composed;
  }

  const id = crypto.randomUUID();
  const payload = buildPayload(id, res.value, 'TEMP_SAVE', req.options, composed.value); // 기본 임시저장(R-5.1)
  await savePayload(payload);
  // ⑨ 소제목 목록(캡션+섹션 본문) 동반 → 사이드패널 이미지 패널이 골라 생성.
  // 프롬프트 합성은 사용자가 소제목·종류를 고른 뒤(image.prompt)에 한다 — 생성 시점엔 목록만 넘긴다.
  const sections = extractH2Sections(res.value);
  return { ok: true, value: { payloadId: id, visuals: [], sections } };
}

// ⑨ 선택 소제목들 → "본문 요약" 한 덩이로 압축(텍스트 LLM 1회). 스타일·방향은 사이드패널이 조립.
// 결과는 사이드패널에서 편집 후 Gemini 로 전송된다. 자격증명 없으면 생성과 동일하게 실패 반환.
async function handleImagePrompt(req: ImagePromptReq): Promise<Result<ImagePromptRes>> {
  const settings = await loadSettings();
  const credential = getActiveCredential(settings);
  if (!credential) return failed(appError(ERR.NO_CREDENTIAL, '키를 먼저 등록해 주세요.'));
  const prompt = await composeImagePrompt(req.sections, geminiTextAdapter, credential, settings.aiModel);
  return { ok: true, value: { prompt } };
}

// ⑨ 선택 소제목 → 기본 카드(Canvas) 썸네일 합성(M3 WP4). 생성 후 이미지 패널이 호출, offscreen 위임.
// 중복 회피는 항상 ON(R-7.4). DOM/Canvas 필요라 background 는 offscreen 으로 넘긴다(05 §2 WP0).
async function handleComposeThumbs(req: ComposeThumbsReq): Promise<Result<VisualComposeRes>> {
  if (!req.captions.length) return { ok: true, value: { visuals: [] } };
  progress('visual', `소제목 썸네일 ${req.captions.length}개 생성 중…`, { percent: 50 });
  const specs: VisualSpec[] = req.captions.map((h2Caption) => ({
    role: 'H2_THUMB',
    source: 'DEFAULT',
    h2Caption,
  }));
  const res = await callOffscreen<VisualComposeReq, VisualComposeRes>('visual.compose', {
    specs,
    style: req.style,
    quality: req.quality, // 압축 품질(WP5 5-2)
    dedup: true, // 중복 회피 항상 ON(R-7.4, WP5 5-1)
  });
  if (!res.ok) {
    progress('visual', `썸네일 생성 건너뜀: ${res.error.message}`, { level: 'warn' });
    return res;
  }
  progress('visual', `소제목 썸네일 ${res.value.visuals.length}개 생성 완료`, { percent: 100 });
  return res;
}

// adapter inline dataUrl(base64) → Blob. SW 엔 atob 사용 가능(FileReader 없음).
function inlineToBlob(data: BinaryOrRef): Blob {
  const dataUrl = data.kind === 'inline' ? data.dataUrl : '';
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return new Blob([], { type: 'image/png' });
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1]! });
}

// ⑥ WP8: ref 이미지 인출. content script 는 확장 IndexedDB 못 읽어 background 가 대신 읽어 dataUrl 전달.
async function handleVisualFetch(req: VisualFetchReq): Promise<Result<VisualFetchRes>> {
  const rec = await dexieRecordStore.get(req.id);
  if (!rec) {
    return failed(appError('VISUAL_NOT_FOUND', '삽입할 이미지를 찾지 못했어요. 다시 생성해 주세요.'));
  }
  return { ok: true, value: { dataUrl: await blobToDataUrl(rec.blob) } };
}

// SW 에는 FileReader 가 없다 → arrayBuffer + btoa 로 dataUrl 생성(청크 분할로 콜스택 보호).
async function blobToDataUrl(blob: Blob | ArrayBuffer): Promise<string> {
  const isBlob = blob instanceof Blob;
  const buf = isBlob ? await blob.arrayBuffer() : blob;
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const mime = isBlob && blob.type ? blob.type : 'image/jpeg';
  return `data:${mime};base64,${btoa(bin)}`;
}

// 참조 바구니: 링크 fetch → HTML → 오프스크린 변환(html2md)으로 본문 텍스트 추출.
// background fetch 로 CORS 회피. 추출 텍스트는 프롬프트 [참고 자료] 로 합쳐진다.
const REFERENCE_TIMEOUT_MS = 20_000;
const REFERENCE_MAX_CHARS = 50_000; // 링크당 본문 상한 — 여유롭게(사이드패널 파일 상한과 동일)
async function handleReferenceFetch(req: ReferenceFetchReq): Promise<Result<ReferenceFetchRes>> {
  let url: URL;
  try {
    url = new URL(req.url.trim());
  } catch {
    return failed(appError('REF_BAD_URL', '올바른 링크 주소가 아니에요.'));
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return failed(appError('REF_BAD_URL', 'http/https 링크만 가져올 수 있어요.'));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REFERENCE_TIMEOUT_MS);
  try {
    const res = await fetch(url.href, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return failed(appError('REF_FETCH', `링크를 가져오지 못했어요 (HTTP ${res.status}).`));
    const html = await res.text();
    const title = extractHtmlTitle(html) || url.hostname;

    // 오프스크린 turndown 으로 마크다운 추출(script/style 등 잡태그 제거). 실패 시 거친 평문 폴백.
    const conv = await callOffscreen<ConvertReq, ConvertRes>('convert.htmlmd', {
      direction: 'html2md',
      content: html,
    });
    const full = (conv.ok ? conv.value.content : stripTags(html)).trim();
    const text = full.slice(0, REFERENCE_MAX_CHARS);
    if (!text) return failed(appError('REF_EMPTY', '링크에서 읽을 본문을 찾지 못했어요.'));
    return { ok: true, value: { title, text, truncated: full.length > REFERENCE_MAX_CHARS } };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return failed(appError('REF_FETCH', aborted ? '링크 가져오기 시간 초과' : `링크 오류: ${String(e)}`));
  } finally {
    clearTimeout(timer);
  }
}

function extractHtmlTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1]!.replace(/\s+/g, ' ').trim() : '';
}

// 변환 실패 시 폴백 — 태그 제거 거친 평문(script/style 블록 먼저 삭제).
function stripTags(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

// ⑩ 키워드 밀도 검증(M3 WP2). 저장 본문에서 키워드 횟수·밀도 집계(경량, DOM 불필요).
async function handleDensity(req: DensityAnalyzeReq): Promise<Result<DensityAnalyzeRes>> {
  const payload = await getPayload(req.payloadId);
  if (!payload) {
    return failed(appError('PAYLOAD_NOT_FOUND', '대상 본문을 찾지 못했어요. 다시 생성해 주세요.'));
  }
  return { ok: true, value: analyzeDensity(payload.contentHtml, req.keywords, req.range) };
}

// ⑥⑦ 라우팅: 네이버 글쓰기 탭의 content script 로 전달.
async function handleInsert(req: InsertStartReq): Promise<Result<void>> {
  progress('insert', '에디터 탭으로 전달…', { percent: 35 });
  return forwardToEditor('insert.start', req);
}

// 네이버 글쓰기 탭 content script 로 cmd 전달(본문 프레임이 응답). insert.start·image.insert 공용.
// blog.naver.com 탭이 여러 개일 수 있고(글 보기 + 글쓰기), 본문은 중첩 iframe 안이라
// 탭 전체 브로드캐스트는 top 프레임의 무응답이 먼저 undefined 로 resolve 돼 버린다(Chrome 멀티프레임 한계).
// → 모든 blog.naver.com 탭의 모든 프레임에 프레임별 개별 전송하고, 에디터 프레임만 hasEditorHere(.se-canvas)
//   로 Result(ok)를 돌려준다. 에디터 iframe 주소(과거 'PostWriteForm')에 의존하지 않아 네이버 변경에 견고하다.
async function forwardToEditor<T>(name: ChannelName, payload: T): Promise<Result<void>> {
  const tabs = await chrome.tabs.query({ url: 'https://blog.naver.com/*' });
  const editorTabs = tabs.filter((t): t is chrome.tabs.Tab & { id: number } => t.id !== undefined);
  if (editorTabs.length === 0) {
    return failed(
      appError(ERR.EDITOR_NOT_FOUND, '네이버 글쓰기 페이지가 열려 있지 않아요. 글쓰기 화면을 먼저 열어 주세요.'),
    );
  }

  const fwd: Msg<T> = { kind: 'cmd', name, payload };
  let reached = false; // 적어도 한 프레임의 content script 가 살아 응답했나(orphaned 여부 판별)
  let lastError = '';
  for (const tab of editorTabs) {
    const frames = (await chrome.webNavigation.getAllFrames({ tabId: tab.id })) ?? [];
    for (const frame of frames) {
      try {
        const res = (await chrome.tabs.sendMessage(tab.id, fwd, { frameId: frame.frameId })) as
          | Result<void>
          | undefined;
        reached = true; // 응답이 undefined 라도 리스너는 살아있음(= CS 주입 정상)
        // 에디터 프레임만 Result 를 돌려준다(나머지 프레임은 hasEditorHere=false 라 undefined).
        if (res && typeof (res as { ok?: unknown }).ok === 'boolean') return res;
      } catch (e) {
        lastError = String(e); // CS 없는/끊긴 프레임 → "receiving end does not exist". 다음 프레임 시도.
      }
    }
  }

  // reached=false = 모든 프레임이 CS 끊김(확장 리로드 후 새로고침 안 함) / true = CS 는 살아있는데 본문 영역 없음.
  return failed(
    appError(
      ERR.EDITOR_NOT_FOUND,
      reached
        ? '글쓰기 본문 영역을 찾지 못했어요. SmartEditor 글쓰기 화면이 맞는지 확인해 주세요.'
        : '글쓰기 페이지의 확장 연결이 끊겼어요. 글쓰기 페이지를 새로고침(F5)한 뒤 다시 시도해 주세요.',
      lastError ? { failedStep: lastError } : undefined,
    ),
  );
}

// ⑨ Gemini 웹 반자동: 탭 CS 운전 → 생성 이미지 dataUrl 수신 → Dexie 저장 → Visual(ref) 승격.
// CS 는 페이지 origin 이라 Dexie 접근 불가 → visual.fetch 와 같은 이유로 BG 가 저장을 책임진다(05 §5).
// 결과 Visual 은 사이드패널 visuals[] 에 합류해 기존 image.insert 수동 삽입 경로를 그대로 탄다.
async function handleGeminiRun(req: GeminiRunReq): Promise<Result<GeminiRunRes>> {
  const scraped = await forwardToGemini(req);
  if (!scraped.ok) return scraped;

  const id = crypto.randomUUID();
  await dexieRecordStore.put({
    id,
    blob: inlineToBlob({ kind: 'inline', dataUrl: scraped.value.dataUrl }),
    meta: { role: req.role ?? 'BODY_IMAGE', source: 'GEMINI_WEB', caption: req.h2Caption },
  });
  const visual: Visual = {
    role: req.role ?? 'BODY_IMAGE',
    source: 'AI', // VisualSource 어휘상 AI(웹 세션도 AI 생성물). 출처 구분은 meta.source 에 보관.
    data: { kind: 'ref', id },
    dedupApplied: false, // 매번 다른 생성물이라 중복 회피 불필요
    h2Caption: req.h2Caption,
  };
  return { ok: true, value: { visual } };
}

// gemini.google.com 탭의 CS 로 cmd 전달(릴레이). 입력은 top 문서라 탭 전송으로 충분(프레임 불필요).
async function forwardToGemini(payload: GeminiRunReq): Promise<Result<GeminiScrapeRes>> {
  const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
  const tabId = tabs.find((t) => t.id !== undefined)?.id;
  if (tabId === undefined) {
    return failed(
      appError('GEMINI_NO_TAB', 'Gemini 탭이 없어요. gemini.google.com 을 열고 로그인해 주세요.'),
    );
  }
  const fwd: Msg<GeminiRunReq> = { kind: 'cmd', name: 'gemini.run', payload };
  try {
    const res = (await chrome.tabs.sendMessage(tabId, fwd)) as Result<GeminiScrapeRes> | undefined;
    if (res && typeof (res as { ok?: unknown }).ok === 'boolean') return res;
    return failed(appError('GEMINI_NO_RESPONSE', 'Gemini 탭이 응답하지 않아요. 페이지를 새로고침해 주세요.'));
  } catch (e) {
    return failed(appError('GEMINI_NO_RESPONSE', `Gemini 탭 연결 실패: ${String(e)}`));
  }
}

function failed(error: AppError): Result<never> {
  progress('error', error.message, { level: 'error' });
  return { ok: false, error };
}
