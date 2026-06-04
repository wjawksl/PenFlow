/*
 * 펜플로우 — 제목/표 삽입 진단 프로브 (M3 WP1 후속)
 *
 * 증상: 제목이 작게 들어가고 지워지지 않음, marked 표가 제대로 안 들어감.
 * 목적: ① 제목 요소 구조 ② 제목 입력법(textContent vs paste) ③ marked 스타일 표 paste 결과.
 *
 * 사용법:
 *  1) 네이버 글쓰기(팝업) 열고 본문 보이는 상태. F12 → Console.
 *  2) 이 파일 전체 붙여넣고 Enter → 제목 요소 구조 덤프(읽기전용).
 *  3) 제목 입력 실측: `PENFLOW_DIAG = 'title'` 실행 후 재실행 → textContent/paste 두 방식 비교.
 *  4) 표 실측: `PENFLOW_DIAG = 'table'` 실행 후 재실행 → marked 스타일 표 paste 결과.
 *  5) 출력 JSON 전체 복사해 전달. (각 테스트 후 Ctrl+Z 로 되돌리기)
 */
(() => {
  const MODE = typeof PENFLOW_DIAG !== 'undefined' ? PENFLOW_DIAG : null; // null|'title'|'table'
  const report = { url: location.href, mode: MODE, probedAt: new Date().toISOString() };

  function findEditorDoc() {
    for (const f of Array.from(document.querySelectorAll('iframe'))) {
      try {
        const d = f.contentDocument;
        if (d && (d.querySelector('.se-canvas') || d.querySelector('[contenteditable="true"]'))) return d;
      } catch {}
    }
    return document;
  }
  const doc = findEditorDoc();

  // 셀렉터(현재 코드값)
  const SEL_TITLE = ['.se-title-text', '[placeholder*="제목"]'];
  const SEL_BODY = ['.se-content [contenteditable="true"]', 'div[contenteditable="true"]', '.se-content'];
  const pick = (arr) => arr.map((s) => doc.querySelector(s)).find(Boolean) || null;

  const titleEl = pick(SEL_TITLE);
  const bodyEl = pick(SEL_BODY);

  // ── 제목 요소 구조 덤프(읽기전용) ──
  function dumpEl(el) {
    if (!el) return null;
    return {
      tag: el.tagName.toLowerCase(),
      class: (typeof el.className === 'string' ? el.className : '').slice(0, 120),
      contentEditable: el.getAttribute('contenteditable'),
      childTags: Array.from(el.children).map((c) => `${c.tagName.toLowerCase()}.${(typeof c.className === 'string' ? c.className : '').split(' ')[0]}`),
      outerHTMLHead: el.outerHTML.slice(0, 400),
    };
  }
  report.title = dumpEl(titleEl);

  function pasteInto(el, html, plain) {
    el.focus();
    const dt = new DataTransfer();
    if (html) dt.setData('text/html', html);
    dt.setData('text/plain', plain);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    const cancelled = !el.dispatchEvent(ev);
    return cancelled;
  }

  if (MODE === 'title' && titleEl) {
    // ⚠️ 먼저 F5 새로고침으로 제목을 깨끗이 둔 뒤 실행(이전 오염 제거).
    // 가설: SmartEditor 는 클릭한 컴포넌트를 활성화하고 paste/키를 후킹한다(본문 paste 성공과 동일).
    //       → 제목 paragraph 를 실제처럼 클릭(mousedown/up/click) → 활성 요소에 paste.
    const para = titleEl.querySelector('.se-text-paragraph') || titleEl;
    const span = titleEl.querySelector('span.__se-node') || para;

    report.titleContext = {
      closestEditable: !!titleEl.closest('[contenteditable="true"]'),
      titleEditableAttr: titleEl.getAttribute('contenteditable'),
    };

    // 실제 클릭 시퀀스
    for (const type of ['mousedown', 'mouseup', 'click']) {
      span.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView }));
    }
    const active = doc.activeElement;
    report.afterClick = {
      activeTag: active ? active.tagName.toLowerCase() : null,
      activeClass: active && typeof active.className === 'string' ? active.className.slice(0, 80) : null,
    };

    // 활성 요소(없으면 span)에 paste — text/plain 제목.
    const target = active && active !== doc.body ? active : span;
    const cancelled = pasteInto(target, null, '제목클릭paste테스트');
    setTimeout(() => {
      report.titleClickPaste = {
        pasteTargetTag: target.tagName.toLowerCase(),
        eventCancelled: cancelled,
        after: titleEl.outerHTML.slice(0, 350),
        stillEmptyClass: titleEl.className.includes('se-is-empty'),
      };
      console.log('%c제목 클릭+paste 결과', 'color:#0a0;font-weight:bold', report.titleClickPaste);
      console.log('context:', report.titleContext, 'afterClick:', report.afterClick);
      console.log('전체 JSON ↓\n', JSON.stringify(report, null, 2));
      window.__PENFLOW_DIAG__ = report;
    }, 400);
  } else if (MODE === 'table' && bodyEl) {
    // marked 가 만드는 스타일의 표(thead/th 포함)를 paste.
    const tableHtml =
      '<table><thead><tr><th>항목</th><th>값</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></tbody></table>';
    const beforeTables = doc.querySelectorAll('.se-table').length;
    const cancelled = pasteInto(bodyEl, tableHtml, '항목 값 / A 1 / B 2');
    setTimeout(() => {
      const seTables = doc.querySelectorAll('.se-table');
      const rawTables = doc.querySelectorAll('[contenteditable="true"] table:not(.se-table table)').length;
      report.tableTest = {
        eventCancelled: cancelled,
        seTableDelta: seTables.length - beforeTables,
        rawTableCount: rawTables,
        firstSeTableHead: seTables.length ? seTables[seTables.length - 1].outerHTML.slice(0, 300) : null,
        interpretation:
          seTables.length - beforeTables > 0
            ? '✅ .se-table 변환됨(thead 포함 표도 OK)'
            : rawTables > 0
              ? '⚠️ raw <table> 로 남음 → SE 표 변환 실패'
              : '❌ 표 안 들어감',
      };
      console.log('%c표 paste 결과', 'color:#0a0;font-weight:bold', report.tableTest);
      console.log('전체 JSON ↓\n', JSON.stringify(report, null, 2));
      window.__PENFLOW_DIAG__ = report;
    }, 700);
  } else {
    console.log('%c제목 요소 구조(읽기전용)', 'font-weight:bold');
    console.log(report.title);
    console.log("\n제목 입력 비교: PENFLOW_DIAG = 'title' 후 재실행");
    console.log("표 paste 실측:  PENFLOW_DIAG = 'table' 후 재실행");
    console.log('JSON ↓\n', JSON.stringify(report, null, 2));
    window.__PENFLOW_DIAG__ = report;
  }
  return report;
})();
