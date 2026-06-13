// 네이버 SmartEditor 셀렉터 단일 출처 — 07 §3. UI 변경 대비 폴백 배열.
// M1 스파이크(2026-06-04) 실측 반영(docs/manual/milestone/M1-스파이크.md).
// 본문은 iframe[name=mainFrame] 안(same-origin) → insert/dom.ts findEditorDoc() 으로 접근.
// 동적 해시 클래스(.save_btn__xxxx)는 빌드마다 변하므로 class*= 부분매칭을 우선 폴백으로 둔다(07 §13).
// 우선순위 순서대로 시도, 앞에서 실패하면 다음으로 폴백(R-4.1).
export const SEL = {
  editorReady: ['.se-canvas', '.se-editing-area'],
  titleField: ['.se-title-text', '[placeholder*="제목"]'],
  bodyArea: [
    '.se-content [contenteditable="true"]',
    '.se-main-container [contenteditable="true"]',
    'div[contenteditable="true"]',
    '.se-content',
  ],
  initialPopupClose: ['.se-popup-close', '.se-popup-button-cancel', '.btn_close'],
  saveDraft: ['button[class*="save_btn"]', 'button[class*="save"]'],
  publishOpen: ['button[class*="publish_btn"]', 'button[class*="publish"]'],
  // 발행 확인 버튼은 발행 클릭 후에만 등장 → M2 에서 실측(현재 미검증).
  publishConfirm: ['.confirm_btn', 'button[data-testid="seOnePublishBtn"]'],
} as const;

export type SelectorKey = keyof typeof SEL;

// Gemini 웹(gemini.google.com) 셀렉터 — M3 반자동 스파이크 실측(2026-06-11, gemini-probe.js).
// 프롬프트칸은 Quill contenteditable. 전송/중지 버튼은 텍스트 있을 때만/생성 중에만 등장 → 라이브 재확인 필요.
// 생성 이미지는 single-image 안의 img(완료 시 class 에 'loaded', src=blob:). 로딩 중 image-loading-overlay 존재.
export const GEMINI = {
  promptInput: [
    'rich-textarea .ql-editor[contenteditable="true"]', // 실측 ✅
    '.ql-editor[contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
  ],
  // ⚠️ 미검증(빈 입력 땐 미렌더) — 추측 폴백. 라이브 실측 후 교체.
  sendButton: [
    'button.send-button',
    'button[aria-label*="보내기"]',
    'button[aria-label*="전송"]',
    'button[aria-label*="Send" i]',
  ],
  // 생성 중에만 등장(send→stop 토글). 완료 폴링 보조 신호.
  stopButton: [
    'button.send-button.stop',
    'button[aria-label*="응답 중지"]',
    'button[aria-label*="중지"]',
    'button[aria-label*="Stop" i]',
  ],
  attachButton: [
    'button[aria-label*="업로드"]', // 실측 ✅ "업로드 및 도구"
    'input[type="file"]',
  ],
  // 완료 신호: img.loaded 등장 + 로딩 오버레이 소멸. src 는 blob:(같은 origin → CS fetch 가능).
  generatedImage: [
    'single-image img.loaded', // 실측 ✅ (완료)
    'single-image img',
    'generated-image img',
    'message-content img[src^="blob:"]',
  ],
  loadingOverlay: ['image-loading-overlay'], // 실측 ✅ 생성 중 존재
} as const;

// Gemini 운전 타임아웃 — 이미지 생성은 느리다(반자동: 사용자 전송 대기 포함).
export const GEMINI_DEFAULTS = {
  inputSettleMs: 200, // 프롬프트 주입 후 프레임워크 반영 대기
  sendWaitTimeout: 8_000, // (autoSend) 텍스트 입력 후 전송 버튼 등장 대기
  sendWaitPoll: 200,
  resultTimeout: 240_000, // 반자동: 사용자 전송 + 생성 완료까지 넉넉히
  resultPoll: 800,
} as const;

// 타임아웃·대기시간 파라미터 — 07 §11. 전부 설정값(하드코딩 지양, R-4.3)의 초기 기본값.
export const EDITOR_DEFAULTS = {
  editorReadyPollInterval: 300, // ms
  editorReadyTimeout: 10_000, // ms
  jobDelayMin: 300, // ms
  jobDelayMax: 900, // ms
  imageUploadTimeout: 30_000, // ms
  focusRetry: 3, // 회
} as const;
