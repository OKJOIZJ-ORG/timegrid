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

- 운영 버전: **v3.12.65** (검증 완료·배포 대기, 2026-08-20)
  - index.html sha1: `e194923fbf0166d0b44abb38098c2ff41b2f8c19`
  - sw.js sha1: `dbb9b146134f62296c3bafd7729b72b10a5240bd`
- v3.12.65 변경: 할일 날짜 이동 모달 전면 재디자인 및 Emil Design Engineering 표준 폴리싱 (전역 44px 텍스트 닫기 버튼 대신 28px 소프트 원형 SVG 닫기 버튼 `.dlg-close-btn` 적용, 과도한 압축을 교정하여 13px/14px 황금비 여백과 시각적 호흡감 복원, `다음 주` 칩 및 커스텀 캘린더 단일 모드 완성).
