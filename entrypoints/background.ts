// Background (Service Worker) — 두뇌·라우터 — 05 §2. M1: ③ 생성 + ⑤ 저장 + ⑥⑦ 라우팅.
import { geminiTextAdapter } from '@/adapters/ai/gemini';
import { geminiImageAdapter } from '@/adapters/ai/gemini-image';
import { dexieRecordStore } from '@/adapters/storage/record-store';
import { compose } from '@/components/composer';
import { extractH2Captions, generateBody } from '@/components/generator';
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
  ConvertReq,
  ConvertRes,
  DensityAnalyzeReq,
  DensityAnalyzeRes,
  GenerateReq,
  ImageInsertReq,
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
import type { Settings, Visual } from '@/types/models';

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
    if (msg.name === 'visual.fetch') {
      // ⑥ WP8: content script 가 ref 이미지 바이트 요청 → Dexie 읽어 dataUrl 반환.
      handleVisualFetch(msg.payload as VisualFetchReq).then(sendResponse);
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

// ③ 생성 → ⑨ 비주얼 → ④ 합성 → ⑤ 저장. M1: 키 1개, 순환 없음(R-0.2는 M2).
async function handleGenerate(
  req: GenerateReq,
): Promise<Result<{ payloadId: string; visuals: Visual[] }>> {
  const settings = await loadSettings();
  const credential = getActiveCredential(settings);
  if (!credential) {
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
    credential,
    model: settings.aiModel,
  });
  if (!res.ok) return res;

  // ⑨ 비주얼: 소제목 썸네일 옵션 ON 이면 H2 캡션으로 생성(기본=Canvas, AI=Gemini). 실패해도 본문은 진행(R-7.1).
  const visuals = await buildVisuals(res.value, req.options, settings);

  // ④ 부가요소 합성: 본문 마커 → 순서 보장 InsertQueue. 이미지 마커는 visuals 와 1:1(R-7.6).
  const composed = compose(res.value, req.options, visuals);
  if (!composed.ok) {
    progress('compose', composed.error.message, { level: 'error' });
    return composed;
  }

  const id = crypto.randomUUID();
  const payload = buildPayload(id, res.value, 'TEMP_SAVE', req.options, composed.value); // 기본 임시저장(R-5.1)
  payload.visuals = visuals;
  await savePayload(payload);
  return { ok: true, value: { payloadId: id, visuals } };
}

// ⑨ 소제목 썸네일 생성(M3 WP4/A3). H2 캡션 → 소스 모드별 생성.
// 비주얼은 선택 단계(R-7.1) — 옵션 OFF 거나 실패하면 빈 배열로 본문만 진행한다.
async function buildVisuals(
  contentHtml: string,
  options: GenerateReq['options'],
  settings: Settings,
): Promise<Visual[]> {
  if (!options.h2Thumbnail) return [];
  const captions = extractH2Captions(contentHtml);
  if (!captions.length) return [];

  // AI 모드 + 키 있으면 Gemini 이미지 생성, 아니면 기본(Canvas). 키 없는 AI 선택은 기본으로 폴백.
  const mode = options.h2Thumbnail.source ?? 'DEFAULT';
  if (mode === 'AI') {
    if (settings.aiImageCredential) return buildAiThumbnails(captions, settings);
    progress('visual', 'AI 이미지 키가 없어 기본 썸네일로 만듭니다.', { level: 'warn' });
  }

  progress('visual', `소제목 썸네일 ${captions.length}개 생성 중…`, { percent: 32 });
  const specs: VisualSpec[] = captions.map((h2Caption) => ({
    role: 'H2_THUMB',
    source: 'DEFAULT',
    h2Caption,
  }));
  const res = await callOffscreen<VisualComposeReq, VisualComposeRes>('visual.compose', {
    specs,
    style: options.h2Thumbnail,
    quality: options.h2Thumbnail.quality, // 압축 품질(WP5 5-2)
    dedup: true, // 중복 회피 항상 ON(R-7.4, WP5 5-1)
  });
  if (!res.ok) {
    progress('visual', `썸네일 생성 건너뜀: ${res.error.message}`, { level: 'warn' });
    return [];
  }
  return res.value.visuals;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ⑨ AI(Gemini) 소제목 썸네일 — 캡션마다 이미지 생성 → Dexie 저장 → ref Visual.
// 외부 호출은 캡션 사이 지연으로 rate limit 회피(R-7.5). 일부 실패는 건너뛰고 진행(R-7.1).
async function buildAiThumbnails(captions: string[], settings: Settings): Promise<Visual[]> {
  const credential = settings.aiImageCredential!;
  const model = settings.aiImageModel ?? 'gemini-2.5-flash-image';
  const out: Visual[] = [];
  for (let i = 0; i < captions.length; i++) {
    const caption = captions[i]!;
    progress('visual', `AI 썸네일 ${i + 1}/${captions.length} 생성 중…`, { percent: 32 });
    const res = await geminiImageAdapter.generate({ prompt: thumbPrompt(caption), model, credential });
    if (!res.ok) {
      progress('visual', `AI 썸네일 건너뜀: ${res.error.message}`, { level: 'warn' });
      continue;
    }
    const id = crypto.randomUUID();
    await dexieRecordStore.put({
      id,
      blob: inlineToBlob(res.value),
      meta: { role: 'H2_THUMB', source: 'AI', caption },
    });
    out.push({
      role: 'H2_THUMB',
      source: 'AI',
      data: { kind: 'ref', id },
      dedupApplied: false, // AI 생성물은 매번 달라 별도 중복 회피 불필요
      h2Caption: caption,
    });
    if (i < captions.length - 1) await sleep(600 + Math.floor(Math.random() * 600)); // 0.6~1.2s(R-7.5)
  }
  return out;
}

// 소제목 → 이미지 생성 프롬프트. 글자 렌더는 불안정해 텍스트 없는 일러스트로 요청.
function thumbPrompt(caption: string): string {
  return `한국어 블로그 소제목 "${caption}" 을 표현하는 깔끔한 일러스트 썸네일. 텍스트·글자 없이, 단순하고 밝은 배경, 가로형.`;
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
// blog.naver.com 탭이 여러 개일 수 있다(글 보기 + 글쓰기) → 단순 tabs[0] 는 엉뚱한 보기 탭을 집는다.
// 글쓰기 프레임(PostWriteForm)을 가진 탭만 고른다. 또 본문은 중첩 iframe(mainFrame) 안이라
// 탭 전체 브로드캐스트는 top 프레임의 무응답(return false)이 먼저 undefined 로 resolve 돼 버린다
// (Chrome tabs.sendMessage 멀티프레임 한계) → 프레임마다 개별 전송해 에디터 Result(ok)만 채택.
async function forwardToEditor<T>(name: ChannelName, payload: T): Promise<Result<void>> {
  const tabs = await chrome.tabs.query({ url: 'https://blog.naver.com/*' });
  let editorTabId: number | undefined;
  let frames: chrome.webNavigation.GetAllFrameResultDetails[] = [];
  for (const t of tabs) {
    if (!t.id) continue;
    const fs = (await chrome.webNavigation.getAllFrames({ tabId: t.id })) ?? [];
    if (fs.some((f) => f.url.includes('PostWriteForm'))) {
      editorTabId = t.id; // 글쓰기 프레임이 있는 탭 = 진짜 에디터 탭
      frames = fs;
      break;
    }
  }
  if (editorTabId === undefined) {
    return failed(
      appError(ERR.EDITOR_NOT_FOUND, '네이버 글쓰기 화면을 찾지 못했어요. 글쓰기 페이지를 열어 주세요.'),
    );
  }
  const fwd: Msg<T> = { kind: 'cmd', name, payload };
  let lastError = '';
  for (const frame of frames) {
    try {
      const res = (await chrome.tabs.sendMessage(editorTabId, fwd, { frameId: frame.frameId })) as
        | Result<void>
        | undefined;
      // 에디터 프레임만 Result 를 돌려준다. 그 외 프레임은 무응답(undefined)이라 건너뛴다.
      if (res && typeof (res as { ok?: unknown }).ok === 'boolean') return res;
    } catch (e) {
      lastError = String(e); // 리스너 없는 프레임 → "receiving end does not exist". 다음 프레임 시도.
    }
  }
  return failed(
    appError(
      ERR.EDITOR_NOT_FOUND,
      '에디터 프레임을 찾지 못했어요. 글쓰기 페이지를 새로고침한 뒤 다시 시도해 주세요.',
      lastError ? { failedStep: lastError } : undefined,
    ),
  );
}

function failed(error: AppError): Result<never> {
  progress('error', error.message, { level: 'error' });
  return { ok: false, error };
}
