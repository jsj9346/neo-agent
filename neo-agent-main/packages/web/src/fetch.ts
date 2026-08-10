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
 * 아래 세 값은 **T-012 실사용 실측으로 확정**했다(실 조회 50건, HTML 성공분).
 * 관측 분포는 raw 바이트 p50 181KB · p95 1.31MB · 최대 2.93MB, 총 소요 p50 439ms ·
 * p95 1,536ms · 최대 4,427ms, 리다이렉트 홉 최대 2(98%가 1홉 이하)였다.
 *
 * - **4MB** — 2MB에서는 50건 중 1건(2.93MB)이 잘렸고 그 1건에서 추출 텍스트의
 *   **23.4%가 사라졌다**. §3이 이어 읽기를 제공하지 않기로 한 이상 잘림은 회복
 *   불가능한 손실이므로 상한은 관측 최대치보다 확실히 위에 둔다(관측 최대의 1.37배,
 *   표본 절단 0건). 반대 방향의 비용은 추출 시간뿐인데 2.93MB HTML의 `extractText`가
 *   50ms대다 — 상한을 정하는 근거가 되지 못한다.
 * - **15초** — 관측 최대의 3.4배. 30초는 최대의 6.8배로 **실패를 늦게 알리는 쪽으로만**
 *   작동한다. 대화형 단발 조회에서 30초 침묵은 사용자가 취소를 누르는 시간이다.
 * - **5홉 유지** — 관측 최대 2홉의 2.5배로 이미 넉넉하다. 홉 상한은 시간도 컨텍스트도
 *   먹지 않는다(시간은 체인 전체가 나눠 쓰는 단일 예산이다) — 낮출 실익이 없다.
 */
export const WEB_FETCH_MAX_BYTES = 4 * 1024 * 1024;
export const WEB_FETCH_TIMEOUT_MS = 15_000;
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
      /**
       * 페이지가 선언했지만 지원 목록에 없어 UTF-8로 떨어진 인코딩 라벨
       * `[미규정 EW-6]`. 정상 경로에서는 없다 — **있다는 것 자체가 "이 본문은 깨져
       * 있을 수 있다"는 사실**이고, 그 사실은 결과 텍스트에 드러나야 한다.
       * 침묵하면 모델이 치환 문자 덩어리를 문서로 읽는다(`ARCHITECTURE.md` §2.6).
       */
      unsupportedCharset?: string;
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
 * content-type의 `charset=` 파라미터. 라벨은 길어야 수십 자다 — 유계로 둔다.
 */
const CHARSET_PARAM = /;\s*charset\s*=\s*"?\s*([a-zA-Z0-9_.:+-]{1,40})/i;

/**
 * 본문 선두의 인코딩 선언. `<meta charset="euc-kr">`와
 * `<meta http-equiv="Content-Type" content="text/html; charset=euc-kr">`는 둘 다
 * `charset=`을 포함하므로 패턴 하나로 덮인다. 태그 안쪽 필러는 유계다(`{0,400}`) —
 * 큰 문서에서 백트래킹이 늘어나지 않게 한다.
 */
const META_CHARSET = /<meta\b[^>]{0,400}?\bcharset\s*=\s*["']?\s*([a-zA-Z0-9_.:+-]{1,40})/i;

/**
 * `<meta>` 탐색 구간. HTML 표준의 prescan은 1,024바이트인데 T-012 실측 표본(EUC-KR
 * 페이지)의 선언이 **992바이트**에 있었다 — 여유 없이 딱 맞는 값이다. 4KB로 잡되
 * 전체를 훑지는 않는다. 실제 `<meta>`는 `<head>` 안에 있고, 전체 훑기는 4MB 본문에서
 * 비용이 된다.
 */
const META_SCAN_BYTES = 4096;

/**
 * 디코더에 넘길 수 있는 인코딩 라벨. **화이트리스트다** — 모르는 라벨은 UTF-8로
 * 떨어지고 그 사실이 결과에 드러난다(`[미규정 EW-6]`).
 *
 * 왜 `new TextDecoder(label)`을 try/catch로 감싸는 것만으로는 부족한가: **던지지 않고
 * 쓰레기를 내놓는 라벨이 있다.** `x-user-defined`는 0x80 이상 바이트를 전부 사설
 * 사용 영역(U+F780~)으로 옮긴다 — 예외도 없고 U+FFFD도 없어서 아래 어느 층도
 * 이상을 알아챌 수 없다(실측: `가나다` 9바이트 → U+F7EA U+F7B0 … , U+FFFD 0개).
 * 받을 라벨을 세는 쪽만이 이 조용한 손상을 막는다. throw하는 라벨(`hz-gb-2312`·
 * `iso-2022-kr` 등, 이 런타임에서 RangeError)은 아래 try/catch가 이중으로 받는다.
 *
 * UTF-16 계열은 일부러 뺐다. 상한이 raw 바이트라 홀수 바이트에서 잘리면 문서 전체가
 * 어긋나고, HTML 표준도 `<meta>`의 UTF-16 선언은 UTF-8로 취급하라고 정한다.
 *
 * 별칭 해석 자체는 `TextDecoder`가 한다 — 여기서는 **받을지 말지만** 정한다.
 */
const SUPPORTED_CHARSETS: ReadonlySet<string> = new Set([
  // 유니코드·ASCII
  "utf-8",
  "utf8",
  "unicode-1-1-utf-8",
  "us-ascii",
  "ascii",
  // 한국어
  "euc-kr",
  "ks_c_5601-1987",
  "ks_c_5601-1989",
  "ksc5601",
  "ksc_5601",
  "korean",
  "windows-949",
  "cp949",
  // 일본어
  "shift_jis",
  "shift-jis",
  "sjis",
  "x-sjis",
  "ms_kanji",
  "windows-31j",
  "euc-jp",
  "x-euc-jp",
  "iso-2022-jp",
  // 중국어
  "gb2312",
  "gb_2312",
  "gb_2312-80",
  "gbk",
  "gb18030",
  "x-gbk",
  "euc-cn",
  "chinese",
  "big5",
  "big5-hkscs",
  "cn-big5",
  "csbig5",
  // 라틴·키릴
  "iso-8859-1",
  "iso8859-1",
  "latin1",
  "iso-8859-2",
  "iso-8859-5",
  "iso-8859-7",
  "iso-8859-9",
  "iso-8859-15",
  "windows-1250",
  "windows-1251",
  "windows-1252",
  "windows-1253",
  "windows-1254",
  "windows-1255",
  "windows-1256",
  "windows-1257",
  "windows-1258",
  "cp1251",
  "cp1252",
  "koi8-r",
  "koi8-u",
  "macintosh",
]);

/** 페이지가 선언한 인코딩. 헤더가 먼저고, 없으면 HTML 선두의 `<meta>`다 */
function declaredCharset(raw: Buffer, contentType: string): string | undefined {
  const fromHeader = CHARSET_PARAM.exec(contentType)?.[1];
  if (fromHeader !== undefined) return fromHeader.toLowerCase();

  // `<meta>` 탐색은 HTML 계열에서만 한다. JSON·평문에는 그런 선언이 없고, 본문
  // 어딘가의 `charset=` 문자열을 선언으로 오인하면 멀쩡한 문서를 잘못 디코드한다.
  const bare = bareContentType(contentType);
  if (bare !== "text/html" && bare !== "application/xhtml+xml") return undefined;

  // latin1은 바이트를 1:1로 옮긴다 — 아직 인코딩을 모르는 상태에서 선두를 훑는
  // 유일하게 안전한 방법이다(UTF-8로 읽으면 선언 자체가 치환 문자에 묻힌다).
  const prefix = raw.subarray(0, META_SCAN_BYTES).toString("latin1");
  return META_CHARSET.exec(prefix)?.[1]?.toLowerCase();
}

/**
 * raw 바이트를 문자열로 만든다. **자리가 여기인 이유**: 바이트를 가진 곳이 여기뿐이고
 * 크기 상한도 raw 바이트 기준이다(§9 A-9). 도구가 문자열을 받은 뒤에는 이미 늦다.
 *
 * 고치는 이유는 `[미규정 EW-5]`의 UTF-8 고정이 **침묵 실패**였기 때문이다
 * (`ARCHITECTURE.md` §2.6). T-012 실측: EUC-KR 페이지 한 곳에서 9,869자 중 5,847자가
 * U+FFFD였는데 **에러가 아니라 성공으로 돌아왔다** — 모델은 그것을 문서로 읽는다.
 * 한국 주요 사이트 16곳 중 1곳이 비UTF-8이었다(드물지만 0은 아니다).
 */
function decodeBody(
  raw: Buffer,
  contentType: string,
): { body: string; unsupportedCharset?: string } {
  const declared = declaredCharset(raw, contentType);

  if (declared !== undefined && SUPPORTED_CHARSETS.has(declared)) {
    try {
      return { body: new TextDecoder(declared).decode(raw) };
    } catch {
      // 목록과 런타임이 어긋난 경우. 조용히 UTF-8로 넘어가지 않는다.
      return { body: new TextDecoder("utf-8").decode(raw), unsupportedCharset: declared };
    }
  }

  const body = new TextDecoder("utf-8").decode(raw);
  // 선언이 없으면 UTF-8이 맞다고 보는 것이 웹의 기본값이므로 알릴 것이 없다.
  // 선언이 있는데 지원하지 않는 경우만 결과에 드러낸다.
  return declared === undefined ? { body } : { body, unsupportedCharset: declared };
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
  | {
      kind: "response";
      contentType: string;
      body: string;
      truncated: boolean;
      unsupportedCharset?: string;
    }
  | { kind: "redirect"; location: string }
  | { kind: "error"; reason: string };

interface HopOptions {
  addresses: readonly string[];
  maxBytes: number;
  /**
   * 이 홉이 실제로 쓸 수 있는 시간 — 체인 전체 예산의 **잔여분**이다(§3의 단일 예산).
   * 타이머가 보는 값은 이쪽이다.
   */
  remainingMs: number;
  /**
   * 사유 문구에 쓰는 **설정된 총 예산** (2026-08-10 판정 A-17). 타이머는 잔여분으로
   * 재지만 사용자·모델에게 보고하는 수치는 총 예산이다 — 잔여분은 아무도 설정한 적
   * 없는 내부 회계이고, 그 수치를 사유에 실으면 `timeoutMs: 1500`으로 부른 호출이
   * `Timed out after 1178ms`로 돌아온다(T-012 실측). **보고는 조정 가능한 손잡이의
   * 단위로 한다** — 그래야 모델이 "더 줘야 하나"를 판단할 수 있다. 같은 문장이
   * `fetchUrl`의 홉 진입 전 검사에서는 이미 총 예산을 보고하고 있었으므로, 같은
   * 문면이 경로에 따라 다른 뜻이 되는 것을 함께 없앤다.
   */
  totalTimeoutMs: number;
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
        // 상한이 raw 바이트라 잘린 끝에서 멀티바이트 문자가 쪼개질 수 있다
        // (치환 문자로 나타난다). 그것은 잘림의 성질이지 인코딩 판정의 실패가 아니다.
        finish({
          kind: "response",
          contentType: header,
          truncated,
          ...decodeBody(Buffer.concat(chunks), header),
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
      finish({
        kind: "error",
        reason: `Timed out after ${options.totalTimeoutMs}ms: ${target.href}`,
      });
      req.destroy();
    }, options.remainingMs);

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
      remainingMs: remaining,
      totalTimeoutMs: timeoutMs,
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
      ...(hop.unsupportedCharset === undefined
        ? {}
        : { unsupportedCharset: hop.unsupportedCharset }),
    };
  }
}
