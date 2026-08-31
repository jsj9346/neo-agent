/**
 * HTTP 서버 — 계약 검증.
 *
 * 기대값의 출처: `docs/WEB-UI.md` §4(노출은 루프백 고정 · 바인드 호스트는 상수 · 흔적은
 * 서버 생성 함수의 인자)·§6(버전이 정확히 일치할 때만 수락 · 협상·다운그레이드 없음 ·
 * 버전은 스트림을 여는 요청이 싣는다)·§2.1(스트림이 열리기도 전의 HTTP 400)·§5 규칙 2
 * (구독은 subscribe로만)·§12(기본값이 존재한다는 것이 계약이고 값은 아니다).
 *
 * ## 무엇을 실물로 재는가
 *
 * §4의 절반은 **값**이다. 아래 첫 스위트가 소켓을 실제로 열어 루프백 밖에서 연결이 안 되는
 * 것을 재는 이유가 그것이다 — 덮어쓸 수 없다는 축만 재면 상수가 어떤 주소든 전부 그린이고,
 * 그때 이 문서에서 네트워크 노출을 막는 계약이 아무것도 안 남는다.
 *
 * 덮어쓰기 축은 경로 셋(설정·env·argv)을 각각 잰다. 설정 경로는 타입과 런타임 둘 다,
 * env·argv 경로는 실제 바인드와 소스 텍스트 둘 다다 — 읽는 코드가 0건이면 그 갈래는 막히는
 * 것이 아니라 존재하지 않는다.
 *
 * ## 이 파일이 재지 않는 것
 *
 * - **스트림의 내용** — 핸드셰이크·푸시·배압·재접속은 §6.1·§8의 계약이고 `stream.ts`가
 *   진다. 여기의 개설 요청은 관문을 지났는지만 보고, 통과한 요청이 무엇을 받는지는 안 본다.
 * - **메서드 표와 정적 자산** — §11·§9.1이고 각각 `methods.ts`·`assets.ts`가 진다. 여기서는
 *   스트림 라우트 밖의 요청이 그 갈래로 넘어가는지까지만 본다.
 * - **종료 순서** — §3.2의 여덟 단계는 `shutdown.ts`의 계약이다. 아래 `close`는 그 시퀀스가
 *   쓰는 부품이라 새 연결을 그만 받는 것과 구독을 끊는 것까지만 잰다.
 * - **기본 포트의 값** — §12가 값을 세부로 두었으므로 존재와 범위만 잰다. 값을 단정하면
 *   그 순간 세부가 계약이 된다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의 대조
 * 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로 있는 부분
 * 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 문서를 줄번호로 가리키는 자리는
 * 이 규약의 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { readdirSync, readFileSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { get as httpGet, request as httpRequest } from "node:http";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentEvent, AgentEventListener, Unsubscribe } from "@neo-agent/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  type BindHost,
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
const WEB_UI_DOC = fileURLToPath(new URL("../../../docs/WEB-UI.md", import.meta.url));
const CLIENT_STREAM = fileURLToPath(new URL("../client/stream.js", import.meta.url));

/* ------------------------------------------------------------------------ *
 * 도구 — 코어 대역·서버 기동·요청
 * ------------------------------------------------------------------------ */

/**
 * 코어 대역. `subscribe` 하나만 든다.
 *
 * 실물 `Agent`를 세우지 않는 이유는 이 파일이 재는 것이 코어의 행동이 아니라 **서버가 코어를
 * 어떻게 쥐는가**이기 때문이다. 대역이 얇을수록 서버가 subscribe 밖의 무엇을 만졌을 때 그것이
 * 여기서 드러난다.
 */
class AgentDouble {
  /** 지금 붙어 있는 리스너 */
  readonly listeners: AgentEventListener[] = [];
  /** 이력 — 대역 자신도 속성 대입을 안 한다. 아래 덫이 대역의 계수까지 잡기 때문이다 */
  readonly subscribed: AgentEventListener[] = [];
  readonly unsubscribed: AgentEventListener[] = [];

  subscribe(listener: AgentEventListener): Unsubscribe {
    this.subscribed.push(listener);
    this.listeners.push(listener);
    return () => {
      this.unsubscribed.push(listener);
      const at = this.listeners.indexOf(listener);
      if (at !== -1) this.listeners.splice(at, 1);
    };
  }
}

/**
 * 속성 대입을 던짐으로 바꾼 코어 대역.
 *
 * §5 규칙 2가 금한 형태를 **런타임에서 잡는 덫**이다. 서버가 코어 인스턴스에 콜백 속성을
 * 대입하면 그 순간 기동이 던지므로, 대입이 0건이라는 단언이 소스 문자열 검색이 아니라 실행으로
 * 선다.
 */
function trapAssignments(agent: AgentDouble): AgentDouble {
  return new Proxy(agent, {
    set(_target, property) {
      throw new Error(`코어 인스턴스에 속성을 대입했다 — ${String(property)}`);
    },
    defineProperty(_target, property) {
      throw new Error(`코어 인스턴스에 속성을 정의했다 — ${String(property)}`);
    },
  });
}

type Harness = {
  readonly server: ServeServer;
  readonly agent: AgentDouble;
  readonly port: number;
  readonly opened: StreamOpen[];
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

/** 커널이 고른 포트에 실제로 바인드한다. 열린 소켓 없이는 §4의 값 축을 잴 수 없다 */
async function start(options: { readonly host?: BindHost } = {}): Promise<Harness> {
  const agent = new AgentDouble();
  const opened: StreamOpen[] = [];
  const plain: PlainRequest[] = [];
  const server = createServeServer({
    host: options.host ?? LOOPBACK_HOST,
    port: 0,
    agent: trapAssignments(agent),
    openStream: (open) => {
      opened.push(open);
      // 스트림의 내용은 이 파일의 계약이 아니다. 열렸다는 사실만 남기고 즉시 닫는다 —
      // 열어 둔 채로 두면 `close`가 그 연결을 기다려 스위트가 멈춘다.
      open.response.writeHead(200, { "content-type": "text/event-stream" });
      open.response.end();
    },
    handleRequest: (request) => {
      plain.push(request);
      request.response.writeHead(204);
      request.response.end();
    },
  });
  started.push(server);
  const address = await server.listen();
  return { server, agent, port: address.port, opened, plain };
}

type Reply = {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
};

/**
 * §4.1의 다섯째 축을 통과할 헤더. **안전한 메서드에는 아무것도 안 붙인다.**
 *
 * 안전한 메서드(`GET`·`HEAD`)가 받는 것은 검사 1(`Host`)뿐이고, 그 값은 `node:http`가
 * `host`·`port`에서 스스로 지어 `127.0.0.1:<실포트>`로 나간다 — 허용 Host 집합 안이다.
 * 그래서 이 파일의 GET 축들은 손대지 않아도 관문을 지나고, 여기서 굳이 `Origin`을
 * 붙이면 그 축들이 재던 모양(주소창 내비게이션 — `Origin` 없는 안전한 요청)이 바뀐다.
 *
 * 안전하지 않은 메서드는 검사 2·3을 함께 받으므로 둘을 정직하게 싣는다. **관문을
 * 우회하는 스위치를 만들지 않는다** — 테스트 전용 플래그·환경변수를 두는 순간 그것이
 * §4.1이 닫은 문의 뒷문이 된다.
 *
 * 실포트를 인자로 받는 것이 §4.1 결정 2의 반영이다 — 허용 오리진 집합이 바인드된
 * 실주소에서 지어지므로 상수 포트로 지은 `Origin`은 여기서 거절된다.
 */
function gateHeaders(port: number, method: string): Record<string, string> {
  if (method === "GET" || method === "HEAD") return {};
  return {
    "content-type": "application/json",
    origin: `http://${LOOPBACK_HOST}:${String(port)}`,
  };
}

function fetchPath(port: number, path: string, method = "GET"): Promise<Reply> {
  return new Promise<Reply>((resolve, reject) => {
    const request = httpRequest(
      { host: LOOPBACK_HOST, port, path, method, headers: gateHeaders(port, method) },
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
    request.on("error", reject);
    request.end();
  });
}

/** 헤더로 버전을 실어 본다 — 자리가 쿼리 문자열이라는 판정의 역방향 축이다 */
function fetchWithVersionHeader(port: number, path: string, version: string): Promise<Reply> {
  return new Promise<Reply>((resolve, reject) => {
    const request = httpGet(
      { host: LOOPBACK_HOST, port, path, headers: { "neo-agent-protocol-version": version } },
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
    request.on("error", reject);
  });
}

/** 연결 시도의 결말 하나. `connected` 말고는 전부 붙지 못한 것이다 */
function probe(host: string, port: number): Promise<string> {
  return new Promise<string>((resolve) => {
    const socket = connect({ host, port });
    const done = (verdict: string): void => {
      socket.destroy();
      resolve(verdict);
    };
    socket.setTimeout(2000);
    socket.once("connect", () => {
      done("connected");
    });
    socket.once("timeout", () => {
      done("timeout");
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      done(error.code ?? "error");
    });
  });
}

/** 이 기계의 비-루프백 IPv4 전부 */
function nonLoopbackAddresses(): string[] {
  const found: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) found.push(entry.address);
    }
  }
  return found;
}

/**
 * 주석 본문을 공백으로 지운다(줄 번호·열 폭 보존). 문자열 리터럴은 남긴다.
 *
 * **파일-로컬 복제다.** 같은 술어가 `packages/serve/test/package-boundary.contract.test.ts`에
 * 있고 공유하지 않았다 — 그 파일의 머리가 적는 이유(계약 판정이 다른 테스트의 헬퍼 변경에
 * 끌려가지 않게 한다)가 여기에도 그대로 선다. 이 파일에서 이 술어가 필요한 이유는 문체
 * 때문이다: 아래 서버 소스가 env·argv를 이름으로 부르며 읽지 않는다고 적으므로, 주석을 그대로
 * 두면 그 줄이 전부 오탐이 된다.
 */
function stripComments(source: string): string {
  let out = "";
  let index = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
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

/** `src/`의 모듈들 — 주석을 벗긴 원문 */
function sourceFiles(): { name: string; text: string }[] {
  const files = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: stripComments(readFileSync(join(SRC_DIR, name), "utf8")) }));
  // 0건은 통과가 아니라 검사가 죽은 것이다(`ARCHITECTURE.md` §2.6).
  if (files.length === 0) {
    throw new Error("packages/serve/src에서 .ts를 1건도 찾지 못했다 — 검사가 죽었다");
  }
  return files;
}

/* ------------------------------------------------------------------------ *
 * §4 — 노출은 루프백 고정
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §4 — 바인드 호스트의 값이 루프백이다", () => {
  it("적합 — 루프백으로는 붙고 비-루프백 주소로는 붙지 못한다", async () => {
    // 이 단언이 §4의 절반을 진다. 아래 덮어쓰기 축만 재면 상수가 어느 주소든 전부 그린이다.
    const { port } = await start();

    expect(await probe(LOOPBACK_HOST, port)).toBe("connected");

    const outside = nonLoopbackAddresses();
    for (const address of outside) {
      expect(await probe(address, port), `${address}에서 붙었다`).not.toBe("connected");
    }

    // 이 기계에 비-루프백 인터페이스가 없을 때도 축이 남게 두 번째 자리를 든다. 루프백
    // 대역의 다른 주소는 서버가 주소 하나에 붙었을 때만 거부되고, 모든 인터페이스에
    // 붙었으면 여기서 연결된다.
    expect(await probe("127.0.0.2", port)).not.toBe("connected");
  });

  it("적합 — 설정 경로: 다른 호스트는 타입에서도 런타임에서도 통과하지 않는다", () => {
    const agent = new AgentDouble();
    const options = {
      port: 0,
      agent,
      openStream: () => undefined,
      handleRequest: () => undefined,
    };

    // 타입 층 — 바인드 호스트의 타입에 넣을 수 있는 값이 하나뿐이다.
    // @ts-expect-error 루프백이 아닌 주소는 BindHost가 아니다
    expect(() => createServeServer({ ...options, host: "0.0.0.0" })).toThrow(/바인드 호스트/);

    // 런타임 층 — 컴파일러를 우회해 들어온 값도 막힌다. 계약이 걸린 것은 값이지 표기가
    // 아니므로 컴파일러 하나에 맡기면 JS 호출자·설정 파일 경유가 열린다.
    const smuggled = "0.0.0.0" as unknown as BindHost;
    expect(() => createServeServer({ ...options, host: smuggled })).toThrow(/바인드 호스트/);
  });

  it("적합 — env 경로: 환경 변수가 바인드를 못 바꾼다", async () => {
    const keys = ["HOST", "BIND", "BIND_HOST", "NEO_AGENT_HOST", "NEO_AGENT_BIND_HOST"];
    const saved = keys.map((key) => [key, process.env[key]] as const);
    for (const key of keys) process.env[key] = "0.0.0.0";
    try {
      const { server, port } = await start();
      expect(server.address?.host).toBe(LOOPBACK_HOST);
      expect(await probe("127.0.0.2", port)).not.toBe("connected");
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    // 실행 축만 재면 읽고도 무시하는 구현이 통과한다. 읽는 자리 자체가 0건이어야 그 갈래가
    // 막히는 것이 아니라 존재하지 않는다.
    for (const file of sourceFiles()) {
      expect(file.text, `${file.name}에 env를 읽는 자리가 있다`).not.toMatch(/process\s*\.\s*env/);
    }
  });

  it("적합 — argv 경로: 명령행 인자가 바인드를 못 바꾼다", async () => {
    const saved = [...process.argv];
    process.argv = [...saved, "--host", "0.0.0.0", "--bind", "0.0.0.0"];
    try {
      const { server, port } = await start();
      expect(server.address?.host).toBe(LOOPBACK_HOST);
      expect(await probe("127.0.0.2", port)).not.toBe("connected");
    } finally {
      process.argv = saved;
    }

    for (const file of sourceFiles()) {
      expect(file.text, `${file.name}에 argv를 읽는 자리가 있다`).not.toMatch(
        /process\s*\.\s*argv/,
      );
    }
  });

  it("적합 — 서버 생성 함수가 바인드 호스트를 인자로 받는다", async () => {
    // §4의 흔적이 요구한 형태다. 인자를 빼면 컴파일되지 않고, 우회해서 빼면 던진다 —
    // 즉 이 인자는 장식이 아니라 바인드가 실제로 쓰는 값이다.
    const agent = new AgentDouble();
    const options = {
      port: 0,
      agent,
      openStream: () => undefined,
      handleRequest: () => undefined,
    };
    // @ts-expect-error host는 선택적이지 않다
    expect(() => createServeServer(options)).toThrow(/바인드 호스트/);

    // 그리고 넘긴 값이 실제 바인드 주소로 나타난다.
    const { server } = await start({ host: LOOPBACK_HOST });
    expect(server.host).toBe(LOOPBACK_HOST);
    expect(server.address?.host).toBe(LOOPBACK_HOST);
  });
});

/* ------------------------------------------------------------------------ *
 * §6 — 버전 관문
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §6 — 버전이 정확히 일치할 때만 스트림이 열린다", () => {
  const streamPath = (version: string): string =>
    `${STREAM_PATH}?${PROTOCOL_VERSION_PARAM}=${encodeURIComponent(version)}`;

  it("적합 — 일치하면 열린다", async () => {
    const { port, opened } = await start();
    const reply = await fetchPath(port, streamPath(PROTOCOL_VERSION));
    expect(reply.status).toBe(200);
    expect(opened).toHaveLength(1);
  });

  it("적합 — 불일치·부재는 스트림을 열지 않고 비-200으로 거부된다", async () => {
    const { port, opened } = await start();

    for (const path of [
      streamPath(`${PROTOCOL_VERSION}-old`),
      streamPath(""),
      `${STREAM_PATH}?${PROTOCOL_VERSION_PARAM}=0`,
      STREAM_PATH,
    ]) {
      const reply = await fetchPath(port, path);
      // 스트림이 열리기도 전의 HTTP 400이다(§2.1). 열렸다 닫히는 것이 아니다.
      expect(reply.status, path).toBe(400);
      expect(reply.headers["content-type"], path).not.toMatch(/event-stream/);
      // 침묵하지 않는다(§12) — 무엇이 안 맞았는지가 본문에 있다.
      expect(reply.body, path).toContain(PROTOCOL_VERSION);
    }

    // 협상도 다운그레이드도 없다 — 거부된 요청 중 어느 것도 개설에 도달하지 않았다.
    expect(opened).toEqual([]);
  });

  it("적합 — 스트림을 여는 것은 GET이다", async () => {
    // 이 축의 요청은 §4.1의 관문을 **지나야** 한다. 그 절이 "귀결 하나를 적는다"로
    // 적은 것이 정확히 여기다 — 관문을 못 지난 POST는 이제 405가 아니라 403 하나를 받고,
    // "교차 오리진 POST는 이제 라우트별 응답(405·400·404)이 아니라 거절 하나를 받는다".
    //
    // **그래서 기대값을 403으로 바꾸지 않고 헬퍼가 통과 헤더를 싣는다**(위 `gateHeaders`).
    // 403으로 바꾸면 405 갈래가 도달 불가가 되어 「스트림 개설은 GET이다」를 아무도 안 재게
    // 된다 — 축을 지우는 정정은 커버리지 구멍을 조용히 만든다. 여기 남는 것은 관문이
    // 아니라 **스트림 라우트의 메서드 판정**이다. 관문이 무엇을 거절하고 무엇을 통과시키는가는
    // §4.1 강제 수단이 든 닫힌 표이고 이 파일의 계약이 아니다 — 이 파일의 머리가 스트림의
    // 내용·메서드 표·종료 순서를 각각의 계약으로 밀어낸 것과 같은 분업이다.
    const { port, opened } = await start();
    const reply = await fetchPath(port, streamPath(PROTOCOL_VERSION), "POST");
    expect(reply.status).toBe(405);
    expect(opened).toEqual([]);
  });

  it("적합 — 스트림 라우트 밖의 요청은 다른 갈래로 간다", async () => {
    const { port, opened, plain } = await start();
    const reply = await fetchPath(port, "/");
    expect(reply.status).toBe(204);
    expect(plain).toHaveLength(1);
    expect(opened).toEqual([]);
  });

  it("적합 — 400은 관문의 산물이지 이 서버의 기본 응답이 아니다", async () => {
    // 위 거부 단언이 공허하지 않다는 증거다. 같은 라우트가 버전 하나 차이로 200과 400을
    // 가르므로, 400은 서버가 아무 요청에나 내는 값이 아니다.
    const { port } = await start();
    expect((await fetchPath(port, STREAM_PATH)).status).toBe(400);
    expect((await fetchPath(port, streamPath(PROTOCOL_VERSION))).status).toBe(200);
  });
});

/* ------------------------------------------------------------------------ *
 * §6 말미 — 버전의 자리가 정본과 실물에서 같은 형태다
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §6 말미 — 버전은 스트림을 여는 요청의 쿼리 문자열이 싣는다", () => {
  /** §6 본문. 다음 절 머리 앞까지가 그 절이다 */
  function sectionSix(): string {
    const doc = readFileSync(WEB_UI_DOC, "utf8");
    const start = doc.indexOf("\n## 6. ");
    const end = doc.indexOf("\n### 6.1 ", start + 1);
    if (start === -1 || end === -1) throw new Error("WEB-UI.md에서 §6을 찾지 못했다");
    return doc.slice(start, end);
  }

  it("적합 — 정본이 그 자리를 든다", () => {
    const section = sectionSix();
    expect(section).toContain("쿼리 문자열");
    // 지목이 스트림을 여는 요청이라는 것도 그 절이 이미 든다.
    expect(section).toContain("버전은 스트림을 여는 요청이 싣고");
  });

  it("적합 — 실물이 같은 형태다. 쿼리로만 서고 헤더로는 서지 않는다", async () => {
    const { port, opened } = await start();

    const viaQuery = await fetchPath(
      port,
      `${STREAM_PATH}?${PROTOCOL_VERSION_PARAM}=${PROTOCOL_VERSION}`,
    );
    expect(viaQuery.status).toBe(200);
    expect(opened).toHaveLength(1);

    // 헤더 갈래가 살아 있으면 자리가 둘이고, 그때 정본의 한 문장이 실물의 절반만 말한다.
    const viaHeader = await fetchWithVersionHeader(port, STREAM_PATH, PROTOCOL_VERSION);
    expect(viaHeader.status).toBe(400);
    expect(opened).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------------ *
 * §12 — 기본 포트
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §12 — 기본 포트가 존재한다", () => {
  it("적합 — 존재하고 특권 포트 밖이다. 값은 단정하지 않는다", () => {
    // §12가 값을 세부로 두었으므로 값을 단정하면 그 순간 세부가 계약이 된다.
    expect(Number.isInteger(DEFAULT_PORT)).toBe(true);
    expect(DEFAULT_PORT).toBeGreaterThan(1023);
    expect(DEFAULT_PORT).toBeLessThan(65536);
  });

  it("적합 — 포트를 안 주면 그 기본값이 선다", () => {
    const server = createServeServer({
      host: LOOPBACK_HOST,
      agent: new AgentDouble(),
      openStream: () => undefined,
      handleRequest: () => undefined,
    });
    expect(server.port).toBe(DEFAULT_PORT);
    // 바인드는 아직 없다 — 생성과 바인드가 갈려 있다(§3의 기동 순서).
    expect(server.address).toBeUndefined();
  });
});

/* ------------------------------------------------------------------------ *
 * §5 규칙 2 — 구독
 * ------------------------------------------------------------------------ */

describe("WEB-UI.md §5 규칙 2 — 구독은 subscribe로만 한다", () => {
  it("적합 — 코어 인스턴스에 콜백 속성을 대입하지 않는다", async () => {
    // 대역이 속성 대입을 던짐으로 바꿔 두었으므로, 기동이 성공했다는 것 자체가 대입 0건의
    // 증거다. 소스 문자열 검색이 아니라 실행이 재는 자리다.
    const { agent } = await start();
    expect(agent.subscribed).toHaveLength(1);
  });

  it("적합 — 구독은 프로세스가 하나 들고 연결들이 그 위에 붙는다", async () => {
    const { server, agent } = await start();
    // 코어가 보는 리스너는 하나다. 연결마다 코어를 구독하면 마지막 연결이 끊길 때 코어
    // 구독이 사라지고, 그때 §8의 런 생존이 배선에서 거짓이 된다.
    expect(agent.listeners).toHaveLength(1);

    const seen: AgentEvent[] = [];
    const unsubscribe = server.events.subscribe((event) => {
      seen.push(event);
    });
    const event: AgentEvent = { type: "agent_start" };
    const deliver = agent.listeners[0];
    if (deliver === undefined) throw new Error("코어 구독이 서지 않았다");
    await deliver(event, new AbortController().signal);
    expect(seen).toEqual([event]);

    unsubscribe();
    await deliver(event, new AbortController().signal);
    expect(seen).toHaveLength(1);
  });

  it("적합 — 닫으면 구독을 끊는다", async () => {
    const { server, agent } = await start();
    await server.close();
    expect(agent.unsubscribed).toHaveLength(1);
    expect(agent.listeners).toEqual([]);
  });

  it("적합 — 전달 도중 리스너가 던져도 나머지에게 전달되고 예외는 삼켜지지 않는다", async () => {
    const { server, agent } = await start();
    const seen: string[] = [];
    server.events.subscribe(() => {
      seen.push("첫째");
      throw new Error("구독자 실패");
    });
    server.events.subscribe(() => {
      seen.push("둘째");
    });

    const deliver = agent.listeners[0];
    if (deliver === undefined) throw new Error("코어 구독이 서지 않았다");
    await expect(deliver({ type: "agent_start" }, new AbortController().signal)).rejects.toThrow(
      /구독자 실패/,
    );
    expect(seen).toEqual(["첫째", "둘째"]);
  });
});

/* ------------------------------------------------------------------------ *
 * 브라우저 모듈의 사본 — 이 파일의 상수와 갈리지 않는다 (§6 말미 · §9.3)
 * ------------------------------------------------------------------------ */

/**
 * §6 말미가 *"양쪽이 같은 이름을 쓰는 것은 §9.3이 프로토콜 행동을 이 레포 소유로 둔
 * 결과"*라고 적는데, 브라우저 모듈은 빌드 없이 로드되므로(§9 · `TECH-STACK.md` §2) 이 파일의
 * `.ts` 상수를 런타임에 들여올 수단이 없다. 그래서 그쪽은 사본을 들고 **이 스위트가 그 사본과
 * 정본의 일치를 잰다** — 사본만 두고 검사를 안 두면 서버가 값을 바꾸는 날 화면이 조용히
 * 400·404를 받는다(2026-08-26 · QA D-2 처분).
 *
 * 재는 것은 **문자열 리터럴의 실재**다. 값을 옮겨 적지 않고 이 파일이 import한 정본에서
 * 뽑으므로, 한쪽만 바뀌면 여기서 붉어진다.
 */
describe("§6 말미·§9.3 — 브라우저 모듈이 라우트·버전 파라미터·버전을 정본과 같은 값으로 든다", () => {
  const clientText = stripComments(readFileSync(CLIENT_STREAM, "utf8"));

  it("스트림 라우트가 사본으로 실재하고 값이 같다", () => {
    expect(clientText).toContain(`"${STREAM_PATH}"`);
  });

  it("메서드 라우트가 사본으로 실재하고 값이 같다", () => {
    expect(clientText).toContain(`"${METHOD_PATH}"`);
  });

  it("버전 파라미터의 이름과 자리(쿼리 문자열)가 같다", () => {
    expect(clientText).toContain(`"?${PROTOCOL_VERSION_PARAM}="`);
  });

  it("프로토콜 버전이 같다 — 갈리면 스트림이 열리기 전에 400이다", () => {
    expect(clientText).toContain(`"${PROTOCOL_VERSION}"`);
  });
});
