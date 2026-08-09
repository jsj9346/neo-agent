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
 */
const BLOCKED_IPV4: readonly Subnet[] = [
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

const BLOCKED_IPV6: readonly Subnet[] = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["100::", 64], // discard-only
  ["2001:2::", 48], // benchmarking
  ["2001:20::", 28], // ORCHIDv2
  ["fc00::", 7], // ULA
  ["fe80::", 10], // link-local
];

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
  return list;
}
