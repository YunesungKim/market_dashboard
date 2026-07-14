# UI 개선 & 재디자인 — 설계 (Design Spec)

작성일: 2026-07-14
대상: (1) 증시 브리핑 생성 도구, (2) 증시 브리핑 아카이브

## 목적

두 페이지를 **라이트 금융 대시보드** 톤으로 모바일 친화적으로 다듬고, 생성 도구에 사용자 설정(테마·개수·LLM 모델)·모드 표시·배포 카드 수 표시를 추가하며, 아카이브에 날짜 필터를 추가한다.

## 결정 사항 (브레인스토밍 확정)

- 사용자 설정 저장: **브라우저 localStorage + 요청 파라미터**. 서버는 무상태 유지, 기본값은 서버 기본.
- 테마 설정: **완전 편집형** (행 추가/삭제, 각 행 라벨·검색어·gl·hl·개수).
- LLM 모델 UI: **Claude 모델 드롭다운** (provider는 claude 고정, 모델만 선택).
- 비주얼: **라이트 금융 대시보드**.

## A. 공통 비주얼 시스템

빌드 도구 없이 각 CSS 파일 상단에 동일한 CSS 커스텀 프로퍼티(디자인 토큰)를 선언한다.

```
--bg: #f6f8fa;        /* 앱 배경 */
--surface: #ffffff;   /* 카드/모달 표면 */
--border: #e6e8eb;
--text: #1a2233;
--muted: #6b7280;
--accent: #2563eb;    /* 딥 블루 */
--accent-weak: #eaf1ff;
--radius: 12px;
--shadow: 0 1px 2px rgba(16,24,40,.06), 0 4px 12px rgba(16,24,40,.06);
```

- 폰트: system-ui 스택. 날짜/개수 등 수치는 `font-variant-numeric: tabular-nums`.
- 카드: `--surface` + 1px `--border` + `--radius` + `--shadow`, hover 시 미세 상승/보더 강조.
- 모바일 우선: 1열 기본 → `@media (min-width:720px)` 다열. 탭 타깃 ≥44px. 상단 sticky 헤더.
- 버튼: 기본(보조)·프라이머리(--accent 배경) 두 종류. 포커스 링 접근성 확보.

## B. 증시 브리핑 생성 도구 (`tools/templates/index.html`, `tools/static/generate.{js,css}`)

요구사항 → 구현:

1. **모드 뱃지**: 검색 입력 앞에 현재 모드를 표시 — `A · Serper`(기본) / `B · LLM`. LLM 토글(스위치) 상태에 연동되어 실시간 갱신.
2. **배포 카드 수**: 배포 버튼 라벨을 **"배포 (N)"** 로 표시, N = 현재 보드 카드 수. 카드 추가/삭제/배포 시 갱신.
3. **버튼명 변경**: `검색 추가` → **검색**, `남긴 카드 배포` → **배포**.
4. **설정 버튼(⚙️) + 모달**:
   - **테마 설정(완전 편집형)**: 각 행 `라벨 / 검색어(query) / 지역(gl) / 언어(hl) / 개수(count)`. 행 추가·삭제. 기본값: 미국(US stock market, gl=us, hl=en, 3), 한국(한국 증시, gl=kr, hl=ko, 3).
   - **LLM 모델 드롭다운**: `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`. 모드 B 요약에 사용.
   - 저장 시 localStorage 반영. 취소/저장 버튼. 모달은 오버레이+중앙(모바일 풀스크린).
5. 진입 시 저장된 테마로 후보 자동 로드. 저장된 설정 없으면 서버 기본.

동작 유지: 카드 편집(제목/요약/상세, contenteditable)·삭제, fetch 에러 처리, XSS `esc()`/`safeUrl()`.

## C. 증시 브리핑 아카이브 (`index.html`, `app.js`, `style.css`)

- 카드 인덱스·상세 모달을 공통 비주얼로 재디자인.
- **날짜 필터**: 년/월/일 **드롭다운(계단식)**, 각 "전체" 옵션 포함.
  - 옵션은 로드된 `briefings`의 `date`(YYYY-MM-DD)에서 생성.
  - 년 선택 → 월 옵션 갱신, 월 선택 → 일 옵션 갱신. 필터 적용 후에도 최신순(날짜 역순) 유지.
  - 필터 결과 0건이면 안내 문구.
- XSS `esc()`/`safeUrl()` 유지.

## D. 백엔드 변경 (`tools/app.py`, 테스트 갱신)

- **`/api/trends`**: `GET` → **`POST`** 로 변경. body `{ "themes": [ {label,query,gl,hl,count} ] }` 수용.
  - body가 없거나 `themes`가 비면 기존 기본(MARKET_QUERIES 미국/한국 ×3)으로 폴백.
  - 각 테마별로 `search_news(query, gl, hl, num=count)` 실행, 기사당 카드 1장 생성(모드 A), 카드 제목은 기사 제목.
- **`/api/search`**: 선택적 `model` 필드 수용. 모드 B에서 `get_summarizer(provider=..., model=...)` 로 전달, `generator.model`에 실제 사용 모델 기록.
- 나머지 엔드포인트(cards/publish) 불변.

## E. 설정 데이터 shape (localStorage 키: `briefing-settings`)

```json
{
  "themes": [
    {"label": "미국 증시", "query": "US stock market", "gl": "us", "hl": "en", "count": 3},
    {"label": "한국 증시", "query": "한국 증시", "gl": "kr", "hl": "ko", "count": 3}
  ],
  "model": "claude-sonnet-5"
}
```

## 비목표 (Out of Scope)

- 실제 provider 추가(Gemini 등) — 모델 드롭다운은 Claude 계열만.
- 설정의 서버 영속화 / 다중 사용자.
- 아카이브의 키워드/전문 검색(날짜 필터만).
- 가격/차트 데이터.

## 수용 기준 (요약)

- 두 페이지가 공통 토큰 기반의 라이트 대시보드로 보이고 모바일 1열/데스크톱 다열로 반응.
- 생성 도구: 모드 뱃지 표시, 배포 버튼에 카드 수, 버튼명 변경, ⚙️ 설정 모달에서 테마 행 편집·모델 선택 후 저장→localStorage→다음 로드/검색에 반영.
- 아카이브: 년/월/일 드롭다운으로 필터링 동작, 최신순 유지.
- `/api/trends`(POST, themes) 및 `/api/search`(model) 백엔드 반영 + 테스트 갱신, 전체 스위트 통과.
