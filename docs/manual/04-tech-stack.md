# 펜플로우 (PenFlow) — 기술 스택 가이드

> 기준 문서: `02-functional-design.md`, `03-implementation-checklist.md`
> 목적: 설계서의 기능/규칙을 **무엇으로 구현할지**를 한눈에 정한다.
> 핵심 원칙: 기술은 설계가 **강제하는 제약**에서 거의 자동으로 결정된다. 취향이 아니라 제약을 따른다.
> **대상 브라우저: Chromium 계열 전용** (크롬·네이버 웨일·엣지·브레이브·오페라 등). Firefox·Safari는 범위 밖.

---

## 🎯 한 장 요약 (Cheat Sheet)

```
대상      ─ Chromium 계열 전용                   ← 크롬·웨일·엣지 (Firefox/Safari 제외)
실행 환경 ─ 브라우저 확장 (Manifest V3)        ← 다른 선택지 없음
프레임워크 ─ WXT (Vite)                        ← 2026 표준, Plasmo는 피하기
언어      ─ TypeScript                         ← 계약·데이터모델·이식성 때문에 필수
UI        ─ React + Tailwind + TanStack Table  ← 표·진행패널 많음
UI 표면   ─ Chrome Side Panel                  ← 편집기 옆에 띄워두기 (사용성)
상태머신   ─ XState                             ← 설계서 14.2가 이미 상태도
저장      ─ chrome.storage(설정) + IndexedDB(이미지)
형태소    ─ Kiwi (WASM)                         ← 서버 없이 로컬에서 한국어 분석
이미지    ─ Canvas (+ browser-image-compression)
변환      ─ turndown + marked + DOMPurify
표/엑셀   ─ SheetJS
서명인증   ─ Web Crypto (HMAC)                   ← 네이버 검색광고 API
예약/간격  ─ chrome.alarms                       ← setTimeout 쓰면 안 됨
테스트    ─ Vitest + Playwright
```

> ❌ **백엔드 서버는 두지 않는다.** 키를 서버로 보내는 순간 R-0.3(로컬 전용)을 위반한다.

---

## 1. 가장 먼저: 왜 "브라우저 확장"으로 고정되는가

선택의 여지가 없는 부분부터 짚는다. 아래 두 조건을 **동시에** 만족하는 실행 환경은 브라우저 확장 하나뿐이다.

```
                 무엇을 만들어야 하나?
                         │
        ┌────────────────┴────────────────┐
        ▼                                  ▼
 ⑥ 삽입 엔진                          R-0.3 보안
 네이버 SmartEditor(외부 페이지)를      인증 키를 로컬에만 저장,
 우리 코드가 직접 조작해야 함            서버로 보내면 안 됨
        │                                  │
        ▼                                  ▼
 페이지 안에서 도는 코드 필요          서버 백엔드 두면 안 됨
 = Content Script                    = 순수 클라이언트
        │                                  │
        └────────────────┬─────────────────┘
                         ▼
            ✅ 브라우저 확장 (Manifest V3)
        (웹앱·데스크톱앱·서버 = 전부 탈락)
```

**펜플로우는 Chromium 계열만 타깃한다.** 크롬·네이버 웨일·엣지·브레이브·오페라·비발디 등은 같은 확장 엔진을 쓰므로 코드 한 벌로 모두 커버된다. 특히 네이버 블로그 사용자가 많이 쓰는 **웨일이 Chromium 기반**이라, Chromium 하나만 잡아도 실사용자 대부분이 포함된다. Firefox(엔진·사이드바 API 상이)와 Safari(네이티브 앱 래핑 + App Store 필요)는 의도적으로 범위에서 제외한다.

> Chromium 전용으로 고정하면 얻는 단순화: ① `chrome.*` API를 그대로 쓰면 되고(크로스 브라우저 폴리필 불필요), ② 백그라운드를 service worker로 일원화, ③ **Chrome Side Panel을 폴백 없이** 그대로 쓸 수 있다.

---

## 2. 추천 스택 한눈에 보기

| 레이어 | 추천 | 한 줄 이유 |
|---|---|---|
| 실행 환경 | **WebExtension (MV3), Chromium 전용** | ⑥ 외부 편집기 조작 + R-0.3 로컬 전용. `chrome.*` 직접 사용 |
| 빌드/프레임워크 | **WXT** (Vite 기반) | 2026 신규 확장 표준. 빠른 빌드·작은 번들·뛰어난 DX |
| 언어 | **TypeScript** | 컴포넌트 간 계약(16장)·데이터모델(15장)을 타입으로 고정 |
| UI 프레임워크 | **React + Tailwind** | 상태 많은 UI, WXT와 궁합 좋음 |
| 표 컴포넌트 | **TanStack Table** | 키워드·밀도 표가 화면의 핵심 |
| UI 표면 | **Chrome Side Panel** | 편집기 옆에 고정 → 팝업 닫힘 문제 해소 |
| 상태머신 | **XState** | 14.2 상태도(IDLE→RUNNING→STEP_DONE)를 코드로 |
| 컨텍스트 통신 | WXT messaging | popup·content·background 사이 메시지 |
| 설정/세션 저장 | **chrome.storage.local** | 작은 메타데이터, 내보내기/불러오기(R-0.4) |
| 이미지/페이로드 저장 | **IndexedDB (Dexie.js)** | 이미지는 큼. 용량 미터(`storage.estimate()`) |
| 형태소 분석 | **Kiwi (WASM)** | 서버 없이 로컬에서 한국어 분석 (R-0.3 부합) |
| HTML↔MD 변환 | **turndown + marked + DOMPurify** | 9.3 변환·미리보기, 마커 보존 |
| 표/엑셀 입출력 | **SheetJS (xlsx)** | 키워드 일괄 입출력, 제목 다운로드 |
| AI 호출 | **얇은 fetch 어댑터** | 키 순환·재시도·벤더 교체를 직접 제어 |
| 서명 인증 | **Web Crypto (HMAC)** | 네이버 검색광고 API 서명 |
| 예약/간격 | **chrome.alarms** | 서비스 워커가 잠들어도 동작 |
| 테스트 | **Vitest + Playwright** | 단위 + 삽입 엔진 E2E |

> **WXT를 고르고 Plasmo는 피한다.** Plasmo는 2026년 초 기준 사실상 유지보수 모드이고 Parcel 번들러라 빌드가 Vite 대비 2~3배 느리며 번들도 크다. WXT는 활발히 개발 중이고 Vite 기반이라 빌드가 빠르며 번들이 약 43% 더 작다. (Chromium 전용이라도 file-based 엔트리포인트·HMR·작은 번들이라는 WXT의 이점은 그대로 유효하다.) React가 부담되면 WXT 위에서 **Svelte**로 가면 더 가볍다.

---

## 3. 설계 컴포넌트(①~⑩) → 기술 매핑

설계서의 책임 단위를 그대로 기술에 1:1로 붙인 표다. 이 표만 보면 "어디에 뭘 쓰는지"가 바로 보인다.

| 컴포넌트 | 핵심 기술 | 메모 |
|---|---|---|
| ① 설정 관리자 | chrome.storage + Web Crypto | 키 복수 등록·순환, 내보내기/불러오기 |
| ② 주제 선정기 | fetch + 소스 어댑터 + SheetJS | 검색광고 API는 Web Crypto 서명 |
| ③ 본문 생성기 | AI fetch 어댑터 | 키 순환(R-0.2)·재시도(R-2.3) 래퍼 |
| ⑩ 검증·편집기 | **Kiwi WASM** + turndown/marked | 형태소 밀도 + HTML↔MD |
| ⑨ 비주얼 생성기 | **Canvas** + 이미지 압축 라이브러리 | 썸네일 합성·중복 회피·압축 |
| ④ 부가요소 합성기 | TypeScript 로직 | 마커 순회 → 순서 보장 큐 |
| ⑤ 페이로드 저장소 | **IndexedDB (Dexie)** | 이미지 바이너리 보관 |
| ⑥ 삽입 엔진 | **Content Script** (+ `world: MAIN`) | SmartEditor 클립보드 주입 |
| ⑦ 발행 처리기 | Content Script | 임시저장/발행 + 완료 신호 |
| ⑧ 오케스트레이터 | **XState + chrome.alarms** | 상태머신·예약·간격 |

---

## 4. 여기서 스택이 갈린다 — 까다로운 4가지

설계가 콕 집어 요구한 부분들. 이 4개를 잘못 고르면 나중에 갈아엎어야 한다.

### ① 한국어 형태소 분석 → Kiwi (WASM)  〔컴포넌트 ⑩, 9.1〕

가장 큰 함정이다.

```
MeCab / KoNLPy 계열  →  네이티브·Node·Python 바인딩  →  ❌ 브라우저에 못 올림
ETRI 등 외부 API     →  본문이 외부로 전송됨          →  ❌ R-0.3 위반
Kiwi (WASM)          →  의존성 없는 C++의 WASM 빌드   →  ✅ 확장 안에서 완전 로컬
```

Kiwi는 의존성 없는 C++ 구현에 **WebAssembly 바인딩**이 있고 세종 품사 태그 기반이라, 확장 내부에서 100% 클라이언트 사이드로 돌아간다. 밀도 표(횟수·밀도·판정)는 Kiwi 토큰 결과로 직접 계산한다. **권장 밀도 범위는 설정값으로 분리**한다(R-8.2, 고정값 금지).

### ② 자동화 오케스트레이터 → XState + chrome.alarms  〔컴포넌트 ⑧, 14.2〕

설계서 14.2가 이미 상태도를 그려놨으니 그대로 XState 머신으로 옮긴다.

```
⚠️ 함정: MV3 서비스 워커는 수시로 잠든다.
   → setTimeout 으로 예약·간격을 만들면 깨어날 때 사라진다.
   → 반드시 chrome.alarms 로 다음 글을 스케줄한다.
```

- 세션 상태 영속·재개(R-6.1) → XState 상태를 IndexedDB에 persist
- 완료 신호 후에만 전이(R-6.2) → 상태머신 전이 조건으로 명시
- 무작위 간격·위험 시 자동 확대(R-6.6) → alarm 재스케줄

### ③ 네이버 검색광고 API 서명 → Web Crypto  〔컴포넌트 ②, R-0.5〕

HMAC-SHA256 서명 인증이고 **로컬 시계 오차에 민감**하다.

- 브라우저 내장 `crypto.subtle`(Web Crypto)로 서명 생성
- CORS는 확장 `host_permissions`로 우회 → background에서 호출
- 인증 실패 시 **시계 확인 안내** 노출(R-0.5)

### ④ 이미지 파이프라인 → Canvas 중심  〔컴포넌트 ⑨, 10.x〕

썸네일 합성·중복 회피·압축이 전부 캔버스로 풀린다.

| 요구 | 구현 |
|---|---|
| H2 썸네일 텍스트 얹기 (10.3) | Canvas 텍스트 렌더 (편의 시 fabric.js/Konva) |
| 중복 이미지 회피 (R-7.4) | 캔버스 재인코딩으로 메타데이터 제거 + 1px 미세 노이즈 → 매번 다른 바이트 |
| 품질/압축 (10.6) | `canvas.toBlob(quality)` 또는 browser-image-compression |
| 동영상 프레임 캡처 (10.3) | `<video>` → `drawImage` |
| 모델 일관성 (10.5) | AI 어댑터에서 참조 이미지를 멀티모달 입력으로 동반 |

---

## 5. 사용성(UX) 설계 포인트

- **Chrome Side Panel을 컨트롤 UI로** 쓰면 네이버 편집기를 띄운 채 옆에 붙여 작업할 수 있어, 팝업이 닫히는 불편이 사라진다.
- 시나리오의 "사이드바 모드 권장 안 함"은 **네이버 편집기 자체의 창 모드** 얘기다. 사용자에게는 **편집기 팝업 모드**를 안내한다(R-4.5). (우리 UI의 Side Panel과는 무관)
- 진행 상태는 background에 모아두고 messaging으로 브로드캐스트 → 어느 화면에서도 **실시간 진행 패널**(R-6.3).
- 설정 내보내기/불러오기(R-0.4)는 파일·클립보드를 기본, 클라우드는 선택 어댑터로.

---

## 6. 알아둘 주의점 / 한계

| 항목 | 내용 |
|---|---|
| SmartEditor 주입 | contenteditable 기반 → **클립보드(DataTransfer) 붙여넣기**가 실전적. 에디터 내부 JS 접근이 필요하면 content script를 `world: "MAIN"`으로 주입 |
| UI 변경 대비 | 셀렉터를 **상수 파일로 분리**해 폴백 셀렉터 관리(R-4.1) |
| 키 암호화 한계 | chrome.storage는 평문. 패스프레이즈 기반 Web Crypto 암호화는 얹을 수 있으나 확장 특성상 완전 보호는 불가. **"평문 하드코딩 금지 + 외부 전송 안 함"** 까지가 현실적 목표 |
| AI 호출 | 공식 SDK보다 **얇은 fetch 어댑터** 권장 — 키 순환·재시도·벤더 교체를 직접 제어해야 이식성(비기능) 충족 |

---

## 7. 마일스톤별 최소 스택 (한꺼번에 다 깔지 않는다)

`03-implementation-checklist` 부록의 빌드 순서에 맞춰 필요한 시점에 추가한다.

| 단계 | 추가로 필요한 것 |
|---|---|
| **M1** 최소 동작 | WXT + TypeScript + React + chrome.storage + AI fetch 어댑터 + Content Script 삽입 엔진 |
| **M2** 주제·부가요소 | SheetJS + 소스 어댑터 + Web Crypto(검색광고 서명) |
| **M3** 비주얼·검증 | Canvas + 이미지 압축 + **Kiwi WASM** + turndown/marked |
| **M4** 자동화 | **XState + chrome.alarms** + IndexedDB(세션 영속) |
| **M5** 강건화 | Playwright E2E + 로깅/관측성 + 폴백 셀렉터 전수 |

> M1에서는 Kiwi·XState·IndexedDB·SheetJS가 필요 없다. **걷는 해골(Walking Skeleton)부터** 세우고 단계마다 붙인다.

---

## 부록 — 의존성 빠른 목록

```
# 빌드/프레임워크
wxt, react, react-dom, tailwindcss, @tanstack/react-table

# 상태/저장
xstate, @xstate/react, dexie

# 한국어/변환
(kiwi wasm 바인딩), turndown, marked, dompurify

# 데이터
xlsx (SheetJS)

# 이미지
browser-image-compression  (+ 선택: fabric / konva)

# 테스트
vitest, @playwright/test
```

> Chromium 전용이므로 `webextension-polyfill` 같은 크로스 브라우저 폴리필은 필요 없다. `chrome.*` API를 직접 쓴다.
> 표준 브라우저 API(Canvas, Web Crypto, IndexedDB, chrome.alarms, chrome.sidePanel, **chrome.offscreen / OffscreenCanvas**)는 별도 설치가 없다.
> ⚠️ 서비스 워커에는 DOM·Canvas가 없으므로, ⑨ 이미지 합성·⑩ HTML↔MD 변환은 **오프스크린 문서(`chrome.offscreen`)** 에서 처리한다(배치·근거는 `05-architecture` 1·2장).

---

## 부록 — 확장 식별자

확장의 실제 이름(스토어 등록명)과 빌드 설정은 다음 값으로 고정한다.

```
manifest.json  → "name": "펜플로우"   (스토어 노출명, 필요 시 "PenFlow" 병기)
WXT 프로젝트명  → penflow
패키지명        → penflow
```

> 표시명은 한글 "펜플로우"를 기본으로 하되, 영문 환경·식별자(패키지·리포지토리)에는 `penflow`/`PenFlow`를 쓴다.
