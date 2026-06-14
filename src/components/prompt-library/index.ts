// ② 프롬프트 라이브러리 (R-2.1) — 이름붙인 생성 프롬프트 저장/불러오기/삭제.
// chrome.storage.local(kvStore)에 `prompt:<name>` 키로 저장. payload 저장소와 같은 프리픽스 CRUD 패턴.
import { chromeKvStore, STORE_KEYS } from '@/lib/storage';
import type { Prompt } from '@/types/models';

const key = (name: string) => `${STORE_KEYS.promptPrefix}${name}`;

/** 저장된 프롬프트 전체를 이름순(한글 우선)으로. */
export async function listPrompts(): Promise<Prompt[]> {
  const keys = await chromeKvStore.list(STORE_KEYS.promptPrefix);
  const items = await Promise.all(keys.map((k) => chromeKvStore.get<Prompt>(k)));
  return items
    .filter((p): p is Prompt => p !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** 이름붙여 저장(같은 이름이면 덮어쓰기). 빈 이름 거부(R-2.1). */
export async function savePrompt(prompt: Prompt): Promise<void> {
  const name = prompt.name.trim();
  if (!name) throw new Error('프롬프트 이름을 입력해 주세요.');
  await chromeKvStore.set(key(name), { name, body: prompt.body });
}

/** 이름으로 삭제. */
export async function deletePrompt(name: string): Promise<void> {
  await chromeKvStore.delete(key(name.trim()));
}
