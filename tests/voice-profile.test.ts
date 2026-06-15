import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildVoiceAnalysisPrompt, pickExcerpts } from '@/components/voice-profile/analyze';
import { assemblePrompt } from '@/lib/prompt';
import type { Topic, Prompt, VoiceProfile } from '@/types/models';

// 어투 프로필 — CRUD(인메모리 모킹) + 분석 순수 함수 + assemblePrompt 주입.

function mockStorage() {
  const store: Record<string, unknown> = {};
  const chrome = {
    storage: {
      local: {
        get: vi.fn(async (key?: string | null) => {
          if (key == null) return { ...store };
          return key in store ? { [key]: store[key] } : {};
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
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

describe('어투 프로필 CRUD', () => {
  it('저장 → voice: 프리픽스 키로 들어가고 목록에 뜬다', async () => {
    const store = mockStorage();
    const { saveVoiceProfile, listVoiceProfiles } = await import('@/components/voice-profile');
    await saveVoiceProfile({ name: '내블로그', spec: '해요체 위주', excerpts: ['안녕하세요~'] });
    expect((store['voice:내블로그'] as VoiceProfile).spec).toBe('해요체 위주');
    expect((await listVoiceProfiles()).map((v) => v.name)).toEqual(['내블로그']);
  });

  it('빈 이름·빈 명세는 거부', async () => {
    mockStorage();
    const { saveVoiceProfile } = await import('@/components/voice-profile');
    await expect(saveVoiceProfile({ name: ' ', spec: 'x', excerpts: [] })).rejects.toThrow();
    await expect(saveVoiceProfile({ name: 'A', spec: '  ', excerpts: [] })).rejects.toThrow();
  });

  it('같은 이름 덮어쓰기 + 빈 발췌 제거 + 이름순 정렬·삭제', async () => {
    mockStorage();
    const { saveVoiceProfile, deleteVoiceProfile, listVoiceProfiles } = await import(
      '@/components/voice-profile'
    );
    await saveVoiceProfile({ name: '나', spec: 's', excerpts: ['a', '  ', ''] });
    await saveVoiceProfile({ name: '가', spec: 's2', excerpts: [] });
    await saveVoiceProfile({ name: '나', spec: 's-new', excerpts: [] }); // 덮어쓰기
    const all = await listVoiceProfiles();
    expect(all.map((v) => v.name)).toEqual(['가', '나']);
    expect(all.find((v) => v.name === '나')!.spec).toBe('s-new');
    await deleteVoiceProfile('가');
    expect((await listVoiceProfiles()).map((v) => v.name)).toEqual(['나']);
  });
});

describe('어투 분석 순수 함수', () => {
  it('분석 프롬프트에 본문 샘플이 들어가고 말투만 분석하도록 지시', () => {
    const p = buildVoiceAnalysisPrompt(['첫 글 본문', '둘째 글 본문']);
    expect(p).toContain('말투');
    expect(p).toContain('첫 글 본문');
    expect(p).toContain('[글 1]');
    expect(p).toContain('[글 2]');
  });

  it('pickExcerpts: 길이 범위 문단만, 중복 제거, max개', () => {
    const mid = '가'.repeat(80);
    const samples = [`${mid}\n\n짧음\n\n${mid}\n\n${'나'.repeat(90)}`];
    const ex = pickExcerpts(samples, 2);
    expect(ex).toHaveLength(2);
    expect(ex[0]).toBe(mid); // 중복 mid 는 1번만
    expect(ex.every((e) => e.length >= 40 && e.length <= 220)).toBe(true);
  });
});

describe('assemblePrompt 어투 주입', () => {
  const topic: Topic = { id: 't', keyword: '캠핑' };
  const prompt: Prompt = { name: '기본', body: '써줘' };

  it('voice 없으면 어투 지침 미포함', () => {
    const out = assemblePrompt(topic, prompt);
    expect(out).not.toContain('[어투 지침]');
  });

  it('voice 있으면 명세 + 발췌 주입', () => {
    const voice: VoiceProfile = { name: 'v', spec: '해요체로 친근하게', excerpts: ['안녕하세요~ 오늘은'] };
    const out = assemblePrompt(topic, prompt, undefined, undefined, voice);
    expect(out).toContain('[어투 지침]');
    expect(out).toContain('해요체로 친근하게');
    expect(out).toContain('안녕하세요~ 오늘은');
  });

  it('spec 이 공백뿐이면 주입 안 함', () => {
    const voice: VoiceProfile = { name: 'v', spec: '   ', excerpts: ['x'] };
    const out = assemblePrompt(topic, prompt, undefined, undefined, voice);
    expect(out).not.toContain('[어투 지침]');
  });
});
