// 키워드 목록 xlsx/csv 입출력(M2 WP1, 1-5) — SheetJS. ② 결과를 파일로 왕복.
// 다운로드는 확장 페이지(사이드패널)에서 Blob + <a download>. 업로드는 ArrayBuffer 파싱.
import * as XLSX from 'xlsx';
import type { Topic } from '@/types/models';

// 경쟁도 수치(1·2·3) ↔ 라벨. searchad 어댑터 COMP_MAP 과 동일 규약.
const COMP_LABEL: Record<number, string> = { 1: '낮음', 2: '중간', 3: '높음' };
const LABEL_COMP: Record<string, number> = { 낮음: 1, 중간: 2, 높음: 3 };

export interface TopicRow {
  키워드: string;
  검색량: number | '';
  경쟁도: string;
}

export function topicsToRows(topics: Topic[]): TopicRow[] {
  return topics.map((t) => ({
    키워드: t.keyword,
    검색량: t.metrics?.volume ?? '',
    경쟁도: t.metrics?.competition ? (COMP_LABEL[t.metrics.competition] ?? '') : '',
  }));
}

export function rowsToTopics(rows: TopicRow[]): Topic[] {
  return rows
    .filter((r) => String(r.키워드 ?? '').trim())
    .map((r, i) => {
      const vol = Number(r.검색량);
      const comp = LABEL_COMP[String(r.경쟁도 ?? '').trim()];
      return {
        id: `kw_imp_${Date.now()}_${i}`,
        keyword: String(r.키워드).trim(),
        metrics: {
          volume: Number.isFinite(vol) ? vol : 0,
          competition: comp ?? 0,
        },
      };
    });
}

/** Topic[] → xlsx 다운로드(사이드패널 컨텍스트). */
export function downloadTopicsXlsx(topics: Topic[], filename = 'keywords.xlsx'): void {
  const ws = XLSX.utils.json_to_sheet(topicsToRows(topics));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '키워드');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  triggerDownload(
    new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
}

/** xlsx/csv ArrayBuffer → Topic[] (업로드 파싱, 왕복). */
export function parseTopicsFromBuffer(buf: ArrayBuffer): Topic[] {
  const wb = XLSX.read(buf, { type: 'array' });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<TopicRow>(ws);
  return rowsToTopics(rows);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
