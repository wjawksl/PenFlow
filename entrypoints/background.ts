// Background (Service Worker) — 두뇌·라우터 — 05 §2. M1: ③ 생성 + ⑤ 저장 + ⑥⑦ 라우팅.
import { geminiTextAdapter } from '@/adapters/ai/gemini';
import { compose } from '@/components/composer';
import { generateBody } from '@/components/generator';
import { buildPayload, getPayload, savePayload } from '@/components/payload';
import { analyzeDensity } from '@/components/validator/density';
import { getActiveCredential, loadSettings } from '@/components/settings';
import { collectTopics } from '@/components/topic';
import { wireProgressBroadcast } from '@/lib/bus';
import { appError, ERR } from '@/lib/errors';
import { progress } from '@/lib/logger';
import { callOffscreen } from '@/lib/offscreen';
import type {
  ConvertReq,
  ConvertRes,
  DensityAnalyzeReq,
  DensityAnalyzeRes,
  GenerateReq,
  InsertStartReq,
  Msg,
  TopicCollectReq,
  TopicCollectRes,
} from '@/lib/messaging';
import type { AppError, Result } from '@/types/common';

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
    if (msg.name === 'insert.start') {
      handleInsert(msg.payload as InsertStartReq).then(sendResponse);
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

// ③ 생성 → ⑤ 저장. M1: 키 1개, 순환 없음(R-0.2는 M2).
async function handleGenerate(req: GenerateReq): Promise<Result<{ payloadId: string }>> {
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

  // ④ 부가요소 합성: 본문 마커 → 순서 보장 InsertQueue. 정합성 위반(광고 누락 등) 시 차단(R-3.4).
  const composed = compose(res.value, req.options);
  if (!composed.ok) {
    progress('compose', composed.error.message, { level: 'error' });
    return composed;
  }

  const id = crypto.randomUUID();
  const payload = buildPayload(id, res.value, 'TEMP_SAVE', req.options, composed.value); // 기본 임시저장(R-5.1)
  await savePayload(payload);
  return { ok: true, value: { payloadId: id } };
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
  const tabs = await chrome.tabs.query({ url: 'https://blog.naver.com/*' });
  const tab = tabs[0];
  if (!tab?.id) {
    return failed(
      appError(ERR.EDITOR_NOT_FOUND, '네이버 글쓰기 탭을 찾지 못했어요. 글쓰기 페이지를 열어 주세요.'),
    );
  }
  progress('insert', '에디터 탭으로 전달…', { percent: 35 });
  const fwd: Msg<InsertStartReq> = { kind: 'cmd', name: 'insert.start', payload: req };
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
