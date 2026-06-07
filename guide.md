# PenFlow 개발 환경 가이드

네이버 블로그 AI 글쓰기 자동화 — **Chromium 전용 MV3 확장**. WXT(Vite) + React 19 + Tailwind 4 + TypeScript.

새 PC/새 환경에서 이 문서만 따라 하면 개발·실행·검증까지 된다.

---

## 1. 요구 도구

| 도구 | 버전 | 비고 |
|---|---|---|
| Node.js | 20+ (검증: 24.16) | WXT 0.20 요구. nvm 권장 |
| npm | Node 동봉 | pnpm/yarn 도 가능하나 lockfile 은 npm(`package-lock.json`) |
| Chromium 브라우저 | 최신 | Chrome/Edge/Brave 등. **Firefox 불가**(chrome.* 직접 사용, MV3 offscreen) |
| Git | — | 커밋 trailer 규칙 있음(§7) |

OS 무관하나 현재 주 개발은 Windows. Windows 파일 워치 이슈는 dev 스크립트가 polling 으로 이미 처리됨(§3).

---

## 2. 설치

```bash
git clone <repo-url>
cd PenFlow
npm install          # postinstall 이 자동으로 `wxt prepare` 실행 (.wxt 타입 생성)
```

`.env` 파일 **없음**. API 키는 코드/환경변수가 아니라 **확장 UI(설정 페이지)** 에서 입력하고 `chrome.storage` 에 로컬 저장한다(R-0.3 인증키 로컬 전용). §6 참조.

---

## 3. 개발 (HMR)

```bash
npm run dev
```

- `.output/chrome-mv3/` 에 확장이 빌드되고 파일 변경을 감시한다.
- dev 스크립트는 `CHOKIDAR_USEPOLLING`·`WATCHPACK_POLLING` 을 켜서 **Windows/네트워크 드라이브에서 변경 미감지**를 막는다(커밋 `f0de878`).

### 브라우저에 로드 (압축 해제)
1. `chrome://extensions` 열기
2. 우상단 **개발자 모드** ON
3. **압축해제된 확장 프로그램을 로드** → `D:\...\PenFlow\.output\chrome-mv3` 선택
4. 코드 수정 시 HMR 반영. 안 되면 확장 카드의 **새로고침(↻)** 클릭. background/content script 변경은 새로고침이 필요할 때가 많다.

> ⚠️ **dev 서버가 떠 있는 동안 `npm run build` 금지** — `.output` 충돌. 빌드는 dev 끄고.

---

## 4. 빌드 / 배포 패키징

```bash
npm run build        # .output/chrome-mv3 프로덕션 빌드
npm run zip          # 스토어 업로드용 zip
```

---

## 5. 검증 (반드시 통과 후 커밋)

```bash
npm run compile      # tsc --noEmit (타입 검사, 0 이어야 함)
npm test             # vitest run (전부 pass 여야 함)
```

- 테스트: **vitest + jsdom**. 순수 함수·DOM 헬퍼 위주(브라우저 없이 검증 가능한 범위).
- SmartEditor 실제 동작(이미지 업로드, paste 가로채기 등)은 자동 테스트 불가 → 브라우저에서 수동 검증 후 DOM 덤프로 확인하는 패턴을 써왔다(§ remind.md 의 "SE 실측 사실").

---

## 6. API 키 설정 (런타임)

확장 로드 후 사이드패널 우상단 **⚙ 설정** → 옵션 페이지에서 입력. 모두 `chrome.storage.local` 저장(서버 전송 없음).

| 키 | 용도 | 필수 | 비고 |
|---|---|---|---|
| Gemini API Key | ③ AI 본문 생성 | 생성에 필수 | `aiModel` 도 설정 |
| 네이버 검색광고 (액세스 라이선스 / Secret / CustomerID) | ② 키워드 검색량·경쟁도(경로 A) | 키워드 검색량에 필요 | **PC 시계 정확해야 서명 통과**(R-0.5). 틀어지면 인증 실패 배너 |
| (연관 검색어 경로 C) | 네이버/구글/유튜브 자동완성 | 키 불필요 | 공개 엔드포인트 |

본문 생성·삽입만 보려면 Gemini 키만 있으면 된다.

---

## 7. 작업 규칙

- **언어**: 기본 한국어 응답. 코드/식별자/오류는 원문 유지.
- **커밋**: 사용자가 요청할 때만. 메시지 끝에 trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **줄바꿈**: 저장소는 LF. Windows 체크아웃 시 `LF will be replaced by CRLF` 경고는 무해.
- **되돌리기 어려운 작업**(삭제·덮어쓰기·강제푸시·외부전송)은 사전 확인.

---

## 8. 프로젝트 구조

```
PenFlow/
├─ entrypoints/            # 확장 진입점 = "배치"(어디서 실행되나)
│  ├─ background.ts        #   Service Worker = 두뇌·라우터(생성·합성·라우팅·릴레이)
│  ├─ editor.content.ts    #   blog.naver.com content script(all_frames, 본문 iframe 삽입)
│  ├─ offscreen/           #   화면 없는 문서 — Canvas 합성·DOM 변환(SW 엔 DOM 없음)
│  ├─ sidepanel/           #   메인 UI(React)
│  └─ options/             #   설정(키 입력) UI
├─ src/                    # 로직(@ → src 별칭)
│  ├─ adapters/            #   외부 연동(ai/gemini, storage/record-store=Dexie, ...)
│  ├─ components/          #   기능 모듈(generator, composer, insert, visual, validator, payload, ...)
│  ├─ lib/                 #   공용(messaging=메시지 계약, selectors, markers, errors, ui-bus, offscreen)
│  └─ types/               #   common·models (데이터 모델 단일 출처)
├─ tests/                  # vitest
├─ docs/manual/            # 설계 문서 01~09 + milestone/ (작업분해·스파이크)
└─ wxt.config.ts           # manifest·권한·alias
```

### 핵심 아키텍처 제약 (05 아키텍처)
- **Service Worker(background)** 엔 DOM/Canvas 없음 → DOM·Canvas 작업은 **offscreen 문서**에서.
- **content script** 는 페이지(blog.naver.com) origin → **확장 IndexedDB(Dexie) 접근 불가** → 이미지 바이트는 background `visual.fetch` 릴레이로 받는다.
- 큰 바이너리는 메시지로 던지지 않고 Dexie 에 넣은 뒤 **ref(id)만 전달**(05 §5).
- 컴포넌트 간 통신은 `src/lib/messaging.ts` 의 채널/타입이 **단일 계약**.

---

## 9. 자주 막히는 것

| 증상 | 해결 |
|---|---|
| dev 변경이 반영 안 됨 | 확장 카드 ↻ 새로고침. background/content 는 거의 항상 필요 |
| `.output` 충돌 | dev 와 build 동시 실행 금지 |
| 검색광고 인증 실패 | PC 시계 동기화(설정→시간→지금 동기화), 키 3개 재확인 |
| 본문 iframe 삽입 안 됨 | 네이버 글쓰기 페이지가 열려 있어야 함. content script 는 본문 iframe 에서만 응답 |
| tsc 통과인데 런타임 오류 | 브라우저 콘솔(background=확장 카드 "서비스 워커", content=페이지 콘솔) 확인 |
