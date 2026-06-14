import { describe, it, expect, vi, beforeEach } from 'vitest';

// ② 프롬프트 라이브러리(R-2.1) 단위 테스트. chrome.storage.local 을 인메모리로 모킹.

function mockStorage() {
  const store: Record<string, unknown> = {};
  const chrome = {
    storage: {
      local: {
        get: vi.fn(async (key?: string | null) => {
          if (key == null) return { ...store };
          return key in store ? { [key]: store[key] } : {};
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key];
        }),
      },
    },
  };
  vi.stubGlobal('chrome', chrome);
  return store;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('프롬프트 라이브러리 (R-2.1)', () => {
  it('저장 → prompt: 프리픽스 키로 들어가고 목록에 뜬다', async () => {
    const store = mockStorage();
    const { savePrompt, listPrompts } = await import('@/components/prompt-library');
    await savePrompt({ name: '정보글', body: '정보성 글을 써줘' });
    expect(store['prompt:정보글']).toEqual({ name: '정보글', body: '정보성 글을 써줘' });
    expect(await listPrompts()).toEqual([{ name: '정보글', body: '정보성 글을 써줘' }]);
  });

  it('같은 이름 저장은 덮어쓴다', async () => {
    mockStorage();
    const { savePrompt, listPrompts } = await import('@/components/prompt-library');
    await savePrompt({ name: 'A', body: '첫번째' });
    await savePrompt({ name: 'A', body: '두번째' });
    const all = await listPrompts();
    expect(all).toHaveLength(1);
    expect(all[0]!.body).toBe('두번째');
  });

  it('빈/공백 이름은 거부한다', async () => {
    mockStorage();
    const { savePrompt } = await import('@/components/prompt-library');
    await expect(savePrompt({ name: '  ', body: 'x' })).rejects.toThrow();
  });

  it('이름은 trim 해서 저장한다', async () => {
    const store = mockStorage();
    const { savePrompt } = await import('@/components/prompt-library');
    await savePrompt({ name: '  여행  ', body: 'x' });
    expect(store['prompt:여행']).toEqual({ name: '여행', body: 'x' });
  });

  it('목록은 이름순 정렬, 삭제 후 빠진다', async () => {
    mockStorage();
    const { savePrompt, deletePrompt, listPrompts } = await import('@/components/prompt-library');
    await savePrompt({ name: '나', body: '2' });
    await savePrompt({ name: '가', body: '1' });
    expect((await listPrompts()).map((p) => p.name)).toEqual(['가', '나']);
    await deletePrompt('가');
    expect((await listPrompts()).map((p) => p.name)).toEqual(['나']);
  });
});
