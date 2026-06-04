/*
 * 펜플로우 — 제목 입력 최종 테스트 (중첩 iframe body paste)
 *
 * 발견: 제목 클릭 시 focus 가 mainFrame>iframe[0] 의 body(contenteditable=true) 로 감.
 * 가설: 제목 클릭으로 SE 가 제목 컴포넌트를 활성화 → 그 중첩 iframe body 에 paste 하면 제목에 입력.
 *
 * 사용법: F5 후 글쓰기 콘솔에 붙여넣고 Enter. 본문에 영향 없이 제목만 시도. 결과 JSON 전달.
 */
(() => {
  const report = { url: location.href, probedAt: new Date().toISOString() };

  function findEditorDoc() {
    for (const f of Array.from(document.querySelectorAll('iframe'))) {
      try {
        const d = f.contentDocument;
        if (d && (d.querySelector('.se-canvas') || d.querySelector('[contenteditable="true"]'))) return d;
      } catch {}
    }
    return document;
  }
  const edoc = findEditorDoc();
  const titleDiv = edoc.querySelector('.se-title-text');
  const titleSpan = titleDiv?.querySelector('span.__se-node') || titleDiv;

  if (!titleSpan) {
    report.error = '제목 못 찾음';
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  const beforeEmpty = titleDiv.className.includes('se-is-empty');

  // 1) 제목 컴포넌트 활성화 — 실제 클릭 시퀀스.
  for (const t of ['mousedown', 'mouseup', 'click']) {
    titleSpan.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: edoc.defaultView }));
  }

  setTimeout(() => {
    // 2) focus 된 중첩 iframe 의 body(contenteditable) 를 paste 타깃으로.
    const active = edoc.activeElement;
    let target = titleSpan;
    let targetDesc = 'titleSpan';
    if (active && active.tagName === 'IFRAME') {
      try {
        const nd = active.contentDocument;
        if (nd?.body) { target = nd.body; targetDesc = 'nestedIframeBody'; }
      } catch (e) { report.nestedErr = String(e); }
    }

    // 3) paste(text/plain) — SE 가 활성 컴포넌트(제목)에 반영하길 기대.
    let cancelled = null;
    try {
      target.focus?.();
      const dt = new DataTransfer();
      dt.setData('text/plain', '제목자동입력테스트');
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      cancelled = !target.dispatchEvent(ev);
    } catch (e) { report.pasteErr = String(e); }

    setTimeout(() => {
      report.result = {
        pasteTarget: targetDesc,
        eventCancelled: cancelled,
        beforeEmpty,
        afterEmpty: titleDiv.className.includes('se-is-empty'),
        titleText: (titleDiv.textContent || '').trim().slice(0, 50),
        titleHtmlHead: titleDiv.outerHTML.slice(0, 300),
      };
      report.success = !report.result.afterEmpty && report.result.titleText.includes('제목자동입력테스트');
      console.log('%c제목 중첩 iframe paste 결과', 'color:#0a0;font-weight:bold', report.result);
      console.log(report.success ? '✅ 성공 — 제목 들어감' : '❌ 실패');
      console.log('전체 JSON ↓\n', JSON.stringify(report, null, 2));
      window.__PENFLOW_TITLE__ = report;
    }, 400);
  }, 250);
})();
