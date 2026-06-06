import { describe, it, expect, vi, beforeEach } from 'vitest';

// WP0 — 오프스크린 수명관리(생성·중복방지·종료)와 위임 호출(callOffscreen) 단위 테스트.
// chrome.* 를 per-test 로 모킹하고, 모듈 레벨 `creating` 상태 격리를 위해 resetModules + 동적 import.

type Ctx = { contextType: string };

function mockChrome(opts: {
  contexts?: Ctx[];
  sendMessage?: ReturnType<typeof vi.fn>;
  createDocument?: ReturnType<typeof vi.fn>;
}) {
  const getContexts = vi.fn(async () => opts.contexts ?? []);
  const createDocument = opts.createDocument ?? vi.fn(async () => undefined);
  const closeDocument = vi.fn(async () => undefined);
  const sendMessage = opts.sendMessage ?? vi.fn(async () => ({ ok: true, value: {} }));
  const chrome = {
    runtime: {
      getContexts,
      getURL: (p: string) => `chrome-extension://id/${p}`,
      sendMessage,
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
    },
    offscreen: {
      createDocument,
      closeDocument,
      Reason: { DOM_PARSER: 'DOM_PARSER' },
    },
  };
  vi.stubGlobal('chrome', chrome);
  return { getContexts, createDocument, closeDocument, sendMessage };
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('offscreen 수명관리 (M3 WP0)', () => {
  it('ensureOffscreen: 문서 없으면 1회 생성', async () => {
    const { createDocument } = mockChrome({ contexts: [] });
    const { ensureOffscreen } = await import('@/lib/offscreen');
    await ensureOffscreen();
    expect(createDocument).toHaveBeenCalledTimes(1);
  });

  it('ensureOffscreen: 이미 있으면 생성하지 않음', async () => {
    const { createDocument } = mockChrome({ contexts: [{ contextType: 'OFFSCREEN_DOCUMENT' }] });
    const { ensureOffscreen } = await import('@/lib/offscreen');
    await ensureOffscreen();
    expect(createDocument).not.toHaveBeenCalled();
  });

  it('ensureOffscreen: 동시 호출도 생성 1회 (중복 방지)', async () => {
    const { createDocument } = mockChrome({ contexts: [] });
    const { ensureOffscreen } = await import('@/lib/offscreen');
    await Promise.all([ensureOffscreen(), ensureOffscreen(), ensureOffscreen()]);
    expect(createDocument).toHaveBeenCalledTimes(1);
  });

  it('closeOffscreen: 있으면 종료, 없으면 no-op', async () => {
    const present = mockChrome({ contexts: [{ contextType: 'OFFSCREEN_DOCUMENT' }] });
    let mod = await import('@/lib/offscreen');
    await mod.closeOffscreen();
    expect(present.closeDocument).toHaveBeenCalledTimes(1);

    vi.resetModules();
    vi.unstubAllGlobals();
    const absent = mockChrome({ contexts: [] });
    mod = await import('@/lib/offscreen');
    await mod.closeOffscreen();
    expect(absent.closeDocument).not.toHaveBeenCalled();
  });
});

describe('offscreen 위임 호출 (M3 WP0)', () => {
  it('callOffscreen: 보장 후 target:offscreen 으로 송신하고 Result 반환', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true, value: { content: 'X' } }));
    const { createDocument } = mockChrome({ contexts: [], sendMessage });
    const { callOffscreen } = await import('@/lib/offscreen');

    const res = await callOffscreen('convert.htmlmd', { direction: 'md2html', content: 'a' });

    expect(createDocument).toHaveBeenCalledTimes(1); // 없었으니 생성
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cmd', target: 'offscreen', name: 'convert.htmlmd' }),
    );
    expect(res).toEqual({ ok: true, value: { content: 'X' } });
  });

  it('callOffscreen: 미응답(undefined)이면 NO_RESPONSE 에러로 수렴', async () => {
    const sendMessage = vi.fn(async () => undefined);
    mockChrome({ contexts: [{ contextType: 'OFFSCREEN_DOCUMENT' }], sendMessage });
    const { callOffscreen } = await import('@/lib/offscreen');

    const res = await callOffscreen('convert.htmlmd', { direction: 'md2html', content: 'a' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NO_RESPONSE');
  });
});
