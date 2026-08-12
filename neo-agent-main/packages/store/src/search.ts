/**
 * 대화 검색 — `docs/SEARCH.md` §4.
 *
 * **범위 판정 전체가 한 쿼리 안에 있다.** tip 해석·`active` 판정·dedupe·정렬·`LIMIT`이
 * 전부 SQL 안에서 일어나는 것이 §4의 요구다 — "제외는 **조회 조건이지 사후 필터가
 * 아니다**"(SESSION-STORE §5의 같은 판정 준용). 애플리케이션에서 걸러 내면 삭제된
 * 체인의 매치가 `limit` 자리를 소비해, 사용자에게는 멀쩡한 대화가 검색에서 사라진
 * 것으로 보인다.
 *
 * 검색은 **읽기 전용이고 표시 전용**이다(§1). 결과는 모델 컨텍스트에 들어가지 않으므로
 * 프롬프트 캐시·컨텍스트 예산에 무영향이며, 저장소는 여기서 아무것도 쓰지 않는다.
 */

import type { DatabaseSync } from "node:sqlite";
import { integerParam, textParam } from "./bind.ts";

export interface SearchOptions {
  /** 기본 20 (조정 가능 영역 — §4) */
  limit?: number;
}

export interface SearchHit {
  messageId: string;
  /** 매치가 발견된 세션 — superseded 부모일 수 있다 */
  sessionId: string;
  /** 이 매치가 속한 압축 체인의 tip — 재개 가능한 유일한 세션 */
  chainTipId: string;
  chainTipTitle: string | null;
  /** 색인 대상이 두 역할뿐이므로 닫힌다(§3) */
  role: "user" | "assistant";
  /** 매치 주변 발췌. 매치 구간이 `SNIPPET_MARK_*`로 감싸인다 */
  snippet: string;
  timestamp: number;
}

/**
 * 스니펫의 매치 구간 마커 — **store가 넣고 CLI가 색상으로 치환한다**(§4).
 *
 * 제어문자를 고른 근거는 사용자 텍스트에 나타날 확률이 사실상 0이라는 것이다. 상수로
 * 내보내는 이유는 문자 선택이 한 곳에만 남아야 하기 때문이다 — CLI 렌더러와 QA가
 * 이것을 참조하므로, 값이 바뀌어도 고칠 곳이 여기뿐이다.
 *
 * **소스에는 실문자가 아니라 이스케이프로 쓴다.** 실제 제어문자를 넣으면 파일이
 * 바이너리로 인식돼 grep·diff·리뷰가 깨진다.
 */
export const SNIPPET_MARK_START = "\u0002";
export const SNIPPET_MARK_END = "\u0003";

/** §4 — 조정 가능 영역 */
const DEFAULT_LIMIT = 20;

/**
 * trigram 토크나이저가 매치할 수 있는 최소 길이. 이보다 짧으면 FTS는 **0건**을
 * 돌려주므로 LIKE로 라우팅한다 — 한국어 2자 단어("압축"·"설정"·"삭제")가 흔해서
 * 이 폴백은 부속이 아니라 요구사항이다(§4·§7).
 */
const MIN_FTS_QUERY_LENGTH = 3;

/**
 * 매치 앞뒤로 남길 문맥 문자 수 (조정 가능 영역 — §4·§8).
 *
 * 40자로 잡은 근거는 화면 폭이다. 한 hit은 `앞 40 + 매치 + 뒤 40`이라 한국어 기준
 * 대략 두 줄, 80열 터미널에서 접두·title·날짜와 함께 놓아도 한 항목이 화면을 넘기지
 * 않는다. 더 넓히면 결과 20건이 한 화면에 안 들어오고, 좁히면 매치가 어떤 문장에서
 * 났는지 알 수 없어진다.
 */
const SNIPPET_CONTEXT = 40;

/** 잘려 나간 앞뒤가 있음을 알린다 — 발췌를 문장 전체로 오해하지 않게 */
const ELLIPSIS = "…";

/**
 * `LIKE`의 이스케이프 문자. 백슬래시 자체도 이스케이프 대상이므로 `%`·`_`와 함께
 * 셋 다 앞에 붙인다 — 하나라도 빠지면 사용자 입력이 와일드카드로 새어 나간다.
 */
const LIKE_ESCAPE = "\\";

/**
 * 체인 tip 해석 + 범위 판정의 공통 골격. FTS 경로와 LIKE 폴백이 **같은 골격에 술어와
 * 정렬만 갈아 끼운다** — 두 경로의 범위 규칙이 어긋날 자리를 만들지 않는다.
 *
 * **`walk`의 시드가 "히트가 난 세션"이다.** 전 세션에서 시드하면 세션 수에 비례해
 * 매번 계보 전체를 걷는다. 2026-08-07 실측(세션 200·FTS 4,000행, 30회 평균):
 * 희소 질의에서 전 세션 시드 0.37ms vs 히트 시드 0.14ms, 다건 질의에서는 51.8ms vs
 * 53.1ms로 동률이었고 **결과는 완전히 동일**했다. 즉 히트 시드가 전 세션 시드를
 * 지배한다.
 *
 * **chainTip 해석은 재귀 CTE 1회이고 애플리케이션 측 해석이 아니다** — `SEARCH.md` §8이
 * 판정 ES-33으로 닫았다. 같은 실측에서 앱 측 해석이 다건 질의에서 8배 빨랐다(6.4ms vs
 * 53.1ms — 인덱스 없는 CTE와의 조인과 `ROW_NUMBER()` 윈도 계산이 원인이며 재귀 자체는
 * 아니다). 그럼에도 SQL을 택한 근거는 속도가 아니라 **계약이 있는 위치**다: tip 해석·
 * `active` 판정·dedupe·정렬·`LIMIT`이 한 쿼리 안에 있어야 "제외는 조회 조건이지 사후
 * 필터가 아니다"가 구조로 지켜진다. 앱 측으로 옮기면 같은 규칙이 JS 문장 순서에
 * 의존하게 되고, 나중에 필터와 슬라이스 순서가 조용히 뒤바뀔 자리가 생긴다. 실사용
 * 규모(메시지 수백)에서 두 방식 모두 1ms 미만이므로 성능은 판정 근거가 되지 못했다.
 *
 * `distance`는 매치가 난 세션에서 tip까지의 거리다. dedupe가 이 값의 최솟값을 고르므로
 * 대표 행은 **체인 tip에 가까운 쪽**이 된다(§4).
 */
function buildSearchSql(predicate: string, score: string, order: string): string {
  return `
WITH RECURSIVE
  hit AS (
    SELECT message_id, session_id, text, ${score} AS score
      FROM messages_fts
     WHERE ${predicate}
  ),
  walk(origin_id, node_id, distance) AS (
    SELECT DISTINCT session_id, session_id, 0 FROM hit
    UNION ALL
    SELECT walk.origin_id, sessions.id, walk.distance + 1
      FROM walk JOIN sessions ON sessions.parent_session_id = walk.node_id
  ),
  chain_tip AS (
    SELECT origin_id, node_id AS tip_id, distance
      FROM walk
     WHERE NOT EXISTS (
             SELECT 1 FROM sessions child WHERE child.parent_session_id = walk.node_id
           )
  ),
  scoped AS (
    SELECT hit.message_id       AS message_id,
           hit.session_id       AS session_id,
           hit.text             AS text,
           hit.score            AS score,
           chain_tip.tip_id     AS tip_id,
           tip.title            AS tip_title,
           messages.role        AS role,
           messages.timestamp   AS timestamp,
           ROW_NUMBER() OVER (
             PARTITION BY hit.message_id
             ORDER BY chain_tip.distance ASC, hit.session_id ASC
           ) AS rn
      FROM hit
      JOIN chain_tip ON chain_tip.origin_id = hit.session_id
      JOIN sessions tip ON tip.id = chain_tip.tip_id
      JOIN messages ON messages.session_id = hit.session_id
                   AND messages.id = hit.message_id
     WHERE tip.active = 1
  )
SELECT message_id, session_id, tip_id, tip_title, role, timestamp, text
  FROM scoped
 WHERE rn = 1
 ORDER BY ${order}
 LIMIT ?`;
}

/**
 * FTS 경로 — 정렬은 rank(bm25)다(§4). bm25는 더 음수일수록 좋은 매치이므로 오름차순이
 * "관련 높은 것 먼저"가 된다. 동점은 최신 우선으로, 그마저 같으면 id로 가른다 —
 * **같은 질의가 늘 같은 순서를 내야** 사용자에게 검색이 재현 가능해 보인다.
 */
const FTS_SQL = buildSearchSql(
  "messages_fts MATCH ?",
  "bm25(messages_fts)",
  "score ASC, timestamp DESC, message_id ASC",
);

/**
 * LIKE 폴백 경로 — `messages_fts`에 저장된 텍스트를 그대로 훑는다(§4).
 *
 * **폴백의 정렬은 `timestamp` 내림차순이다** — `SEARCH.md` §4가 정한다(판정 ES-34 /
 * QA-A A-7). §4의 "rank(bm25) 기본"은 이 경로에 적용할 수 없다 — MATCH를 쓰지 않으므로 bm25가 없다.
 * 최신 우선을 고른 근거 둘: (1) 순위 근거가 없을 때 "최근 것부터"가 사용자 기대에
 * 가장 가깝고, (2) §4가 날짜 정렬을 "지금 안 만든다"고 한 것은 **사용자에게 노출할
 * 옵션**에 대한 판정이지 폴백 내부 규칙에 대한 것이 아니다. 두 경로의 정렬이 다른
 * 것은 사실이나 사용자에게는 어느 쪽도 "찾은 것들"로 보이고, 폴백 여부는 결과에
 * 표시하지 않는다는 §4의 판정과도 충돌하지 않는다.
 */
const LIKE_SQL = buildSearchSql(
  `text LIKE ? ESCAPE '${LIKE_ESCAPE}'`,
  "0",
  "timestamp DESC, message_id ASC",
);

interface SearchRow {
  message_id: unknown;
  session_id: unknown;
  tip_id: unknown;
  tip_title: unknown;
  role: unknown;
  timestamp: unknown;
  text: unknown;
}

/**
 * 트랜스크립트 전문에서 질의를 찾는다. 결과는 관련도 순(폴백은 최신 순)이다.
 *
 * **질의는 언제나 리터럴이다**(§4) — FTS5 쿼리 문법을 노출하지 않는다. `AND`/`OR`/
 * `NEAR`/`*`를 문법으로 해석하는 것의 유일한 효과는 개인 유저 1명에게 문법 에러 화면을
 * 보여 주는 것이다. 어떤 사용자 입력도 쿼리 에러를 내지 않아야 한다.
 *
 * **범위**(§4): superseded 부모 **포함**(압축 전 원문이 거기 있다 — 빼면 압축할수록
 * 검색이 빈다), soft-delete 체인 **제외**(`/delete`의 "지웠다"와 검색 재등장이
 * 모순되지 않게), 같은 `message_id`는 **1회**(부모 원본과 자식 복사본은 같은 메시지다).
 */
export function searchMessages(
  db: DatabaseSync,
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const needle = textParam(query, "search query");

  // **빈 질의는 빈 결과다**(§4 — ES-35). §5가 빈 질의를 CLI의 사용법 에러로 정했으므로
  // 정상 경로로는 여기 닿지 않는다. 그래도 닫아 두는 이유는 폴백 경로의 `LIKE '%%'`가
  // **전 메시지에 매치**하기 때문이다 — 저장소가 "아무것도 안 물었는데 전부 돌려주는"
  // 형상을 갖지 않게 한다. 던지지 않는 것은 §4의 "어떤 입력도 에러를 내지 않는다"와
  // 결을 맞춘 것이다.
  //
  // **판정 기준이 `trim()`인 것은 공백 하나가 같은 구멍이기 때문이다**(2026-08-07 QA-B
  // B-13 실측). 모든 문서가 공백을 포함하므로 `" "` 질의의 `LIKE '% %'`는 전 메시지에
  // 매치한다 — 길이만 보면 위 방어를 그대로 통과한다.
  //
  // **트림한 값은 판정에만 쓰고 검색은 원본 `needle`로 한다.** 질의를 트림해서 넘기면
  // "질의는 항상 리터럴"(§4)이 깨진다 — 앞뒤 공백을 의도적으로 포함한 검색(예: 들여쓰기가
  // 붙은 코드 조각)이 조용히 다른 질의가 되어 버린다. 사용자 입력에 딸려 온 공백을
  // 정리하는 것은 CLI의 몫이고(§5), 여기는 저장소의 방어선이다 — 두 층이 각자의 이유로
  // 처리하며 서로를 대신하지 않는다.
  if (needle.trim().length === 0) return [];

  const limit = resolveLimit(options.limit);

  const rows = (needle.length < MIN_FTS_QUERY_LENGTH
    ? db.prepare(LIKE_SQL).all(likePattern(needle), limit)
    : db.prepare(FTS_SQL).all(ftsPhrase(needle), limit)) as unknown as SearchRow[];

  return rows.map((row) => toSearchHit(row, needle));
}

/**
 * **0 이하·비정수 `limit`은 기본값으로 취급한다** — `SEARCH.md` §4가 정한다
 * (판정 ES-36 / QA-A A-8).
 *
 * `listSessions`는 음수 LIMIT을 "제한 없음"으로 쓰는 SQLite 관례에 기대고 있어
 * (`sessions.ts`의 `NO_LIMIT`), 같은 값을 여기로 흘리면 **전량 반환**이 된다. 검색은
 * 목록과 달리 매치 수의 상한이 없으므로 그 사고의 크기가 다르다. 던지지 않는 이유는
 * `/search`의 인자가 질의 문자열뿐이라(§5) 이 값이 사용자 입력에서 오는 경로가 지금
 * 없기 때문이다 — 호출자의 실수를 조용한 전량 반환으로 갚지 않는 선에서 닫았다.
 */
function resolveLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit <= 0) return DEFAULT_LIMIT;
  return integerParam(limit, "search limit");
}

/**
 * 질의를 FTS5 phrase 하나로 감싼다 — 내부 `"`는 `""`로 이스케이프한다(§4).
 *
 * 이 한 겹이 "문법 비노출"의 전부다. phrase 안에서는 `*`·`AND`·`(`·`^`·`NEAR`가
 * 전부 보통 문자이므로, 어떤 입력이 와도 파서가 거부하지 않는다.
 */
function ftsPhrase(query: string): string {
  return `"${query.replaceAll('"', '""')}"`;
}

/**
 * `LIKE` 패턴. 와일드카드(`%`·`_`)와 이스케이프 문자 자신을 전부 막는다 — 하나라도
 * 빠지면 `50%`를 찾는 사용자가 `50`으로 시작하는 모든 메시지를 받는다.
 */
function likePattern(query: string): string {
  const escaped = query.replaceAll(LIKE_ESCAPE, `${LIKE_ESCAPE}${LIKE_ESCAPE}`);
  return `%${escaped.replaceAll("%", `${LIKE_ESCAPE}%`).replaceAll("_", `${LIKE_ESCAPE}_`)}%`;
}

function toSearchHit(row: SearchRow, query: string): SearchHit {
  const text = requireText(row.text, "text");
  return {
    messageId: requireText(row.message_id, "message_id"),
    sessionId: requireText(row.session_id, "session_id"),
    chainTipId: requireText(row.tip_id, "tip_id"),
    chainTipTitle:
      row.tip_title === null || row.tip_title === undefined
        ? null
        : requireText(row.tip_title, "tip_title"),
    role: requireRole(row.role),
    snippet: makeSnippet(text, query),
    timestamp: requireInteger(row.timestamp, "timestamp"),
  };
}

/**
 * 매치 주변 발췌 — **애플리케이션이 만든다. FTS5 `snippet()`이 아니다**(§4).
 *
 * 근거는 2026-08-07 실측이다: trigram 토크나이저에서 `snippet()`은 문자 하나하나를
 * 개별 토큰으로 보아 **발췌 전 구간의 모든 문자를 마커로 감싼다** — 매치 구간 표시라는
 * 목적 자체가 성립하지 않는다. 이것은 trigram 채택의 대가이지 `snippet()`의 결함이
 * 아니다(unicode61이었다면 정상 동작했을 것이다).
 *
 * 대안이 단순한 이유는 **질의가 언제나 리터럴이기 때문**이다(§4) — 질의 문자열은
 * 매치된 텍스트에 그대로 존재한다. 부수 효과로 FTS 경로와 LIKE 폴백이 같은 함수를
 * 쓰게 된다. `snippet()`은 폴백에서 쓸 수 없으므로 원안대로였다면 표시 코드가 두
 * 벌이 됐을 것이다.
 *
 * **발췌 구간을 정하는 것은 첫 매치이고, 마킹은 그 구간 안의 매치 전부다**(§4 —
 * 2026-08-07 QA-B B-12 판정). 첫 매치만 강조하면 나머지가 평문처럼 보여 사용자가
 * "이 결과가 왜 걸렸는지"를 헷갈린다. 발췌 안의 매치 밀도는 관련도 신호이므로 버리지
 * 않는다.
 */
function makeSnippet(text: string, query: string): string {
  // 줄바꿈이 섞인 발췌는 목록 한 줄을 깨뜨린다. 여러 `TextContent`가 `"\n\n"`으로
  // 결합돼 있으므로(§3) 이 접기는 예외가 아니라 통상 경로다.
  const flat = text.replace(/\s+/g, " ").trim();
  const at = indexOfIgnoreCase(flat, query, 0);

  // 매치를 못 찾는 경우 — trigram의 대소문자·정규화 처리가 리터럴 탐색과 어긋나는
  // 가장자리다. 마커 없이 머리를 보여 준다: 스니펫이 비는 것보다 낫고, 어느 메시지가
  // 걸렸는지는 여전히 읽힌다.
  if (at === -1) return clip(flat, 0, SNIPPET_CONTEXT * 2);

  // 창의 기준은 **첫 매치**다. 뒤쪽 매치까지 담으려 창을 늘리면 스니펫 길이가 본문에
  // 따라 들쭉날쭉해져 목록의 행 높이가 예측 불가능해진다.
  const from = Math.max(0, at - SNIPPET_CONTEXT);
  const to = Math.min(flat.length, at + query.length + SNIPPET_CONTEXT);

  return (
    (from > 0 ? ELLIPSIS : "") +
    markAll(flat.slice(from, to), query) +
    (to < flat.length ? ELLIPSIS : "")
  );
}

/**
 * 창 안의 매치를 **전부** 마커로 감싼다. 매치 구간의 **원문 대소문자를 보존한다** —
 * 찾을 때만 대소문자를 무시하고, 끼워 넣는 것은 언제나 원문 조각이다(질의 문자열을
 * 그대로 넣으면 사용자가 쓴 글자가 화면에서 변조된다).
 *
 * 매치는 겹치지 않는다 — 커서가 질의 길이만큼 전진하므로 `"aaa"`에서 `"aa"`는 1회다.
 * 겹침을 허용하면 마커가 서로를 가로질러 짝이 맞지 않는 출력이 나온다.
 */
function markAll(window: string, query: string): string {
  // 길이 0이면 `indexOf`가 언제나 0을 돌려주어 무한 루프가 된다. 호출자가 빈 질의를
  // 이미 막지만(§4), 그 방어가 이 함수의 종료 조건이 되게 두지 않는다.
  if (query.length === 0) return window;

  let marked = "";
  let cursor = 0;
  for (;;) {
    const at = indexOfIgnoreCase(window, query, cursor);
    if (at === -1) break;
    const end = at + query.length;
    marked +=
      window.slice(cursor, at) + SNIPPET_MARK_START + window.slice(at, end) + SNIPPET_MARK_END;
    cursor = end;
  }
  return marked + window.slice(cursor);
}

/**
 * `from`부터의 대소문자 무시 탐색. trigram이 대소문자를 무시하므로(2026-08-07 실측 —
 * `riverbank`/`RIVERBANK`/`RiverBank` 동일 매치) 발췌도 같은 기준이어야 한다.
 *
 * `toLowerCase()`가 길이를 바꾸는 문자가 있어(예: `"İ"` → 2자) 인덱스가 어긋날 수
 * 있다. 길이가 달라지면 대소문자 구분 탐색으로 물러난다 — 어긋난 위치에 마커를
 * 넣어 엉뚱한 구간을 강조하는 것보다 낫다.
 */
function indexOfIgnoreCase(text: string, query: string, from: number): number {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerText.length === text.length && lowerQuery.length === query.length) {
    return lowerText.indexOf(lowerQuery, from);
  }
  return text.indexOf(query, from);
}

function clip(text: string, from: number, length: number): string {
  const to = Math.min(text.length, from + length);
  return text.slice(from, to) + (to < text.length ? ELLIPSIS : "");
}

/**
 * DB에서 나온 값은 외부 입력처럼 다룬다(`sessions.ts`의 같은 방향). 조용히
 * `undefined`를 통과시키면 `SearchHit`의 타입이 거짓말이 된다.
 */
function requireText(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`Corrupt search row: ${name} should be TEXT, got ${describe(value)}.`);
  }
  return value;
}

function requireInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Corrupt search row: ${name} should be INTEGER, got ${describe(value)}.`);
  }
  return value;
}

/**
 * `role`이 두 값으로 닫히는 것은 색인 대상이 두 역할뿐이라는 §3의 결과다 — FTS 행이
 * 있는데 `toolResult`인 상황은 색인 규칙이 깨졌다는 뜻이므로 조용히 통과시키지 않는다.
 */
function requireRole(value: unknown): "user" | "assistant" {
  if (value === "user" || value === "assistant") return value;
  throw new Error(
    `Corrupt search row: role should be "user" or "assistant", got ${describe(value)}. ` +
      "Only those two roles are indexed (SEARCH.md §3) — a different role means the index drifted.",
  );
}

function describe(value: unknown): string {
  return value === null ? "NULL" : `${typeof value} ${JSON.stringify(value)}`;
}
