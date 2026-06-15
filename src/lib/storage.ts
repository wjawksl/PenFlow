// 저장소 추상화 — 05 §6·§7 + 03 공통 기반(벤더 교체 가능).
// 설정·세션·프롬프트는 chrome.storage.local(작은 메타, 로컬 전용 R-0.3).
// 이미지·페이로드(IndexedDB RecordStore)는 M3/M5 에서 추가한다.
import type { KvStore } from '@/adapters';

export const chromeKvStore: KvStore = {
  async get<T>(key: string): Promise<T | null> {
    const r = await chrome.storage.local.get(key);
    return (r[key] as T) ?? null;
  },
  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async delete(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
  async list(prefix?: string): Promise<string[]> {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all);
    return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
  },
};

// 저장 키 네임스페이스 — 단일 출처.
export const STORE_KEYS = {
  settings: 'settings',
  session: 'autoPostSession',
  promptPrefix: 'prompt:',
  voicePrefix: 'voice:', // 어투 프로필(내 블로그 말투 학습)
} as const;
