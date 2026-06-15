// 어투 프로필 — 내 블로그 말투를 학습해 이름붙여 저장/불러오기/삭제.
// chrome.storage.local(kvStore)에 `voice:<name>` 키. 프롬프트 라이브러리(R-2.1)와 같은 프리픽스 CRUD 패턴.
import { chromeKvStore, STORE_KEYS } from '@/lib/storage';
import type { VoiceProfile } from '@/types/models';

const key = (name: string) => `${STORE_KEYS.voicePrefix}${name}`;

/** 저장된 어투 프로필 전체를 이름순(한글 우선)으로. */
export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  const keys = await chromeKvStore.list(STORE_KEYS.voicePrefix);
  const items = await Promise.all(keys.map((k) => chromeKvStore.get<VoiceProfile>(k)));
  return items
    .filter((p): p is VoiceProfile => p !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** 이름붙여 저장(같은 이름이면 덮어쓰기). 빈 이름·빈 명세 거부. */
export async function saveVoiceProfile(profile: VoiceProfile): Promise<void> {
  const name = profile.name.trim();
  if (!name) throw new Error('어투 프로필 이름을 입력해 주세요.');
  if (!profile.spec.trim()) throw new Error('학습된 어투 명세가 비어 있어요.');
  await chromeKvStore.set(key(name), {
    name,
    spec: profile.spec.trim(),
    excerpts: profile.excerpts.filter((e) => e.trim()),
    sourceBlogId: profile.sourceBlogId,
    createdAt: profile.createdAt ?? Date.now(),
  });
}

/** 이름으로 삭제. */
export async function deleteVoiceProfile(name: string): Promise<void> {
  await chromeKvStore.delete(key(name.trim()));
}
