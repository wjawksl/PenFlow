// ① 설정 관리자 (M1 최소) — 키 1개·모델 저장/인출 + 키 가드. WP1.
// 복수 키 순환(R-0.2)·내보내기(R-0.4)·시계 오차(R-0.5)는 M2~M5.
import { chromeKvStore, STORE_KEYS } from '@/lib/storage';
import type { Credential, Settings } from '@/types/models';

export const DEFAULT_SETTINGS: Settings = {
  aiTextCredentials: [],
  aiModel: 'gemini-2.5-flash',
  aiImageModel: 'gemini-2.5-flash-image', // ⑨ AI 이미지 기본 모델(옵션에서 교체)
  format: { lineHeight: '1.8', fontFamily: 'nanumgothic', fontSize: '15px' },
  densityRange: { min: 1, max: 5 }, // ⑩ 권장 밀도 기본 1~5%(R-8.2, 변경 가능)
};

export async function loadSettings(): Promise<Settings> {
  const s = await chromeKvStore.get<Settings>(STORE_KEYS.settings);
  return s ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chromeKvStore.set(STORE_KEYS.settings, settings);
}

/** M1: AI 본문 키 1개를 set(있으면 교체). 빈 값/공백은 거부(6.4). */
export async function setAiKey(apiKey: string, model: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error('빈 키는 저장할 수 없습니다.');
  const settings = await loadSettings();
  const cred: Credential = {
    id: 'ai_text_1',
    kind: 'ai_text',
    fields: { apiKey: trimmed },
  };
  await saveSettings({ ...settings, aiTextCredentials: [cred], aiModel: model.trim() });
}

/** ⑨ AI 이미지 키·모델 저장(선택). 빈 키면 슬롯을 비워 AI 모드 비활성(R-7.1). */
export async function setAiImageKey(apiKey: string, model: string): Promise<void> {
  const settings = await loadSettings();
  const trimmed = apiKey.trim();
  const m = model.trim() || DEFAULT_SETTINGS.aiImageModel;
  if (!trimmed) {
    const { aiImageCredential: _drop, ...rest } = settings;
    await saveSettings({ ...rest, aiImageModel: m });
    return;
  }
  const cred: Credential = {
    id: 'ai_image_1',
    kind: 'ai_image',
    fields: { apiKey: trimmed },
  };
  await saveSettings({ ...settings, aiImageCredential: cred, aiImageModel: m });
}

/** ⑩ 권장 밀도 범위 저장(R-8.2). min>max 등 비정상 입력은 호출부에서 정리. */
export async function setDensityRange(min: number, max: number): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({ ...settings, densityRange: { min, max } });
}

/** 생성 차단 가드(1-3): 키 없으면 null. */
export function getActiveCredential(settings: Settings): Credential | null {
  return settings.aiTextCredentials[0] ?? null;
}

/** ② 검색광고 키워드도구 자격증명 저장(M2 WP1). 셋 다 있어야 검색량·경쟁도 조회. */
export async function setKeywordToolCred(
  apiKey: string,
  secret: string,
  customerId: string,
): Promise<void> {
  const settings = await loadSettings();
  const a = apiKey.trim();
  const s = secret.trim();
  const c = customerId.trim();
  if (!a || !s || !c) {
    // 일부만 입력 시 슬롯 비움(부분 자격증명 방지).
    const { keywordToolCredential: _drop, ...rest } = settings;
    await saveSettings(rest);
    return;
  }
  const cred: Credential = {
    id: 'keyword_tool_1',
    kind: 'keyword_tool',
    fields: { apiKey: a, secret: s, customerId: c },
  };
  await saveSettings({ ...settings, keywordToolCredential: cred });
}
