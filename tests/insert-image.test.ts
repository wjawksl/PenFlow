import { describe, it, expect } from 'vitest';
import { countEditorImages, dataUrlToFile } from '@/components/insert/image';

// WP8 이미지 삽입 순수 헬퍼 — 바이트 변환·업로드 완료 판정 기준.
describe('dataUrlToFile', () => {
  it('base64 dataUrl 을 올바른 mime/내용의 File 로 변환한다', async () => {
    // "hi" → base64 "aGk="
    const file = dataUrlToFile('data:image/png;base64,aGk=', 'x.png');
    expect(file.name).toBe('x.png');
    expect(file.type).toBe('image/png');
    expect(await file.text()).toBe('hi');
  });

  it('mime 누락 시 image/jpeg 로 기본 처리', () => {
    const file = dataUrlToFile('data:;base64,aGk=');
    expect(file.type).toBe('image/jpeg');
  });
});

describe('countEditorImages', () => {
  it('url 형태 무관하게 모든 <img> 를 센다(상대 증가로 삽입 판정)', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<img src="https://blogfiles.naver.net/a.jpg">' +
      '<img src="data:image/png;base64,aGk=">' +
      '<img src="blob:https://blog.naver.com/x">';
    expect(countEditorImages(root)).toBe(3);
  });

  it('이미지 없으면 0', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>텍스트</p>';
    expect(countEditorImages(root)).toBe(0);
  });
});
