// ⑥ 이미지 삽입 — WP8. 07 §6 이미지 경로 + 완료 비동기 대기.
// content script(페이지 origin)는 확장 IndexedDB(Dexie) 접근 불가 → 이미지 바이트는
// background(visual.fetch) 경유로 받는다. SE 본문에 이미지 File 을 paste(사용자 스크린샷 붙여넣기와
// 동일 경로) → SE 가 네이버 서버로 업로드 → placeholder 를 업로드 URL 로 교체한다.
import type { VisualFetchReq, VisualFetchRes } from '@/lib/messaging';
import { sendCmd } from '@/lib/ui-bus';
import type { BinaryOrRef } from '@/types/common';
import { sleep } from './dom';

/** BinaryOrRef → dataUrl. inline 은 즉시, ref 는 background(Dexie) 경유. 실패 시 null. */
export async function fetchVisualDataUrl(data: BinaryOrRef): Promise<string | null> {
  if (data.kind === 'inline') return data.dataUrl;
  const res = await sendCmd<VisualFetchReq, VisualFetchRes>('visual.fetch', { id: data.id });
  return res.ok ? res.value.dataUrl : null;
}

/** base64 dataUrl → 이미지 File. SE 클립보드 업로드용. */
export function dataUrlToFile(dataUrl: string, name = 'penflow.jpg'): File {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = /data:(.*?);base64/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/** 본문에 이미지 File paste(클립보드 경로). SE 가 가로채면(이벤트 취소) true. */
export function pasteImage(target: HTMLElement, file: File): boolean {
  target.focus();
  try {
    const dt = new DataTransfer();
    dt.items.add(file); // items.add → clipboardData.files 에도 노출됨
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    return !target.dispatchEvent(ev); // 취소되면 SE 가 업로드 처리
  } catch {
    return false; // DataTransfer.items.add 미지원 등
  }
}

/**
 * 에디터 문서 내 <img> 총개수 — 삽입 완료 판정 기준.
 * 실측(2026-06-07): SE 는 이미지를 contenteditable(body) 밖 article 레벨 컴포넌트로 넣고,
 * 업로드 후에도 src 가 naver URL 이 아닐 수 있다 → body 한정·url 필터는 영영 안 잡힘(무조건 타임아웃).
 * 그래서 문서 전체에서 모든 img 를 세고, before 대비 증가(=새 이미지 삽입)로만 판정한다.
 */
export function countEditorImages(root: Document | HTMLElement): number {
  return root.querySelectorAll('img').length;
}

/**
 * 이미지 삽입 완료 대기 — 문서 내 img 개수가 before 보다 늘면 완료. 타임아웃 시 false(비주얼은 선택, R-7.1).
 * (서버 업로드 완료가 아니라 "에디터에 이미지가 들어옴"을 본다 — 삽입 순서·페이싱엔 충분. 업로드는 SE 가 비동기 처리.)
 */
export async function waitImageUploaded(
  root: Document | HTMLElement,
  before: number,
  timeoutMs: number,
  intervalMs = 500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (countEditorImages(root) > before) return true;
    if (Date.now() >= deadline) return false;
    await sleep(intervalMs);
  }
}
