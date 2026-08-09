/**
 * 피닝 HTTPS 클라이언트 — `docs/WEB-ACCESS.md` §4 5~7단계.
 *
 *   5. 피닝 연결 — `lookup` 훅에서 4단계를 통과한 주소만 돌려준다. 연결은 검증된
 *      IP로 하되 `Host` 헤더와 SNI는 **원 호스트명을 보존**한다(DNS 리바인딩 방어).
 *   6. 리다이렉트는 홉마다 1단계부터 전부 재실행한다. 홉 수는 유계.
 *   7. 응답 크기·시간 유계.
 *
 * **내장 `fetch`를 쓰지 않는다.** Node가 `undici`를 모듈로 노출하지 않아 dispatcher에
 * `lookup`을 꽂을 수 없다(2026-08-08 실측) — `node:https` 직접 사용은 취향이 아니라
 * 전제다. 부수 효과로 리다이렉트가 자동 추종되지 않아 홉별 재판정이 구조적으로
 * 강제된다.
 *
 * 실패는 전부 값이다(`{ ok: false, reason }`). throw로 번역하는 것은 도구의 몫이다
 * (§9 A-14) — 전송 계층과 도구는 각자의 계약을 지킨다.
 */

import { type RequestOptions, request } from "node:https";
import type { LookupFunction } from "node:net";
import { isIP, isIPv6 } from "node:net";
import { checkUrlShape, stripBrackets, type UrlVerdict, verifyUrl } from "./verdict.ts";

/**
 * 기준선 수치. 계약은 "유계 + 잘림 가시화 + 기본값 존재"이지 수치가 아니다(§8).
 * 실사용 실측(T-012)으로 조정될 수 있다.
 */
export const WEB_FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const WEB_FETCH_TIMEOUT_MS = 30_000;
export const WEB_FETCH_MAX_REDIRECTS = 5;

/**
 * 요청 신원은 정직하다(§3). 브라우저나 다른 제품을 사칭하는 UA는 넣지 않는다 —
 * 컴플라이언스 규칙(ARCHITECTURE §2.2)이 모델 프로바이더 밖으로 처음 확장되는 지점이다.
 *
 * 버전은 `package.json`과 함께 손으로 맞춘다. 파일에서 읽지 않는 이유는 `node:fs`가
 * 이 패키지에서 금지이기 때문이다(§2).
 */
const VERSION = "0.1.0";
const USER_AGENT = `neo-agent/${VERSION}`;

export interface FetchOptions {
  signal?: AbortSignal;
  /** raw 바이트 상한 (§9 A-9) */
  maxBytes?: number;
  /** 요청 전체(리다이렉트 포함)의 시간 예산 `[미규정 EW-4]` */
  timeoutMs?: number;
  maxRedirects?: number;
  /**
   * 판정 주입점. 기본값은 실제 `verifyUrl`이며 호스트(CLI)는 프로덕션에서 채우지
   * 않는다(§4). 스킴·userinfo 검사(1단계)는 이 주입과 무관하게 여기서 항상 돈다 —
   * 주입이 §4의 입구를 우회하지 못하게 한다.
   */
  verify?: (url: string) => Promise<UrlVerdict>;
}

export type FetchOutcome =
  | {
      ok: true;
      /** 최종 URL — 리다이렉트를 따라갔다면 목적지다 */
      url: string;
      /** 받은 content-type 헤더 원문 */
      contentType: string;
      /** **raw 본문.** 추출은 도구의 몫이다(§3, 판정 A-6) */
      body: string;
      truncated: boolean;
      /** 리다이렉트 횟수. 리다이렉트가 없으면 0 (§9 A-8) */
      hops: number;
    }
  | { ok: false; reason: string };

/** `text/plain; charset=utf-8` → `text/plain` */
export function bareContentType(header: string): string {
  const [bare = ""] = header.split(";");
  return bare.trim().toLowerCase();
}

/**
 * 텍스트로 다룰 수 있는 타입만 통과시킨다(§3). 그 외(바이너리·이미지)는 거부하고
 * **받은 content-type을 사유에 명시**한다 — 사유에 타입이 없으면 모델의 재시도가 눈먼다.
 */
export function isTextualContentType(header: string): boolean {
  const bare = bareContentType(header);
  return (
    bare.startsWith("text/") ||
    bare === "application/json" ||
    bare.endsWith("+json") ||
    bare === "application/xhtml+xml"
  );
}

/**
 * 5단계 — 검증을 통과한 주소만 돌려주는 `lookup` 훅.
 *
 * **배열 전원을 넘긴다.** Happy Eyeballs(`autoSelectFamily` 기본 활성)가 `all: true`로
 * 부르며, 첫 주소만 검증하고 나머지를 그대로 넘기면 검증되지 않은 IP로 연결된다.
 * 여기 오는 배열은 이미 4단계를 통과한 것뿐이다.
 */
function createPinnedLookup(addresses: readonly string[]): LookupFunction {
  const entries = addresses.map((address) => ({
    address,
    family: isIPv6(address) ? 6 : 4,
  }));

  return (_hostname, options, callback) => {
    const requested: unknown = options.family;
    const wanted =
      requested === 6 || requested === "IPv6" ? 6 : requested === 4 || requested === "IPv4" ? 4 : 0;
    const usable = wanted === 0 ? entries : entries.filter((entry) => entry.family === wanted);

    if (usable[0] === undefined) {
      const error: NodeJS.ErrnoException = new Error(
        "No verified address is available for this connection.",
      );
      error.code = "ENOTFOUND";
      callback(error, []);
      return;
    }

    if (options.all === true) {
      callback(null, [...usable]);
      return;
    }
    callback(null, usable[0].address, usable[0].family);
  };
}

type HopResult =
  | { kind: "response"; contentType: string; body: string; truncated: boolean }
  | { kind: "redirect"; location: string }
  | { kind: "error"; reason: string };

interface HopOptions {
  addresses: readonly string[];
  maxBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

/** 한 홉의 요청. 시간 상한은 **소켓을 파괴한다** — 값만 돌려주고 연결이 살아 있으면 상한이 아니다 */
function requestHop(target: URL, options: HopOptions): Promise<HopResult> {
  return new Promise<HopResult>((resolve) => {
    const hostname = stripBrackets(target.hostname);
    const isLiteral = isIP(hostname) !== 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: HopResult): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(result);
    };

    const requestOptions: RequestOptions = {
      // 연결은 IP로, 신원은 이름으로. `hostname`을 원 호스트명으로 두면 Node가
      // `Host` 헤더를 이름으로 만들고, 실제 연결처는 아래 `lookup`이 정한다.
      // IP를 Host에 실으면 가상 호스팅된 대상이 다른 사이트를 준다 — 조용한 오조회다.
      hostname,
      port: target.port === "" ? 443 : Number(target.port),
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html, text/*;q=0.9, application/json;q=0.9, */*;q=0.1",
        // 스스로 압축을 풀지 않으므로 압축을 요청하지 않는다.
        "accept-encoding": "identity",
        // 쿠키·Authorization·Referer는 보내지 않는다(§3). 세션을 만들지 않으므로
        // 사용자의 로그인 상태를 빌려 쓸 수 없다 — 혼동된 대리인 문제의 제거다.
      },
      lookup: createPinnedLookup(options.addresses),
      // SNI도 원 호스트명이다. IP 리터럴에는 SNI를 보내지 않는다(TLS가 이름만 받는다).
      ...(isLiteral ? {} : { servername: hostname }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };

    const req = request(requestOptions, (res) => {
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400) {
        const location = res.headers.location;
        res.resume();
        req.destroy();
        if (typeof location === "string" && location.trim() !== "") {
          finish({ kind: "redirect", location });
          return;
        }
        finish({ kind: "error", reason: `HTTP ${status} redirect without a Location header.` });
        return;
      }

      if (status < 200 || status >= 300) {
        // `[미규정 EW-2]` 비 2xx 응답의 표현. 본문 대신 상태 코드를 사유로 준다 —
        // 오류 페이지 본문을 성공처럼 돌려주면 모델이 그것을 문서로 읽는다.
        res.resume();
        req.destroy();
        finish({ kind: "error", reason: `HTTP ${status} response from ${target.href}.` });
        return;
      }

      const header = res.headers["content-type"];
      if (typeof header !== "string" || header.trim() === "") {
        // `[미규정 EW-1]` content-type 부재. 타입을 모르면 텍스트라고 단정할 수 없다.
        res.resume();
        req.destroy();
        finish({ kind: "error", reason: `Response has no content-type header: ${target.href}.` });
        return;
      }
      if (!isTextualContentType(header)) {
        res.resume();
        req.destroy();
        finish({ kind: "error", reason: `Unsupported content type: ${header}` });
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      let truncated = false;

      const finishBody = (): void => {
        // `[미규정 EW-5]` charset은 보지 않고 UTF-8로 읽는다. 상한이 raw 바이트라
        // 잘린 끝에서 멀티바이트 문자가 쪼개질 수 있다(치환 문자로 나타난다).
        finish({
          kind: "response",
          contentType: header,
          body: Buffer.concat(chunks).toString("utf8"),
          truncated,
        });
      };

      res.on("data", (chunk: Buffer) => {
        if (settled) return;
        const remaining = options.maxBytes - total;
        if (chunk.length > remaining) {
          if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
          total += Math.max(remaining, 0);
          truncated = true;
          finishBody();
          res.destroy();
          req.destroy();
          return;
        }
        chunks.push(chunk);
        total += chunk.length;
      });
      res.on("end", finishBody);
      res.on("error", (error: Error) => {
        finish({ kind: "error", reason: `Response stream failed: ${error.message}` });
      });
    });

    req.on("error", (error: Error) => {
      finish({ kind: "error", reason: `Request to ${target.href} failed: ${error.message}` });
    });

    timer = setTimeout(() => {
      finish({ kind: "error", reason: `Timed out after ${options.timeoutMs}ms: ${target.href}` });
      req.destroy();
    }, options.timeoutMs);

    req.end();
  });
}

/**
 * URL 하나를 가져온다. 판정 → 피닝 연결 → (리다이렉트면 처음부터 다시)의 반복이다.
 *
 * 돌려주는 본문은 **raw**다. content-type 분기 중 "거부"만 여기서 하고(바이너리를
 * 문자열로 담을 수 없으므로), 표현(HTML 추출·래핑)은 도구가 한다(§3, 판정 A-6).
 */
export async function fetchUrl(url: string, options: FetchOptions = {}): Promise<FetchOutcome> {
  const maxBytes = options.maxBytes ?? WEB_FETCH_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? WEB_FETCH_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? WEB_FETCH_MAX_REDIRECTS;
  const verify = options.verify ?? verifyUrl;
  const deadline = Date.now() + timeoutMs;

  let current = url;
  let hops = 0;

  for (;;) {
    if (options.signal?.aborted === true) {
      // abort는 값으로 표현한다(§9 A-10) — 판정기의 거부와 같은 규율이다.
      return { ok: false, reason: `Aborted before fetching ${current}.` };
    }

    // 1단계는 홉마다 여기서 직접 돈다. 주입된 판정기가 스킴·userinfo 검사를
    // 대신하거나 우회하는 일이 없어야 한다.
    const shape = checkUrlShape(current);
    if (!shape.ok) return { ok: false, reason: shape.reason };

    const verdict = await verify(current);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
    if (verdict.addresses.length === 0) {
      // 판정기는 이 상태를 만들지 않지만(§9 A-7), 주입된 판정기는 만들 수 있다.
      // 빈 배열은 연결이 아니라 실패다 — 여기서 막지 않으면 피닝 없는 연결이 된다.
      return { ok: false, reason: `No verified address to connect to for ${current}.` };
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return { ok: false, reason: `Timed out after ${timeoutMs}ms while fetching ${url}.` };
    }

    const hop = await requestHop(shape.url, {
      addresses: verdict.addresses,
      maxBytes,
      timeoutMs: remaining,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    if (hop.kind === "error") return { ok: false, reason: hop.reason };

    if (hop.kind === "redirect") {
      if (hops >= maxRedirects) {
        return {
          ok: false,
          reason: `Too many redirects (limit ${maxRedirects}) starting from ${url}.`,
        };
      }
      let next: URL;
      try {
        next = new URL(hop.location, shape.url);
      } catch {
        // `[미규정 EW-3]` 해석 불가능한 Location.
        return { ok: false, reason: `Redirect target is not a usable URL: ${hop.location}` };
      }
      hops += 1;
      current = next.href;
      continue;
    }

    return {
      ok: true,
      url: shape.url.href,
      contentType: hop.contentType,
      body: hop.body,
      truncated: hop.truncated,
      hops,
    };
  }
}
