# 펜플로우 (PenFlow) — 기술 아키텍처 설계서

> 기준 문서: `02-functional-design.md`(컴포넌트 ①~⑩, 15·16장), `04-tech-stack.md`(스택·MV3·Chromium 전용), `06-marker-prompt-spec.md`, `07-editor-automation-spec.md`
> 목적: 02의 **기능 컴포넌트**와 04의 **기술 선택**을, 실제 **Chromium 확장(MV3) 런타임 구조**로 배치한다 — *무엇이 어디서 돌고, 어떻게 통신하며, 데이터가 어떻게 흐르는지*.
> 위치: 02(기술 비종속)와 04(무슨 기술) 사이의 "그래서 어떤 구조로 짜는가"를 채운다. 코드 착수의 청사진.

---

## 1. 핵심 제약 (MV3가 강제하는 것)

1. **서비스 워커는 일시적이다.** background는 수시로 잠들고 깨어난다 → **상태를 메모리에 두면 안 되고**, 모든 진행 상태는 저장소에 영속해야 한다. 타이머는 `setTimeout`이 아니라 **`chrome.alarms`** (R-6.5).
2. **서비스 워커에는 DOM·Canvas가 없다.** 이미지 합성(⑨)·HTML↔MD 변환(⑩)처럼 DOM/Canvas가 필요한 작업은 background에서 직접 못 한다 → **오프스크린 문서(`chrome.offscreen`)** 또는 UI 페이지 컨텍스트에서 처리한다. (본 문서의 핵심 결정 중 하나)
3. **UI는 닫힐 수 있다.** popup·side panel은 사용자가 닫으면 사라진다 → **장시간 작업(연속/예약 발행)의 주체는 background**여야 하고, UI는 표시·입력만 담당한다.
4. **외부 페이지 조작은 content script로만.** 네이버 에디터(⑥⑦), 대화형 AI 자동화(③-B), 참고자료 크롤링은 각각 해당 페이지의 content script에서 동작한다.

---

## 2. 런타임 토폴로지 (무엇이 어디서 도는가)

```
┌─────────────────────────────────────────────────────────────┐
│  UI 컨텍스트 (React)  ─ Side Panel(주) / Options(설정)        │
│  역할: 입력·표시만. 무거운 로직 없음. 진행 패널 구독.          │
│  담당 화면: ① ② ③입력 ⑨제어 ⑩편집 + ⑧ 진행표시            │
└───────────────▲───────────────────────────┬──────────────────┘
                │ 메시지(명령/이벤트)          │
┌───────────────┴───────────────────────────▼──────────────────┐
│  Background (Service Worker) ─ 두뇌                            │
│  ⑧ 오케스트레이터(XState) · 라우터 · chrome.alarms            │
│  ② 외부 API 호출 · ③ AI 호출(직접) · 키 순환/재시도           │
│  ⑤ 페이로드 저장소(IndexedDB) 읽기/쓰기 · ① 설정 접근         │
└──┬───────────────┬────────────────┬───────────────┬──────────┘
   │ scripting/msg  │ offscreen msg  │ content msg   │ content msg
   ▼                ▼                ▼               ▼
┌────────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│ Reader CS  │ │ Offscreen Doc │ │ Editor CS   │ │ AI-Web CS    │
│ ③ 참고자료 │ │ ⑨ 이미지합성  │ │ ⑥ 삽입엔진  │ │ ③-B 대화형   │
│ 크롤링     │ │ ⑩ 변환(DOM)   │ │ ⑦ 발행      │ │ 자동화       │
│            │ │ (Canvas/Kiwi) │ │ (world:MAIN)│ │              │
└────────────┘ └──────────────┘ └─────────────┘ └──────────────┘
   임의 페이지     화면 없는 처리      네이버 글쓰기     AI 서비스 페이지
```

### 컨텍스트별 책임

| 컨텍스트 | 담당 컴포넌트 | 핵심 이유 |
|---|---|---|
| **Side Panel (UI)** | ① ② ③(입력) ⑨(제어) ⑩(편집 UI) ⑧(진행표시) | 편집기 옆 상주(04). 표시·입력 전담 |
| **Background (SW)** | ⑧ 오케스트레이터 · ②③ 외부/AI 호출 · ⑤ 저장 · ① 설정 | 두뇌·영속·스케줄. UI가 닫혀도 동작 |
| **Offscreen Doc** | ⑨ 이미지 합성·압축 · ⑩ HTML↔MD 변환 | SW엔 DOM/Canvas 없음 → 여기서 처리 |
| **Editor CS** | ⑥ 삽입 엔진 · ⑦ 발행 | 네이버 에디터는 외부 페이지(07) |
| **AI-Web CS** | ③-B 대화형 자동화 | AI 사이트 화면 조작(키 불필요) |
| **Reader CS** | ③ 참고자료 크롤링 | "제목+본문 가져오기" 대상 페이지 |

> ⑨·⑩을 **오프스크린**에 두는 이유: 자동화(⑧)가 UI를 닫은 채 돌아도 이미지 합성·변환이 가능해야 한다. UI가 열려 있을 땐 UI 페이지에서 처리해도 되지만, **단일 경로(offscreen)로 일원화**해 동작을 일관되게 한다.

---

## 3. 컴포넌트 ①~⑩ → 모듈 매핑

도메인 로직은 `src/components/`에 컨텍스트 독립적으로 두고, 각 실행 컨텍스트(entrypoint)는 이를 **호출**만 한다. (로직과 실행 위치 분리 → 테스트 용이)

| 컴포넌트 | 모듈 | 실행 컨텍스트 | 04 기술 |
|---|---|---|---|
| ① 설정 관리자 | `components/settings` | Background(저장) + UI(입력) | chrome.storage + Web Crypto |
| ② 주제 선정기 | `components/topic` | Background | fetch + 소스 어댑터 + SheetJS |
| ③ 본문 생성기 | `components/generator` | Background(직접) / AI-Web CS(대화형) | AI fetch 어댑터 |
| ④ 부가요소 합성기 | `components/composer` | Background | TS 로직(06 scan→큐) |
| ⑤ 페이로드 저장소 | `components/payload` | Background | IndexedDB(Dexie) |
| ⑥ 삽입 엔진 | `components/insert` | Editor CS | DOM + world:MAIN(07) |
| ⑦ 발행 처리기 | `components/publish` | Editor CS | DOM |
| ⑧ 오케스트레이터 | `components/orchestrator` | Background | XState + chrome.alarms |
| ⑨ 비주얼 생성기 | `components/visual` | Offscreen | Canvas + 압축 |
| ⑩ 검증·편집기 | `components/validator` | Offscreen(변환) + UI(편집) | Kiwi WASM + turndown/marked |

---

## 4. 메시지 프로토콜 (컨텍스트 간 통신)

컨텍스트가 분리돼 있으므로 **타입이 있는 메시지**로만 통신한다. (WXT messaging / `@webext-core/messaging`)

### 4.1 메시지 종류

- **Command (요청/응답)**: UI → Background, Background → CS/Offscreen. `requestId`로 응답 짝을 맞춘다.
- **Event (브로드캐스트)**: Background → UI. 진행률·상태·로그. UI는 구독만.

### 4.2 봉투(Envelope) 형태 (권장)

```ts
interface Msg<T = unknown> {
  kind: 'cmd' | 'event';
  name: string;        // 예: 'generate.run', 'insert.start', 'progress'
  requestId?: string;  // cmd 응답 매칭용
  payload: T;
}
```

### 4.3 주요 채널 (예시)

| name | 방향 | 용도 |
|---|---|---|
| `topic.collect` | UI→BG | 주제 수집(경로 A/B/C) |
| `generate.run` | UI→BG | 본문 생성(③) |
| `visual.compose` | BG→Offscreen | 썸네일·이미지 합성(⑨) |
| `convert.htmlmd` | BG/UI→Offscreen | 변환(⑩) |
| `insert.start` | BG→Editor CS | 삽입 큐 실행(⑥) |
| `publish.do` | BG→Editor CS | 임시저장/발행(⑦) |
| `step.done` | Editor CS→BG | 완료 신호(R-5.2 → ⑧) |
| `progress` | BG→UI | 진행/상태/로그 이벤트 |

> 모든 메시지 이름·타입은 `lib/messaging.ts` **한 곳에 정의**(마커·셀렉터와 동일한 단일 출처 원칙).

---

## 5. 데이터 흐름 (한 글이 만들어지는 경로)

```
[UI 입력: 주제·프롬프트·옵션]
        │ generate.run
        ▼
 Background ── ③ 본문 생성(AI 어댑터, 키 순환) ──► 06 후처리·마커 검사
        │
        ├─ visual.compose ─► Offscreen ⑨ (Canvas 합성·압축) ─► 이미지들
        │
        ▼
 06 정합성 검사 (H2=썸네일=Visual 수, 광고문구 등) ── 실패 시 차단·통지
        │
        ▼
 ④ 합성: 06 scan() 순서대로 InsertQueue 생성 (재배치 금지)
        │
        ▼
 ⑤ 페이로드 저장소(IndexedDB): {본문, InsertQueue, 이미지, 발행옵션} 저장
        │ insert.start (payloadId 전달)
        ▼
 Editor CS ── ⑤에서 인출 ──► ⑥ 삽입(제목·본문·이미지·표·링크·서식)
        │
        ▼
 ⑦ 발행(임시저장/발행) ── step.done ──► ⑧ 오케스트레이터
        │
        ▼
 ⑧ 완료 신호 수신 후에만 다음 글로 전이(R-6.2) / 예약·간격(alarms)
```

> 컨텍스트 간에는 **큰 바이너리(이미지)를 메시지로 던지지 않고**, ⑤ 저장소에 넣은 뒤 **`payloadId`만 전달**한다(메시지 크기·직렬화 비용 회피).

---

## 6. 저장소 아키텍처 (⑤ + ①)

| 저장 대상 | 위치 | 이유 |
|---|---|---|
| 설정·인증 키(①) | `chrome.storage.local` | 작은 메타. 내보내기/불러오기(R-0.4). 키는 로컬 전용(R-0.3) |
| 자동화 세션 상태(⑧) | `chrome.storage.local` | 영속·재개(R-6.1). SW 재시작에도 보존 |
| 페이로드·이미지(⑤) | **IndexedDB(Dexie)** | 이미지 바이너리는 큼. 용량 미터(`storage.estimate()`) |
| 프롬프트 라이브러리 | `chrome.storage.local` | 이름 저장/불러오기(R-2.1) |

- 두 저장소 모두 **저장소 추상화 인터페이스**(`lib/storage.ts`) 뒤에 둔다(03 공통 기반: 벤더 교체 가능).
- 키는 평문이므로(04 한계) 민감 정보는 Web Crypto 기반 선택적 암호화.

---

## 7. 횡단 관심사 (Cross-cutting)

- **어댑터(이식성, 비기능)**: `src/adapters/` 아래 `ai/`, `image/`, `source/`, `storage/`. 컴포넌트는 인터페이스에만 의존(구체 벤더 교체 가능). 구체 타입은 `types/`(02 16장 계약) — *별도 인터페이스 규격 문서/`types.ts`에서 확정*.
- **관측성(로깅·진행)**: `lib/logger.ts`가 단일 채널. 모든 단계가 `progress` 이벤트를 발신 → UI 진행 패널 + 로그 양쪽(R-6.3, 03 공통 기반).
- **에러 표준**: `lib/errors.ts`. "사용자 통지 + 안전 종료" 패턴 공통화. 컨텍스트 경계를 넘는 에러는 봉투에 직렬화해 전달.
- **단일 출처 파일**: `markers.ts`(06) · `selectors.ts`(07) · `messaging.ts`(4장) · 데이터 모델 `types/`(02 15장).

---

## 8. 모듈/폴더 구조 (WXT 기준)

```
penflow/
├── wxt.config.ts
├── entrypoints/                  # 실행 컨텍스트(=배치)
│   ├── background.ts             # ⑧ 두뇌·라우터·alarms·②③⑤
│   ├── sidepanel/                # 메인 UI (React)
│   │   ├── index.html
│   │   └── main.tsx
│   ├── options/                  # 설정 UI (선택)
│   ├── offscreen/                # ⑨⑩ Canvas/DOM 처리 (headless)
│   │   ├── index.html
│   │   └── main.ts
│   ├── editor.content.ts         # ⑥⑦ 네이버 글쓰기 페이지
│   ├── ai-web.content.ts         # ③-B 대화형 자동화
│   └── reader.content.ts         # ③ 참고자료 크롤링
├── src/
│   ├── components/               # ①~⑩ 도메인 로직(컨텍스트 독립)
│   │   ├── settings/  topic/  generator/  composer/  payload/
│   │   ├── insert/    publish/  orchestrator/  visual/  validator/
│   ├── adapters/                 # ai/ image/ source/ storage/  (이식성)
│   ├── lib/                      # markers.ts selectors.ts messaging.ts
│   │   ├── storage.ts  logger.ts  errors.ts
│   └── types/                    # 데이터 모델(15장) + 계약(16장)
└── tests/                        # vitest(단위) / playwright(E2E)
```

> 원칙: **`entrypoints/`는 배치(어디서 도는가)만, `src/components/`는 로직(무엇을 하는가)만.** 컨텍스트를 바꿔도 로직 모듈은 그대로 재사용·테스트된다.

---

## 9. M1(Walking Skeleton) 최소 아키텍처

M1 범위(0 공통 + ①③⑤⑥⑦)만 세우면 다음으로 충분하다.

```
Side Panel(UI) ──generate.run──► Background(③ AI 직접호출 → 06 후처리)
                                      │ ⑤ payload 저장(IndexedDB)
                                      │ insert.start(payloadId)
                                      ▼
                                 Editor CS(⑥ 텍스트 삽입 → ⑦ 임시저장 → step.done)
```

- M1에서 **불필요**: Offscreen(⑨⑩), AI-Web CS(③-B), Reader CS, XState 풀 상태머신(단순 단일 흐름이면 최소화), chrome.alarms.
- M3(비주얼·검증)에서 **Offscreen 도입**, M4(자동화)에서 **XState + alarms + 세션 영속** 추가.

> 즉 컨텍스트를 한 번에 다 만들지 않고, **Side Panel + Background + Editor CS** 3개로 시작해 마일스톤마다 Offscreen·추가 CS를 붙인다.

---

## 10. 합의가 필요한 결정 (열린 항목)

- ⑩ 변환을 **Offscreen 단일 경로**로 갈지, UI 열림 시 UI에서 처리할지(성능 vs 일관성).
- ⑨ 이미지 처리량이 많을 때 Offscreen 1개로 충분한지(직렬 처리 한계).
- 메인 UI를 Side Panel로 고정할지, popup 병행할지.
- 세션 상태 영속을 chrome.storage로 둘지, IndexedDB로 옮길지(크기·빈도 기준).

> 위 결정이 서면 본 문서와 `messaging.ts`/폴더 구조를 함께 갱신한다.
