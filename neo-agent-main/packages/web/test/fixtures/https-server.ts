/**
 * 로컬 HTTPS 테스트 서버 픽스처 — QA-A 계약 테스트 전용. (테스트 파일이 아니므로 vitest가 수집하지 않는다)
 *
 * **왜 이 픽스처가 필요한가.** `WEB-ACCESS.md` §4의 차단 대역은 루프백(127.0.0.0/8)을
 * 포함하므로 **로컬 테스트 서버는 설계상 도달 불가능한 주소에 있다.** 그래서 `fetchUrl`의
 * 5~7단계(피닝 연결·홉 루프·유계)를 외부 도메인 없이 결정론적으로 검증하려면 판정
 * 결과를 주입하는 지점이 하나 필요하다 — `fetch.contract.test.ts`의 `A-2` 마커. 자세한 요청은 리포트 참조.
 *
 * 대안(가짜 `https.request`를 통째로 흉내내기)을 택하지 않은 이유: 그러면 `node:https`의
 * 실제 동작(`lookup` 훅 호출, SNI 전송, Host 헤더 생성, 소켓 파괴)을 검증하지 못하고
 * **우리가 상상한 인자 모양**만 검증하게 된다. 실서버를 쓰면 구현이 어떤 인자 모양을
 * 택하든 결과로 판정할 수 있다(판정 중립).
 *
 * **인증서에 대하여.** 아래 PEM은 이 테스트만을 위해 생성한 자체 서명 키쌍이며
 * 어떤 실서비스와도 무관하다(시크릿이 아니다). 유효기간 100년 — 만료로 인한 미래의
 * 깜빡임을 없애기 위한 것이다. SAN에 `a.test`·`b.test` 등 RFC 6761 예약 TLD를 담아
 * **실제 DNS로는 절대 해석되지 않는 이름**만 쓴다: 구현이 피닝(`lookup` 훅)을 빠뜨리면
 * 이름 해석 자체가 실패하므로, 피닝 누락이 조용히 통과하지 않는다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:https";
import type { TLSSocket } from "node:tls";
import type { UrlVerdict } from "../../src/index.ts";

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDfDCCAmSgAwIBAgIUd/W6olLXiUxn/PvP9n+2xMhfrXAwDQYJKoZIhvcNAQEL
BQAwJjEkMCIGA1UEAwwbbmVvLWFnZW50LXdlYi1jb250cmFjdC10ZXN0MCAXDTI2
MDgwOTAyNTUzOVoYDzIxMjYwNzE2MDI1NTM5WjAmMSQwIgYDVQQDDBtuZW8tYWdl
bnQtd2ViLWNvbnRyYWN0LXRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDc49URFhuUIXepRp0ewjJbeCWzuV5SJNEi440r+Slxnha0icfx/IAGla3g
Y68P7CsZagDGm5K7d2HBO461Ig2bNDHTuw/YQXvSVujy1EMmodqTNgrMulfW9rg8
oKDIz+QYfGsfYFOo9CirNqrXWYrL9EG7TuObPpHkGzC3fODx0LqJ5u2vpGEExtZ+
k+2gAXkIoSLx5t2FWKmZVLPIn435BkmmJDjvayKkay8qGhvzLB91hH9fqWBgLBW9
f0ygjavm71ijpenfMwmb3+bwpiENY/U1XEPUKg1nooZJEaGy8knO/Xae61j3pziQ
NgOq7DGsKsVOQ2PSbEPcVyYjbRm5AgMBAAGjgZ8wgZwwHQYDVR0OBBYEFMnYtqn1
XetpGQ9Sc0IeA1hqbDBZMB8GA1UdIwQYMBaAFMnYtqn1XetpGQ9Sc0IeA1hqbDBZ
MA8GA1UdEwEB/wQFMAMBAf8wSQYDVR0RBEIwQIIGYS50ZXN0ggZiLnRlc3SCCGhv
cC50ZXN0gglzbG93LnRlc3SCCGJpZy50ZXN0gglsb2NhbGhvc3SHBH8AAAEwDQYJ
KoZIhvcNAQELBQADggEBADHJkG+6x5fV6UFdHBza+opIXz7etjAF8GrPFfPdVUcK
xagqQ1Vgld+VOYCaslZpSM5XBgKTCVF2ifHHQmV8fn4Uojq7WpjGv9S/7cUY8A04
r0+Mz1Sqm/bZzJk2zegdNky9lmmBO4iIap/fNwlq+twJvlyO1+FfpP5GOiuCI75X
aCtWh2TyWb9qO6rVQGIs9zRxMTftlaS56zyfJIWWuzpiQjTsorG40luHAPDqCEh+
Js+0hE4o8syj5UFq/AdryQnYvQBFk9QJBaLJbfgk4zfXn+6kHKHi9cJdM653gs8n
SiFpjYC9AAuyGrBOuPxPgpSHPaLRmofn9tmmYWMTi38=
-----END CERTIFICATE-----
`;

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDc49URFhuUIXep
Rp0ewjJbeCWzuV5SJNEi440r+Slxnha0icfx/IAGla3gY68P7CsZagDGm5K7d2HB
O461Ig2bNDHTuw/YQXvSVujy1EMmodqTNgrMulfW9rg8oKDIz+QYfGsfYFOo9Cir
NqrXWYrL9EG7TuObPpHkGzC3fODx0LqJ5u2vpGEExtZ+k+2gAXkIoSLx5t2FWKmZ
VLPIn435BkmmJDjvayKkay8qGhvzLB91hH9fqWBgLBW9f0ygjavm71ijpenfMwmb
3+bwpiENY/U1XEPUKg1nooZJEaGy8knO/Xae61j3pziQNgOq7DGsKsVOQ2PSbEPc
VyYjbRm5AgMBAAECggEABUmp8QcE5+Q8m4kedUN9iTceCSIFag6wd/b91+d9MIq+
ueZeqpvacVRPc+kglXW+mvtKSfbXvO4EB86cbhi2CsW/PjWPhBdRnSZdKYT4/fMb
16OdTHg9TPhqgb8Jok0BuMlWFvHxufNtIgFRkFneV5J0Qvh5CXjmhqqhw6uB+gZM
+64Gpp4iYLi+9W9QH/0hgsAlh74UGOxAdhDjvWHvkfYg5K/yuJPlQRs3aUxlmHSZ
sb4W8V774nww7uJ7pusgbpdC7QOkjt93iuykeBMfVIuZq3tC6SUSqqi1IUEWwQkG
Jlb2ljwNXxOKSPb4mNj9lX1XWraA+G/Txh/II/MyxQKBgQD5ic7N+I8zrp7NXeoB
AqNi9/2VAgiYlt0nDtsAUmjM2ntbZToDoTbadw8YEjtb9nC4C1c9sxItJ1Q847cI
4EySPXeCWt2kKkkCxcWqV3Sn/z53i33tr3UVe58gkBGRMbvM31uOFb+CQFqyXC7e
gczaeItMCa69f4vkLE2y9W/bfQKBgQDinB1CSxpVjwUHfaWEU/59NkyE39GAmNKq
T/fcOlcSM8v0tGNsPBjYwGc1NIGeJNufjpFeMAZ0AAl9my1F9jhpN0taMTmFg7Ip
GtnwHVfqobGytx8cXp78lWUiSbPRmJuaXvUuaqrH/BFjGE2cdMgJLo9zYntDGPDe
hEFxEckz7QKBgQCIgocLzooob8KX/mRhIRxYq+mhdndVYlKhZ1MPHgYO6wbIvNu7
2Jm1caRkOrUWXf7T8ABN1ISBBx7iIICk7m91IQMb4LGXeTpvtdmokidTMCLwKvM8
79tRYUtv+OBjWZ2vOhFP7T3S93mmUR+iwcdbTM6HTlS1fez9ae8nk3UZ0QKBgQCi
0ksPpAji6uVRMY1o3DUh4I7wdiUBAk1zxAuyuFRxprfoNmitjyzHKM+/Yd+0MoV/
Sp/WjilE1fX7wzCvcS+tIebJgk7zSOINONbY+Sx/UPjuETeQWchgcjN9hHloov9C
1vHSDSBymwIfMoopXZuRRVwbKuqoFlaTe3HN/VqVLQKBgFSExJtCLZkKmDq81FlM
YflJvF746IdNTgX5rQGed6Vp310hfysMrcYhB4NGJepPs1b08lRaw3GrLi63ij7f
InLw36WjwkIpRcbIT7YXe3RaqaHuekG4VjweggBmvxR/rtG3rNYyP6ibipy70OjT
ZqV3VIN+b8cunC/Cnd3B1F5W
-----END PRIVATE KEY-----
`;

/** 서버가 기록한 요청 한 건 — 헤더·SNI 계약 검증의 관측 지점 */
export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  /** 소문자 키. `host`·`user-agent`·`cookie`·`authorization`·`referer` 검증에 쓴다 */
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** TLS SNI. `undefined`면 SNI를 보내지 않은 것이다 */
  readonly servername: string | undefined;
}

export interface StubResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  /** 같은 본문을 이 바이트 수에 도달할 때까지 반복 전송한다 — 크기 상한 검증용 */
  repeatToBytes?: number;
  /** 응답 헤더를 쓰기 전 이만큼 지연한다 — 시간 상한 검증용 */
  delayMs?: number;
}

export interface TestHttpsServer {
  readonly port: number;
  readonly requests: readonly RecordedRequest[];
  /** 경로별 응답 등록. 미등록 경로는 404 */
  route(path: string, response: StubResponse): void;
  /** 특정 경로가 받은 요청 수 */
  countFor(path: string): number;
  close(): Promise<void>;
}

export async function startTestHttpsServer(): Promise<TestHttpsServer> {
  const routes = new Map<string, StubResponse>();
  const requests: RecordedRequest[] = [];
  const timers = new Set<NodeJS.Timeout>();

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const path = req.url ?? "/";
    requests.push({
      method: req.method ?? "GET",
      path,
      headers: req.headers,
      servername: (req.socket as TLSSocket).servername || undefined,
    });

    const stub = routes.get(path);
    const send = (): void => {
      // 클라이언트가 이미 끊었으면(시간·크기 상한) 조용히 포기한다 — 서버가 죽으면
      // 그 자체로 테스트가 오염된다.
      if (res.writableEnded || res.destroyed) return;
      if (stub === undefined) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      res.writeHead(stub.status ?? 200, stub.headers ?? { "content-type": "text/plain" });
      const body = stub.body ?? "";
      if (stub.repeatToBytes !== undefined && body.length > 0) {
        let written = 0;
        while (written < stub.repeatToBytes && !res.destroyed) {
          res.write(body);
          written += Buffer.byteLength(body);
        }
      } else if (body.length > 0) {
        res.write(body);
      }
      res.end();
    };

    if (stub?.delayMs !== undefined) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        send();
      }, stub.delayMs);
      timers.add(timer);
      res.on("close", () => {
        clearTimeout(timer);
        timers.delete(timer);
      });
    } else {
      send();
    }
  };

  const server: Server = createServer({ cert: TEST_CERT, key: TEST_KEY }, (req, res) => {
    try {
      handle(req, res);
    } catch {
      // 연결이 이미 끊긴 뒤의 쓰기 실패는 테스트 대상이 아니다
    }
  });
  server.on("clientError", () => {
    /* TLS 핸드셰이크 중단 등 — 무시 */
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("서버 주소를 얻지 못했다");
  const port = address.port;

  return {
    port,
    requests,
    route(path, response) {
      routes.set(path, response);
    },
    countFor(path) {
      return requests.filter((entry) => entry.path === path).length;
    },
    async close() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

/**
 * 자체 서명 인증서를 신뢰하게 만드는 전역 스위치.
 *
 * 구현에 `rejectUnauthorized: false` 같은 완화 옵션을 **요구하지 않기 위해** 프로세스
 * 환경 변수를 쓴다. 이 완화가 구현의 TLS 검증 누락을 가려버리므로,
 * `package-boundary.contract.test.ts`가 소스에 `rejectUnauthorized: false`·
 * `NODE_TLS_REJECT_UNAUTHORIZED`가 없음을 별도로 고정한다(보상 검증).
 *
 * **다른 테스트 파일로 새지 않는다 — 2026-08-10 실측.** 이 스위치가 프로세스 전역이라
 * "같은 워커의 다른 파일이 창 안에서 느슨해지는가"가 7사이클 동안 미검증으로 남아
 * 있었다. 실측 결과 **vitest가 파일마다 별도 프로세스를 쓴다**: 이 함수를 부르는 파일
 * 3개가 각각 다른 pid에서 돌았고, 같은 시간대에 3초간 50ms 간격으로 60회 샘플링한
 * 별도 파일은 완화 상태를 **0회** 관측했다(자신도 네 번째 pid였다). 즉 새는 것이
 * 관측되지 않은 게 아니라 **프로세스 경계가 구조적으로 막는다.**
 *
 * **재검토 트리거**: vitest 풀 구성을 바꿀 때(`pool: "threads"`, `isolate: false`,
 * `fileParallelism` 조정 등). 그 순간 이 근거가 사라지므로 다시 재야 한다 —
 * 현재 `vitest.config.ts`는 `projects`만 정하고 풀을 명시하지 않는다.
 */
export function relaxTlsForFixtureCert(): () => void {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  return () => {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
  };
}

/**
 * 지정한 호스트명만 루프백으로 고정 판정하고, 나머지는 **실제 `verifyUrl`에 넘기는**
 * 판정기. 리다이렉트 목적지의 SSRF 재판정을 진짜로 돌리기 위한 구성이다 —
 * 전부 통과시키는 스텁을 쓰면 §4 6단계(홉마다 1단계부터 재실행) 검증이 무의미해진다.
 */
export function loopbackVerifyFor(
  hostnames: readonly string[],
  real: (url: string) => Promise<UrlVerdict>,
): (url: string) => Promise<UrlVerdict> {
  const allowed = new Set(hostnames);
  return async (url) => {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return real(url);
    }
    if (allowed.has(hostname)) return { ok: true, addresses: ["127.0.0.1"] };
    return real(url);
  };
}
