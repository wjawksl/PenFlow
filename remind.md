# PenFlow 작업 리마인드 (현황 + 다음)

새 환경에서 "어디까지 했고 뭘 할 차례인지" 빠르게 복귀하기 위한 문서. 상세 작업분해는 `docs/manual/milestone/` 참조.

마지막 갱신: 2026-06-15 / 브랜치 `main` / HEAD `c3a11e4` 다음 커밋(무효키 전환 버그 수정 + 실측 3건 통과 — 이 커밋에 반영).

> ✅ **블로커 해소(2026-06-09)**: "background NO_RESPONSE" 는 두 가지가 겹친 거였음. (1) **dev 빌드(`.output/chrome-mv3-dev`)를 dev 서버 없이 로드** → vite-hmr WebSocket 실패로 확장이 반쯤 죽음. → **항상 prod 빌드(`.output/chrome-mv3`) 로드**, dev 빌드는 `npm run dev` 켜둘 때만. (2) **삽입 탭/프레임 오선택**(아래 `5e76926` 참조). 참조 바구니(링크·첨부·텍스트)도 브라우저 실측 완료.
>
> ⚠️ **운영 주의**: 확장을 삭제·재등록하면 **열려있던 네이버 탭의 content script 가 죽는다(orphaned)** → 글쓰기 페이지를 **새로고침(F5)** 해야 CS 재주입됨. 권한(`webNavigation` 등) 바뀌면 제거 후 재등록 필요.

---

## 마일스톤 큰 그림

| 마일스톤 | 범위 | 상태 |
|---|---|---|
| **M1** | 단일 플로우: 주제→생성→삽입→임시저장 (텍스트만) | ✅ 완료 |
| **M2** | ② 주제 선정(검색량/블로그제목/연관검색어) + ④ 부가요소 합성(표·링크·CTA·백링크·광고문구) | ✅ 완료 |
| **M3** | ⑨ 비주얼(이미지) + ⑩ 검증(변환·밀도) + Offscreen + 이미지 삽입 | 🟡 진행 중 |
| M4 | ⑧ 연속/예약/간격 자동화 + 발행(PUBLISH) | ⬜ 예정 |
| M5 | 복수키 순환 + 대화형 생성(B) + 프롬프트 라이브러리 | 🟡 프롬프트 라이브러리(R-2.1)·복수키 순환(R-0.2) ✅ / 대화형(B) ⬜ |

---

## M3 워크패키지 현황

| WP | 내용 | 상태 |
|---|---|---|
| WP0 | Offscreen 문서 도입(Canvas 합성·DOM 변환 호스트) | ✅ |
| WP1 | HTML↔MD 변환(marked/turndown), 마커 보존, SmartEditor 제목 입력 | ✅ |
| WP2 | 키워드 밀도(경량 카운트, Kiwi 형태소는 보류) + 자동 검사 UI | ✅ |
| WP3 | ~~찾기·바꾸기~~ | ❌ 제거(에디터 기본 기능과 중복) |
| WP4 | ⑨ 비주얼 생성 — H2 썸네일(기본 Canvas + Gemini 웹) | 🟡 **선택 소제목 전체→1장**(Gemini, 본문요약 레이아웃 명세+스타일+방향) / 기본카드(소제목당 1:1) / H1 대표·본문 IMG 슬롯 ⬜ |
| WP5 | ⑨ 중복 회피(1px 노이즈) + 압축(품질 슬라이더) + 용량 미터 | ✅ |
| WP6 | ⑨ 모델/캐릭터 일관성(참조 이미지 동반) | ⬜ |
| WP7 | 정합성 확장(`validate.ts` H2↔H2THUMB) | ✅ 축소판(R-7.3 안전망만, 이미지 opt-in 으로 R-7.6 폐기) |
| WP8 | ⑥ 이미지 삽입 | ✅ 검증 완료(수동 삽입 UX) |

---

## 최근 굵직한 결정·수정 (맥락 까먹지 않게)

### 2026-06-15 작업 (무효키 전환 버그 수정 + 실측 3건 통과 — 이번 세션)

복수키 순환(R-0.2) 라이브 실측 중 발견한 구멍 메우고, 미확인 꼬리 3건 브라우저 실측 완료.

1. **무효키 400 전환 안 되던 버그**(`adapters/ai/gemini.ts`) — 가짜/오타 키는 Gemini 가 **400 INVALID_ARGUMENT** 반환(429/403 아님). 어댑터가 이를 `AI_FORMAT` 으로 매핑 → 순환 트리거(`AI_QUOTA`) 안 걸려 **무효키 1개가 배치 전체 죽임**(뒤 정상키 못 써봄). 라이브서 "AI 호출 실패 (HTTP 400)" 만 뜨고 멈춤. → **에러 바디 검사**: 400 + `/api[_ ]?key not valid/i` 매칭 시 `AI_QUOTA`(전환). 그 외 400(진짜 잘못된 요청)은 `AI_FORMAT` 유지(키 다 써도 똑같이 실패 → 낭비 방지). 429/403 은 기존대로. 메시지도 무효키 땐 "API 키가 유효하지 않음".
2. **어댑터 테스트 신규**(`tests/gemini-adapter.test.ts`) — fetch 모킹 7케이스: NO_CREDENTIAL / 400 무효키→AI_QUOTA / 400 잘못된요청→AI_FORMAT / 429→AI_QUOTA / 403→AI_QUOTA / 200 정상 / 200 빈응답→AI_EMPTY.
3. **라이브 실측 통과** ✅ — (A) **복수키 순환**: 무효키 1번 + 정상키 2번 → "2번째 키로 전환" 후 성공 확인. (B) **프롬프트 라이브러리 R-2.1**: 저장/불러오기/덮어쓰기/삭제·리로드 후 영속 확인. (C) **Gemini 레이아웃 명세**: 인포그래픽 명세 → Gemini 웹 1장 결합 렌더 확인.
4. 검증: tsc 0, 테스트 95 pass(88+7), prod 빌드 OK.

### 2026-06-14 작업 (복수 API키 순환 R-0.1·R-0.2 — 이전 세션)

본문 생성 키를 **여러 개 등록 → 한도 초과 시 다음 키로 자동 전환**. 대량 정보성 글 생성 시 쿼터 벽 대응. 기존엔 `aiTextCredentials[]` 가 배열인데 `getActiveCredential`=`[0]` 만 써 1개만 동작했음.

1. **순환 지점 = `generateBody`**(`generator/index.ts`) — `credential: Credential` → `credentials: Credential[]`. 첫 키로 호출 → 결과가 `AI_QUOTA`(어댑터가 429/403 매핑)면 다음 키로 재시도, 다 떨어지면 마지막 에러 반환. **비-quota 오류(format/empty/h2누락)는 전환 안 하고 즉시 통지**(키 문제 아님). 빈 배열 → `NO_CREDENTIAL`.
2. **호출부**(`background.ts handleGenerate`) — `getActiveCredential` 대신 `settings.aiTextCredentials` 통째 전달. (이미지 프롬프트 경로 `handleImagePrompt` 는 여전히 `getActiveCredential`=`[0]` — 순환 불필요.)
3. **저장**(`settings/index.ts`) — `setAiKey`(단일) → **`setAiKeys(apiKeys[], model)`**: 줄별 trim·빈줄 무시, `ai_text_1..N` id 부여, 전부 비면 거부.
4. **options UI** — API Key 입력 1칸(`<input>`) → **여러 줄 `<textarea>`**(한 줄에 키 하나). 안내문 추가. 로드 시 기존 키들 줄바꿈 join, 저장 시 `split('\n')`.
5. **테스트**(`tests/generate-rotation.test.ts`) — 4케이스: 첫키 quota→둘째 성공(2회 호출) / 전부 quota→AI_QUOTA(N회) / format 오류→전환안함(1회) / 빈배열→NO_CREDENTIAL(0회).
6. 검증: tsc 0, 테스트 88 pass(84+4), prod 빌드 OK. **브라우저 실측 미확인**(실제 쿼터 초과 전환).

### 2026-06-14 작업 (프롬프트 라이브러리 R-2.1 — 이번 세션)

생성 프롬프트를 **이름붙여 저장/불러오기/삭제**(R-2.1). 정보성 글 반복 생성 시 골격 프롬프트 재사용 목적. M5 항목이지만 범위 작고 발행과 독립이라 선구현.

1. **모듈**(`src/components/prompt-library/index.ts`) — `chrome.storage.local` 에 `prompt:<name>` 키(`STORE_KEYS.promptPrefix`, 예약돼 있던 자리). `payload/index.ts` 와 같은 프리픽스 CRUD 패턴. `listPrompts`(이름순 정렬)·`savePrompt`(빈 이름 거부·trim·동명 덮어쓰기)·`deletePrompt`. background 왕복 없이 sidepanel(확장 페이지)에서 직접 호출.
2. **UI**(`App.tsx` 프롬프트 textarea 위) — 드롭다운(저장된 것 선택 → 본문 채움) + 이름 input + `저장`/`삭제` 버튼 + 결과 메시지. 선택/저장 시 `promptName`·`promptBody` 동기.
3. **테스트**(`tests/prompt-library.test.ts`) — chrome.storage.local 인메모리 모킹, 5케이스(저장·덮어쓰기·빈이름거부·trim·정렬+삭제).
4. 검증: tsc 0, 테스트 84 pass(79+5), prod 빌드 OK. **브라우저 실측 미확인**(저장/불러오기 라이브 동작).

### 2026-06-14 작업 (죽은 AI 이미지 API 코드 청소 — 이번 세션)

⑨ 이미지 전략을 **유료 API → Gemini 웹 반자동**으로 튼 뒤(2026-06-08~) 남아있던 **유료 Gemini 이미지 API 경로 전부 제거**. 어디서도 호출 안 됐고(가공 안 된 죽은 코드 + options UI에 동작 안 하는 API키 입력칸까지 노출) WP6(인물 일관성)도 정보성 목적상 저우선이라 정리.

- **삭제**: `src/adapters/ai/gemini-image.ts`(파일 통째) · `AIImageAdapter` 인터페이스(`adapters/index.ts`) · `ModelReference` 인터페이스(`models.ts`) · `Settings.aiImageCredential`/`aiImageModel` · `DEFAULT_SETTINGS.aiImageModel` · `setAiImageKey()`(`settings/index.ts`) · `Credential.kind` 의 `'ai_image'` · options UI "AI 이미지 생성 키" 섹션(상태 2개·import·`setAiImageKey` 호출 포함).
- **남김**: `ImageSourceAdapter`/`imageSourceCredential`(외부 이미지 검색 R-7.5, 별개 미구현 슬롯) — 이번 범위 밖이라 유지. `Visual.modelRefApplied?`(boolean) 도 모델 정의라 유지.
- ⚠️ **WP6 재개 시**: `ModelReference`·`AIImageAdapter` 다시 추가 필요(현재 이미지 = Gemini 웹 반자동, 참조 이미지는 사용자가 화면서 수동 첨부).
- 검증: tsc 0, 테스트 79 pass, prod 빌드 OK.

### 2026-06-14 작업 (R-8.4 마커 왕복 전수 테스트 — 이번 세션)

R-8.4("HTML↔MD 왕복 후 마커 무손실") 검증 항목을 테스트로 닫음. 메커니즘(`convert.ts` protect/restore = 마커 → 영숫자 placeholder 치환→변환→복원)은 이미 구현돼 있었고, 기존 왕복 테스트가 **AD/SHOP/CTA 3종만** 커버해 전수 보장이 비어 있었음.

1. **전 마커타입 왕복 테스트 추가**(`tests/convert.test.ts`) — 9개 `MARKER_TYPES`(`H1THUMB H2THUMB IMG PRODUCT SHOP BACKLINK CTA SOURCE AD`) 전부를 **소제목·문단·표·리스트·링크 경계 곳곳**에 박아 HTML→MD→HTML 왕복 → `scan()` 으로 순서·타입·키 불변 검증. turndown/marked 가 어떤 타입도 코드·링크로 오인하거나 블록 경계서 삼키지 않음 확인. 결과: 8 pass(기존 7 + 신규 1). **R-8.4 닫힘**(체크리스트 갱신).

### 2026-06-14 작업 (이미지 생성 재설계 + 참조 UI 수정 — 이전 세션)

⑨ Gemini 이미지 흐름을 **"선택 소제목 전체 → 1장"** 으로 재설계하고, 정보성 블로그용 레이아웃을 LLM 으로 구조화. 참조 자료 UI 자잘한 버그도 수정.

1. **결합 1장(요구1)** — 기존 소제목당 순차 N장 → **선택 소제목 전체를 한 프롬프트로 묶어 Gemini 1회 요청**. `onComposeImages` GEMINI 분기를 단일 `gemini.run`(h2Caption=캡션들 `·` 결합)으로. 기본 카드 모드는 그대로(소제목당 1:1).
2. **본문 요약 = 인포그래픽 레이아웃 명세(요구2)** — `distillImagePrompts`(소제목별 증류) **폐기** → `composeImagePrompt`(generator). 선택 소제목들을 **인포그래픽 레이아웃 명세 마크다운**으로 구조화하는 텍스트 LLM 1회. 형식 적중률을 위해 **골격(skeleton) + 퓨샷 예시 + 분기 규칙**(구간·등급→표/막대차트, 절차→플로우, 단일값→강조 라벨)을 프롬프트에 함께 박음. 본문 숫자·구간 그대로 보존, 색·폰트·톤 등 스타일 지시는 배제(스타일 필드가 따로 담당). 실패 시 빈 문자열 → 패널 로컬 폴백(캡션 나열).
3. **역할 분리 UI(요구2·3)** — Gemini 패널을 셋으로 분리:
   - **본문 요약** textarea(`✨ 본문 요약 만들기` 버튼 = `image.prompt` 채널 → `handleImagePrompt`). 편집 가능, 스타일 미포함.
   - **스타일·지시** textarea — 유저가 이미지 스타일 전부 자유 프롬프팅. 전송 시 **본문 요약 아래에 구분선(`────────`)으로 분리** 삽입(`buildFinalPrompt`).
   - **방향 라디오**(가로형/세로형, `imgOrient`) → 기본 지시 "아래 본문 요약의 모든 내용을 담은 이미지 1장… 방향: X" 에 박힘.
   - 종류 드롭다운(인포그래픽/일러스트)은 "스타일 필드가 모든 스타일 담당" 과 중복 → **제거**. `ImageKind`·`GEMINI_CTX_MAX`·`H2Section.imagePrompt` 도 삭제.
4. **파일 첨부 = 수동(요구3)** — 코드 파일첨부 안 함. 본문 요약이 이미 텍스트로 들어가고, **참고 파일·이미지는 사용자가 Gemini 화면에서 직접 첨부**(패널에 안내 배너). 참조 바구니 선택 UI 불필요.
5. **썸네일 삭제** — 썸네일 카드에 `🗑`(`onRemoveVisual`): `visuals[]`에서 제거(effect 가 미리보기 objectURL 재생성·해제) + ref 비주얼은 **Dexie 레코드도 삭제**(용량 회수).
6. **참조 UI 수정** — (a) 텍스트 붙여넣기에 **제목 입력**(`refTitle`, 미입력 시 '붙여넣기'). (b) 텍스트 textarea `resize-none`(드래그 확장 방지). (c) **참조 fieldset 최소폭에서 잘림 버그 해결**: 진짜 원인 = `<fieldset>` UA 기본 `min-width: min-content`(블록과 달리 콘텐츠 최소폭 밑으로 안 줄어듦) → 패널 좁히면 fieldset 이 패널보다 넓어져 `overflow-x-hidden` 이 테두리째 잘랐음. **모든 fieldset에 `min-w-0`**(작성자 스타일이 UA 우선) + `<main>` `overflow-x-hidden` 가드 + 파일 input `min-w-0` + RefList 행 글자수칸 `shrink truncate`.
7. ⚠️ **빌드 주의 재확인** — 프롬프트/UI 수정 후 `npm run build` 안 하면 prod 빌드(`.output/chrome-mv3`)에 반영 안 됨. tsc·테스트만으론 빌드 안 됨(이번 세션 한 번 빠뜨려 "산문 덩어리" 오인 발생).
8. 핵심 파일: `App.tsx`(이미지 패널 재구성·썸네일 삭제·참조 UI), `generator/index.ts`(`composeImagePrompt`), `background.ts`(`handleImagePrompt`·`image.prompt` 라우팅), `messaging.ts`(`ImagePromptReq`/`Res`, `image.prompt` 채널, `H2Section.imagePrompt` 제거), `tests/visual.test.ts`. 검증: tsc 0, 테스트 78 pass, prod 빌드 OK. **브라우저 실측**: 참조 잘림 수정은 확인됨 / 이미지 레이아웃 명세가 Gemini 웹서 깔끔히 렌더되는지는 미확인(라이브 필요).

### 2026-06-13 작업 (이미지 생성 UX 통합 — 이전 세션)

⑨ 이미지 진입점을 **하나로 통합**. 기존엔 (1) 부가요소의 "소제목 썸네일 자동 생성"(전체 H2 일괄) + (2) 별도 "Gemini 웹 이미지"(자유 프롬프트 1장)로 **갈라져** 있었음. → **생성 후 단일 "🖼 이미지 (소제목 선택)" 패널**로 합침.

1. **타이밍 전환** — 이미지 생성을 본문 생성 *시점*에서 떼어 **생성 후 단계**로. 소제목 목록(H2)이 있어야 "골라서"가 가능하기 때문. `handleGenerate` 가 더는 썸네일을 만들지 않고(`buildVisuals`/`buildAiThumbnails`/`thumbPrompt`/유료 `geminiImageAdapter` 경로 **삭제**), 대신 `extractH2Sections`(신규: 캡션+섹션 본문)로 **소제목 목록을 응답**(`GenerateRunRes{payloadId,visuals:[],sections}`).
2. **소제목 다중 선택 + 방식 토글** — 패널에서 소제목 체크(전체 선택 포함) → 방식 **기본 카드(Canvas) / Gemini 웹(반자동)**.
   - 기본 카드: 선택 캡션 → `visual.composeSelected`(신규 채널) → BG `handleComposeThumbs` → offscreen `visual.compose` 일괄. 배경색·압축품질은 패널 로컬 상태로 이전.
   - Gemini 웹: **순차 1개씩**(반자동이라 소제목마다 사용자가 Gemini 화면에서 전송). 프롬프트 = 소제목+섹션 맥락(300자)+사용자 추가프롬프트. 진행 "2/3" 표시. 기존 `gemini.run` 을 `role:'H2_THUMB',h2Caption` 로 루프 호출.
3. **합류·삽입 경로 무변경** — 결과 Visual 은 기존 `visuals[]` → 썸네일 그리드 → 커서 수동 삽입 그대로.
4. **마커 decouple** — 생성 시 `h2Thumbnail` 옵션을 안 켜므로 `injectH2ThumbMarkers` 비활성 → composer/validate 의 H2THUMB 1:1 부담 자연 소멸(R-7.6 폐기 연장선, opt-in·수동삽입이라 안전).
5. 핵심 파일: `App.tsx`(이미지 패널), `background.ts`(`handleComposeThumbs`, `handleGenerate` 정리), `generator/index.ts`(`extractH2Sections`), `messaging.ts`(`visual.composeSelected`/`ComposeThumbsReq`/`H2Section`/`GenerateRunRes`). 검증: tsc 0, 테스트 74 pass(`extractH2Sections` 케이스 추가), prod 빌드 OK.

6. **삽입 라우팅 견고화**(`forwardToEditor`) — 에디터 탭/프레임 선택이 `url.includes('PostWriteForm')` **문자열 한 줄에 의존**해, 네이버가 에디터 iframe 주소를 바꾸거나 탭 상태가 어긋나면 "글쓰기 화면을 찾지 못했어요"로 전부 막혔음. → **모든 `blog.naver.com` 탭의 모든 프레임에 프레임별 전송 → `hasEditorHere`(`.se-canvas`)로 에디터 프레임만 Result 응답**하는 방식으로 변경(URL 문자열 비의존). 에러도 3분기로 구분: 탭 없음 / CS 끊김(F5 안내) / 본문영역 없음(SmartEditor 아님). `reached` 플래그(프레임이 응답했나)로 orphaned 여부 판별.

7. **삽입 실패 시 임시저장 버튼 유지** — 버튼 노출 조건이 `phase==='generated'|'inserting'|'done'` 이라 삽입 실패(`phase='error'`)면 버튼이 사라져 **매 실패마다 글을 새로 생성**해야 했음. → `hasPayload` 상태 도입(생성 성공 시 true, 새 생성 시작 시 false). 버튼 조건을 `hasPayload && phase!=='generating'` 으로 바꿔 **실패해도 버튼 유지·재시도**(라벨 "↻ 다시 삽입"). `payloadId.current` 도 생성 시작 시 null 로 비워 생성 실패 시엔 버튼 안 뜨게.

8. ~~**Gemini 이미지 프롬프트 = 소제목 본문 전문 전달**~~ → **2026-06-14 폐기**: 본문 전문 직송은 이미지 모델 장문 약점·Quill 주입 위험이 컸음. 대신 텍스트 LLM 으로 **인포그래픽 레이아웃 명세(요약+구조화)** 를 만들어 짧게 넘기는 방식으로 교체(`composeImagePrompt`). `GEMINI_CTX_MAX` 삭제. (아래 옛 내용은 히스토리) — 기존 `buildGeminiPrompt` 가 `s.text.slice(0,300)`(앞 300자 절단)만 넘겨 맥락이 빈약했음. → **본문 전문**을 넘기도록 변경(`GEMINI_CTX_MAX`=4,000자 안전 상한까지, `extractH2Sections` 가 이미 소제목 사이 전문을 뽑아둠). 프롬프트 구조도 이미지 모델 친화적으로: **지시(무엇을 그릴지)를 앞, `[섹션 본문]`을 뒤**. 패널 소제목 행에 `(본문 N자)` + 상한 초과 시 경고 표시. ⚠️ **알려진 위험**(미해결, 길어지면 발현): (1) **Quill 주입 신뢰도** — `setPrompt`(gemini.content.ts)의 `paste→textContent.includes(text) 검증→폴백`이 긴 본문에서 Quill 재구성으로 검증 실패해 부분만 들어갈 수 있음(짧은 프롬프트만 라이브 검증됨). (2) **이미지 모델은 장문 이해 약함** → 전문 전달은 충실도↑ vs 이미지 품질↓ 트레이드오프. (3) 표·리스트가 평문으로 뭉개짐(노이즈). 대응 후보: `setPrompt` 견고화 / 본문을 요약·첨부로 동반(WP6 연계).

> ⚠️ **참고**: 부가요소 fieldset 에서 썸네일 블록 제거, 별도 Gemini fieldset 제거. `settings.aiImageCredential`/`gemini-image.ts`(유료 API)는 이제 어디서도 호출 안 함(파일은 잔존, 사실상 죽은 코드).

### 2026-06-11~12 작업 (Gemini 웹 반자동 — 이전 세션)

⑨ 이미지 전략 = **Gemini 웹 반자동**(유료 API 폐기 대체) 스파이크 → 동작 + 삽입경로 합류까지 배선. 상세: `docs/manual/milestone/M3-Gemini스파이크.md`.

1. **스파이크 실측**(`tools/spike/gemini-probe.js`) — gemini.google.com DOM 덤프. 확정:
   - 입력칸 = Quill `rich-textarea .ql-editor[contenteditable]`(aria-label "Gemini 프롬프트 입력").
   - 생성 이미지 = `single-image img`(class `image animate loaded`), **src=`blob:`**(같은 origin → CS `fetch` 로 바이트 추출).
   - **완료 신호 = img `loaded` 클래스 + naturalWidth>0**. ⚠️ `image-loading-overlay` 는 완료 후에도 DOM 잔존 → **존재 여부로 판정 금지**(초기 타임아웃 버그 원인, 수정함).
   - 전송버튼은 **빈 입력 땐 미렌더** → 반자동(사용자 전송)이라 비차단. autoSend 자동전송 쓸 때만 실측 필요(현재 추측 폴백).
2. **라이브 검증 통과** — 격리월드 CS 에서 Quill 입력 주입 OK(`world:MAIN` 불필요), blob 스크랩 OK.
3. **배선**:
   - `entrypoints/gemini.content.ts`(신규) — 프롬프트 주입(`setPrompt`: paste→insertText→textContent)·완료 폴링(`waitForImage`)·blob→dataUrl 스크랩(`imgToDataUrl`).
   - `gemini.run` 채널(`messaging.ts`): `GeminiRunReq{prompt,autoSend?,role?,h2Caption?}`, CS→BG 내부 `GeminiScrapeRes{dataUrl}`, BG→UI `GeminiRunRes{visual}`.
   - `background.ts`: `forwardToGemini`(탭 릴레이) + `handleGeminiRun`(dataUrl → `inlineToBlob` → `dexieRecordStore.put` → `Visual{role,source:'AI',data:{kind:'ref',id}}`). CS 는 Dexie 못 써 BG 가 저장(visual.fetch 와 같은 이유).
   - `selectors.ts`: `GEMINI`(셀렉터)·`GEMINI_DEFAULTS`(타임아웃, resultTimeout 240s — 사용자 전송 대기 포함).
   - `App.tsx`: "Gemini 웹 이미지(반자동)" 블록(프롬프트+버튼) → 결과 Visual 을 `visuals[]` 합류 → 기존 썸네일 미리보기·`image.insert` 커서 삽입 경로 재사용.
   - host 권한은 기존 `https://*/*` 로 커버. CS matches `https://gemini.google.com/*`.

> ⚠️ **운영 주의(추가)**: gemini 탭도 네이버와 동일 — 확장 리로드 시 **열려있던 gemini 탭 F5** 안 하면 "Receiving end does not exist"(orphaned CS).

### 2026-06-09 작업 (이전 세션)

1. **삽입 실패 근본 원인 2개 해결** (`5e76926`) — 증상은 삽입 시 "백그라운드 응답이 없어요"(= `forwardToEditor` 가 undefined 반환).
   - **엉뚱한 탭 선택**: `forwardToEditor` 가 `tabs[0]` 사용 → 같이 열린 블로그 **글보기 탭**으로 메시지를 보냄(글쓰기 탭 아님). → `blog.naver.com/*` 탭들 중 **`PostWriteForm` 프레임을 가진 탭**(진짜 글쓰기 탭)을 골라 전송.
   - **멀티프레임 race**: 본문이 중첩 `iframe[name=mainFrame]` 안 → `chrome.tabs.sendMessage(tabId)` 탭 브로드캐스트 시 **top 프레임의 `return false` 가 먼저 undefined 로 resolve** 돼 mainFrame 응답이 버려짐(Chrome 멀티프레임 한계). → `chrome.webNavigation.getAllFrames` 로 **프레임마다 개별 전송**(`{frameId}`), 에디터 프레임의 Result(`ok:boolean`)만 채택. `webNavigation` 권한 추가(`wxt.config.ts`).
   - `hasEditorHere` 를 아무 `contenteditable` → **`.se-canvas`/`.se-editing-area`** 로 한정(`dom.ts`) — 제목용 중첩 프레임(`mainFrame>0`, contenteditable 있고 canvas 없음)이 본문 삽입을 가로채는 것 방지.
   - 실측 프레임 구조: `top`(글쓰기 셸) → `mainFrame`(PostWriteForm, `.se-canvas` = **본문**) → `mainFrame>0`(제목용 중첩, contenteditable만).
2. **참조 바구니 브라우저 실측 완료** — 링크·첨부·텍스트 정상 동작 확인(원래 블로커였던 항목).

### 2026-06-08 작업 (이전 세션)

0. **방향 전환 — 이미지 전략 재설정** (대화 결정, 코드 일부만 반영)
   - **UPLOAD 폐기**(`4aaf54f`): 사용자 업로드 이미지는 SE 에 직접 드롭하면 됨 → 풀 제거.
   - **유료 AI 이미지 API 폐기**: 무료 티어 없음. `geminiImageAdapter`/소스 라디오는 **남겨두되 사실상 비활성**.
   - **새 목표 = Gemini 웹 반자동**: `gemini.google.com` 을 SmartEditor 자동화 플레이북 그대로 운전(프롬프트 입력·첨부 paste·완료 폴링·결과 스크랩). **무료 세션** 활용. 사용자가 최종 "전송"만 누르는 **반자동**으로 결정(취약성↓). 아직 **미착수**(스파이크 필요, 브라우저서 DOM 실측).
   - **참조 바구니 = 공유 입력함**: 글 생성 참고자료 + (후속)이미지 생성 입력을 **한 바구니**가 먹인다. `Attachment` 모델로 통합 예정. messaging `method:'web'`·`reference` 가 이미 이 길을 예약해둠.

1. **WP7 H2↔H2THUMB 정합성 안전망** (`752e168`) — `validate.ts`, 옵션 ON 시 `<h2>` 수 ≠ H2THUMB 마커 수면 차단.
2. **본문 문단 사이 공백 줄** (`d3bc0c0`) — `splitForSe` 가 텍스트런 문단을 빈 문단(`<p><br></p>`)으로 이어붙임. 브라우저 확인됨(빈 줄 들어감).
3. **WP5 중복회피+압축+용량미터** (`f67da52`) — 1px 노이즈 dedup, `toBlob(quality)` 슬라이더, `estimateUsage` 미터.
4. **참조 바구니** (`f78d652`·`118e930`·`c7c816a`) — 사이드패널 "참조 자료(선택)" 3 컴포넌트:
   - **첨부파일**: 텍스트/PDF(`pdfjs-dist`)/docx·hwpx(`fflate` unzip+XML). 구버전 `.hwp` 미지원(안내). 추출은 `src/components/reference/extract.ts`(사이드패널 실행).
   - **링크**: background `reference.fetch` 가 fetch → 오프스크린 turndown 으로 본문 추출(CORS 회피). `<all_urls>` host 권한 추가.
   - **텍스트 붙여넣기**: 핵심만 직접 입력.
   - 항목당 50,000자 상한, 초과 시 `(잘림)` 표시 + 안내. 생성 시 `[참고 자료]`(`assemblePrompt`)로 합쳐짐. **브라우저 실측 미확인**(위 블로커).

### 이전 세션

1. **이미지 자동삽입 → 수동 선택 삽입** (`cf210e0`)
   - 자동으로 박으면 맘에 안 드는 이미지도 들어가 통제권 없음 → **생성만 하고 사이드패널 썸네일에서 골라 에디터 커서에 수동 삽입**.
   - `image.insert` 채널: 사이드패널 → background(`forwardToEditor`) → content script → `insertImageAtCursor`.
   - 부수효과: 비주얼이 **opt-in** 이 되어 WP7 의 "이미지 마커 수 === Visual 수 강제 차단"(R-7.6) 충돌이 자연 해소.

2. **WP8 이미지 삽입 메커니즘** (`6e34812`)
   - content script(페이지 origin) → 확장 IndexedDB 못 읽음 → background `visual.fetch` 가 Dexie 읽어 `dataUrl` 반환(SW 엔 FileReader 없어 `arrayBuffer`+`btoa`).
   - SE 본문에 **이미지 File 을 합성 ClipboardEvent 로 paste**(사용자 스크린샷 붙여넣기와 동일 경로) → SE 가 가로채 업로드.

3. **본문 삽입 볼드 번짐·문단 합쳐짐·제목 중복 수정** (`d82947c`) — 아래 "SE 실측 사실" 참조.

---

## SE(SmartEditor) 실측 사실 — 새 환경에서 반드시 기억

브라우저 없이는 재현 안 되는, DOM 덤프로 확정한 사실들. 코드 곳곳의 전제다.

- **합성 Enter/`beforeinput(insertParagraph)` 무시.** SE 는 우리가 쏜 가짜 키/입력 이벤트로 문단을 안 만든다. → `insertParagraphBreak` 폐기.
- **단일 paste 안의 `<p>` 경계는 존중.** 연속 텍스트를 한 번에 paste 하면 SE 가 `<p>`별로 문단을 만든다(표는 별도 paste 해야 컴포넌트화). → `splitForSe`: 텍스트런 묶음 + 구조블록(table/ul/…) 분리.
- **문단 첫머리가 볼드(heading/`<strong>`)면 그 볼드가 런 전체로 번지고 다음 문단까지 합쳐 먹는다.** → heading 을 **평문 `<p>`로 강등**(`demoteHeading`). 소제목 굵기는 포기(시각 구획은 H2 썸네일이 담당). paste 로 SE 에 볼드 넣는 길은 막혀 있음.
- **이미지는 contenteditable(body) 밖 article 레벨 컴포넌트로 들어가고, 업로드 후에도 src 가 naver URL 이 아닐 수 있다.** → 완료 감지는 **에디터 문서 전체 `<img>` 개수 상대 증가**로 판정(`countEditorImages`). body 한정·url 필터는 무조건 타임아웃이었음.
- **본문은 `iframe[name=mainFrame]`(PostWriteForm) 안.** content script 를 `all_frames` 로 주입, 본문 프레임에서만 응답(`hasEditorHere` = `.se-canvas` 감지).
- **제목은 contenteditable 밖 별도 컴포넌트.** 제목 span 클릭→중첩 iframe body 에 text/plain paste(`insertTitle`). 이 중첩 프레임(`mainFrame>0`)도 contenteditable 을 갖지만 `.se-canvas` 는 없음 → 본문 게이트에서 배제해야 함.
- **삽입 라우팅(background→CS)은 탭·프레임을 정확히 찍어야 한다.** 본문이 중첩 iframe 이라 `tabs.sendMessage(tabId)` 브로드캐스트는 top 의 `return false` 가 먼저 undefined 로 resolve → **`getAllFrames` 로 프레임별 개별 전송**(`forwardToEditor`, `webNavigation` 권한). ⚠️ **2026-06-13 변경**: 예전엔 `PostWriteForm` URL 가진 탭만 골랐으나(네이버 주소 변경에 취약) → **모든 `blog.naver.com` 탭의 모든 프레임에 보내고 `hasEditorHere`(`.se-canvas`)로 에디터 프레임만 응답**하게 일반화. URL 문자열 비의존. 보기 탭 등 비에디터 프레임은 응답 안 해 자연 배제.

---

## 핵심 파일 맵

| 관심사 | 파일 |
|---|---|
| 메시지 계약(채널·요청/응답 타입) | `src/lib/messaging.ts` |
| 두뇌·라우터 | `entrypoints/background.ts` |
| 에디터 삽입(본문/제목 흐름) | `src/components/insert/engine.ts` |
| SE DOM 헬퍼(paste·split·title) | `src/components/insert/dom.ts` |
| 이미지 삽입(fetch·File·paste·완료감지) | `src/components/insert/image.ts` |
| content script(삽입·이미지 라우팅) | `entrypoints/editor.content.ts` |
| 본문 생성·후처리·마커 주입 | `src/components/generator/index.ts` |
| 부가요소 합성(마커→InsertQueue) | `src/components/composer/index.ts` |
| 합성 정합성 검사 | `src/components/composer/validate.ts` |
| 비주얼 합성(Canvas) | `src/components/visual/{thumbnail,index}.ts` |
| Gemini 웹 반자동 CS(입력·전송·완료폴링·blob 스크랩) | `entrypoints/gemini.content.ts` |
| Gemini 웹 라우팅·Dexie 저장·Visual 승격 | `entrypoints/background.ts`(`forwardToGemini`/`handleGeminiRun`) |
| Gemini 셀렉터·타임아웃 | `src/lib/selectors.ts`(`GEMINI`/`GEMINI_DEFAULTS`) |
| 참조 첨부 추출(PDF·docx·hwpx·텍스트) | `src/components/reference/extract.ts` |
| 이미지 저장(Dexie) | `src/adapters/storage/record-store.ts` |
| 프롬프트 라이브러리(저장/불러오기/삭제, R-2.1) | `src/components/prompt-library/index.ts` |
| HTML↔MD 변환·정제 | `src/components/validator/convert.ts` |
| 셀렉터·타임아웃 단일 출처 | `src/lib/selectors.ts` |
| 데이터 모델 | `src/types/{common,models}.ts` |
| 사이드패널 UI | `entrypoints/sidepanel/App.tsx` |

---

## 다음 할 일 (우선순위 제안)

1. **Gemini 웹 반자동 스파이크** ✅ 동작 확인 — 라이브 검증 통과: 입력 주입(#2/#8 격리월드 OK), blob 스크랩(#5/#9), 완료 판정(#4). **삽입경로 합류까지 배선 완료**: 사이드패널 "Gemini 웹 이미지(반자동)" 블록(프롬프트+버튼) → `gemini.run` → BG `handleGeminiRun`(CS 운전 → dataUrl → `dexieRecordStore.put` → `Visual{role,source:'AI',data:{kind:'ref',id}}`) → 사이드패널 `visuals[]` 합류 → 썸네일 미리보기 → 기존 `image.insert` 커서 삽입. 완료 신호는 img `loaded` 클래스(주의: `image-loading-overlay` 는 완료 후에도 DOM 잔존 → 존재 여부로 판정 금지). 핵심 파일: `entrypoints/gemini.content.ts`, `forwardToGemini`/`handleGeminiRun`(background), `GEMINI`/`GEMINI_DEFAULTS`(selectors).
   - ✅ **결합 1장 + 레이아웃 명세로 재설계(2026-06-14)**: 생성 후 "🖼 이미지" 패널 GEMINI 모드 = 소제목 다중 선택 → **전체를 1장**으로. 본문요약(`composeImagePrompt` = 인포그래픽 레이아웃 명세) + 스타일 필드(구분선 분리) + 방향 라디오 → `buildFinalPrompt` 조립 → `gemini.run` 1회. 파일 첨부는 사용자가 Gemini 화면서 수동(안내). 위 "2026-06-14 작업" 참조.
   - ✅ **레이아웃 명세 Gemini 웹 렌더 라이브 실측 통과(2026-06-15)** — 인포그래픽 명세 → 1장 결합 렌더 확인.
   - **남은 것**: (#3) 전송버튼 셀렉터는 추측 폴백만(반자동이라 비차단). 참조 바구니 이미지 첨부(WP6, attachButton=`button[aria-label*="업로드"]`, `input[type=file]` 지연렌더) + AI 생성 동반(R-7.7).
2. **WP4 슬롯 잔여** — H1 대표 썸네일·본문(IMG) 슬롯. 본문 IMG 는 생성기가 IMG 마커 emit 해야 함.
3. **WP6 모델 일관성** — 참조 이미지 등록 + AI 생성 시 동반 전송(R-7.7). 어댑터에 `modelRef` inlineData 자리 이미 마련.
4. **WP8 8-2** — 썸네일에 링크 부착(현재 H2THUMB 무링크라 보류).

> ✅ 해소: 블로커(NO_RESPONSE) + 삽입 탭/프레임 오선택 + 참조 바구니 실측 모두 완료(2026-06-09).
> 큰 그림: 이미지 전략을 **유료 API → Gemini 웹 반자동**으로 틀었고, **참조 바구니**가 글 생성·이미지 생성 공용 입력함이 됨. 다음은 **Gemini 웹 반자동 스파이크**.

---

## M3 완료 판정 체크리스트 (docs 발췌)

- [x] 밀도 표 + 권장범위 경고(R-8.2) — 경량 카운트로 충족
- [x] 이미지가 에디터에 삽입(수동) — WP8
- [x] HTML↔MD 왕복 후 마커 무손실(R-8.4) — `convert.test.ts` 전 9개 마커타입 왕복 테스트로 닫힘(2026-06-14)
- [x] 소제목 N개 글 → H2 썸네일 정확히 N개, 중복회피 시 모두 다른 바이트 (WP5) — 브라우저 실측은 미확인
- [ ] 모델 참조 등록 시 AI 이미지에 동반 (WP6)
- [x] H2↔H2THUMB 정합성(R-7.3) — WP7 축소판 (이미지↔Visual R-7.6 은 opt-in 으로 폐기)

---

## 참조 바구니 / 이미지 전략 메모 (2026-06-08 신규)

- **참조 바구니**(글 생성 참고자료): 첨부파일·링크·텍스트 → `[참고 자료]` 로 프롬프트 동반. `reference`·`method:'web'` 는 messaging 에 이미 예약돼 있던 자리.
- **첨부 추출**(`extract.ts`): 텍스트=`file.text()`, PDF=`pdfjs-dist`(텍스트 PDF만, 스캔 OCR 아님), docx/hwpx=`fflate` unzip+XML(문단 경계 보존). `.hwp` 바이너리 미지원.
- **deps 추가**: `pdfjs-dist`(워커 1.25MB 별도 번들), `fflate`. 번들 총 ~2.4MB.
- **이미지 = Gemini 웹 반자동(예정)**: 유료 API 무료티어 없어 폐기. 사용자 무료 웹 세션을 SE 자동화처럼 운전. `geminiImageAdapter`(API)는 코드만 남기고 비활성.
