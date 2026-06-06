// ⑥ 삽입 엔진 (M1) — WP4. 편집기 준비→팝업정리→포커스→제목·본문 삽입→서식→완료.
// M1 큐는 텍스트/HTML 단일 블록(이미지·표·링크 제외). 07 §2 Happy Path 축약.
// 스파이크 실측: 본문은 iframe[name=mainFrame] 안 → dom.ts 가 editor 문서를 자동 타깃.
import { extractTitle } from '@/components/generator';
import { sanitizeHtml } from '@/components/validator/convert';
import { appError, ERR } from '@/lib/errors';
import { progress } from '@/lib/logger';
import { EDITOR_DEFAULTS, SEL } from '@/lib/selectors';
import { ok, err, type Result } from '@/types/common';
import type { InsertTask, Payload, FormatPrefs } from '@/types/models';
import { insertTitle, pasteHtml, resolveEl, sleep, waitForEl } from './dom';

const P = EDITOR_DEFAULTS;

// InsertTask → 삽입할 HTML 조각. 스파이크 실측: 표·링크 모두 HTML paste 로 SE 컴포넌트화됨.
export function taskToHtml(task: InsertTask): string {
  switch (task.type) {
    case 'text':
    case 'productTable': // 합성기가 html table 을 content 로 전달
    case 'backlink':
    case 'ctaButton':
      return String(task.content ?? '');
    case 'adNotice':
      return `<p>${String(task.content ?? '')}</p>`;
    case 'shoppingLink': {
      const url = task.link ?? String(task.content ?? '');
      return url ? `<a href="${url}">${url}</a>` : '';
    }
    case 'image': // 비주얼 ⑨ — M3
      return '';
    default:
      return '';
  }
}

const jitter = (): number =>
  P.jobDelayMin + Math.floor(Math.random() * (P.jobDelayMax - P.jobDelayMin));

export async function runInsert(
  payload: Payload,
  format: FormatPrefs,
  titleFallback: string,
): Promise<Result<void>> {
  // all_frames 주입으로 이 코드는 본문이 있는 editor iframe 안에서 실행된다 → own document.
  // 1) 편집기 준비 감지 (폴링+타임아웃) — R-4.1, TC-INS-02/06.
  progress('insert', '편집기 준비 대기 중…', { percent: 40 });
  const editor = await waitForEl(SEL.editorReady, P.editorReadyTimeout, P.editorReadyPollInterval);
  if (!editor) {
    return fail(ERR.EDITOR_NOT_FOUND, '편집기를 찾지 못했어요. 글쓰기 팝업을 열어 주세요.', '편집기 준비');
  }

  // 2) 초기 팝업 정리 — R-4.2, TC-INS-03.
  resolveEl(SEL.initialPopupClose)?.click();

  const body = resolveEl(SEL.bodyArea);
  if (!body) {
    return fail(ERR.EDITOR_NOT_FOUND, '본문 영역을 찾지 못했어요.', '본문 탐색');
  }

  // 3) 본문 포커스 확보(재시도) — R-4.2, TC-INS-07.
  const focused = await ensureFocus(body);
  if (!focused) {
    return fail(ERR.EDITOR_NO_FOCUS, '본문 영역을 한 번 클릭해 주세요.', '포커스 확보');
  }

  // 4) 본문 삽입 — InsertQueue 가 있으면 작업 순서대로(R-3.3), 없으면 단일 HTML(M1 호환).
  //    스파이크 실측: 표(.se-table)·링크(.se-link) 모두 HTML paste 로 변환됨 → 작업별 HTML paste.
  //    제목보다 먼저 한다: 제목 클릭이 활성 컴포넌트를 제목으로 바꿔, 이후 본문 paste 가 제목칸에 들어가기 때문.
  progress('insert', '본문 삽입 중…', { percent: 65 });
  const queue = payload.insertQueue?.length
    ? payload.insertQueue
    : [{ type: 'text' as const, content: payload.contentHtml }];
  for (let i = 0; i < queue.length; i++) {
    const task = queue[i]!;
    const html = sanitizeHtml(taskToHtml(task)); // M3 WP1 1-2: 삽입 직전 XSS·잡태그 정제
    if (!html) continue; // 이미지 등 M2 미지원 작업은 스킵
    try {
      body.focus();
      pasteHtml(body, html);
    } catch (e) {
      return fail(ERR.INSERT_FAILED, `삽입 실패(${task.type}): ${String(e)}`, `삽입:${task.type}`);
    }
    await sleep(jitter()); // 작업 간 대기(R-4.3) — 에디터 처리 속도 맞춤
  }

  // 5) 서식 일괄 적용(best-effort) — 12.2-5, TC-INS-04. 정교한 툴바 조작은 후속.
  applyFormat(body, format);

  // 6) 제목 입력 — 맨 마지막. 07 §7, TC-INS-05. 스파이크: 제목 클릭→중첩 iframe body paste.
  //    (제목 클릭이 focus 를 가져가므로 본문 삽입 완료 후 처리해 충돌 방지.)
  progress('insert', '제목 입력 중…', { percent: 88 });
  const titleEl = resolveEl(SEL.titleField);
  if (titleEl) await insertTitle(titleEl, extractTitle(payload.contentHtml, titleFallback));

  progress('insert', '삽입 완료', { percent: 92 });
  return ok(undefined);
}

async function ensureFocus(body: HTMLElement): Promise<boolean> {
  for (let i = 0; i < P.focusRetry; i++) {
    body.click();
    body.focus();
    const active = body.ownerDocument.activeElement;
    if (active === body || body.contains(active)) return true;
    await sleep(200);
  }
  return false;
}

function applyFormat(body: HTMLElement, format: FormatPrefs): void {
  // M1 best-effort: 컨테이너에 인라인 스타일. 실제 SmartEditor 툴바 조작은 후속.
  if (format.lineHeight) body.style.lineHeight = format.lineHeight;
  if (format.fontFamily) body.style.fontFamily = format.fontFamily;
  if (format.fontSize) body.style.fontSize = format.fontSize;
}

function fail(code: string, message: string, step: string): Result<void> {
  progress('insert', message, { level: 'error' });
  return err(appError(code, message, { failedStep: step })); // R-4.4 실패 작업 명시
}
