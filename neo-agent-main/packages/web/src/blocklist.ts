/**
 * 차단 대역 — `docs/WEB-ACCESS.md` §4.
 *
 * 판정은 `node:net`의 내장 `BlockList`가 한다. 외부 IP 파싱 라이브러리를 넣지 않는
 * 근거는 §4·§7이다: CIDR 판정이 내장이고, **IPv4-mapped IPv6(`::ffff:10.0.0.1`)를
 * 내장이 이미 처리한다**(2026-08-08 실측). 즉 우리 코드에는 그 우회를 막는 방어가
 * 없고 내장 동작에 의존한다 — 그래서 §8이 그 의존 자체를 계약 테스트로 고정했다.
 * 테스트가 깨지면 명시적 정규화를 우리가 떠안는다.
 *
 * 이 표는 코드 상수다. 설정 파일·환경 변수에서 읽지 않는다 — 설정 표면이 없으면
 * 약화 경로도 없다(§4).
 */

import { BlockList } from "node:net";

/** `[네트워크 주소, prefix 길이]` */
type Subnet = readonly [string, number];

/**
 * IPv4 차단 대역. `240.0.0.0/4`가 broadcast(`255.255.255.255`)까지 덮으므로
 * 별도 규칙을 두지 않는다 — 대역으로 덮이는 것을 특례로 다시 적으면 표가
 * 두 곳에서 진실을 주장하게 된다.
 *
 * **`export`는 아래 NAT64 그림자가 이 표의 생성물이라는 계약을 계약 테스트가
 * «순회»로 재기 위한 것이다** — 대표 표본 몇 개로는 「IPv4 표에 대역이 하나 늘 때
 * 그림자가 조용히 갈린다」는 정확히 그 실패를 못 잡는다. `index.ts` 배럴에는 올리지
 * 않는다: 이것은 패키지 밖에 내놓을 생각이 없는 중간 상수이고, 배럴의 소속 기준이
 * 그런 것을 올리지 않는다(`CLI-INTERFACE.md` §1).
 */
export const BLOCKED_IPV4: readonly Subnet[] = [
  ["0.0.0.0", 8], // unspecified / "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — 클라우드 메타데이터(169.254.169.254)가 여기 포함된다
  ["172.16.0.0", 12], // private
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // RFC2544 benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

/**
 * IPv6 차단 대역. **이 표를 지배하는 것은 §4 「IPv4를 품은 IPv6 — 두 규칙」이다.**
 *
 * 1. *"판정 대상은 감싼 형식이 아니라 품은 목적지다."* — IPv4를 품은 IPv6 주소는
 *    품은 IPv4로 판정한다. 소비자는 둘이고 **둘 다 이 표에 열거되지 않는다**:
 *    IPv4-mapped는 내장 `BlockList`가 IPv4 규칙으로 판정하고(그 실측의 사정거리는
 *    `::ffff:0:0/96` 한 형식이다 — 다른 임베드 형식은 덮지 않는다), NAT64 well-known
 *    `64:ff9b::/96`은 아래 그림자 생성이 맡는다.
 * 2. *"정당한 목적지가 없는 형식은 접두사 통째로 차단한다."* — 폐기·퇴역·비라우팅·
 *    로컬 전용 형식에는 재판정이 살릴 것이 없다. **아래 열거 전부가 이 규칙이다.**
 *
 * 두 규칙이 갈리는 축은 «그 대역에 지금 정당한 목적지가 사는가» 하나다. 그래서
 * NAT64 well-known(DNS64가 합성하는, IPv6 온리 망이 IPv4 웹에 닿는 유일한 경로)은
 * 재판정으로 살리고, 같은 NAT64라도 RFC 8215 로컬 접두사 `64:ff9b:1::/48`은 통째로
 * 막는다 — 갈리는 것은 용도가 아니라 판정 가능성이다(*"임베드 위치가 결정 불가다."*).
 *
 * **`::/96`이 `::/128`·`::1/128`을 흡수한다.** 위 IPv4 표의 규율(대역으로 덮이는 것을
 * 특례로 다시 적지 않는다)을 IPv6 표에 그대로 적용한 것이다. unspecified·loopback이
 * 판정에서 빠지는 것이 아니며, 그 두 속성은 표 모양과 독립으로 계약 테스트가 이름으로
 * 단언한다(§4).
 */
const BLOCKED_IPV6: readonly Subnet[] = [
  ["::", 96], // IPv4-compatible (RFC 4291 §2.5.5.1 폐기) — unspecified `::`·loopback `::1`을 품는다
  ["64:ff9b:1::", 48], // RFC 8215 로컬 NAT64 — 임베드 길이가 배포마다 달라 재판정 불가
  ["100::", 64], // discard-only
  ["2001::", 32], // Teredo (퇴역)
  ["2001:2::", 48], // benchmarking
  ["2001:20::", 28], // ORCHIDv2
  ["2001:db8::", 32], // 문서용 (RFC 3849) — 라우팅되지 않는다
  ["2002::", 16], // 6to4 — 릴레이가 RFC 7526으로 퇴역
  ["fc00::", 7], // ULA
  ["fe80::", 10], // link-local
  ["fec0::", 10], // 폐기 site-local (RFC 3879) — fc00::/7에도 fe80::/10에도 들어가지 않는다
  ["ff00::", 8], // multicast — ff02::1(all-nodes)이 내부 탐침의 실제 목적지다
];

/** NAT64 well-known 접두사 (RFC 6052 §2.1). */
const NAT64_WELL_KNOWN_PREFIX = "64:ff9b::";

/**
 * NAT64 well-known 접두사 아래의 IPv4 차단 대역 그림자 — **규칙 1의 두 번째 소비자다.**
 *
 * **손으로 적지 않고 `BLOCKED_IPV4`에서 생성한다.** 정본이 그 이유를 든다 —
 * *"손으로 적으면 IPv4 표에 대역이 하나 늘 때 NAT64 경로가 조용히 갈린다"*. 그것을 막는
 * 것은 주의가 아니라 생성이고, 이 한 줄이 그 문장의 코드판이다. 계약 테스트가 재는 것도
 * 표본이 아니라 **두 표의 동기**다.
 *
 * `a.b.c.d/N`은 이 접두사 아래에서 `64:ff9b::a.b.c.d`의 `/(96+N)`이 된다. `addSubnet()`이
 * dotted-quad 꼬리를 받으므로 hextet 손 환산이 없다 (2026-09-09 실측 — §4).
 */
const BLOCKED_NAT64_SHADOW: readonly Subnet[] = BLOCKED_IPV4.map(
  ([address, prefix]) => [`${NAT64_WELL_KNOWN_PREFIX}${address}`, 96 + prefix] as const,
);

/**
 * 차단 대역이 등록된 `BlockList`를 만든다.
 *
 * 판정 경로가 쓰는 인스턴스는 `verdict.ts`의 모듈 상수 하나이며 생성 후 아무도
 * 바꾸지 않는다(§9 A-3). 이 함수 자체는 호출마다 새 인스턴스를 만든다 —
 * 하나를 돌려주면 호출자가 `addAddress()`로 표를 바꿀 수 있고, 그 변경이 이후의
 * 모든 판정에 조용히 남는다. 대역표는 코드 상수라는 §9의 취지를 지키는 쪽이
 * "공유하되 아무도 못 바꾼다"를 실제로 강제한다.
 */
export function createBlockList(): BlockList {
  const list = new BlockList();
  for (const [address, prefix] of BLOCKED_IPV4) list.addSubnet(address, prefix, "ipv4");
  for (const [address, prefix] of BLOCKED_IPV6) list.addSubnet(address, prefix, "ipv6");
  for (const [address, prefix] of BLOCKED_NAT64_SHADOW) list.addSubnet(address, prefix, "ipv6");
  return list;
}
