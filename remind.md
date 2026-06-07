# PenFlow 작업 리마인드 (현황 + 다음)

새 환경에서 "어디까지 했고 뭘 할 차례인지" 빠르게 복귀하기 위한 문서. 상세 작업분해는 `docs/manual/milestone/` 참조.

마지막 갱신: 2026-06-07 / 브랜치 `main` / HEAD `cf210e0`.

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
| WP4 | ⑨ 비주얼 생성 — H2 썸네일 Canvas 합성 | 🟡 1차 슬라이스(DEFAULT 배경만) |
| WP5 | ⑨ 중복 회피(재인코딩) + 압축(품질 슬라이더) + 용량 미터 | ⬜ |
| WP6 | ⑨ 모델/캐릭터 일관성(참조 이미지 동반) | ⬜ |
| WP7 | 정합성 확장(`validate.ts` H2↔H2THUMB) | ✅ 축소판(R-7.3 안전망만, 이미지 opt-in 으로 R-7.6 폐기) |
| WP8 | ⑥ 이미지 삽입 | ✅ 검증 완료(수동 삽입 UX) |

---

## 최근 굵직한 결정·수정 (맥락 까먹지 않게)

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
| 이미지 저장(Dexie) | `src/adapters/storage/record-store.ts` |
| HTML↔MD 변환·정제 | `src/components/validator/convert.ts` |
| 셀렉터·타임아웃 단일 출처 | `src/lib/selectors.ts` |
| 데이터 모델 | `src/types/{common,models}.ts` |
| 사이드패널 UI | `entrypoints/sidepanel/App.tsx` |

---

## 다음 할 일 (우선순위 제안)

1. **WP5 중복 회피 + 압축** — 같은 썸네일이라도 매번 다른 바이트(메타 제거 + 1px 노이즈), 품질 슬라이더(`toBlob(quality)`), 용량 미터(`storage.estimate()`). 네이버 중복 이미지 회피(R-7.4).
2. **WP4 나머지** — 이미지 소스 모드(업로드/AI/외부), H1 대표 썸네일·본문(IMG) 슬롯. AI/외부는 키·어댑터 필요.
3. **WP6 모델 일관성** — 참조 이미지 등록 + AI 생성 시 동반 전송(R-7.7).
4. **WP8 8-2** — 썸네일에 링크 부착(현재 H2THUMB 무링크라 보류).

> 추천 착수: **WP5(체감 큼, 키 불필요)**.

---

## M3 완료 판정 체크리스트 (docs 발췌)

- [x] 밀도 표 + 권장범위 경고(R-8.2) — 경량 카운트로 충족
- [x] 이미지가 에디터에 삽입(수동) — WP8
- [ ] HTML↔MD 왕복 후 마커 무손실(R-8.4) — 검증 필요
- [ ] 소제목 N개 글 → H2 썸네일 정확히 N개, 중복회피 시 모두 다른 바이트 (WP5)
- [ ] 모델 참조 등록 시 AI 이미지에 동반 (WP6)
- [x] H2↔H2THUMB 정합성(R-7.3) — WP7 축소판 (이미지↔Visual R-7.6 은 opt-in 으로 폐기)
