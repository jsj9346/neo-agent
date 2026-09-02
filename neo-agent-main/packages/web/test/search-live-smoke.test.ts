/**
 * T-013 — 검색 라이브 스모크 (opt-in).
 *
 * `TAVILY_API_KEY`가 **env에** 없으면 통째로 skip한다. 키 없이 `pnpm check`는 그린이어야
 * 하고, CI는 이 테스트에 의존하지 않는다. 선례는 `packages/providers/test/live-smoke.test.ts`다.
 *
 * **픽스처가 잡지 못하는 것 하나만 노린다**: 우리가 상수로 박은 엔드포인트·인증 헤더·응답
 * 필드 매핑이 **실제 와이어와 같은가.** 픽스처는 우리가 쓰므로 자기충족적이고, 특히
 * 필드 이름은 조용히 깨진다 — `search-normalize.ts`의 `toText`가 없는 필드를 빈 문자열로
 * 받으므로(`[미규정]` 처리, 계약이 열거한 탈락 사유 둘 밖에 세 번째를 만들지 않기 위한
 * 판정), 프로바이더가 `title`·`content`를 개명한 날 우리에게 보이는 것은 예외가 아니라
 * **제목 없는 결과**다. 그 자리는 여기서만 확인된다.
 *
 * **호출은 1회다.** 크레딧을 쓰는 실호출이고, 이 파일은 계약 축이 아니라 실측 도구다 —
 * 반복 호출·시나리오 확장은 넣지 않는다. 계약을 재는 것은 픽스처 축의 몫이다.
 *
 * ## 실행 절차 (수동 1회)
 *
 * ⚠️ **키는 env가 아니라 `~/.neo-agent/credentials`(600) 파일에 산다**(`docs/WEB-ACCESS.md`
 * §3.2 「시크릿」 · `docs/CLI-INTERFACE.md` §4). 그래서 아무것도 안 하면 이 파일은 **항상
 * skip**이다. 돌리려면 그 세션에서만 env로 실어 준다 — `neo-agent-main/`에서:
 *
 * ```sh
 * TAVILY_API_KEY="$(grep -m1 '^TAVILY_API_KEY=' ~/.neo-agent/credentials | cut -d= -f2- | tr -d "\"'")" \
 *   pnpm test packages/web/test/search-live-smoke.test.ts
 * ```
 *
 * 명령 치환으로 읽는 이유는 **키를 어디에도 타이핑하지 않기 위해서**다. 값을 셸에 붙여
 * 넣으면 히스토리에 남는다. 값을 `echo`하지 않고, 이 테스트의 출력·실행 리포트·devnote·
 * devlog **어디에도 키를 적지 않는다** — 적는 것은 저장 위치와 결과뿐이다.
 * (`cut -d= -f2-`는 값에 `=`가 있어도 자르지 않고, `tr`은 로더의 `unquote`와 같은 자리를
 * 덜어낸다. 파일 형식은 `KEY=value` — `packages/cli/src/credentials.ts`의 `parseDotenv`.)
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b. 아래 주석이 `neo-agent-main/docs/`의 설계 정본
 * 문면을 인용하는 자리에는 §3.4의 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼
 * 문면은 대상 문서에 문자 그대로 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고
 * 서술로 쓴다. 문서 지목은 줄번호가 아니라 절 번호와 필드 이름으로 한다.
 */

import { describe, expect, it } from "vitest";
import {
  normalizeSearchResponse,
  SEARCH_ENDPOINT,
  searchTransport,
  WEB_SEARCH_MAX_RESULTS,
  WEB_SEARCH_MAX_SUMMARY_CHARS,
} from "../src/index.ts";

const API_KEY = process.env.TAVILY_API_KEY;

/**
 * 짧고 안정적인 질의 하나. 결과가 계속 존재할 것이 거의 확실한 사실 질의를 고른다 —
 * 시사 질의를 쓰면 0건이 프로바이더 사정으로도 날 수 있어 스모크가 재는 것이 흐려진다.
 * 질의 문자열 자체가 프로바이더에게 나가므로(§6) 민감한 내용을 담지 않는다.
 */
const QUERY = "what is the capital of france";

describe.skipIf(!API_KEY)("라이브 스모크 — 실제 검색 API (opt-in)", () => {
  it("짧은 질의 1회가 200으로 돌아오고 결과가 제목·URL·요약의 모양으로 온다", {
    timeout: 30_000,
  }, async () => {
    // 이 한 줄이 엔드포인트 상수와 인증 헤더를 함께 잰다. 둘 중 하나라도 와이어와
    // 다르면 여기서 200이 오지 않는다 — 성공 자체가 그 둘의 확인이다.
    // 엔드포인트는 인자가 아니라 상수이므로(§3.2 "엔드포인트는 상수다") 여기서
    // 고를 것도 없다. 상수의 값은 아래에서 사유 문자열로만 다시 드러낸다.
    const outcome = await searchTransport({ query: QUERY, apiKey: API_KEY as string });

    // 실패를 "그냥 실패"로 뭉개지 않는다(`ARCHITECTURE.md` §2.6). 닫힌 유니온의
    // 이름과 사유를 그대로 드러내야 인증 실패인지 한도 초과인지 전송 문제인지가
    // 실행자에게 보인다 — 그 구분이 다음 행동을 가른다(§3.2).
    // 사유 문자열은 전송이 상태 코드로 지은 우리 문장이라 키가 실리지 않는다.
    expect(
      outcome.ok ? null : `${outcome.kind}: ${outcome.reason} (${SEARCH_ENDPOINT})`,
    ).toBeNull();
    if (!outcome.ok) return;

    // ── 와이어의 필드 이름 — 개명이 조용히 지나가는 유일한 자리 ──────────────
    // 정규화가 읽는 것은 `results[].url`·`.title`·`.content` 셋이다. 이름이 바뀌면
    // `toText`가 빈 문자열을 돌려주므로 예외 없이 통과해 버린다. 그래서 매핑의
    // 입력 쪽을 여기서 직접 단정한다.
    const raw: unknown = outcome.json;
    expect(typeof raw === "object" && raw !== null).toBe(true);
    if (typeof raw !== "object" || raw === null) return;

    const results: unknown = (raw as { results?: unknown }).results;
    expect(Array.isArray(results)).toBe(true);
    if (!Array.isArray(results)) return;
    expect(results.length).toBeGreaterThan(0);

    const first = results[0] as Record<string, unknown>;
    expect(typeof first.url).toBe("string");
    expect(typeof first.title).toBe("string");
    expect(typeof first.content).toBe("string");

    // ── 정규화까지 통과한 모양 — §3.2가 정한 반환 범위 ────────────────────────
    // 순수 함수라 네트워크를 다시 타지 않는다. 위에서 받은 같은 응답을 먹인다.
    const normalized = normalizeSearchResponse(outcome.json);
    expect(normalized.kind).toBe("items");
    if (normalized.kind !== "items") return;

    // 결과 수는 상수로 유계다(§3.2 "결과 수는 상수로 유계다" · §8의 5).
    expect(normalized.items.length).toBeGreaterThan(0);
    expect(normalized.items.length).toBeLessThanOrEqual(WEB_SEARCH_MAX_RESULTS);

    // 회계는 조건 없이 항상 선다 — 실물 응답에서도 수가 맞물리는지 본다.
    expect(normalized.accounting.kept).toBe(normalized.items.length);
    expect(normalized.accounting.received).toBeGreaterThanOrEqual(normalized.accounting.kept);

    // URL은 전건 https로 파싱된 것이어야 한다(§3.2 — 정규화가 그 밖을 버린다).
    expect(normalized.items.every((item) => item.url.startsWith("https://"))).toBe(true);
    expect(
      normalized.items.every((item) => item.summary.length <= WEB_SEARCH_MAX_SUMMARY_CHARS),
    ).toBe(true);

    // **"결과 1건 이상"이 계약이 요구하는 최소다.** 전건에 제목·요약이 차 있기를
    // 요구하지 않는 이유는 그것이 프로바이더의 페이지 사정(제목 없는 문서)으로도
    // 붉어져 실측 도구가 거짓 경보를 내기 때문이다. 필드 개명은 위의 와이어 단정이
    // 이미 정확히 잡으므로, 여기서 더 조이면 얻는 것 없이 흔들림만 는다.
    expect(normalized.items.some((item) => item.title.length > 0 && item.summary.length > 0)).toBe(
      true,
    );
  });
});
