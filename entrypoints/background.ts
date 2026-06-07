// Background (Service Worker) — 두뇌·라우터 — 05 §2. M1: ③ 생성 + ⑤ 저장 + ⑥⑦ 라우팅.
import { geminiTextAdapter } from '@/adapters/ai/gemini';
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
  TopicCollectReq,
  TopicCollectRes,
  VisualComposeReq,
  VisualComposeRes,
  VisualFetchReq,
  VisualFetchRes,
  VisualSpec,
} from '@/lib/messaging';
import type { AppError, Result } from '@/types/common';
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
    if (msg.name === 'visual.fetch') {
      // ⑥ WP8: content script 가 ref 이미지 바이트 요청 → Dexie 읽어 dataUrl 반환.
      handleVisualFetch(msg.payload as VisualFetchReq).then(sendResponse);
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

  // ⑨ 비주얼: 소제목 썸네일 옵션 ON 이면 H2 캡션으로 Canvas 합성(오프스크린). 실패해도 본문은 진행(R-7.1).
  const visuals = await buildVisuals(res.value, req.options);

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

// ⑨ 소제목 썸네일 생성(M3 WP4). H2 캡션 → VisualSpec → 오프스크린 Canvas 합성.
// 비주얼은 선택 단계(R-7.1) — 옵션 OFF 거나 실패하면 빈 배열로 본문만 진행한다.
async function buildVisuals(contentHtml: string, options: GenerateReq['options']): Promise<Visual[]> {
  if (!options.h2Thumbnail) return [];
  const captions = extractH2Captions(contentHtml);
  if (!captions.length) return [];
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
async function forwardToEditor<T>(name: ChannelName, payload: T): Promise<Result<void>> {
  const tabs = await chrome.tabs.query({ url: 'https://blog.naver.com/*' });
  const tab = tabs[0];
  if (!tab?.id) {
    return failed(
      appError(ERR.EDITOR_NOT_FOUND, '네이버 글쓰기 탭을 찾지 못했어요. 글쓰기 페이지를 열어 주세요.'),
    );
  }
  const fwd: Msg<T> = { kind: 'cmd', name, payload };
  try {
    return (await chrome.tabs.sendMessage(tab.id, fwd)) as Result<void>;
  } catch (e) {
    return failed(appError(ERR.INSERT_FAILED, `에디터 연결 실패: ${String(e)}`));
  }
}

function failed(error: AppError): Result<never> {
  progress('error', error.message, { level: 'error' });
  return { ok: false, error };
}
