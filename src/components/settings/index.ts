// ① 설정 관리자 (M1 최소) — 키 1개·모델 저장/인출 + 키 가드. WP1.
// 복수 키 순환(R-0.2)·내보내기(R-0.4)·시계 오차(R-0.5)는 M2~M5.
import { chromeKvStore, STORE_KEYS } from '@/lib/storage';
import type { Credential, Settings } from '@/types/models';

export const DEFAULT_SETTINGS: Settings = {
  aiTextCredentials: [],
  aiModel: 'gemini-2.5-flash',
  format: { lineHeight: '1.8', fontFamily: 'nanumgothic', fontSize: '15px' },
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

/** 생성 차단 가드(1-3): 키 없으면 null. */
export function getActiveCredential(settings: Settings): Credential | null {
  return settings.aiTextCredentials[0] ?? null;
}
