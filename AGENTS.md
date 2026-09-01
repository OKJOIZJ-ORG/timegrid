# TimeGrid — 작업 앵커 (Agent Anchor)

이 파일은 에이전트 세션이 작업 시작 시 길을 잃지 않도록 핵심 위치와 규칙을 고정한다.

## 진실의 원천 (SSOT)

| 대상 | 위치 |
|---|---|
| 코드 (단일 파일 PWA) | 이 저장소 `index.html` + `sw.js` (빌드 없음) |
| 스펙·운영 명세 | 노션: https://app.notion.com/p/TimeGrid-f2e6337c66918301baa1015ae5a93a57 (page id `f2e6337c66918301baa1015ae5a93a57`) |
| 배포 | GitHub Pages: https://okjoizj-org.github.io/timegrid/ (저장소 `OKJOIZJ-ORG/timegrid`, `main` 브랜치 push = 즉시 배포) |

## 작업 규칙 요약 (명세 §7의 핵심)

- **명세 정독**: 작업 전 노션 명세를 먼저 읽는다. MCP는 잘리므로 `ntn pages get f2e6337c66918301baa1015ae5a93a57`로 덤프 후 읽기.
- **노션 갱신 전 항상 최신 페이지 내용 재조회** — 로컬 캐시·이전 기억에 의존해 패치하지 않는다.
- **우선순위**: 사용자 명령(또는 명령 의도의 개연적 해석) > 노션 명세. 충돌 시 명령을 이행하고 명세를 그에 맞게 갱신.
- **한글 패치**: Windows에서 Node `.js` 스크립트로만. CRLF→LF 정규화 후 매칭, 교체당 정확히 1회 등장 단언, UTF-8 명시 기록, 패치 후 U+FFFD 재검사.
- **검증 5단계**: U+FFFD 0개 → `node --check` (추출 스크립트) → Chromium 헤드리스 렌더링 → grep/diff → 셀렉터 실재 grep.
- **버전/SW 캐시 키 재사용 금지**: 릴리스마다 `index.html` footer 버전과 `sw.js` `VERSION`을 함께 올린다.
- **배포 게이트**: 배치 배포는 사용자 명시 지시가 있을 때만. push = Pages 배포.
- **보안**: 인증 토큰·UID 원문을 노션/코드/저장소/대화에 기록·재공유 금지. 임베드 파일 교체는 세션 권한 밖.

- 배포 운영 버전: **v3.13.3** (GitHub Pages, 2026-09-02). 검증된 릴리스 코드 커밋은 `9379e6436fb32780029e7cd2f774c46379a98baa`이다.
  - index.html Git blob: `4bbe6b75821c68eb080a34cfb6ddba8033d6da80`
  - sw.js Git blob: `d55ea7d81087033e9ee5a32d60e85f4a6247abb4`
  - SW: `timegrid-v3.13.3-20260902`
  - 외부 Firebase/GSAP 스크립트는 고정 SHA-384 SRI와 anonymous CORS를 사용한다.
  - 가져오기·localStorage·원격 설정의 영역/활동 색은 `#RRGGBB`로 정규화해 저장형 DOM-XSS 경로를 차단한다.
  - 클라이언트와 Firestore Rules는 공개 이메일 allowlist 대신 `timegridOwner` custom claim과 UID 경로 일치를 요구한다.
  - 완료 상태는 명시적 `statusMutations`로 수렴한다. Todo와 routine instance의 embedded `done`은 materialized projection이다.
  - 반복 루틴 정의는 `routineDefId`, 일별 실행은 별도 안정적 instance `id`를 사용한다. ID 없는 semantic duplicate는 settings normalize 단계에서 제거한다.
  - 동일 semantic measurement는 정확히 60초까지 exact timestamp/continuity lineage로 한 span에 합치며 공백도 시간에 포함한다.
  - Tracker 1초 ticker는 live 요소만 갱신하고 plan marker geometry는 데이터/layout invalidation 때만 재계산한다.
  - 버튼/Planner 행은 공유 geometry와 desktop subgrid/mobile two-tier contract를 사용한다. Todo와 Routine의 제어선·시간선·본문선·액션선은 같은 12px 리듬을 공유한다.
  - 모바일 Todo는 이전의 compact two-tier 계층(최소 66px)을 유지하고, Routine은 72px two-tier와 `영역·활동 | 경과 | 요일` 분산 정렬을 사용한다. 카드의 추가 세로 패딩을 제거해 첫·마지막 행도 내부 분리선과 같은 행 패딩 리듬을 사용한다.
  - 고정 높이 텍스트 컨트롤은 block padding 0과 flex 중앙 정렬을 공유한다. Routine 측정 버튼은 40px 원 안의 17px SVG를 쓰고, 비대칭 재생 삼각형에만 0.75px 광학 보정을 적용한다.
  - 시간 표시는 총합과 기록 경로에서 완료된 정수 초 `HH:MM:SS`를 사용한다. 실행 중 상태는 중복 활동 정체성을 표시하지 않고 `시작 시각부터 기록 중 · Nh Nm Ns 경과`를 표시하며, 일일 총합과 세션 경과는 동일한 밀리초 경계를 사용한다.
  - Tracker 활동 입력 폭은 확정 활동의 최종 굵기(600)를 적용한 뒤 단일 JS 경로에서 측정하고, 글꼴 준비 완료 후 다시 측정해 iOS의 한글 잘림을 방지한다.
  - `[hidden]` 상태는 컴포넌트 display 규칙보다 우선한다. 계정 위젯은 인증 상태에 맞는 액션만 노출한다.
- v3.12.67의 `todoMutations` move/delete/restore 계약은 v3.13.3에도 유지된다.
