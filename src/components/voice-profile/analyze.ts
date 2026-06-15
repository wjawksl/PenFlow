// 어투 분석 — 블로그 본문 샘플에서 (1)어투 명세 LLM 프롬프트 조립, (2)짧은 원문 발췌 추출.
// LLM 호출 자체는 background(어댑터·자격증명 보유)가 하고, 여기는 순수 로직만(테스트 가능).

const SAMPLE_MAX_CHARS = 1_500; // 본문 1건당 분석 입력 상한(토큰 절약)
const MAX_SAMPLES = 5; // 분석에 쓰는 글 수 상한

/** 어투 명세를 뽑게 하는 분석 프롬프트. 내용·주제가 아니라 '말투'만 기술하도록 못박는다. */
export function buildVoiceAnalysisPrompt(samples: string[]): string {
  const corpus = samples
    .slice(0, MAX_SAMPLES)
    .map((s, i) => `[글 ${i + 1}]\n${s.trim().slice(0, SAMPLE_MAX_CHARS)}`)
    .join('\n\n');
  return [
    '아래는 한 블로거가 쓴 네이버 블로그 글들이다. 이 사람의 **말투(어투)** 만 분석해라.',
    '주제·내용·정보는 무시하고, 다른 주제의 글을 써도 그대로 흉내낼 수 있도록 문체 특징만 적는다.',
    '',
    '다음 항목을 간결한 한국어 불릿으로 정리한다(각 1줄):',
    '- 종결어미(해요체/합니다체/반말 등 비율과 특징)',
    '- 문장 길이와 리듬(짧게 끊는지, 길게 잇는지, 줄바꿈 습관)',
    '- 자주 쓰는 어휘·말버릇·접속 표현',
    '- 이모지/특수문자 사용(어디에, 얼마나)',
    '- 독자를 부르는 방식(호칭·인사·질문 던지기 등)',
    '- 전체 톤(친근/전문/유머/담백 등)',
    '',
    '출력은 위 불릿만. 머리말/꼬리말·예시 글 생성 금지.',
    '',
    '── 분석 대상 ──',
    corpus,
  ].join('\n');
}

/**
 * 하이브리드용 짧은 원문 발췌 — 대표 문단 1~2개.
 * 너무 짧거나(단편) 너무 긴 문단은 거르고, 중복 제거 후 앞에서 max개.
 */
export function pickExcerpts(samples: string[], max = 2): string[] {
  const paras = samples
    .flatMap((s) => s.split(/\n{2,}/))
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 40 && p.length <= 220);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paras) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}
