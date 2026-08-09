/**
 * SSRF 판정 — `docs/WEB-ACCESS.md` §4. **이 순서가 계약이다.**
 *
 *   1. URL 파싱·스킴·userinfo 검증 — 실패면 여기서 끝. **DNS를 부르지 않는다.**
 *   2. 호스트가 IP 리터럴이면 DNS를 건너뛴다.
 *   3. DNS 해석 — A/AAAA 전부.
 *   4. 대역 판정 — 받은 **모든 주소**를 대조하고 차단 대역인 것을 버린다.
 *      전부 버려지면 거부.
 *
 * 판정의 소유자는 이 패키지 하나다. 판정기가 둘이면 어긋난다.
 *
 * **완화 설정은 없다**(§4). 사설 대역을 여는 설정 키도, 판정을 끄는 문도 만들지
 * 않는다 — 설정 표면이 없으면 약화 경로도 없다. 아래 `deps`는 설정 표면이 아니라
 * 주입점이다: 함수 인자이고, 호스트(CLI)는 프로덕션에서 채우지 않으며, 무엇이
 * 주입되든 4단계(대역 대조)는 그대로 돈다.
 */

import { promises as dns } from "node:dns";
import { isIP, isIPv6 } from "node:net";
import { createBlockList } from "./blocklist.ts";

export type UrlVerdict =
  /** 검증을 통과한 IP만. 연결은 이 중에서만 한다 */
  | { ok: true; addresses: string[] }
  /** 모델에게 보이는 사유 — 침묵 거부는 없다 */
  | { ok: false; reason: string };

export interface VerifyUrlDeps {
  /**
   * 이름 해석기(3단계)만 갈아끼우는 주입점. 기본값은 실제 DNS이며, **무엇을
   * 돌려주든 4단계는 그대로 돈다** — 이 인자로 차단 대역이 열리지 않는다.
   */
  resolveHostname?(hostname: string): Promise<string[]>;
}

/** 대역표는 코드 상수다 — 모듈 수준에 하나만 두고 생성 후 바꾸지 않는다 (§9 A-3) */
const BLOCK_LIST = createBlockList();

/** `[::1]` 처럼 URL이 감싸 주는 대괄호를 벗긴다 — `node:net`·`node:https`는 맨 주소를 쓴다 */
export function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export type UrlShape = { ok: true; url: URL; hostname: string } | { ok: false; reason: string };

/**
 * 1단계 — 파싱·스킴·userinfo. `fetchUrl`도 홉마다 이것을 직접 부른다:
 * 판정 주입점(`FetchOptions.verify`)이 스킴 검사를 **우회할 수 없어야** 하기 때문이다.
 */
export function checkUrlShape(url: string): UrlShape {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: `Not a valid absolute URL: ${url}` };
  }

  if (parsed.protocol !== "https:") {
    // 평문 허용은 내부망 대상 SSRF의 주 경로다(§3). 재도입 트리거는 §8.
    return {
      ok: false,
      reason: `Only https URLs are allowed; got scheme "${parsed.protocol.replace(":", "")}".`,
    };
  }

  if (parsed.username !== "" || parsed.password !== "") {
    // 자격증명 유출 경로인 동시에 `https://trusted.com@evil.com/`처럼 파서마다
    // 호스트 해석이 갈리는 고전적 우회의 입구다. 판정기와 연결기가 호스트를
    // 다르게 읽으면 §4 전체가 무의미해진다.
    return {
      ok: false,
      reason: "URL carries credentials (userinfo before @), which is refused for any target.",
    };
  }

  const hostname = stripBrackets(parsed.hostname);
  if (hostname === "") {
    return { ok: false, reason: `URL has no host: ${url}` };
  }

  return { ok: true, url: parsed, hostname };
}

/** 3단계 기본 해석기 — A/AAAA를 전부 받는다. 순서는 응답 순서를 보존한다(§9 A-4) */
async function resolveViaDns(hostname: string): Promise<string[]> {
  const [v4, v6] = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);
  const addresses: string[] = [];
  if (v4.status === "fulfilled") addresses.push(...v4.value);
  if (v6.status === "fulfilled") addresses.push(...v6.value);
  if (addresses.length === 0) {
    const cause = v4.status === "rejected" ? v4.reason : v6.status === "rejected" ? v6.reason : undefined;
    throw new Error(cause instanceof Error ? cause.message : `no A/AAAA records for ${hostname}`);
  }
  return addresses;
}

function isBlocked(address: string): boolean {
  // `check()`의 패밀리 기본값은 `"ipv4"`다 — IPv6 문자열에 패밀리를 생략하면
  // `false`가 돌아온다(조용한 통과). 항상 명시한다.
  return BLOCK_LIST.check(address, isIPv6(address) ? "ipv6" : "ipv4");
}

/**
 * URL 하나를 판정한다. 통과분이 하나도 없으면 `{ ok: false }`이며,
 * **`{ ok: true, addresses: [] }`는 만들지 않는다**(§9 A-7) — "ok인데 연결할 곳이
 * 없다"는 호출자가 반드시 다시 판정해야 하는 상태이므로 타입으로 배제한다.
 *
 * 실패는 전부 값이다 — DNS 해석 실패도 throw하지 않는다(§9 A-5).
 */
export async function verifyUrl(url: string, deps?: VerifyUrlDeps): Promise<UrlVerdict> {
  const shape = checkUrlShape(url);
  if (!shape.ok) return shape;
  const { hostname } = shape;

  // 2단계 — IP 리터럴이면 이름 해석이 필요 없다. 여기서 DNS를 부르면 거부될
  // 대상에 대해서도 해석 트래픽이 나가고, 그것 자체가 정보 유출이다.
  let addresses: string[];
  if (isIP(hostname) !== 0) {
    addresses = [hostname];
  } else {
    const resolve = deps?.resolveHostname ?? resolveViaDns;
    try {
      addresses = await resolve(hostname);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: `Could not resolve host "${hostname}": ${detail}` };
    }
  }

  if (addresses.length === 0) {
    return { ok: false, reason: `Host "${hostname}" resolved to no addresses.` };
  }

  // 4단계 — **모든 주소**를 대조한다. 첫 주소만 보고 배열을 그대로 넘기면
  // 검증되지 않은 IP로 연결된다(Happy Eyeballs, 2026-08-08 실측).
  // 순서는 보존하고 중복은 제거하지 않는다(§9 A-4) — 순서에 의미가 있다.
  const passed = addresses.filter((address) => isIP(address) !== 0 && !isBlocked(address));

  if (passed.length === 0) {
    return {
      ok: false,
      reason:
        `Host "${hostname}" resolves only to addresses in blocked ranges ` +
        `(loopback, private, link-local, CGNAT, multicast, reserved): ${addresses.join(", ")}.`,
    };
  }

  return { ok: true, addresses: passed };
}
