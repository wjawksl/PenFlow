import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// 순수 도메인 로직 단위 테스트(05 §8 tests/). @ → src 별칭은 wxt.config 와 일치시킨다.
export default defineConfig({
  resolve: {
    alias: { '@': resolve('src') },
  },
  test: {
    environment: 'jsdom', // turndown(HTML→MD)이 DOM 필요
    include: ['tests/**/*.test.ts'],
  },
});
