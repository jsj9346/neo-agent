/**
 * 차단 대역 — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처: `docs/WEB-ACCESS.md` §4 "차단 대역" 문단 하나뿐이다.
 *   IPv4: unspecified · loopback · 10/8 · 172.16/12 · 192.168/16 · 169.254/16 ·
 *         100.64/10 · multicast · broadcast · reserved · RFC2544(198.18/15)
 *   IPv6: unspecified · loopback · ULA(fc00::/7) · link-local(fe80::/10) ·
 *         benchmarking · discard · ORCHIDv2
 *
 * **왜 판정기(`verifyUrl`)가 아니라 `createBlockList()`를 직접 때리는가.** 대역 전수는
 * 수십 건인데 전부 URL을 거쳐 확인하면 DNS·스킴 검사가 섞여 실패 원인이 흐려진다.
 * 대역 등록 누락은 여기서, 판정 순서는 `verdict.contract.test.ts`에서 잡는다.
 *
 * `net.BlockList.check()`는 **패밀리를 생략하면 기본이 `"ipv4"`**라 IPv6 문자열에
 * `false`를 돌려준다(실측). 이 파일은 항상 패밀리를 명시한다 — 생략은 조용한 통과다.
 */

import { describe, expect, it } from "vitest";
import { createBlockList } from "../src/index.ts";

const blocked4: readonly (readonly [string, string])[] = [
  ["0.0.0.0", "unspecified"],
  ["0.1.2.3", "unspecified 0/8"],
  ["127.0.0.1", "loopback"],
  ["127.255.255.254", "loopback 끝"],
  ["10.0.0.1", "private 10/8"],
  ["10.255.255.255", "private 10/8 끝"],
  ["172.16.0.1", "private 172.16/12 시작"],
  ["172.31.255.255", "private 172.16/12 끝"],
  ["192.168.0.1", "private 192.168/16"],
  ["192.168.255.255", "private 192.168/16 끝"],
  ["169.254.0.1", "link-local"],
  ["169.254.255.255", "link-local 끝"],
  ["100.64.0.1", "CGNAT 시작"],
  ["100.127.255.255", "CGNAT 끝"],
  ["224.0.0.1", "multicast 시작"],
  ["239.255.255.255", "multicast 끝"],
  ["255.255.255.255", "broadcast"],
  ["240.0.0.1", "reserved 240/4"],
  ["198.18.0.1", "RFC2544 시작"],
  ["198.19.255.255", "RFC2544 끝"],
];

/**
 * 통과해야 하는 주소들. **차단 대역이 과하게 넓으면 공개 웹이 통째로 막히는데,
 * 그 실패는 "웹이 안 된다"로만 보이고 원인이 대역표라는 것이 드러나지 않는다.**
 * 경계 바로 바깥(172.15/172.32, 100.63/100.128, 198.17/198.20)을 함께 넣는 이유다.
 */
const allowed4: readonly (readonly [string, string])[] = [
  ["8.8.8.8", "공개 DNS"],
  ["1.1.1.1", "공개 DNS"],
  ["93.184.216.34", "공개 웹 호스트"],
  ["172.15.255.255", "172.16/12 바로 앞"],
  ["172.32.0.1", "172.16/12 바로 뒤"],
  ["100.63.255.255", "CGNAT 바로 앞"],
  ["100.128.0.1", "CGNAT 바로 뒤"],
  ["198.17.255.255", "RFC2544 바로 앞"],
  ["198.20.0.1", "RFC2544 바로 뒤"],
  ["223.255.255.255", "multicast 바로 앞"],
];

const blocked6: readonly (readonly [string, string])[] = [
  ["::", "unspecified"],
  ["::1", "loopback"],
  ["fc00::1", "ULA 시작"],
  ["fdff:ffff::1", "ULA 끝쪽"],
  ["fe80::1", "link-local"],
  ["febf:ffff::1", "link-local 끝쪽"],
  ["2001:2::1", "benchmarking 2001:2::/48"],
  ["100::1", "discard 100::/64"],
  ["2001:20::1", "ORCHIDv2 2001:20::/28"],
  ["2001:2f:ffff::1", "ORCHIDv2 끝쪽"],
];

const allowed6: readonly (readonly [string, string])[] = [
  ["2606:4700:4700::1111", "공개 DNS"],
  ["2001:4860:4860::8888", "공개 DNS"],
  ["2a00:1450:4001:81b::200e", "공개 웹 호스트"],
];

describe("차단 대역 등록 (WEB-ACCESS §4)", () => {
  it.each(blocked4)("IPv4 %s (%s)를 차단한다", (address) => {
    expect(createBlockList().check(address, "ipv4")).toBe(true);
  });

  it.each(allowed4)("IPv4 %s (%s)는 통과시킨다 — 과차단은 웹을 통째로 죽인다", (address) => {
    expect(createBlockList().check(address, "ipv4")).toBe(false);
  });

  it.each(blocked6)("IPv6 %s (%s)를 차단한다", (address) => {
    expect(createBlockList().check(address, "ipv6")).toBe(true);
  });

  it.each(allowed6)("IPv6 %s (%s)는 통과시킨다", (address) => {
    expect(createBlockList().check(address, "ipv6")).toBe(false);
  });

  it("호출마다 새 BlockList를 준다 — 공유 가변 인스턴스는 런타임 오염 경로다", () => {
    // [미규정 A-3] `createBlockList()`가 매번 새 인스턴스인지 싱글턴인지 문서에 없다.
    // 어느 쪽 판정으로 가든 통과하도록 **동작만** 고정한다: 한쪽에 대역을 더해도
    // 다른 쪽의 판정이 느슨해지지 않는다(= 이미 차단된 것이 풀리지 않는다).
    const a = createBlockList();
    const b = createBlockList();
    a.addAddress("8.8.8.8", "ipv4");
    expect(b.check("127.0.0.1", "ipv4")).toBe(true);
    expect(b.check("169.254.169.254", "ipv4")).toBe(true);
  });
});

describe("클라우드 메타데이터 (WEB-ACCESS §4)", () => {
  it("169.254.169.254를 차단한다 — link-local 포함으로 자동으로 막히는 것이 계약이다", () => {
    // 이 주소만을 위한 특례 규칙을 넣지 않는다는 것이 §4의 판정이다. 특례로 막고
    // link-local 대역을 빠뜨리면 169.254.169.253 같은 이웃이 열린다.
    expect(createBlockList().check("169.254.169.254", "ipv4")).toBe(true);
  });

  it("메타데이터 주소를 IPv4-mapped IPv6로 써도 차단된다 — 내장 동작 의존의 고정점", () => {
    // ⚠️ **이 테스트가 깨지면 `net.BlockList`의 IPv4-mapped IPv6 처리가 바뀐 것이고,
    // 그때는 명시적 정규화를 우리가 떠안아야 한다.** (`WEB-ACCESS.md` §4·§8)
    //
    // §4는 `ipaddr.js`를 넣지 않는 근거로 "내장이 IPv4-mapped IPv6를 이미 처리한다"는
    // 2026-08-08 실측을 들었다. 즉 우리 코드에는 이 우회를 막는 방어가 **없고**,
    // 내장 동작이 바뀌면 조용히 뚫린다. 그래서 §8이 계약 테스트로 고정하기로 했다.
    const list = createBlockList();
    expect(list.check("::ffff:169.254.169.254", "ipv6")).toBe(true);
    expect(list.check("::ffff:127.0.0.1", "ipv6")).toBe(true);
    expect(list.check("::ffff:10.0.0.1", "ipv6")).toBe(true);
    // 대칭 확인 — 매핑된 공개 주소까지 막아버리면 그것은 과차단이지 방어가 아니다
    expect(list.check("::ffff:8.8.8.8", "ipv6")).toBe(false);
  });
});
