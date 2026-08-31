/**
 * 출처 검증 관문 — 독립 계약 검증.
 *
 * 정본은 `docs/WEB-UI.md` §4.1(결정 2·3·4·5·6 · 절 말미의 강제 수단)과 §7(승인 id 항)이고,
 * 곁따라 §2.3(축의 방향)·§2.1·§9.1(결정 5가 든 라우트 둘)이다.
 *
 * **기대값은 구현이 아니라 정본에서만 도출했다.** 이 파일을 쓰는 동안 `src/origin.ts`와
 * `src/server.ts`의 본문을 열지 않았다 — 임포트한 이름의 출처는
 * `plans/20260831-webui-41-origin-gate-signature.md`이고 그 파일은 이름만 든다. 구현이 문서와
 * 다르면 이 파일은 문서 편에 선다.
 *
 * ## 모집단이 닫힌 표다
 *
 * §4.1 강제 수단이 이 파일의 모집단을 직접 열거한다 — 거절해야 할 조합 여섯과 통과해야 할
 * 조합 넷을 *"전수로 열거한다"*. 그래서 아래 두 스위트의 `it` 수가 각각 여섯과 넷이고, 그
 * 수 자체를 마지막 축이 다시 잰다. 같은 절이 그 근거를 *"모집단이 닫힌 표라"*로 적었다.
 * 판정 사유의 모집단도 닫혀 있다 — 아래 표가 드는 사유 집합과 `origin.ts`가 선언한 유니온의
 * 동일성을 재는 축이 있다.
 *
 * ## 축의 방향
 *
 * 전부 §2.3이 가른 둘 중 필수인 이름이 있는가를 묻는 대조 쪽이다 — 못 찾으면 붉는다. 금지된
 * 표기를 찾는 스캔은 이 파일에 없다.
 *
 * ## 이 파일이 재지 않는 것
 *
 * - **결정 5의 나머지 절반** — 안전한 메서드로 디스패처가 안 불린다는 것은 조립이 사는
 *   자리에서만 재진다(`packages/cli`). 여기서 재는 것은 라우트 상수 대조뿐이다.
 * - **결정 1·7** — 인증이 아니라는 것과 막지 못하는 것 넷은 문서 대조의 몫이다.
 * - **거절 본문의 문면** — 결정 6이 사유를 적으라고만 했고 어떤 문자열인지는 세부다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의 대조
 * 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는 부분
 * 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 문서를 지목하는 자리는 절 번호와
 * 필드 이름으로 하고 줄번호로 하지 않는다.
 */

import { readdirSync, readFileSync } from "node:fs";
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentEventListener, Unsubscribe } from "@neo-agent/core";
import { afterEach, describe, expect, it } from "vitest";
import { createApprovalRegistry } from "../src/approvals.ts";
import { ASSET_MANIFEST } from "../src/assets.ts";
import { checkOrigin, type OriginCheckInput, type OriginRejectionReason } from "../src/origin.ts";
import * as serverModule from "../src/server.ts";
import {
  createServeServer,
  DEFAULT_PORT,
  LOOPBACK_HOST,
  METHOD_PATH,
  type PlainRequest,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_PARAM,
  type ServeServer,
  STREAM_PATH,
  type StreamOpen,
} from "../src/server.ts";

const SRC_DIR = fileURLToPath(new URL("../src/", import.meta.url));
const SERVER_SRC = fileURLToPath(new URL("../src/server.ts", import.meta.url));
const ORIGIN_SRC = fileURLToPath(new URL("../src/origin.ts", import.meta.url));
const DOCS_DIR = fileURLToPath(new URL("../../../docs/", import.meta.url));

/* ------------------------------------------------------------------------ *
 * 기대값 — 전부 §4.1에서 짓는다
 * ------------------------------------------------------------------------ */

/**
 * 결정 2의 허용 집합 둘. **실주소에서 짓는다** — 정본이 그 근거를 든 자리가
 * *"허용 집합 둘을"*로 시작하는 문장이고, 값의 출처는 *"바인드된 실주소"*다.
 */
const allowedHosts = (port: number): readonly string[] => [
  `127.0.0.1:${port}`,
  `localhost:${port}`,
];
const allowedOrigins = (port: number): readonly string[] => [
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
];

/** 결정 3 — 안전한 메서드는 GET·HEAD이고 나머지 전부가 안전하지 않은 메서드다 */
const SAFE_METHODS = ["GET", "HEAD"] as const;

/**
 * 결정 3이 낸 거절 사유의 모집단. 이름의 출처는 T-001의 공개 시그니처 문면이고, 이 일곱이
 * 결정 3의 세 검사가 실패하는 갈래 전부다 — 검사 1 둘(부재·불허), 검사 2 둘(부재·비json),
 * 검사 3 셋(불허 오리진 · 둘 다 부재 · same-origin 아님).
 */
const REJECTION_REASONS: readonly OriginRejectionReason[] = [
  "host-missing",
  "host-not-allowed",
  "content-type-missing",
  "content-type-not-json",
  "origin-not-allowed",
  "origin-and-sec-fetch-site-missing",
  "sec-fetch-site-not-same-origin",
];

/* ------------------------------------------------------------------------ *
 * 도구 — 코어 대역 · 서버 기동 · 임의 헤더 요청
 * ------------------------------------------------------------------------ */

/**
 * 코어 대역. `subscribe` 하나만 든다.
 *
 * **파일-로컬 복제다.** 같은 형태가 `packages/serve/test/server.contract.test.ts`에 있고
 * 공유하지 않았다 — 이 파일의 계약 판정이 다른 테스트의 헬퍼 변경에 끌려가지 않게 한다.
 */
class AgentDouble {
  readonly listeners: AgentEventListener[] = [];

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.listeners.push(listener);
    return () => {
      const at = this.listeners.indexOf(listener);
      if (at !== -1) this.listeners.splice(at, 1);
    };
  }
}

type Harness = {
  readonly server: ServeServer;
  readonly port: number;
  /** 관문을 지나 스트림 개설에 닿은 요청들 (결정 4) */
  readonly opened: StreamOpen[];
  /** 관문을 지나 디스패치 갈래에 닿은 요청들 (결정 4) */
  readonly plain: PlainRequest[];
};

const started: ServeServer[] = [];

afterEach(async () => {
  while (started.length > 0) {
    const server = started.pop();
    if (server === undefined) continue;
    await server.close().catch(() => undefined);
  }
});

/**
 * 커널이 고른 포트에 실제로 바인드한다.
 *
 * **포트 0이 결정 2의 축이다** — 상수 포트를 재는 구현이면 아래 실포트 축이 붉는다.
 */
async function start(): Promise<Harness> {
  const opened: StreamOpen[] = [];
  const plain: PlainRequest[] = [];
  const server = createServeServer({
    host: LOOPBACK_HOST,
    port: 0,
    agent: new AgentDouble(),
    openStream: (open) => {
      opened.push(open);
      open.response.writeHead(200, { "content-type": "text/event-stream" });
      open.response.end();
    },
    handleRequest: (incoming) => {
      plain.push(incoming);
      incoming.response.writeHead(204);
      incoming.response.end();
    },
  });
  started.push(server);
  const address = await server.listen();
  return { server, port: address.port, opened, plain };
}

type Reply = {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
};

type Send = {
  readonly port: number;
  readonly path: string;
  readonly method?: string | undefined;
  readonly headers?: OutgoingHttpHeaders | undefined;
  readonly body?: string | undefined;
};

/**
 * 값이 `undefined`인 이름을 지운다.
 *
 * 「그 헤더가 없는 요청」을 만드는 유일한 수단이다 — `node:http`는 `undefined` 값을 실으려
 * 하면 던지므로, 이름을 아예 안 실어야 부재가 된다.
 */
function headersOf(headers: OutgoingHttpHeaders): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** 헤더를 통째로 우리가 짓는 요청. 브라우저가 붙이는 이름을 흉내 내는 자리다 */
function send(options: Send): Promise<Reply> {
  return new Promise<Reply>((resolve, reject) => {
    const outgoing = httpRequest(
      {
        host: LOOPBACK_HOST,
        port: options.port,
        path: options.path,
        method: options.method ?? "GET",
        headers: headersOf(options.headers ?? {}),
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({ status: response.statusCode ?? 0, headers: response.headers, body });
        });
      },
    );
    outgoing.on("error", reject);
    if (options.body !== undefined) outgoing.write(options.body);
    outgoing.end();
  });
}

/** 우리 화면의 정상 POST — 여기서 한 축만 비틀어 거절 조합을 만든다 */
function screenPost(port: number, override: OutgoingHttpHeaders = {}): Send {
  return {
    port,
    path: METHOD_PATH,
    method: "POST",
    headers: {
      host: `127.0.0.1:${port}`,
      origin: `http://127.0.0.1:${port}`,
      "content-type": "application/json",
      ...override,
    },
    body: "{}",
  };
}

/** 결정 6 — `access-control-` 접두를 가진 응답 헤더의 이름들 */
function corsHeaders(headers: IncomingHttpHeaders): string[] {
  return Object.keys(headers).filter((name) => name.toLowerCase().startsWith("access-control-"));
}

/** 결정 6 — 본문은 평문 한 줄이고 비어 있지 않다 */
function plainOneLine(body: string): { empty: boolean; lines: number } {
  const trimmed = body.replace(/\n+$/, "");
  return { empty: trimmed.trim().length === 0, lines: trimmed.split("\n").length };
}

/** 주석 본문을 공백으로 지운다(줄 수 보존). 파일-로컬 복제인 이유는 위 대역과 같다 */
function stripComments(source: string): string {
  let out = "";
  let index = 0;
  const blank = (text: string): string => text.replace(/[^\n]/g, " ");
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === "//") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    const char = source[index];
    if (char === '"' || char === "'" || char === "`") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) break;
        cursor += 1;
      }
      out += source.slice(index, Math.min(cursor + 1, source.length));
      index = Math.min(cursor + 1, source.length);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/* ------------------------------------------------------------------------ *
 * 묶음 1 — 순수 판정의 표 (결정 3·4)
 * ------------------------------------------------------------------------ */

/** `UNIT_PORT`는 이 표의 픽스처다. 계약은 값이 아니라 실주소에서 짓는다는 성질이다 */
const UNIT_PORT = 51_234;
const OTHER_PORT = 51_235;

type Expected = "ok" | OriginRejectionReason | "reject-unspecified";

type Row = {
  readonly label: string;
  readonly input: OriginCheckInput;
  readonly expected: Expected;
};

const base = (input: Partial<OriginCheckInput>): OriginCheckInput => ({
  method: "POST",
  host: `127.0.0.1:${UNIT_PORT}`,
  origin: `http://127.0.0.1:${UNIT_PORT}`,
  secFetchSite: undefined,
  contentType: "application/json",
  port: UNIT_PORT,
  ...input,
});

const ROWS: readonly Row[] = [
  /* 검사 1 — 모집단은 모든 요청이다 */
  {
    label: "안전한 메서드 · 허용 Host · 오리진도 미디어 타입도 없음 (주소창 내비게이션)",
    input: base({ method: "GET", origin: undefined, contentType: undefined }),
    expected: "ok",
  },
  {
    label: "안전한 메서드 HEAD · 허용 이름 localhost",
    input: base({
      method: "HEAD",
      host: `localhost:${UNIT_PORT}`,
      origin: undefined,
      contentType: undefined,
    }),
    expected: "ok",
  },
  {
    label: "안전한 메서드라도 Host가 없으면 거절이다 — 검사 1의 모집단은 모든 요청이다",
    input: base({ method: "GET", host: undefined, origin: undefined, contentType: undefined }),
    expected: "host-missing",
  },
  {
    label: "안전하지 않은 메서드 · Host 없음",
    input: base({ host: undefined }),
    expected: "host-missing",
  },
  {
    label: "접미사가 루프백으로 풀려도 허용하지 않는다 — foo.localhost",
    input: base({ host: `foo.localhost:${UNIT_PORT}` }),
    expected: "host-not-allowed",
  },
  {
    label: "도달 불가능한 갈래를 허용 집합에 두지 않는다 — [::1]",
    input: base({ host: `[::1]:${UNIT_PORT}` }),
    expected: "host-not-allowed",
  },
  {
    label: "정확 일치다 — 포트 없는 127.0.0.1은 허용 집합 밖이다",
    input: base({ host: "127.0.0.1" }),
    expected: "host-not-allowed",
  },
  {
    label: "정확 일치다 — 다른 포트의 127.0.0.1은 허용 집합 밖이다",
    input: base({ host: `127.0.0.1:${OTHER_PORT}` }),
    expected: "host-not-allowed",
  },
  {
    label: "리바인딩 — 공격자 도메인이 든 Host는 허용 집합 밖이다",
    input: base({ host: `attacker.example:${UNIT_PORT}` }),
    expected: "host-not-allowed",
  },
  {
    label: "정확 일치다 — 꼬리 공백이 붙은 값은 허용 집합의 원소가 아니다",
    input: base({ host: `127.0.0.1:${UNIT_PORT} ` }),
    expected: "host-not-allowed",
  },

  /* 검사 2 — 모집단은 안전하지 않은 메서드다 */
  {
    label: "안전하지 않은 메서드 · 미디어 타입 없음",
    input: base({ contentType: undefined }),
    expected: "content-type-missing",
  },
  {
    label: "폼 미디어 타입 — application/x-www-form-urlencoded",
    input: base({ contentType: "application/x-www-form-urlencoded" }),
    expected: "content-type-not-json",
  },
  {
    label: "폼 미디어 타입 — multipart/form-data",
    input: base({ contentType: "multipart/form-data; boundary=x" }),
    expected: "content-type-not-json",
  },
  {
    label: "폼 미디어 타입 — text/plain",
    input: base({ contentType: "text/plain" }),
    expected: "content-type-not-json",
  },
  {
    label: "미디어 타입에 파라미터가 붙어도 application/json이면 통과다",
    input: base({ contentType: "application/json; charset=utf-8" }),
    expected: "ok",
  },
  {
    label: "안전한 메서드는 검사 2의 모집단 밖이다 — 폼 미디어 타입이라도 통과다",
    input: base({
      method: "GET",
      contentType: "application/x-www-form-urlencoded",
      origin: undefined,
    }),
    expected: "ok",
  },

  /* 검사 3 — 모집단은 안전하지 않은 메서드다 */
  {
    label: "허용 오리진 — http://127.0.0.1:<실포트>",
    input: base({}),
    expected: "ok",
  },
  {
    label: "허용 오리진 — http://localhost:<실포트>",
    input: base({ host: `localhost:${UNIT_PORT}`, origin: `http://localhost:${UNIT_PORT}` }),
    expected: "ok",
  },
  {
    label: "허용 밖 오리진 — 공격자 도메인",
    input: base({ origin: "http://attacker.example" }),
    expected: "origin-not-allowed",
  },
  {
    label: "허용 밖 오리진 — 스킴이 다르다",
    input: base({ origin: `https://127.0.0.1:${UNIT_PORT}` }),
    expected: "origin-not-allowed",
  },
  {
    label: "허용 밖 오리진 — 포트가 다르다",
    input: base({ origin: `http://127.0.0.1:${OTHER_PORT}` }),
    expected: "origin-not-allowed",
  },
  {
    label: "허용 밖 오리진 — 불투명 오리진 null",
    input: base({ origin: "null" }),
    expected: "origin-not-allowed",
  },
  {
    label: "부재는 통과가 아니다 — 오리진도 Sec-Fetch-Site도 없다",
    input: base({ origin: undefined, secFetchSite: undefined }),
    expected: "origin-and-sec-fetch-site-missing",
  },
  {
    label: "오리진이 없으면 Sec-Fetch-Site가 정확히 same-origin이어야 한다",
    input: base({ origin: undefined, secFetchSite: "same-origin" }),
    expected: "ok",
  },
  {
    label: "Sec-Fetch-Site: cross-site",
    input: base({ origin: undefined, secFetchSite: "cross-site" }),
    expected: "sec-fetch-site-not-same-origin",
  },
  {
    label: "Sec-Fetch-Site: same-site",
    input: base({ origin: undefined, secFetchSite: "same-site" }),
    expected: "sec-fetch-site-not-same-origin",
  },
  {
    label: "Sec-Fetch-Site: none — 정확히 same-origin이 아니다",
    input: base({ origin: undefined, secFetchSite: "none" }),
    expected: "sec-fetch-site-not-same-origin",
  },

  /* 모집단 분할 — 나머지 전부가 안전하지 않은 메서드다 */
  {
    label: "PUT도 안전하지 않은 메서드다 — 셋을 만족하면 통과다",
    input: base({ method: "PUT" }),
    expected: "ok",
  },
  {
    label: "DELETE도 안전하지 않은 메서드다 — 미디어 타입이 없으면 거절이다",
    input: base({ method: "DELETE", contentType: undefined }),
    expected: "content-type-missing",
  },
  {
    label: "프리플라이트 모양의 OPTIONS — 미디어 타입 없이 교차 오리진에서 온다",
    input: base({ method: "OPTIONS", origin: "http://attacker.example", contentType: undefined }),
    expected: "reject-unspecified",
  },
  {
    label:
      "[미규정] 메서드 이름 자체가 없는 요청 — 안전한 메서드 둘 중 하나가 아니므로 거절이어야 한다",
    input: base({ method: undefined, origin: undefined, contentType: undefined }),
    expected: "reject-unspecified",
  },
];

describe("WEB-UI.md §4.1 결정 3·4 — 순수 판정의 닫힌 표", () => {
  for (const row of ROWS) {
    it(`판정 — ${row.label}`, () => {
      const verdict = checkOrigin(row.input);
      if (row.expected === "ok") {
        expect({ label: row.label, verdict }).toEqual({ label: row.label, verdict: { ok: true } });
        return;
      }
      if (row.expected === "reject-unspecified") {
        // [미규정] 정본이 이 조합의 **사유**를 정하지 않았다. 거절이라는 결과만 재고,
        // 어느 사유인지는 판정 필요로 리포트에 올린다.
        expect({ label: row.label, ok: verdict.ok }).toEqual({ label: row.label, ok: false });
        return;
      }
      expect({ label: row.label, verdict }).toEqual({
        label: row.label,
        verdict: { ok: false, reason: row.expected },
      });
    });
  }

  it("모집단 — 이 표가 사유 일곱을 하나도 빠뜨리지 않는다", () => {
    const covered = new Set(
      ROWS.map((row) => row.expected).filter(
        (expected): expected is OriginRejectionReason =>
          expected !== "ok" && expected !== "reject-unspecified",
      ),
    );
    expect([...covered].sort()).toEqual([...REJECTION_REASONS].sort());
  });

  it("모집단 — 사유 유니온이 이 파일이 아는 일곱으로 닫혀 있다", () => {
    // 여덟째 사유가 생기면 위 표가 그것을 안 재면서 초록으로 남는다. 그 자리를 닫는 축이다.
    const text = readFileSync(ORIGIN_SRC, "utf8");
    const start = text.indexOf("type OriginRejectionReason");
    expect(start, "origin.ts에서 사유 유니온 선언을 찾지 못했다 — 검사가 죽었다").toBeGreaterThan(
      -1,
    );
    const end = text.indexOf(";", start);
    const declared = [...text.slice(start, end).matchAll(/"([a-z-]+)"/g)].map((hit) => hit[1]);
    expect(declared.length, "유니온에서 리터럴을 1건도 못 읽었다 — 검사가 죽었다").toBeGreaterThan(
      0,
    );
    expect([...new Set(declared)].sort()).toEqual([...REJECTION_REASONS].sort());
  });

  it("역검증 — 이 표가 실제로 잡는다: 통과 행 하나를 비틀면 거절로 갈린다", () => {
    // 위 단언들이 공허하지 않다는 증거. 같은 입력이 Host 한 글자 차이로 통과와 거절을 가른다.
    const good = base({});
    expect(checkOrigin(good)).toEqual({ ok: true });
    expect(checkOrigin({ ...good, host: `127.0.0.2:${UNIT_PORT}` })).toEqual({
      ok: false,
      reason: "host-not-allowed",
    });
  });
});

/* ------------------------------------------------------------------------ *
 * 묶음 2 — 서버 레벨 거절 전수 (강제 수단의 여섯 · 결정 4 · 결정 6)
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §4.1 강제 수단 — 거절해야 할 조합 여섯", () => {
  /** 거절의 모양을 한자리에서 잰다 — 403 · 평문 한 줄 · 관문 뒤에 아무것도 안 닿았다 */
  async function expectRejected(harness: Harness, options: Send, label: string): Promise<Reply> {
    const reply = await send(options);
    expect({ label, status: reply.status }).toEqual({ label, status: 403 });
    // 결정 4 — 통과하지 못한 요청은 어느 갈래에도 도달하지 않는다.
    expect({ label, opened: harness.opened.length, plain: harness.plain.length }).toEqual({
      label,
      opened: 0,
      plain: 0,
    });
    // 결정 6 — 본문은 평문 한 줄이고 사유를 적는다.
    expect({ label, ...plainOneLine(reply.body) }).toEqual({ label, empty: false, lines: 1 });
    return reply;
  }

  it("거절 1 — 허용 밖 Host", async () => {
    const harness = await start();
    // 대표값 둘은 결정 2가 이름으로 든 것이다: 접미사 검사 금지와 도달 불가 갈래.
    for (const host of [`foo.localhost:${harness.port}`, `[::1]:${harness.port}`]) {
      await expectRejected(harness, screenPost(harness.port, { host }), host);
    }
  });

  it("거절 2 — 허용 밖 Origin", async () => {
    const harness = await start();
    await expectRejected(
      harness,
      screenPost(harness.port, { origin: "http://attacker.example" }),
      "허용 밖 Origin",
    );
  });

  it("거절 3 — Origin도 Sec-Fetch-Site도 없음", async () => {
    const harness = await start();
    await expectRejected(
      harness,
      screenPost(harness.port, { origin: undefined }),
      "Origin도 Sec-Fetch-Site도 없음",
    );
  });

  it("거절 4 — Sec-Fetch-Site: cross-site", async () => {
    const harness = await start();
    await expectRejected(
      harness,
      screenPost(harness.port, { origin: undefined, "sec-fetch-site": "cross-site" }),
      "Sec-Fetch-Site: cross-site",
    );
  });

  it("거절 5 — 폼 미디어 타입", async () => {
    const harness = await start();
    for (const contentType of [
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
      "text/plain;charset=UTF-8",
    ]) {
      await expectRejected(
        harness,
        { ...screenPost(harness.port, { "content-type": contentType }), body: "a=b" },
        contentType,
      );
    }
  });

  it("거절 6 — content-type 없음", async () => {
    const harness = await start();
    await expectRejected(
      harness,
      { ...screenPost(harness.port, { "content-type": undefined }), body: undefined },
      "content-type 없음",
    );
  });

  it("역검증 — 403은 관문의 산물이지 이 서버의 기본 응답이 아니다", async () => {
    // 위 여섯이 공허하지 않다는 증거. 같은 라우트가 헤더 하나 차이로 403과 통과를 가른다.
    const harness = await start();
    expect((await send(screenPost(harness.port, { host: "attacker.example" }))).status).toBe(403);
    expect((await send(screenPost(harness.port))).status).not.toBe(403);
  });
});

/* ------------------------------------------------------------------------ *
 * 묶음 3 — 서버 레벨 통과 전수 (강제 수단의 넷)
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §4.1 강제 수단 — 통과해야 할 조합 넷", () => {
  it("통과 1 — 우리 화면의 정상 요청", async () => {
    const harness = await start();
    const reply = await send(screenPost(harness.port));
    expect(reply.status).not.toBe(403);
    expect(harness.plain).toHaveLength(1);
  });

  it("통과 2 — 주소창 내비게이션", async () => {
    const harness = await start();
    // 브라우저가 주소창 이동에 붙이는 모양이다 — 안전한 메서드 · Origin 없음 · 미디어 타입 없음.
    const withHint = await send({
      port: harness.port,
      path: "/",
      headers: { host: `127.0.0.1:${harness.port}`, "sec-fetch-site": "none" },
    });
    expect(withHint.status).not.toBe(403);

    // 힌트 헤더가 아예 없는 브라우저·클라이언트도 안전한 메서드에서는 검사 3의 모집단 밖이다.
    const bare = await send({
      port: harness.port,
      path: "/",
      headers: { host: `127.0.0.1:${harness.port}` },
    });
    expect(bare.status).not.toBe(403);
    expect(harness.plain).toHaveLength(2);
  });

  it("통과 3 — 허용 이름 127.0.0.1", async () => {
    const harness = await start();
    const host = allowedHosts(harness.port)[0];
    const origin = allowedOrigins(harness.port)[0];
    const reply = await send(screenPost(harness.port, { host, origin }));
    expect({ host, origin, status: reply.status }).toEqual({
      host,
      origin,
      status: 204,
    });
  });

  it("통과 4 — 허용 이름 localhost", async () => {
    const harness = await start();
    const host = allowedHosts(harness.port)[1];
    const origin = allowedOrigins(harness.port)[1];
    const reply = await send(screenPost(harness.port, { host, origin }));
    expect({ host, origin, status: reply.status }).toEqual({
      host,
      origin,
      status: 204,
    });
  });

  it("모집단 — 허용 이름이 둘로 닫혀 있다", () => {
    // 셋째 이름이 생기면 위 통과 축이 그것을 안 재면서 초록으로 남는다.
    expect(allowedHosts(1)).toHaveLength(2);
    expect(allowedOrigins(1)).toHaveLength(2);
    // 결정 2가 이름으로 뺀 갈래가 실제로 밖이다.
    expect(checkOrigin(base({ host: `[::1]:${UNIT_PORT}` })).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------------ *
 * 묶음 4 — 결정 2의 실포트 축
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §4.1 결정 2 — 허용 집합을 바인드된 실주소에서 짓는다", () => {
  it("포트 0으로 뜬 서버에서 커널이 준 실포트로 지은 이름이 통과한다", async () => {
    const harness = await start();
    expect(harness.port).toBeGreaterThan(0);
    for (const host of allowedHosts(harness.port)) {
      const reply = await send({ port: harness.port, path: "/", headers: { host } });
      expect({ host, status: reply.status }).toEqual({ host, status: 204 });
    }
  });

  it("역검증 — 상수 포트로 지은 이름은 거절된다 (서버 레벨)", async () => {
    const harness = await start();
    // 이 축이 결정 2가 명시로 경고한 자리다. 상수 포트를 재는 구현이면 위 축이 붉고,
    // 요청이 준 값을 기대값에 넣는 구현이면 이 축이 붉는다.
    const wrongPort = harness.port === DEFAULT_PORT ? DEFAULT_PORT + 1 : DEFAULT_PORT;
    for (const host of allowedHosts(wrongPort)) {
      const reply = await send({ port: harness.port, path: "/", headers: { host } });
      expect({ host, status: reply.status }).toEqual({ host, status: 403 });
    }
  });

  it("역검증 — 순수 판정도 상수 포트를 거절한다", () => {
    expect(checkOrigin(base({ host: `127.0.0.1:${DEFAULT_PORT}`, port: UNIT_PORT }))).toEqual({
      ok: false,
      reason: "host-not-allowed",
    });
    expect(
      checkOrigin(base({ origin: `http://127.0.0.1:${DEFAULT_PORT}`, port: UNIT_PORT })),
    ).toEqual({ ok: false, reason: "origin-not-allowed" });
  });

  it("역검증 — 한 서버의 허용 이름이 다른 서버에서는 거절된다", async () => {
    // 기대값이 실주소에서 지어졌다면 두 서버의 허용 집합은 서로 다르다.
    const first = await start();
    const second = await start();
    expect(first.port).not.toBe(second.port);

    const reply = await send({
      port: second.port,
      path: "/",
      headers: { host: `127.0.0.1:${first.port}` },
    });
    expect(reply.status).toBe(403);
  });

  it("요청이 준 값이 기대값에 들어가지 않는다 — 다른 이름을 아무리 실어도 열리지 않는다", async () => {
    const harness = await start();
    // 꼬리 공백을 단 값은 이 층에서 잴 수 없다 — HTTP 파서가 필드 값의 앞뒤 공백을 이미
    // 벗겨 관문에 닿기 전에 사라진다(2026-08-31 실측: 204). 그 벡터는 아래 순수 판정 표가
    // 진다.
    for (const host of [
      "attacker.example",
      `attacker.example:${harness.port}`,
      `127.0.0.1:${harness.port}.attacker.example`,
      `127.0.0.1:${harness.port}@attacker.example`,
    ]) {
      const reply = await send({ port: harness.port, path: "/", headers: { host } });
      expect({ host, status: reply.status }).toEqual({ host, status: 403 });
    }
  });
});

/* ------------------------------------------------------------------------ *
 * 묶음 5 — 결정 4 · 결정 6 · 결정 5 · §7 · 머리의 현행성
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §4.1 결정 4 — 관문이 라우팅보다 앞의 한 자리다", () => {
  it("거절이 라우트별 응답을 대신한다 — 405·400·404 자리가 전부 403 하나가 된다", async () => {
    // 결정 4가 귀결로 직접 적은 자리다. 관문이 라우팅 뒤였다면 아래 셋의 답이 갈리고,
    // 그 차이가 라우트 표의 모양을 알려 주는 자리가 된다.
    const harness = await start();
    const cross = { origin: "http://attacker.example" };
    const cases: readonly (readonly [string, Send])[] = [
      // 관문이 없다면 405 — 스트림 라우트는 GET만 받는다
      [
        "스트림 라우트에 POST",
        {
          ...screenPost(harness.port, cross),
          path: `${STREAM_PATH}?${PROTOCOL_VERSION_PARAM}=${PROTOCOL_VERSION}`,
        },
      ],
      // 관문이 없다면 400 — 버전이 안 맞는다. 이 자리는 안전한 메서드로만 닿으므로 검사 3이
      // 아니라 검사 1이 진다(모집단이 모든 요청이다). 교차 오리진만 재면 이 자리가 안 재진다.
      [
        "버전 불일치 · 허용 밖 Host",
        {
          port: harness.port,
          path: `${STREAM_PATH}?${PROTOCOL_VERSION_PARAM}=0`,
          headers: { host: `foo.localhost:${harness.port}` },
        },
      ],
      // 관문이 없다면 404·204 — 표에 없는 경로다
      ["표에 없는 경로", { ...screenPost(harness.port, cross), path: "/no-such-route" }],
    ];
    for (const [label, options] of cases) {
      const reply = await send(options);
      expect({ label, status: reply.status }).toEqual({ label, status: 403 });
    }
    expect(harness.opened).toEqual([]);
    expect(harness.plain).toEqual([]);
  });
});

describe("WEB-UI.md §4.1 결정 6 — CORS 허용 헤더를 싣지 않는다", () => {
  it("거절 응답에 access-control-* 헤더가 하나도 없다", async () => {
    const harness = await start();
    const rejected = [
      screenPost(harness.port, { host: "attacker.example" }),
      screenPost(harness.port, { origin: "http://attacker.example" }),
      screenPost(harness.port, { origin: undefined }),
      { ...screenPost(harness.port, { "content-type": undefined }), body: undefined },
    ];
    for (const options of rejected) {
      const reply = await send(options);
      expect({ status: reply.status, cors: corsHeaders(reply.headers) }).toEqual({
        status: 403,
        cors: [],
      });
    }
  });

  it("통과 응답에도 access-control-* 헤더가 없다", async () => {
    const harness = await start();
    for (const options of [
      screenPost(harness.port),
      { port: harness.port, path: "/", headers: { host: `127.0.0.1:${harness.port}` } },
    ]) {
      const reply = await send(options);
      expect(corsHeaders(reply.headers)).toEqual([]);
    }
  });

  it("프리플라이트에 답하지 않는다 — OPTIONS는 거절이고 성공 응답이 나가지 않는다", async () => {
    const harness = await start();
    const reply = await send({
      port: harness.port,
      path: METHOD_PATH,
      method: "OPTIONS",
      headers: {
        host: `127.0.0.1:${harness.port}`,
        origin: "http://attacker.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect({ status: reply.status, cors: corsHeaders(reply.headers) }).toEqual({
      status: 403,
      cors: [],
    });
    expect(harness.plain).toEqual([]);
    expect(harness.opened).toEqual([]);
  });

  it("결정 6 — OPTIONS는 관문에서 거절된다 (조건 없는 문장이다)", async () => {
    // **이 축은 2026-08-31 현재 붉고, 그대로 제출한다.** 기대값은 구현이 아니라 결정 6의
    // 문장에서 나왔다 — 그 문장은 OPTIONS가 *"안전하지 않은 메서드라 관문에서 거절되고"*라고
    // 적으며 조건을 달지 않는다. 반면 결정 3의 표는 검사 셋만 들고, 셋을 전부 만족하도록 손으로
    // 지은 OPTIONS는 그 표에서 통과다. 둘 중 어느 쪽이 계약인지는 **판정 필요**이고, QA가
    // 임의로 고르지 않는다.
    //
    // **막지 못하는 결과가 나는 것은 아니다** — 아래 첫 단언이 그것을 잰다. 브라우저는
    // 미디어 타입이 붙은 교차 오리진 OPTIONS를 프리플라이트 없이 못 내고, 그 프리플라이트는
    // 우리가 CORS 허용 헤더를 안 내므로 실패한다. 그래서 처분이 문서 쪽일 가능성이 높다.
    const harness = await start();
    const reply = await send({
      ...screenPost(harness.port),
      method: "OPTIONS",
      body: undefined,
    });
    expect(corsHeaders(reply.headers)).toEqual([]);
    expect(reply.status).toBe(403);
  });

  it("거절을 로그에 고지하지 않는다 — 표준 출력·표준 오류에 아무것도 안 쓴다", async () => {
    // 고지하면 공격자 페이지가 그 자리를 스팸할 수 있다(결정 6). 우리 화면의 실패 경로는
    // §9.6 결정 6의 자리에 따로 서므로 이 침묵이 §2.6의 비침묵과 충돌하지 않는다.
    const harness = await start();
    const written: string[] = [];
    const outWrite = process.stdout.write.bind(process.stdout);
    const errWrite = process.stderr.write.bind(process.stderr);
    const capture =
      (): typeof process.stdout.write =>
      (chunk: unknown, ...rest: unknown[]): boolean => {
        written.push(String(chunk));
        const done = rest.find((item) => typeof item === "function");
        if (typeof done === "function") (done as () => void)();
        return true;
      };
    process.stdout.write = capture();
    process.stderr.write = capture();
    try {
      await send(screenPost(harness.port, { origin: "http://attacker.example" }));
      await send({ port: harness.port, path: "/", headers: { host: "attacker.example" } });
    } finally {
      process.stdout.write = outWrite;
      process.stderr.write = errWrite;
    }
    expect(written).toEqual([]);
  });

  it("거절 본문이 평문이다 — html·json으로 나가지 않는다", async () => {
    const harness = await start();
    const reply = await send(screenPost(harness.port, { origin: "http://attacker.example" }));
    expect(reply.status).toBe(403);
    expect(String(reply.headers["content-type"] ?? "")).not.toMatch(/html|json/);
  });

  it("역검증 — CORS 스캔이 실제로 잡는다", () => {
    expect(corsHeaders({ "access-control-allow-origin": "*" })).toEqual([
      "access-control-allow-origin",
    ]);
    expect(corsHeaders({ vary: "origin" })).toEqual([]);
  });
});

describe("WEB-UI.md §4.1 결정 5 — 안전한 메서드로 도달하는 라우트가 둘로 닫혀 있다", () => {
  /** `server.ts`가 내보내는 라우트 상수 전부 */
  const routeConstants = Object.entries(serverModule as Record<string, unknown>).filter(
    (entry): entry is [string, string] =>
      entry[0].endsWith("_PATH") && typeof entry[1] === "string",
  );

  it("라우트 상수의 모집단이 둘이다 — 스트림과 메서드 표", () => {
    expect(routeConstants.map(([name]) => name).sort()).toEqual(["METHOD_PATH", "STREAM_PATH"]);
  });

  it("상태를 바꾸는 라우트가 안전한 메서드의 도달 집합 밖이다", () => {
    // 도달 집합은 스트림 개설(§2.1)과 정적 자산(§9.1) 둘이다. 메서드 표의 라우트는 그 어느
    // 쪽도 아니어야 한다 — 겹치면 상태를 바꾸는 라우트가 안전한 메서드로 열린다.
    const assetPaths = Object.keys(ASSET_MANIFEST);
    expect(assetPaths.length, "자산 매니페스트가 비었다 — 검사가 죽었다").toBeGreaterThan(0);
    expect(assetPaths).not.toContain(METHOD_PATH);
    expect(assetPaths).not.toContain(STREAM_PATH);
    expect(METHOD_PATH).not.toBe(STREAM_PATH);
  });

  it("스트림 라우트는 읽기다 — 안전한 메서드로 열리고 POST는 405다", async () => {
    const harness = await start();
    const streamPath = `${STREAM_PATH}?${PROTOCOL_VERSION_PARAM}=${PROTOCOL_VERSION}`;
    const opened = await send({
      port: harness.port,
      path: streamPath,
      headers: { host: `127.0.0.1:${harness.port}` },
    });
    expect(opened.status).toBe(200);
    expect(harness.opened).toHaveLength(1);

    const posted = await send({
      ...screenPost(harness.port),
      path: streamPath,
    });
    expect(posted.status).toBe(405);
    expect(harness.opened).toHaveLength(1);
  });

  it("안전한 메서드도 관문 밖이 아니다 — 스트림 개설이 허용 밖 Host에서 거절된다", async () => {
    const harness = await start();
    const reply = await send({
      port: harness.port,
      path: `${STREAM_PATH}?${PROTOCOL_VERSION_PARAM}=${PROTOCOL_VERSION}`,
      headers: { host: `foo.localhost:${harness.port}` },
    });
    expect(reply.status).toBe(403);
    expect(harness.opened).toEqual([]);
  });
});

describe("WEB-UI.md §7 — 승인 id는 추측 불가여야 하고 프로세스 안에서 유일하다", () => {
  const SAMPLE = 40;

  /** 대기 승인을 여럿 만들어 id만 걷는다. 만료는 이 축의 대상이 아니라 픽스처다 */
  async function issueIds(count: number): Promise<string[]> {
    const registry = createApprovalRegistry({
      timeoutMs: 60_000,
      onSubscriberError: (error: unknown) => {
        throw new Error(`이 축은 던지는 구독자를 두지 않는다 — ${String(error)}`);
      },
    });
    const pending: Promise<unknown>[] = [];
    for (let index = 0; index < count; index += 1) {
      pending.push(
        registry
          .ask({ display: `승인 ${index}` }, new AbortController().signal)
          .catch(() => undefined),
      );
    }
    const ids = registry.list().map((approval) => approval.id);
    for (const id of ids) registry.settle(id, "allow-once");
    await Promise.all(pending);
    return ids;
  }

  /**
   * 추측 가능성의 징후들. 하나라도 나오면 §7의 성질이 깨진 것이다.
   *
   * 무작위 값에서 이 술어가 우연히 붉을 확률은 표본 40에서 무시할 수 있다 —
   * 발급 순서와 사전순이 일치할 확률이 1/40!이고, 인접 쌍의 다른 자리 수가 넷 미만이 될
   * 확률은 값의 길이가 여덟 이상이면 그보다도 작다.
   */
  function guessabilityFindings(ids: readonly string[]): string[] {
    const findings: string[] = [];
    if (ids.length < 2) return ["표본이 둘 미만이다 — 검사가 죽었다"];
    if (new Set(ids).size !== ids.length) findings.push("중복이 있다");
    if (ids.some((id) => /^\d+$/.test(id))) findings.push("순수한 숫자다");

    const head = ids[0] ?? "";
    const shortest = Math.min(...ids.map((id) => id.length));
    let prefix = 0;
    while (prefix < shortest && ids.every((id) => id[prefix] === head[prefix])) prefix += 1;
    let suffix = 0;
    while (
      suffix < shortest - prefix &&
      ids.every((id) => id[id.length - 1 - suffix] === head[head.length - 1 - suffix])
    ) {
      suffix += 1;
    }
    const cores = ids.map((id) => id.slice(prefix, id.length - suffix));
    if (cores.every((core) => /^\d+$/.test(core))) findings.push("고정 접두·접미 뒤 순번이다");

    let ascending = true;
    for (let index = 1; index < ids.length; index += 1) {
      const before = ids[index - 1] ?? "";
      const after = ids[index] ?? "";
      if (!(before < after)) {
        ascending = false;
        break;
      }
    }
    if (ascending) findings.push("발급 순서가 사전순 오름차순이다 — 단조 증가다");

    for (let index = 1; index < ids.length; index += 1) {
      const before = ids[index - 1] ?? "";
      const after = ids[index] ?? "";
      if (before.length !== after.length) continue;
      let differing = 0;
      for (let at = 0; at < before.length; at += 1) if (before[at] !== after[at]) differing += 1;
      if (differing < 4) {
        findings.push(`인접 id의 다른 자리가 ${differing}뿐이다 — 카운터 모양이다`);
        break;
      }
    }
    return findings;
  }

  it("연속 발급된 id가 서로 다르고 인접 id에서 다음 값을 유도할 수 없다", async () => {
    const ids = await issueIds(SAMPLE);
    expect(ids).toHaveLength(SAMPLE);
    expect(guessabilityFindings(ids)).toEqual([]);
  });

  it("프로세스 안 유일성 — 레지스트리가 둘이어도 id가 겹치지 않는다", async () => {
    const first = await issueIds(SAMPLE);
    const second = await issueIds(SAMPLE);
    const overlap = first.filter((id) => second.includes(id));
    expect(overlap).toEqual([]);
  });

  it("역검증 — 이 술어가 순번 모양을 실제로 잡는다", () => {
    const counter = Array.from({ length: 10 }, (_, index) => String(index + 1));
    const prefixed = Array.from({ length: 10 }, (_, index) => `approval-${index + 1000}`);
    const monotonic = Array.from({ length: 10 }, (_, index) => `ap-${1_700_000_000 + index}-xk`);
    expect(guessabilityFindings(counter).length).toBeGreaterThan(0);
    expect(guessabilityFindings(prefixed).length).toBeGreaterThan(0);
    expect(guessabilityFindings(monotonic).length).toBeGreaterThan(0);
  });
});

describe("server.ts 머리의 열거가 낡지 않았다", () => {
  /**
   * 파일의 머리 — 빈 줄 없이 이어지는 첫 주석 덩어리.
   *
   * 술어의 출처는 `DOC-CITATION.md` §6 U-b의 2026-08-18 후속 판정이다: 단위는 연속된 주석 줄
   * 전부이고, 주석 토큰 안의 줄은 별표가 없어도 덩어리를 안 끊는다.
   */
  function headChunk(file: string): string {
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");
    const head: string[] = [];
    let inBlock = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (inBlock) {
        head.push(line);
        if (trimmed.includes("*/")) inBlock = false;
        continue;
      }
      if (trimmed.startsWith("/*")) {
        head.push(line);
        inBlock = !trimmed.includes("*/");
        continue;
      }
      if (trimmed.startsWith("//")) {
        head.push(line);
        continue;
      }
      break;
    }
    return head.join("\n");
  }

  const head = headChunk(SERVER_SRC);

  /** 첫 그룹의 포획들. 빈 포획은 버린다 */
  const captures = (text: string, pattern: RegExp): string[] =>
    [...text.matchAll(pattern)].map((hit) => hit[1] ?? "").filter((value) => value.length > 0);

  it("머리가 실재한다 — 0줄은 통과가 아니라 검사가 죽은 것이다", () => {
    expect(head.trim().length).toBeGreaterThan(0);
  });

  it("머리가 다섯째 축을 든다 — 출처 검증 관문이 열거에 있다", () => {
    // 방향은 필수인 이름이 있는가 쪽이다. 관문이 열거에서 빠지면 여기서 붉는다.
    expect(head).toContain("§4.1");
    const names = ["출처 검증", "관문", "checkOrigin"];
    expect(
      names.filter((name) => head.includes(name)),
      `머리가 관문을 이름으로 안 든다 — 후보 ${names.join(" · ")}`,
    ).not.toEqual([]);
  });

  it("머리가 드는 절 주소가 전부 실재한다", () => {
    const docs = captures(head, /([A-Z][A-Z0-9-]*\.md)/g);
    const targets = docs.length > 0 ? [...new Set(docs)] : ["WEB-UI.md"];
    const texts = targets.map((name) => readFileSync(join(DOCS_DIR, name), "utf8"));
    const sections = [...new Set(captures(head, /§(\d+(?:\.\d+)*)/g))];
    expect(sections.length, "머리에 절 주소가 0건이다 — 검사가 죽었다").toBeGreaterThan(0);
    const dead = sections.filter(
      (section) =>
        !texts.some((text) =>
          new RegExp(`^#{1,6}\\s+${section.replace(/\./g, "\\.")}[.\\s]`, "m").test(text),
        ),
    );
    expect(dead, `머리가 실재하지 않는 절을 가리킨다 — 대상 ${targets.join(" · ")}`).toEqual([]);
  });

  it("머리가 드는 모듈 이름이 전부 실재한다", () => {
    const modules = [...new Set(captures(head, /`([a-z][a-z0-9-]*\.ts)`/g))];
    const present = new Set(
      readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" }).filter((name) =>
        name.endsWith(".ts"),
      ),
    );
    const dead = modules.filter((name) => !present.has(name));
    expect(dead).toEqual([]);
  });

  it("머리가 드는 식별자가 전부 실물로 있다", () => {
    // 낡은 이름이 머리에 남으면 열거가 거짓을 주장한다. 방향은 필수인 이름이 있는가 쪽이다.
    const bodies = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(".ts"))
      .map((name) => stripComments(readFileSync(join(SRC_DIR, name), "utf8")))
      .join("\n");
    const identifiers = [...new Set(captures(head, /`([A-Za-z_$][A-Za-z0-9_$]{2,})`/g))].filter(
      // 밑줄 없는 전대문자는 이 레포의 심볼 표기가 아니라 HTTP 메서드·머리글자다
      // (`GET`·`OPTIONS`). 상수는 밑줄을 갖는다(`STREAM_PATH`).
      (name) => !/^[A-Z]+$/.test(name),
    );
    const dead = identifiers.filter((name) => !bodies.includes(name));
    expect(dead, "머리가 실물에 없는 이름을 든다").toEqual([]);
  });

  it("역검증 — 이 축이 실제로 잡는다", () => {
    const stale = "/**\n * 이 파일이 지는 것 — §99.9 · `ghost.ts` · `noSuchSymbol`\n */";
    expect(/§(\d+(?:\.\d+)*)/.test(stale)).toBe(true);
    const text = readFileSync(join(DOCS_DIR, "WEB-UI.md"), "utf8");
    expect(/^#{1,6}\s+99\.9[.\s]/m.test(text)).toBe(false);
    const present = new Set(
      readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" }).filter((name) =>
        name.endsWith(".ts"),
      ),
    );
    expect(present.has("ghost.ts")).toBe(false);
  });
});

/* ------------------------------------------------------------------------ *
 * 모집단의 수 — 강제 수단이 든 여섯과 넷
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §4.1 강제 수단 — 이 파일의 모집단이 닫힌 표다", () => {
  it("안전한 메서드가 둘이다", () => {
    expect([...SAFE_METHODS]).toEqual(["GET", "HEAD"]);
  });

  it("거절 축이 여섯이고 통과 축이 넷이다", () => {
    // 소스를 읽어 자기 스위트의 `it` 수를 센다 — 축이 조용히 줄면 여기서 붉는다.
    const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const suite = (title: string): string => {
      const start = self.indexOf(`describe("${title}`);
      if (start === -1) throw new Error(`스위트를 찾지 못했다 — ${title}`);
      const end = self.indexOf("\ndescribe(", start + 1);
      return self.slice(start, end === -1 ? self.length : end);
    };
    const countAxes = (body: string): number =>
      [...body.matchAll(/\n {2}it\("([^"]+)"/g)]
        .map((hit) => hit[1] ?? "")
        .filter((title) => !title.startsWith("역검증") && !title.startsWith("모집단")).length;

    expect(countAxes(suite("WEB-UI.md §4.1 강제 수단 — 거절해야 할 조합 여섯"))).toBe(6);
    expect(countAxes(suite("WEB-UI.md §4.1 강제 수단 — 통과해야 할 조합 넷"))).toBe(4);
  });
});
