/*
 * 펜플로우 — Gemini 웹(gemini.google.com) 스파이크 프로브 (M3 이미지 반자동 실측)
 *
 * 목적: SmartEditor 플레이북처럼 Gemini 웹을 운전하려면 DOM 을 실측해야 한다.
 *       프롬프트 입력칸 / 전송 버튼 / 파일첨부 / 응답 컨테이너 / 생성 이미지 /
 *       생성중(스트리밍) 표시의 안정 셀렉터를 찾는다. (헤드리스 불가 — 실제 로그인 세션 필요)
 *
 * 사용법:
 *  1) gemini.google.com 에 로그인하고 새 대화 화면을 연다(프롬프트 입력칸이 보이는 상태).
 *  2) (권장) 이미지 한 장을 먼저 생성시켜 응답에 이미지가 있는 상태로 둔다 — 응답·이미지 셀렉터까지 한 번에 잡음.
 *  3) F12 → Console 탭.
 *  4) 이 파일 전체를 복사해 콘솔에 붙여넣고 Enter.
 *  5) 출력 표 + 맨 아래 JSON 을 통째로 복사해 전달한다. (window.__PENFLOW_GEMINI__ 에도 보관)
 *
 * 기본은 읽기 전용(대화에 영향 없음). 입력 주입 테스트는 opt-in:
 *     PENFLOW_PROBE_TYPE = true;   (한 줄 먼저 실행) 후 프로브 실행.
 *     → 프롬프트칸에 "[펜플로우 입력 테스트]" 가 들어가면 입력 주입이 먹힌다는 뜻(전송은 안 함). 수동 삭제.
 */
(() => {
  const TEST_TYPE = typeof PENFLOW_PROBE_TYPE !== 'undefined' && PENFLOW_PROBE_TYPE === true;
  const report = { url: location.href, probedAt: new Date().toISOString() };

  // ── 후보 셀렉터(추측) — Gemini 는 Angular 커스텀 엘리먼트가 많아 폴백을 넉넉히 둔다. ──
  const CAND = {
    // 프롬프트 입력칸 — rich-textarea 안의 contenteditable(Quill .ql-editor) 패턴이 흔함.
    promptInput: [
      'rich-textarea .ql-editor[contenteditable="true"]',
      'rich-textarea [contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      'textarea[aria-label]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
    ],
    // 전송 버튼 — aria-label(언어별) + send 아이콘.
    sendButton: [
      'button.send-button',
      'button[aria-label*="보내기"]',
      'button[aria-label*="전송"]',
      'button[aria-label*="Send"]',
      'button:has(mat-icon[fonticon="send"])',
      'button mat-icon[fonticon="send"]',
    ],
    // 생성 중지(스트리밍 중에만 등장) — send 가 stop 으로 바뀌는 패턴 → 완료 폴링 신호로 유용.
    stopButton: [
      'button.send-button.stop',
      'button[aria-label*="중지"]',
      'button[aria-label*="응답 중지"]',
      'button[aria-label*="Stop"]',
      'button:has(mat-icon[fonticon="stop"])',
    ],
    // 파일 첨부(+ / 업로드) — 참조 바구니 이미지를 동반시킬 자리.
    attachButton: [
      'button[aria-label*="파일 업로드"]',
      'button[aria-label*="업로드"]',
      'button[aria-label*="추가"]',
      'button[aria-label*="upload" i]',
      'button[aria-label*="add" i]',
      'input[type="file"]',
    ],
    // 응답 컨테이너 — 모델 답변 단위.
    responseContainer: [
      'model-response',
      'message-content',
      '.model-response-text',
      '.response-container',
      '[data-response-index]',
    ],
    // 생성된 이미지 — image-gen 결과. img 가 응답 안에 들어옴.
    generatedImage: [
      'model-response img',
      'single-image img',
      'generated-image img',
      'img[src^="data:image"]',
      'img[src^="blob:"]',
      'message-content img',
    ],
  };

  function describe(el) {
    if (!el) return null;
    const cls = el.className && typeof el.className === 'string' ? el.className.slice(0, 100) : '';
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      class: cls || undefined,
      ariaLabel: el.getAttribute && (el.getAttribute('aria-label') || undefined),
      contenteditable: el.getAttribute && (el.getAttribute('contenteditable') || undefined),
      text: (el.textContent || '').trim().slice(0, 50) || undefined,
    };
  }

  function matchAll(selectors) {
    const out = [];
    for (const sel of selectors) {
      let els = [];
      try {
        els = Array.from(document.querySelectorAll(sel));
      } catch {
        out.push({ selector: sel, error: 'invalid/unsupported (:has?)' });
        continue;
      }
      if (els.length) out.push({ selector: sel, count: els.length, first: describe(els[0]) });
    }
    return out;
  }

  // 1) 후보 셀렉터 매칭.
  report.candidates = {};
  for (const key of Object.keys(CAND)) report.candidates[key] = matchAll(CAND[key]);

  // 2) 커스텀 엘리먼트(하이픈 태그) 인벤토리 — Gemini Angular 컴포넌트 구조 파악에 가장 robust.
  const customCounts = {};
  document.querySelectorAll('*').forEach((el) => {
    const t = el.tagName.toLowerCase();
    if (t.includes('-')) customCounts[t] = (customCounts[t] || 0) + 1;
  });
  report.customElements = Object.entries(customCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  // 3) 모든 img 요약 — 생성 이미지 식별용(src 스킴·크기).
  report.images = Array.from(document.querySelectorAll('img')).map((img) => ({
    srcScheme: (img.currentSrc || img.src || '').slice(0, 24),
    w: img.naturalWidth,
    h: img.naturalHeight,
    alt: img.alt || undefined,
    closestCustom: (() => {
      let p = img.parentElement;
      while (p) {
        if (p.tagName.includes('-')) return p.tagName.toLowerCase();
        p = p.parentElement;
      }
      return undefined;
    })(),
  }));

  // 4) 입력 주입 테스트(opt-in) — 첫 프롬프트 입력칸에 텍스트만 넣음(전송 안 함).
  if (TEST_TYPE) {
    let input = null;
    for (const sel of CAND.promptInput) {
      try {
        input = document.querySelector(sel);
      } catch {}
      if (input) break;
    }
    if (input) {
      try {
        input.focus();
        const text = '[펜플로우 입력 테스트]';
        if (input.isContentEditable) {
          // contenteditable(Quill) — beforeinput/input 으로 프레임워크에 알린다.
          const dt = new DataTransfer();
          dt.setData('text/plain', text);
          const pasteOk = !input.dispatchEvent(
            new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
          );
          if (!input.textContent) {
            input.textContent = text;
            input.dispatchEvent(new InputEvent('input', { bubbles: true }));
          }
          report.typeTest = {
            attempted: true,
            method: 'contenteditable',
            pasteCancelled: pasteOk,
            valueAfter: (input.textContent || '').slice(0, 40),
          };
        } else {
          // <textarea> — value 세팅 + input 이벤트.
          input.value = text;
          input.dispatchEvent(new InputEvent('input', { bubbles: true }));
          report.typeTest = { attempted: true, method: 'textarea', valueAfter: input.value.slice(0, 40) };
        }
      } catch (e) {
        report.typeTest = { attempted: true, error: String(e) };
      }
    } else {
      report.typeTest = { attempted: false, note: '프롬프트 입력칸을 못 찾음' };
    }
  } else {
    report.typeTest = { attempted: false, note: 'PENFLOW_PROBE_TYPE=true 로 켜면 입력 주입 테스트' };
  }

  // ── 출력 ──
  console.log('%c펜플로우 Gemini 웹 스파이크 결과', 'font-weight:bold;font-size:14px');
  for (const key of Object.keys(report.candidates)) {
    const hits = report.candidates[key];
    console.log(
      `  ${key}:`,
      hits.length ? hits.map((h) => `${h.selector}${h.count ? `(${h.count})` : ''}`).join('  |  ') : '✗ 매칭 없음',
    );
  }
  console.log('\n커스텀 엘리먼트 top:', report.customElements.slice(0, 15).map((c) => `${c.tag}×${c.count}`).join(', '));
  console.log('img 개수:', report.images.length);
  console.log('입력 테스트:', report.typeTest);
  console.log('\n%c아래 JSON 전체를 복사해 전달하세요 ↓', 'color:#0a0;font-weight:bold');
  console.log(JSON.stringify(report, null, 2));
  window.__PENFLOW_GEMINI__ = report;
  return report;
})();
