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

// 타임아웃·대기시간 파라미터 — 07 §11. 전부 설정값(하드코딩 지양, R-4.3)의 초기 기본값.
export const EDITOR_DEFAULTS = {
  editorReadyPollInterval: 300, // ms
  editorReadyTimeout: 10_000, // ms
  jobDelayMin: 300, // ms
  jobDelayMax: 900, // ms
  imageUploadTimeout: 30_000, // ms
  focusRetry: 3, // 회
} as const;
