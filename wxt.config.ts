import { defineConfig } from 'wxt';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';

// 펜플로우 — Chromium 전용 MV3 확장 (04 기술스택, 05 아키텍처 §8).
// 표시명 한글 "펜플로우", 식별자 penflow (04 부록).
// 레이아웃: entrypoints/(root) = 배치, src/ = 로직(05 §8).
// WXT 가 `@` 를 srcDir 에 고정하므로 srcDir='src' 로 둬 `@`→src 를 얻고,
// entrypoints 는 절대경로로 root 에 유지한다(path.resolve 가 절대경로면 srcDir 무시).
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  entrypointsDir: resolve('entrypoints'),
  manifest: {
    name: '펜플로우',
    // M1 범위: Side Panel(UI) + Background(두뇌) + Editor CS(삽입) — 05 §9.
    // offscreen: ⑨ Canvas 합성·⑩ DOM 변환을 화면 없는 문서에서 처리(05 §2, M3 WP0).
    permissions: ['storage', 'sidePanel', 'scripting', 'tabs', 'offscreen'],
    // ② 주제 소스 — background fetch 로 CORS 회피(M2).
    // 검색광고(A)·블로그(B)·자동완성(C: 네이버/구글·유튜브).
    host_permissions: [
      'https://blog.naver.com/*',
      'https://api.searchad.naver.com/*',
      'https://ac.search.naver.com/*',
      'https://suggestqueries.google.com/*',
    ],
    action: {},
    side_panel: {
      default_path: 'sidepanel/index.html',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
