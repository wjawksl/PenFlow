/*
 * 펜플로우 — 네이버 SmartEditor 스파이크 프로브 (07 §12 체크리스트 자동 조사)
 *
 * 사용법:
 *  1) 네이버 블로그 "글쓰기"를 연다 (권장: 팝업 모드). 본문이 보이는 상태.
 *  2) F12 → Console 탭.
 *  3) 이 파일 전체를 복사해 콘솔에 붙여넣고 Enter.
 *  4) 출력되는 표 + 맨 아래 JSON 을 통째로 복사해 전달한다.
 *
 * 기본은 읽기 전용(글에 영향 없음). paste 주입 테스트를 하려면:
 *     PENFLOW_PROBE_PASTE = true;  (한 줄 먼저 실행) 후 프로브 실행.
 *     → 본문에 "[펜플로우 paste 테스트]" 가 들어가면 paste 기법이 먹힌다는 뜻. 수동 삭제(Ctrl+Z).
 */
(() => {
  const TEST_PASTE = typeof PENFLOW_PROBE_PASTE !== 'undefined' && PENFLOW_PROBE_PASTE === true;
  const report = { url: location.href, mode: null, frames: [], probedAt: new Date().toISOString() };

  // 동일 출처 프레임 수집(top + iframes). SmartEditor 본문이 iframe 일 수 있음(07 §13).
  function collectDocs() {
    const docs = [{ label: 'top', doc: document, win: window }];
    document.querySelectorAll('iframe').forEach((f, i) => {
      try {
        const d = f.contentDocument;
        if (d) docs.push({ label: `iframe[${i}] ${f.className || f.id || ''}`.trim(), doc: d, win: f.contentWindow });
      } catch {
        docs.push({ label: `iframe[${i}] (cross-origin, 접근불가)`, doc: null, win: null });
      }
    });
    return docs;
  }

  // 후보 셀렉터 — selectors.ts 의 현재 예시값 + 흔한 SmartEditor ONE 패턴.
  const CAND = {
    editorReady: ['.se-editing-area', '[data-editor-ready]', '.se-canvas', 'iframe.se2_inputarea'],
    titleField: ['.se-title-text', '.se_title .se-text-paragraph', '[placeholder*="제목"]', '.se-documentTitle'],
    bodyArea: ['.se-content', '.se-main-container [contenteditable="true"]', '.se-editing-area [contenteditable="true"]', 'div[contenteditable="true"]'],
    initialPopupClose: ['.se-popup-close', '.btn_close', '.se-popup-button-cancel', 'button[class*="close"]'],
    saveDraft: ['button[data-name="save"]', '.save_btn', 'button.btn_save', '[class*="save"] button', 'button[class*="save"]'],
    publishOpen: ['.publish_btn', 'button[data-name="publish"]', 'button.btn_publish', '[class*="publish"] button'],
    publishConfirm: ['.confirm_btn', 'button[data-testid="seOnePublishBtn"]', 'button.btn_ok'],
  };

  function describe(el) {
    if (!el) return null;
    const tag = el.tagName.toLowerCase();
    const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 80) : '';
    const ce = el.getAttribute && el.getAttribute('contenteditable');
    return { tag, id: el.id || undefined, class: cls || undefined, contenteditable: ce || undefined, text: (el.textContent || '').trim().slice(0, 40) || undefined };
  }

  function matchIn(doc, selectors) {
    const hits = [];
    for (const sel of selectors) {
      let el = null;
      try { el = doc.querySelector(sel); } catch { /* invalid sel */ }
      if (el) hits.push({ selector: sel, el: describe(el) });
    }
    return hits;
  }

  const docs = collectDocs();
  // 모드 추정: sidebar 모드면 보통 본문이 좁고 특정 클래스. 간단히 viewport 폭으로 힌트.
  report.mode = window.innerWidth < 900 ? 'narrow(사이드바 의심 — 팝업 권장)' : 'wide(팝업 가능성)';

  for (const { label, doc } of docs) {
    if (!doc) { report.frames.push({ frame: label, accessible: false }); continue; }
    const found = {};
    let anyContentEditable = 0;
    try { anyContentEditable = doc.querySelectorAll('[contenteditable="true"]').length; } catch {}
    for (const key of Object.keys(CAND)) found[key] = matchIn(doc, CAND[key]);
    report.frames.push({ frame: label, accessible: true, contentEditableCount: anyContentEditable, found });
  }

  // paste 주입 테스트(opt-in) — 첫 contenteditable 본문 후보에 시도.
  if (TEST_PASTE) {
    let target = null;
    for (const { doc } of docs) {
      if (!doc) continue;
      target = doc.querySelector('[contenteditable="true"]');
      if (target) break;
    }
    if (target) {
      try {
        target.focus();
        const dt = new DataTransfer();
        dt.setData('text/html', '<p>[펜플로우 paste 테스트]</p>');
        dt.setData('text/plain', '[펜플로우 paste 테스트]');
        const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        const dispatched = target.dispatchEvent(ev);
        report.pasteTest = { attempted: true, eventCancelled: !dispatched, note: '본문에 텍스트가 들어갔으면 성공. Ctrl+Z 로 되돌리세요.' };
      } catch (e) {
        report.pasteTest = { attempted: true, error: String(e) };
      }
    } else {
      report.pasteTest = { attempted: false, note: 'contenteditable 본문을 못 찾음' };
    }
  } else {
    report.pasteTest = { attempted: false, note: 'PENFLOW_PROBE_PASTE=true 로 켜면 테스트' };
  }

  // 출력
  console.log('%c펜플로우 SmartEditor 스파이크 결과', 'font-weight:bold;font-size:14px');
  console.log('모드 힌트:', report.mode, '| 프레임 수:', docs.length);
  for (const fr of report.frames) {
    if (!fr.accessible) { console.log(`\n[${fr.frame}] 접근 불가(cross-origin)`); continue; }
    console.log(`\n[${fr.frame}] contenteditable=${fr.contentEditableCount}`);
    for (const key of Object.keys(fr.found)) {
      const hits = fr.found[key];
      console.log(`  ${key}:`, hits.length ? hits.map((h) => h.selector).join('  |  ') : '✗ 매칭 없음');
    }
  }
  console.log('\n%c아래 JSON 전체를 복사해 전달하세요 ↓', 'color:#0a0;font-weight:bold');
  console.log(JSON.stringify(report, null, 2));
  // 콘솔에서 우클릭 복사용으로 전역에도 보관.
  window.__PENFLOW_SPIKE__ = report;
  return report;
})();
