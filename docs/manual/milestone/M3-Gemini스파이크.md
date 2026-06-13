# 펜플로우 — M3 Gemini 웹 반자동 스파이크 (이미지 생성)

> 목적: 유료 AI 이미지 API 를 폐기하고(무료 티어 없음), **gemini.google.com 무료 웹 세션**을 SmartEditor 자동화 플레이북 그대로 운전한다. 프롬프트 입력 → (반자동: 사용자가 최종 전송) → 완료 폴링 → 생성 이미지 스크랩 → Dexie 저장 → 참조 바구니/본문 삽입과 배선.
> ⚠️ 측정은 **실제 로그인 세션**에서만 가능(헤드리스/CI 불가). SmartEditor 스파이크(`M1-스파이크.md`)와 동일한 방식: 프로브 먼저 → 실측 → 셀렉터·CS 채움.

---

## 0. 왜 반자동인가

- **취약성↓**: 자동 전송까지 하면 Gemini DOM 변경·봇 감지에 더 약하다. 사용자가 최종 "전송"만 누르면 입력 주입만 책임지면 됨.
- **무료 세션 활용**: API 키 비용 없이 사용자의 로그인 웹 세션을 그대로 쓴다.
- 깨지면(전송 자동화 실패해도) 입력까지만 채워주고 사용자가 보내는 것으로 폴백.

---

## 1. 실행 방법

1. `gemini.google.com` 로그인 → 새 대화. 프롬프트 입력칸이 보이는 상태.
2. (권장) 이미지 한 장 먼저 생성시켜 **응답에 이미지가 있는 상태**로 둔다 → 응답·이미지 셀렉터까지 한 번에 측정.
3. `F12` → **Console**.
4. `tools/spike/gemini-probe.js` 전체를 복사해 콘솔에 붙여넣고 Enter.
5. 출력 표 + 맨 아래 **JSON 전체**를 복사해 전달. (`window.__PENFLOW_GEMINI__` 에도 보관)
6. (선택) 입력 주입까지 보려면 `PENFLOW_PROBE_TYPE = true` 실행 후 프로브 재실행. 프롬프트칸에 `[펜플로우 입력 테스트]` 가 들어가면 입력 주입 성공(전송 안 함) → 수동 삭제.

---

## 2. 미지수 체크리스트 (실측 후 채움)

| # | 미지수 | 측정 방법 | 결과 (2026-06-11 1차 실측) |
|---|---|---|---|
| 1 | 프롬프트 입력칸: `<textarea>` 인가 contenteditable(Quill `.ql-editor`)인가? | 프로브 `candidates.promptInput` | ✅ **Quill contenteditable**. `rich-textarea .ql-editor[contenteditable="true"]`, aria-label "Gemini 프롬프트 입력", class `ql-editor textarea new-input-ui ql-blank`(빈 상태 `ql-blank`) |
| 2 | 입력 주입이 먹히는가? 프레임워크가 값을 인식하나(전송 버튼 활성화)? | 라이브 CS `gemini.run` | ✅ **격리월드 CS 에서 먹힘**. `setPrompt`(paste→insertText→textContent) 로 Quill 에 정상 주입 확인 |
| 3 | 전송 버튼 안정 셀렉터 (aria-label 언어 의존?) | 프로브 `candidates.sendButton` | ◐ **빈 입력 땐 미렌더**(매칭 0). 반자동(사용자 전송)이라 **비차단**. autoSend 자동전송 쓸 때만 텍스트 입력 후 재측정 필요(현재 추측 폴백) |
| 4 | **완료 판정 신호**: 생성중 stop 버튼 등장→소멸? 스트리밍 커서? | 라이브 관찰 | ✅ 완료 = **img class 에 `loaded`** + `naturalWidth>0` + 이미지 수 증가. ⚠️ **`image-loading-overlay` 는 완료 후에도 DOM 에 잔존**(Angular host 유지) → 존재 여부로 판정 금지(초기 버그, 수정함) |
| 5 | 생성 이미지 셀렉터 + src 스킴(data/blob/https) | 프로브 `candidates.generatedImage`, `images[]` | ✅ **`single-image img`**(class `image animate loaded`), **src=`blob:`**, 1024×559, alt ", AI로 생성". 부모 체인: `generated-image > single-image > img` |
| 6 | 응답 컨테이너 단위(여러 응답 중 최신 식별법) | 프로브 `candidates.responseContainer` | ✅ `model-response` / `message-content` / `.response-container`. (현재 단일 — 최신=마지막. CS 는 이미지 수 증가로 판정해 컨테이너 식별 불필요) |
| 7 | 파일 첨부 경로(참조 이미지 동반): 버튼인가 `input[type=file]` 인가? paste 로 첨부되나? | 프로브 `candidates.attachButton` | ◐ **`button[aria-label*="업로드"]`** ("업로드 및 도구") 존재. `input[type=file]` 은 지연 렌더(클릭 후 등장 추정). WP6 첨부 배선 시 재측정 |
| 8 | content script 격리 월드로 입력 주입 가능? `world:MAIN` 필요? | 라이브 CS | ✅ **격리월드로 충분**(`world:MAIN` 불필요). 입력 주입·blob fetch 모두 같은 origin 이라 정상 동작 |
| 9 | 이미지 스크랩 방법: img src 가 blob/data 면 어떻게 바이트 추출(canvas? fetch?) | 5 결과에 따라 | ✅ **blob: → `fetch(src)` → blob → FileReader dataUrl**(같은 origin). 실패 시 canvas 폴백(blob 동일 origin 이라 taint 없음). CS `imgToDataUrl` 구현 |

> **1차 결론**: 입력칸·완료신호·이미지·스크랩 경로는 확정. **남은 라이브 관문 2개**: (#2) Quill 입력 주입이 격리월드 CS 에서 먹히는지(#8 포함), (#3) 전송 버튼 셀렉터(텍스트 입력 후). 둘 다 **CS 를 실제 로드해 `gemini.run` 을 돌려 검증**한다(콘솔 MAIN world 보다 권위 있음).

---

## 3. 실측 결과 (selectors.ts `GEMINI` 반영 완료)

```
promptInput      : rich-textarea .ql-editor[contenteditable="true"]   ✅
sendButton       : button.send-button / aria-label*=보내기|전송|Send   ⬜ 추측(빈 입력 미렌더, 라이브 재측정)
stopButton       : (완료는 image-loading-overlay + img.loaded 로 판정)
attachButton     : button[aria-label*="업로드"]   ◐ ("업로드 및 도구")
generatedImage   : single-image img.loaded (src=blob:)   ✅
loadingOverlay   : image-loading-overlay   ✅ (생성 중 존재)
입력 주입 기법    : paste → execCommand insertText → textContent (CS setPrompt)   ⬜ 라이브 검증
이미지 스크랩     : fetch(blob:) → FileReader dataUrl, canvas 폴백   ✅
world:MAIN 필요  : ⬜ 라이브 검증(#2/#8)
```

> 코드 반영: `src/lib/selectors.ts`(`GEMINI`·`GEMINI_DEFAULTS`), `entrypoints/gemini.content.ts`(CS), `src/lib/messaging.ts`(`gemini.run`), `entrypoints/background.ts`(`forwardToGemini`). 빌드 OK(`content-scripts/gemini.js` 등록).

---

## 3b. 라이브 검증 방법 (남은 관문 #2/#3/#8)

1. `npm run build` → `chrome://extensions` 에서 `.output/chrome-mv3` 로드(또는 새로고침).
2. `gemini.google.com` 로그인 탭을 연다.
3. 확장 **사이드패널 콘솔**(또는 SW 콘솔)에서:
   ```js
   chrome.runtime.sendMessage({ kind:'cmd', name:'gemini.run',
     payload:{ prompt:'밝고 단순한 고양이 일러스트, 텍스트 없이, 가로형', autoSend:false } })
     .then(console.log)
   ```
4. **반자동(autoSend:false)**: 프롬프트가 Gemini 입력칸에 채워지면 #2/#8 통과. 사용자가 전송 → 생성 완료되면 `{ok:true, value:{dataUrl}}` 반환되면 #4/#5/#9 통과.
5. **전송 자동화 확인(선택)**: `autoSend:true` 로 재시도. 전송 버튼 클릭되면 #3 의 폴백 셀렉터가 맞는 것. 안 되면 콘솔서 텍스트 입력 후 `gemini-probe.js` 재실행해 `sendButton` 실측값으로 교체.

---

## 4. 스파이크 완료 후 할 일 (코드 배선)

- [ ] `wxt.config.ts` — `host_permissions`/CS `matches` 에 `https://gemini.google.com/*` 추가.
- [ ] `entrypoints/gemini.content.ts` 신규 — 입력 주입·전송(반자동)·완료 폴링·이미지 스크랩.
- [ ] `src/lib/selectors.ts` — `GEMINI` 셀렉터 묶음 추가(실측 폴백 배열).
- [ ] `src/lib/messaging.ts` — `gemini.run`(프롬프트+첨부 → 이미지 dataUrl) 채널 추가.
- [ ] `entrypoints/background.ts` — `gemini.run` 을 Gemini 탭 CS 로 forward(`forwardToEditor` 패턴 재사용). 탭 없으면 안내.
- [ ] 결과 이미지 → Dexie 저장 → `Visual{role:'H2_THUMB'|..., source:'AI'}` 로 기존 삽입 경로 합류.
- [ ] 참조 바구니 이미지 첨부 → Gemini 입력 동반(WP6 모델 일관성과 연결).
- [ ] 사이드패널 UI: 이미지 소스 라디오 `AI(API)` 비활성 자리에 `Gemini 웹(반자동)` 추가.

---

## 5. 메모

- **반자동 결정**: 입력·첨부까지만 자동, 최종 전송은 사용자. 완료 후 결과 스크랩은 자동.
- **기존 비활성 코드**: `src/adapters/ai/gemini-image.ts`(API)는 남겨두되 비활성. 이 스파이크 경로가 대체.
- **참조 바구니 = 공용 입력함**: 글 생성 참고자료 + 이미지 생성 입력을 한 바구니가 먹인다(`Attachment` 통합 예정).
