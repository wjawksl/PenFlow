// ⑤ 이미지·바이너리 저장소 — IndexedDB(Dexie) 구현 (M3 WP4). 05 §6.
// 큰 바이너리(비주얼 이미지)는 메시지로 던지지 않고 여기 넣은 뒤 ref(id)만 전달(05 §5).
// 확장 origin 공유 → background·offscreen·sidepanel 이 같은 DB 를 읽고 쓴다.
// (content script 는 페이지 origin 이라 접근 불가 → WP8 삽입은 background 경유.)
import Dexie, { type Table } from 'dexie';
import type { RecordStore } from '@/adapters';

interface BinRecord {
  id: string;
  blob: Blob;
  meta?: Record<string, unknown>;
}

class PenflowDB extends Dexie {
  records!: Table<BinRecord, string>;
  constructor() {
    super('penflow');
    this.version(1).stores({ records: 'id' }); // id 단일 키, blob 은 인덱스 불필요
  }
}

const db = new PenflowDB();

/** Blob | ArrayBuffer 를 Blob 으로 정규화(Dexie 는 Blob 저장 지원). */
function toBlob(data: Blob | ArrayBuffer): Blob {
  return data instanceof Blob ? data : new Blob([data]);
}

export const dexieRecordStore: RecordStore = {
  async put(record): Promise<void> {
    await db.records.put({ id: record.id, blob: toBlob(record.blob), meta: record.meta });
  },
  async get(id): Promise<{ blob: Blob; meta?: Record<string, unknown> } | null> {
    const r = await db.records.get(id);
    return r ? { blob: r.blob, meta: r.meta } : null;
  },
  async delete(id): Promise<void> {
    await db.records.delete(id);
  },
  async estimateUsage(): Promise<{ usage: number; quota: number }> {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  },
};

/** 미리보기용: 저장된 이미지 ref → object URL. 호출부가 revokeObjectURL 책임. */
export async function refToObjectUrl(id: string): Promise<string | null> {
  const r = await db.records.get(id);
  return r ? URL.createObjectURL(r.blob) : null;
}
