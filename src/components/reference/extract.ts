// 첨부파일 본문 추출 — 참조 바구니. 사이드패널(브라우저 컨텍스트)에서 실행.
// 텍스트: file.text(). PDF: pdfjs(텍스트 PDF만). docx/hwpx: zip(fflate)+XML 텍스트 추출.
// 구버전 .hwp(바이너리 OLE)는 미지원 → .hwpx/PDF 로 저장 후 첨부 안내.
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { unzipSync, strFromU8 } from 'fflate';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export interface ExtractResult {
  ok: boolean;
  text: string;
  reason?: string; // 실패 사유(지원 안 함·파싱 오류 등)
}

const SOFT_CAP = 200_000; // 추출 단계 안전 상한 — 호출부가 표시 한도로 다시 자른다

const TEXT_RE = /\.(txt|md|markdown|csv|json|html?|xml|log|ya?ml)$/i;

/** 확장자/타입으로 분기해 본문 텍스트 추출. 지원 안 하면 ok:false + reason. */
export async function extractFileText(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  try {
    if (file.type.startsWith('text/') || TEXT_RE.test(name)) {
      return { ok: true, text: await file.text() };
    }
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      return { ok: true, text: await extractPdf(file) };
    }
    if (name.endsWith('.docx')) {
      return { ok: true, text: extractZipXml(await file.arrayBuffer(), /^word\/document\.xml$/i, 'w:p') };
    }
    if (name.endsWith('.hwpx')) {
      return { ok: true, text: extractZipXml(await file.arrayBuffer(), /^Contents\/section\d+\.xml$/i, 'hp:p') };
    }
    if (name.endsWith('.hwp')) {
      return { ok: false, text: '', reason: '구버전 .hwp 는 미지원 — .hwpx 나 PDF 로 저장해 첨부하세요' };
    }
    return { ok: false, text: '', reason: '지원하지 않는 형식 (텍스트·PDF·docx·hwpx)' };
  } catch (e) {
    return { ok: false, text: '', reason: `읽기 실패: ${String(e)}` };
  }
}

async function extractPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
    if (out.length > SOFT_CAP) break; // 큰 PDF 조기 중단(호출부가 다시 자름)
  }
  return out;
}

// docx/hwpx 공통 — zip 풀어 대상 XML 을 모아 문단 경계 보존 + 태그 제거 + 엔티티 디코드.
function extractZipXml(buf: ArrayBuffer, fileRe: RegExp, paraTag: string): string {
  const files = unzipSync(new Uint8Array(buf));
  const names = Object.keys(files)
    .filter((n) => fileRe.test(n))
    .sort();
  let out = '';
  for (const n of names) {
    out += xmlToText(strFromU8(files[n]!), paraTag) + '\n';
    if (out.length > SOFT_CAP) break;
  }
  return out;
}

function xmlToText(xml: string, paraTag: string): string {
  return decodeEntities(
    xml
      .replace(new RegExp(`</${paraTag}>`, 'g'), '\n') // 문단 닫힘 → 줄바꿈
      .replace(/<[^>]+>/g, ''), // 나머지 태그 제거
  ).replace(/[ \t]+\n/g, '\n');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // &amp; 는 마지막(이중 디코드 방지)
}
