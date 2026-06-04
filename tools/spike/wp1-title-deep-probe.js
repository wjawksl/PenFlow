/*
 * 펜플로우 — 제목 입력 깊은 스파이크 (SE 내부 엔진/중첩 iframe 추적)
 *
 * 직전 발견: 제목은 contenteditable 밖, 클릭 시 focus 가 중첩 iframe 으로 감.
 * 목적: ① SmartEditor 전역 객체(내부 API) ② iframe 트리(진짜 입력 타깃) ③ 제목 클릭 후 focus 위치.
 *
 * 사용법: 글쓰기(팝업) 콘솔에 붙여넣고 Enter(읽기전용 조사). 출력 JSON 전체 전달.
 */
(() => {
  const report = { url: location.href, probedAt: new Date().toISOString() };

  // ── ① 전역 SmartEditor 객체 스캔(이 프로브는 MAIN world=페이지 컨텍스트) ──
  function scanGlobals(win, label) {
    const hits = [];
    try {
      for (const k of Object.keys(win)) {
        if (/^(se|editor|smart|nhn|oeditor|__se)/i.test(k) || /editor|smarteditor/i.test(k)) {
          let type = typeof win[k];
          let keys;
          try {
            if (type === 'object' && win[k]) keys = Object.keys(win[k]).slice(0, 20);
          } catch {}
          hits.push({ key: k, type, sampleKeys: keys });
        }
      }
    } catch (e) {
      return [{ error: String(e) }];
    }
    return hits.slice(0, 40);
  }

  // ── ② iframe 트리(재귀) — 각 프레임의 입력 요소 개수 ──
  function walk(win, doc, label, depth, out) {
    if (depth > 3) return;
    let ce = 0, ta = 0;
    try { ce = doc.querySelectorAll('[contenteditable="true"]').length; } catch {}
    try { ta = doc.querySelectorAll('textarea, input[type="text"]').length; } catch {}
    out.push({
      frame: label,
      url: (() => { try { return doc.location.href.slice(0, 80); } catch { return '(?)'; } })(),
      contentEditable: ce,
      textareaOrInput: ta,
      seGlobals: scanGlobals(win, label).map((h) => h.key),
    });
    const iframes = (() => { try { return Array.from(doc.querySelectorAll('iframe')); } catch { return []; } })();
    iframes.forEach((f, i) => {
      try {
        const cd = f.contentDocument, cw = f.contentWindow;
        if (cd) walk(cw, cd, `${label}>iframe[${i}]${f.name ? ':' + f.name : ''}`, depth + 1, out);
        else out.push({ frame: `${label}>iframe[${i}]`, url: '(cross-origin)', accessible: false });
      } catch {
        out.push({ frame: `${label}>iframe[${i}]`, url: '(접근불가)', accessible: false });
      }
    });
  }
  const tree = [];
  walk(window, document, 'top', 0, tree);
  report.frameTree = tree;

  // ── ③ 제목 클릭 후 focus 추적 ──
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
  const titleSpan = edoc.querySelector('.se-title-text span.__se-node') || edoc.querySelector('.se-title-text');
  if (titleSpan) {
    for (const t of ['mousedown', 'mouseup', 'click']) {
      titleSpan.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: edoc.defaultView }));
    }
    setTimeout(() => {
      const a = edoc.activeElement;
      let nested = null;
      if (a && a.tagName === 'IFRAME') {
        try {
          const nd = a.contentDocument;
          nested = {
            innerActiveTag: nd?.activeElement?.tagName,
            innerCE: nd?.querySelectorAll('[contenteditable="true"]').length,
            innerTA: nd?.querySelectorAll('textarea').length,
            bodyEditable: nd?.body?.getAttribute('contenteditable'),
            innerUrl: (() => { try { return nd.location.href.slice(0, 80); } catch { return '(?)'; } })(),
          };
        } catch (e) { nested = { error: String(e) }; }
      }
      report.titleClickFocus = {
        activeTag: a?.tagName?.toLowerCase(),
        activeClass: a && typeof a.className === 'string' ? a.className.slice(0, 60) : null,
        nestedIframe: nested,
      };
      console.log('%c제목 입력 깊은 스파이크', 'color:#0a0;font-weight:bold');
      console.log('frameTree:', report.frameTree);
      console.log('titleClickFocus:', report.titleClickFocus);
      console.log('전체 JSON ↓\n', JSON.stringify(report, null, 2));
      window.__PENFLOW_DEEP__ = report;
    }, 300);
  } else {
    report.titleClickFocus = { error: '제목 span 못 찾음' };
    console.log(JSON.stringify(report, null, 2));
  }
  return report;
})();
