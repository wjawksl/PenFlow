# PenFlow 작업 리마인드 (현황 + 다음)

새 환경에서 "어디까지 했고 뭘 할 차례인지" 빠르게 복귀하기 위한 문서. 상세 작업분해는 `docs/manual/milestone/` 참조.

마지막 갱신: 2026-06-08 / 브랜치 `main` / HEAD `c7c816a`.

> ⚠️ **미해결 블로커**: 사이드패널 cmd 에 background **NO_RESPONSE**(참조 링크 추가/생성 시 추정). 빌드 산출물(background.js 198KB, manifest 정상)은 OK → **로딩 환경 문제**로 봄. 의심: `npm run dev` 중 `npm run build` 동시 실행으로 `.output` 충돌(guide §3) 또는 `<all_urls>` 권한 변경 후 미재로드. **해결 절차**: dev 끄고 → `Remove-Item -Recurse -Force .output; npm run build` → 확장 **제거 후 재등록** → SW 콘솔 빨간 에러 확인(복구 안 되면 이 에러가 결정적). 코드 로드-크래시 요소는 안 보임.

---

## 마일스톤 큰 그림

| 마일스톤 | 범위 | 상태 |
|---|---|---|
| **M1** | 단일 플로우: 주제→생성→삽입→임시저장 (텍스트만) | ✅ 완료 |
| **M2** | ② 주제 선정(검색량/블로그제목/연관검색어) + ④ 부가요소 합성(표·링크·CTA·백링크·광고문구) | ✅ 완료 |
| **M3** | ⑨ 비주얼(이미지) + ⑩ 검증(변환·밀도) + Offscreen + 이미지 삽입 | 🟡 진행 중 |
| M4 | ⑧ 연속/예약/간격 자동화 + 발행(PUBLISH) | ⬜ 예정 |
| M5 | 복수키 순환 + 대화형 생성(B) + 프롬프트 라이브러리 | ⬜ 예정 |

---

## M3 워크패키지 현황

| WP | 내용 | 상태 |
|---|---|---|
| WP0 | Offscreen 문서 도입(Canvas 합성·DOM 변환 호스트) | ✅ |
| WP1 | HTML↔MD 변환(marked/turndown), 마커 보존, SmartEditor 제목 입력 | ✅ |
| WP2 | 키워드 밀도(경량 카운트, Kiwi 형태소는 보류) + 자동 검사 UI | ✅ |
| WP3 | ~~찾기·바꾸기~~ | ❌ 제거(에디터 기본 기능과 중복) |
| WP4 | ⑨ 비주얼 생성 — H2 썸네일(기본 Canvas + AI Gemini) | 🟡 A3(소스: 기본·AI ✅, UPLOAD 제거 / H1 대표·본문 IMG 슬롯 ⬜) |
| WP5 | ⑨ 중복 회피(1px 노이즈) + 압축(품질 슬라이더) + 용량 미터 | ✅ |
| WP6 | ⑨ 모델/캐릭터 일관성(참조 이미지 동반) | ⬜ |
| WP7 | 정합성 확장(`validate.ts` H2↔H2THUMB) | ✅ 축소판(R-7.3 안전망만, 이미지 opt-in 으로 R-7.6 폐기) |
| WP8 | ⑥ 이미지 삽입 | ✅ 검증 완료(수동 삽입 UX) |

---

## 최근 굵직한 결정·수정 (맥락 까먹지 않게)

### 2026-06-08 작업 (이번 세션)

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
- **본문은 `iframe[name=mainFrame]` 안.** content script 를 `all_frames` 로 주입, 본문 프레임에서만 응답.
- **제목은 contenteditable 밖 별도 컴포넌트.** 제목 span 클릭→중첩 iframe body 에 text/plain paste(`insertTitle`).

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
| AI 이미지 어댑터(Gemini, 현재 비활성) | `src/adapters/ai/gemini-image.ts` |
| 참조 첨부 추출(PDF·docx·hwpx·텍스트) | `src/components/reference/extract.ts` |
| 이미지 저장(Dexie) | `src/adapters/storage/record-store.ts` |
| HTML↔MD 변환·정제 | `src/components/validator/convert.ts` |
| 셀렉터·타임아웃 단일 출처 | `src/lib/selectors.ts` |
| 데이터 모델 | `src/types/{common,models}.ts` |
| 사이드패널 UI | `entrypoints/sidepanel/App.tsx` |

---

## 다음 할 일 (우선순위 제안)

0. **[블로커] background NO_RESPONSE 해결** — 위 상단 경고 절차. SW 콘솔 에러 확보가 먼저. 참조 바구니 실측은 이거 풀려야 가능.
1. **참조 바구니 브라우저 실측** — 실파일(PDF/docx/hwpx) 추출, 링크 fetch, pdfjs 워커 확장 로드, 추출 품질·글 반영. hwpx 문단 태그(`hp:p`) 버전차 가능 → 안 나오면 조정.
2. **Gemini 웹 반자동 스파이크** — `gemini.google.com` content script 주입, 프롬프트 입력·전송·결과 스크랩 PoC(DOM 덤프 실측). 깨지면 반자동(최종 전송만 사용자). 그 뒤 참조 바구니 이미지 첨부 → 이미지 생성 배선.
3. **WP4 슬롯 잔여** — H1 대표 썸네일·본문(IMG) 슬롯. 본문 IMG 는 생성기가 IMG 마커 emit 해야 함.
4. **WP6 모델 일관성** — 참조 이미지 등록 + AI 생성 시 동반 전송(R-7.7). 어댑터에 `modelRef` inlineData 자리 이미 마련.
5. **WP8 8-2** — 썸네일에 링크 부착(현재 H2THUMB 무링크라 보류).

> 큰 그림: 이미지 전략을 **유료 API → Gemini 웹 반자동**으로 틀었고, **참조 바구니**가 글 생성·이미지 생성 공용 입력함이 됨. 지금은 **블로커(NO_RESPONSE)** 부터 풀어야 실측 가능.

---

## M3 완료 판정 체크리스트 (docs 발췌)

- [x] 밀도 표 + 권장범위 경고(R-8.2) — 경량 카운트로 충족
- [x] 이미지가 에디터에 삽입(수동) — WP8
- [ ] HTML↔MD 왕복 후 마커 무손실(R-8.4) — 검증 필요
- [x] 소제목 N개 글 → H2 썸네일 정확히 N개, 중복회피 시 모두 다른 바이트 (WP5) — 브라우저 실측은 미확인
- [ ] 모델 참조 등록 시 AI 이미지에 동반 (WP6)
- [x] H2↔H2THUMB 정합성(R-7.3) — WP7 축소판 (이미지↔Visual R-7.6 은 opt-in 으로 폐기)

---

## 참조 바구니 / 이미지 전략 메모 (2026-06-08 신규)

- **참조 바구니**(글 생성 참고자료): 첨부파일·링크·텍스트 → `[참고 자료]` 로 프롬프트 동반. `reference`·`method:'web'` 는 messaging 에 이미 예약돼 있던 자리.
- **첨부 추출**(`extract.ts`): 텍스트=`file.text()`, PDF=`pdfjs-dist`(텍스트 PDF만, 스캔 OCR 아님), docx/hwpx=`fflate` unzip+XML(문단 경계 보존). `.hwp` 바이너리 미지원.
- **deps 추가**: `pdfjs-dist`(워커 1.25MB 별도 번들), `fflate`. 번들 총 ~2.4MB.
- **이미지 = Gemini 웹 반자동(예정)**: 유료 API 무료티어 없어 폐기. 사용자 무료 웹 세션을 SE 자동화처럼 운전. `geminiImageAdapter`(API)는 코드만 남기고 비활성.
