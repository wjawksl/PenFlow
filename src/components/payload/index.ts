// ⑤ 페이로드 저장소 (M1) — WP3. 본문+발행옵션을 삽입엔진에 전달.
// M1 은 텍스트만이라 chrome.storage(kvStore)로 충분. 이미지 IndexedDB(RecordStore)는 M3.
import { chromeKvStore } from '@/lib/storage';
import type { Payload, PublishOption } from '@/types/models';

const PAYLOAD_PREFIX = 'payload:';

export async function savePayload(payload: Payload): Promise<void> {
  await chromeKvStore.set(`${PAYLOAD_PREFIX}${payload.id}`, payload);
}

export async function getPayload(id: string): Promise<Payload | null> {
  return chromeKvStore.get<Payload>(`${PAYLOAD_PREFIX}${id}`);
}

export async function deletePayload(id: string): Promise<void> {
  await chromeKvStore.delete(`${PAYLOAD_PREFIX}${id}`);
}

/** M1 페이로드 조립: 본문 HTML + 발행옵션. 비주얼·부가요소 없음. */
export function buildPayload(
  id: string,
  contentHtml: string,
  publishOption: PublishOption,
): Payload {
  return {
    id,
    contentHtml,
    visuals: [],
    options: { includeSourceLink: false },
    publishOption,
  };
}
