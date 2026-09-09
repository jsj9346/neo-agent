/**
 * 차단 대역 — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처: `docs/WEB-ACCESS.md`의 **일곱 자리**다. 그 밖은 출처가 아니다.
 * (2026-09-09 `K-601`이 ③과 ⑥을 더했다 — 그전에는 §4 안의 다섯이었다.)
 *   ① §4 "차단 대역" 문단 — 최종 열거의 정본 (IPv6 열셋 + NAT64 그림자)
 *   ② §4 "IPv4를 품은 IPv6 — 두 규칙" 소절의 표 — 형식별 처분과 근거
 *   ③ §4 "표의 모집단 — 이름이 붙은 접두사만 든다" + 그 아래 `fe00::/9` 문단 — **무엇이
 *      애초에 표에 오르는가.** 이름 없는 미할당 예약 아홉은 모집단 밖이다
 *   ④ §4 "카드 범위 밖에서 함께 닫은 둘" 문단 — `fec0::/10`·`ff00::/8` (②의 표에 **없다**)
 *   ⑤ §4 "이 판정을 가능하게 한 실측" 문단 — 과차단 대칭·형식 분리의 기대값
 *   ⑥ §7 "레퍼런스 대비 의도적 축소"의 임베드 IPv4 추출 행 — 우리 표가 드는 **일곱째** 형식
 *   ⑦ §4 "닫지 못하는 것 — 열거로는 도달할 수 없는 두 형식" 문단 — 한계 선언
 *
 *   IPv4: unspecified · loopback · 10/8 · 172.16/12 · 192.168/16 · 169.254/16 ·
 *         100.64/10 · multicast · broadcast · reserved · RFC2544(198.18/15)
 *   IPv6 **열셋** (2026-09-09 `K-599`로 일곱에서 늘었고, 같은 날 `K-601`이 IPv4-translated
 *   한 줄을 더해 열셋이 됐다):
 *         IPv4-compatible(`::/96` — unspecified `::`·loopback `::1`을 품는다) ·
 *         IPv4-translated(`::ffff:0:0:0/96`) ·
 *         ULA(fc00::/7) · 폐기 site-local(fec0::/10) · link-local(fe80::/10) ·
 *         multicast(ff00::/8) · benchmarking(2001:2::/48) · discard(100::/64) ·
 *         ORCHIDv2(2001:20::/28) · 6to4(2002::/16) · Teredo(2001::/32) ·
 *         문서용(2001:db8::/32) · RFC 8215 로컬 NAT64(64:ff9b:1::/48)
 *   그리고 "NAT64 well-known 접두사(64:ff9b::/96)에 감싸인 위 IPv4 대역 전부" — 이것은
 *         손으로 적힌 표가 아니라 `BLOCKED_IPV4`의 **생성물**이고, 이 파일이 그 생성을
 *         표본이 아니라 **순회**로 잰다(아래 「두 표의 동기」 describe).
 *
 * **왜 판정기(`verifyUrl`)가 아니라 `createBlockList()`를 직접 때리는가.** 대역 전수는
 * 수십 건인데 전부 URL을 거쳐 확인하면 DNS·스킴 검사가 섞여 실패 원인이 흐려진다.
 * 대역 등록 누락은 여기서, 판정 순서는 `verdict.contract.test.ts`에서 잡는다.
 *
 * `net.BlockList.check()`는 **패밀리를 생략하면 기본이 `"ipv4"`**라 IPv6 문자열에
 * `false`를 돌려준다(실측). 이 파일은 항상 패밀리를 명시한다 — 생략은 조용한 통과다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { BlockList } from "node:net";
import { describe, expect, it } from "vitest";
// **배럴 이탈은 의도된 것이다.** 이 패키지 `test/`의 다른 임포트는 전부 `../src/index.ts`를
// 지나지만 `BLOCKED_IPV4`는 배럴에 없다 — 패키지 밖에 내놓을 생각이 없는 중간 상수이고,
// 배럴의 소속 기준이 그런 것을 올리지 않는다(`CLI-INTERFACE.md` §1). 그럼에도 여기서 직접
// 임포트하는 이유는 하나뿐이다: §4가 NAT64 그림자에 건 계약이 "두 표의 동기"라서, 그것을
// 표본이 아니라 **순회**로 재려면 원본 표가 손에 있어야 한다. 이 필요를 배럴에 올려
// "해결"하지 않는다 — 그러면 계약 테스트 하나가 패키지의 공개 표면을 넓히게 된다.
import { BLOCKED_IPV4 } from "../src/blocklist.ts";
import { createBlockList, verifyUrl } from "../src/index.ts";

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
  // 정본 자리 ③ — 이름 없는 미할당 예약 아홉(`4000::/3`·`6000::/3`·`8000::/3`·`a000::/3`·
  // `c000::/3`·`e000::/4`·`f000::/5`·`f800::/6`·`fe00::/9`)은 **표의 모집단이 아니다.**
  // 아래 둘은 그 아홉에서 고른 표본이고, 누군가 「의심스러우면 막는다」로 그 공간을 등록하면
  // 여기가 붉어진다 — 정본은 그 방향을 "세 번째 규칙은 두지 않는다" 로 기각하면서, 넓히는
  // 대가를 "낡는 방향이 과차단" 으로 든다. 아홉 중 `fe00::/9`만 대조군으로 쓰이고 있어
  // 나머지 여덟이 무방비였던 자리다(아래 「`fe00::/9` 존치」 describe가 그 하나를 든다).
  ["4000::1", "이름 없는 미할당 예약 4000::/3 — 모집단 밖"],
  ["f800::1", "이름 없는 미할당 예약 f800::/6 — 모집단 밖"],
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

  // 정본 자리 ①(「차단 대역」)이 이 문장의 **사정거리**를 못박는다: 메타데이터를
  // "감싼 IPv6 표기도 아래 「두 규칙」 표가 드는 형식 전부에서 함께 막힌다".
  // **표가 드는 형식은 여덟이고, 여덟 전부를 한 자리에서 재는 것이 아래다.** 흩어서 재면
  // 형식이 하나 늘 때 이 문장만 조용히 거짓이 된다 — 그것이 F-1이 났던 방식이다
  // (결과 규정 «자동으로 막힌다»와 열거가 조건부로 어긋났고, 아무도 그 둘을 함께 안 쟀다).
  it.each([
    ["::ffff:169.254.169.254", "IPv4-mapped — 규칙 1(내장 재판정)"],
    ["64:ff9b::169.254.169.254", "NAT64 well-known — 규칙 1(그림자 생성)"],
    ["64:ff9b:1::a9fe:a9fe", "RFC 8215 로컬 NAT64 — 규칙 2"],
    ["::169.254.169.254", "IPv4-compatible — 규칙 2"],
    ["::ffff:0:169.254.169.254", "IPv4-translated — 규칙 2 (2026-09-09 `K-601`)"],
    ["2002:a9fe:a9fe::1", "6to4 — 규칙 2"],
    ["2001:0:a9fe:a9fe::1", "Teredo — 규칙 2"],
    ["2001:db8::a9fe:a9fe", "문서용 — 규칙 2"],
  ])("메타데이터를 감싼 %s (%s)가 막힌다 — 표의 여덟 형식 전부", (address) => {
    expect(createBlockList().check(address, "ipv6")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 아래는 2026-09-09 `K-599` 개정분의 독립 검증이고, 같은 날 `K-601` 개정분이 여기에 얹혔다.
// 기대값은 전부 **파일 머리가 든 정본 일곱 자리**에서 나오고(그때는 §4의 다섯이었다),
// 구현(`src/blocklist.ts`)의 코드·주석에서 도출한 기대값은 하나도 없다.
// ---------------------------------------------------------------------------

/** dotted-quad → uint32. 그림자 순회가 대역 안 대표 주소를 스스로 계산하기 위한 것. */
function ipv4ToInt(address: string): number {
  const [a = 0, b = 0, c = 0, d = 0] = address.split(".").map(Number);
  return (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
}

/** uint32 → dotted-quad. */
function intToIpv4(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

/**
 * 대역 하나의 대표 주소 넷 — 네트워크 주소 · 그 다음 · 한가운데 · 마지막.
 *
 * **표본을 손으로 적지 않는 이유가 그림자를 손으로 적지 않는 이유와 같다.** 대역이
 * 하나 늘 때 표본도 함께 늘어야 하는데, 그것을 사람이 하면 안 늘어난다.
 */
function membersOf(address: string, prefix: number): string[] {
  const base = ipv4ToInt(address);
  const size = 2 ** (32 - prefix);
  return [base, base + 1, base + Math.floor(size / 2), base + size - 1].map(intToIpv4);
}

describe("두 표의 동기 — NAT64 그림자는 BLOCKED_IPV4의 생성물이다 (WEB-ACCESS §4)", () => {
  // §4: "NAT64 well-known 접두사(64:ff9b::/96)에 감싸인 위 IPv4 대역 전부".
  //
  // 정본이 이 표를 손으로 적지 못하게 한 근거를 그대로 옮기면 —
  // "손으로 적으면 IPv4 표에 대역이 하나 늘 때 NAT64 경로가 조용히 갈린다" 이고
  // "그것을 막는 것은 주의가 아니라 생성이다" 이다. 그래서 계약 테스트가 재는 것도
  // "두 표의 동기"이고, 정본은 그 재는 방식까지 지정한다:
  // "차단 IPv4 표본마다 그 NAT64 포장이 함께 차단되는가".
  //
  // ⚠️ **표본 몇 개로 대체하면 이 describe는 이름만 남는다.** 손으로 적은 그림자 열 줄도
  // 오늘은 100% 통과하므로, 판별력이 생기는 유일한 형태가 `BLOCKED_IPV4` **순회**다.
  // 역검증(더미 대역 한 줄을 넣고 이 순회가 코드 무수정으로 따라오는가)은 QA 리포트가 든다.
  it.each(BLOCKED_IPV4.map(([address, prefix]) => ({ address, prefix })))(
    "$address/$prefix — 대역 안 전 표본의 NAT64 포장이 함께 차단된다",
    ({ address, prefix }) => {
      const list = createBlockList();
      for (const member of membersOf(address, prefix)) {
        // 원본 표 쪽. 이것이 붉으면 동기 이전에 IPv4 표가 깨진 것이다.
        expect(list.check(member, "ipv4"), `IPv4 ${member}`).toBe(true);
        // 그림자 쪽. `a.b.c.d/N`은 well-known 접두사 아래에서 `/(96+N)`이 된다.
        expect(
          list.check(`64:ff9b::${member}`, "ipv6"),
          `NAT64 포장 64:ff9b::${member} (원본 ${address}/${prefix})`,
        ).toBe(true);
      }
    },
  );

  it("그림자의 접두사 길이가 96+N이다 — 넓으면 과차단, 좁으면 구멍이다", () => {
    // 순회가 "차단되는가"만 재면 `/96` 통째 등록(전면 과차단)도 통과한다. 대역 바로
    // 바깥이 살아 있는지를 함께 재야 96+N이 실제로 고정된다.
    const list = createBlockList();
    for (const [address, prefix] of BLOCKED_IPV4) {
      const base = ipv4ToInt(address);
      const size = 2 ** (32 - prefix);
      for (const outside of [base - 1, base + size]) {
        if (outside < 0 || outside > 0xff_ff_ff_ff) continue;
        const dotted = intToIpv4(outside >>> 0);
        // IPv4 쪽이 이미 차단이면(대역끼리 인접) 그림자도 차단이어야 하므로 판별력이 없다.
        if (list.check(dotted, "ipv4")) continue;
        expect(
          list.check(`64:ff9b::${dotted}`, "ipv6"),
          `NAT64 포장 64:ff9b::${dotted}는 ${address}/${prefix} 밖이라 통과해야 한다`,
        ).toBe(false);
      }
    }
  });

  it.each(allowed4)("IPv4 %s (%s)의 NAT64 포장도 통과한다 — 과차단 대칭", (address) => {
    // §4 "이 판정을 가능하게 한 실측": "재판정 의미가 실제로 성립한다" — 차단 IPv4의
    // 포장만 막히고 공개 IPv4의 포장은 살아야 재판정이지 통째 차단이 아니다.
    expect(createBlockList().check(`64:ff9b::${address}`, "ipv6")).toBe(false);
  });
});

describe("NAT64 well-known 재판정 (WEB-ACCESS §4)", () => {
  // §4 표: NAT64 well-known `64:ff9b::/96`은 "품은 IPv4로 재판정" 한다. 근거는
  // "살아 있는 정당한 용도가 있다" — DNS64가 IPv4 전용 사이트의 A 레코드를 이
  // 접두사로 합성하고, 통째로 막으면 IPv6 온리 망이 IPv4 웹을 전부 잃는다.
  const blockedNat64: readonly (readonly [string, string])[] = [
    ["64:ff9b::a9fe:a9fe", "메타데이터 — hextet 표기"],
    ["64:ff9b::169.254.169.254", "메타데이터 — dotted 표기 (같은 주소)"],
    ["64:ff9b::7f00:1", "loopback 127.0.0.1 — hextet 표기"],
    ["64:ff9b::127.0.0.1", "loopback — dotted 표기"],
    ["64:ff9b::10.0.0.1", "private 10/8"],
    ["64:ff9b::255.255.255.255", "broadcast"],
  ];

  const allowedNat64: readonly (readonly [string, string])[] = [
    ["64:ff9b::8.8.8.8", "공개 DNS — 정본이 이름으로 든 통과 예"],
    ["64:ff9b::1.1.1.1", "공개 DNS"],
  ];

  it.each(blockedNat64)("%s (%s)를 차단한다", (address) => {
    expect(createBlockList().check(address, "ipv6")).toBe(true);
  });

  it.each(allowedNat64)("%s (%s)는 통과시킨다", (address) => {
    // §4: "IPv6 온리 망의 IPv4 웹 접근이 살아 있다" — 이 줄이 붉어지면 재판정이
    // 통째 차단으로 퇴화한 것이고, 그 거래를 정본이 명시적으로 기각했다.
    expect(createBlockList().check(address, "ipv6")).toBe(false);
  });

  // ⚠️ 아래 넷은 **판정기 층**이다. 대역표가 그린이어도 `verifyUrl`이 패밀리를 잘못
  // 고르거나 리터럴 경로를 안 지나면 §4는 그대로 다시 뚫린다 — 원래 취약점(F-1)이
  // 보고된 자리가 대역표가 아니라 이 층이다.
  it("verifyUrl이 DNS64 합성 응답을 거부한다 (3~4단계)", async () => {
    const verdict = await verifyUrl("https://example.test/", {
      resolveHostname: async () => ["64:ff9b::a9fe:a9fe"],
    });
    expect(verdict.ok).toBe(false);
  });

  it("verifyUrl이 NAT64 리터럴을 거부한다 (2단계 — DNS를 건너뛰는 경로)", async () => {
    const verdict = await verifyUrl("https://[64:ff9b::a9fe:a9fe]/");
    expect(verdict.ok).toBe(false);
  });

  it("verifyUrl이 정당한 NAT64 목적지는 살린다 — 과차단 대칭", async () => {
    const verdict = await verifyUrl("https://example.test/", {
      resolveHostname: async () => ["64:ff9b::8.8.8.8"],
    });
    expect(verdict).toEqual({ ok: true, addresses: ["64:ff9b::8.8.8.8"] });
  });

  it("verifyUrl이 섞인 응답에서 차단분만 버린다 (4단계)", async () => {
    const verdict = await verifyUrl("https://example.test/", {
      resolveHostname: async () => ["64:ff9b::a9fe:a9fe", "64:ff9b::8.8.8.8"],
    });
    expect(verdict).toEqual({ ok: true, addresses: ["64:ff9b::8.8.8.8"] });
  });
});

/**
 * 통째 차단 여덟 — §4 「IPv4를 품은 IPv6 — 두 규칙」 표의 여섯 + 「카드 범위 밖에서
 * 함께 닫은 둘」의 둘. 근거는 규칙 2: "정당한 목적지가 없는 형식은 접두사 통째로 차단한다."
 *
 * (2026-09-09 `K-601`로 일곱 → 여덟. 늘어난 것은 **표 쪽**이고 — IPv4-translated 행이
 * 생겨 다섯 → 여섯 — 표 밖의 둘은 그대로다. 이 수가 정본과 갈리면 그것 자체가 발견이다.)
 *
 * `outside`는 **경계 바로 바깥의 대조군**이다. 없으면 `/0` 등록(전면 과차단)도 통과한다.
 */
const wholeBlocked6: readonly {
  readonly cidr: string;
  readonly why: string;
  readonly inside: readonly string[];
  readonly outside: readonly string[];
}[] = [
  {
    cidr: "::/96",
    why: "IPv4-compatible — RFC 4291 §2.5.5.1이 폐기했다. 정당한 목적지 0",
    // ::/96은 unspecified `::`·loopback `::1`을 품는다(§4). 그 둘은 아래 S-9 몫으로
    // `blocked6`에 이름으로 남아 있으므로 여기서는 대역 성격만 잰다.
    inside: ["::0.0.0.1", "::8.8.8.8", "::255.255.255.255", "::ffff:ffff"],
    // 96번째 비트가 서면 밖이다. `::ffff:…`(IPv4-mapped)는 이 대역이 아니라 내장
    // 재판정의 관할이고, 그 분리는 아래 「형식 분리」가 따로 잰다.
    outside: ["::1:0:0"],
  },
  {
    cidr: "::ffff:0:0:0/96",
    why: "IPv4-translated (RFC 2765 §2.1) — RFC 6145가 대체하며 삭제했다. 정당한 목적지 0",
    // 정본 표에서 `::/96` 바로 다음 행이라 여기서도 인접하게 둔다.
    // **통째 차단이므로 공개 IPv4를 품어도 막힌다** — `::ffff:0:8.8.8.8`이 `inside`에 있는
    // 것이 규칙 1(재판정)과 갈리는 지점이고, 그 주소가 통과하면 규칙 2가 규칙 1로 퇴화한
    // 것이다. dotted-quad 꼬리는 §4 실측이 "표기는 취향이다" 로 못박았으므로 둘 다 든다.
    inside: [
      "::ffff:0:0:0",
      "::ffff:0:0.0.0.0",
      "::ffff:0:169.254.169.254",
      "::ffff:0:127.0.0.1",
      "::ffff:0:8.8.8.8",
      "::ffff:0:255.255.255.255",
      "::ffff:0:ffff:ffff",
    ],
    // 판별력 있는 «바로 바깥» 둘 — 접두사(첫 96비트)의 **최하위 비트를 세운** `::ffff:1:0:0`
    // 과 대역 바로 아래인 `::fffe:ffff:ffff:ffff`. 둘 다 다른 행의 관할이 아니다: `::/96`은
    // 다섯째 hextet도 `0`이어야 하고, IPv4-mapped `::ffff:0:0/96`은 다섯째가 `0`·여섯째가
    // `ffff`인데(이 대역은 다섯째 `ffff`·여섯째 `0`) 셋이 서로 겹치지 않는다.
    outside: ["::ffff:1:0:0", "::fffe:ffff:ffff:ffff"],
  },
  {
    cidr: "64:ff9b:1::/48",
    why: "RFC 8215 로컬 NAT64 — 임베드 위치가 결정 불가다.",
    inside: ["64:ff9b:1::1", "64:ff9b:1:ffff:ffff:ffff:ffff:ffff", "64:ff9b:1::a9fe:a9fe"],
    outside: ["64:ff9b:2::1"],
  },
  {
    cidr: "2002::/16",
    why: "6to4 — 릴레이가 RFC 7526으로 퇴역했다",
    inside: ["2002::1", "2002:a9fe:a9fe::1", "2002:ffff:ffff:ffff:ffff:ffff:ffff:ffff"],
    outside: ["2003::1"],
  },
  {
    cidr: "2001::/32",
    why: "Teredo — 퇴역. 임베드 IPv4가 보수(complement) 인코딩이라 재판정이 더 비싸다",
    inside: [
      "2001::1",
      "2001:0:4136:e378:8000:63bf:3fff:fdd2",
      "2001:0:ffff:ffff:ffff:ffff:ffff:ffff",
    ],
    outside: ["2001:1::1"],
  },
  {
    cidr: "2001:db8::/32",
    why: "문서용 RFC 3849 — 라우팅되지 않는다",
    inside: ["2001:db8::1", "2001:db8:1::a9fe:a9fe", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff"],
    outside: ["2001:db7:ffff::1", "2001:db9::1"],
  },
  {
    cidr: "fec0::/10",
    why: "폐기 site-local RFC 3879 — 폐기가 도달 불가를 뜻하지 않는다 (정본 자리 3)",
    inside: ["fec0::1", "fec0::a9fe:a9fe", "feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"],
    // 바로 아래 fe80–febf는 link-local로 이미 차단, 바로 위 ff00–는 multicast로 이미
    // 차단이다. 그래서 판별력 있는 「바깥」은 fe00–fe7f 하나뿐이다.
    // ⚠️ **이 대조군은 누락이 아니라 판정에 기댄다** (정본 자리 ③ — 2026-09-09 `K-601`).
    // `fe00::/9`가 열거에 없는 것은 빠뜨린 것이 아니라 "이름이 없어 표에 오르지 않는다" 는
    // 모집단 판정의 결과다. **재판정 트리거: IANA가 `fe00::/9`에서 배정을 낼 때.** 배정에
    // 이름이 생기는 순간 그 공간이 모집단 안으로 들어오고, 이 `outside`는 판별력을 잃는다
    // (그날 이 행은 대조군을 잃는다 — 아래 「`fe00::/9` 존치」 describe가 그것을 기계로 든다).
    outside: ["fe7f:ffff:ffff:ffff::1"],
  },
  {
    cidr: "ff00::/8",
    why: "IPv6 multicast — ff02::1(all-nodes)이 내부 탐침의 실제 목적지다 (정본 자리 3)",
    inside: ["ff00::1", "ff02::1", "ff05::1:3", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"],
    // 위와 같은 이유로 fe00–fe7f가 유일한 판별 지점이고, 같은 재판정 트리거가 걸린다 —
    // 이 대조군도 `fe00::/9`를 막지 않는다는 **판정**에 기댄다(정본 자리 ③).
    outside: ["fe7f::1"],
  },
];

describe("통째 차단 여덟 — 규칙 2 (WEB-ACCESS §4)", () => {
  it.each(wholeBlocked6)("$cidr 안을 차단한다 — $why", ({ inside }) => {
    const list = createBlockList();
    for (const address of inside) {
      expect(list.check(address, "ipv6"), address).toBe(true);
    }
  });

  it.each(wholeBlocked6)("$cidr 바로 바깥은 통과시킨다 — 과차단 대조군", ({ outside }) => {
    const list = createBlockList();
    for (const address of outside) {
      expect(list.check(address, "ipv6"), address).toBe(false);
    }
  });

  it("여덟이 전부 서 있다 — 표가 줄면 이 수가 먼저 붉어진다", () => {
    // 「몇 개 중 몇 개를 대조했나」를 파일 안에 고정한다. 위 두 `it.each`는 표가
    // 통째로 비어도 0건 통과로 그린이 된다(0건 순회는 조용한 통과다).
    expect(wholeBlocked6.map((entry) => entry.cidr)).toEqual([
      "::/96",
      "::ffff:0:0:0/96",
      "64:ff9b:1::/48",
      "2002::/16",
      "2001::/32",
      "2001:db8::/32",
      "fec0::/10",
      "ff00::/8",
    ]);
  });
});

describe("형식 분리 — ::/96이 ::ffff: 경로를 건드리지 않는다 (WEB-ACCESS §4)", () => {
  // §4 실측 문단: 같은 표에서 `::8.8.8.8`은 차단, `::ffff:8.8.8.8`은 통과다.
  // 두 형식의 처분이 갈리는 것이 규칙 1·2의 구분 그대로다 — 앞은 폐기된 형식이라
  // 통째 차단, 뒤는 "판정 대상은 감싼 형식이 아니라 품은 목적지다." 의 첫 소비자다.
  it("`::8.8.8.8`은 차단하고 `::ffff:8.8.8.8`은 통과시킨다", () => {
    const list = createBlockList();
    expect(list.check("::8.8.8.8", "ipv6")).toBe(true);
    expect(list.check("::ffff:8.8.8.8", "ipv6")).toBe(false);
  });

  it.each([
    ["::ffff:169.254.169.254", "메타데이터"],
    ["::ffff:127.0.0.1", "loopback"],
    ["::ffff:10.0.0.1", "private"],
    ["::ffff:100.64.0.1", "CGNAT"],
    ["::ffff:255.255.255.255", "broadcast"],
  ])("%s (%s)는 `::/96` 등록 뒤에도 계속 차단된다 — 무회귀", (address) => {
    expect(createBlockList().check(address, "ipv6")).toBe(true);
  });

  it.each([
    ["::ffff:8.8.8.8", "공개 DNS"],
    ["::ffff:1.1.1.1", "공개 DNS"],
    ["::ffff:93.184.216.34", "공개 웹 호스트"],
    ["::ffff:172.32.0.1", "172.16/12 바로 뒤"],
  ])("%s (%s)는 `::/96` 등록 뒤에도 계속 통과한다 — 무회귀", (address) => {
    expect(createBlockList().check(address, "ipv6")).toBe(false);
  });

  it("`::ffff:0:` (translated)와 `::ffff:` (mapped)의 처분이 갈린다 — hextet 하나 차이다", () => {
    // §4 실측 문단: "IPv4-translated 차단이 IPv4-mapped 경로를 안 건드린다" 이고,
    // "hextet 하나 차이인 두 형식의 처분이 갈리는 것이 규칙 1·2의 구분 그대로다".
    // 앞은 정당한 목적지가 없어 **통째 차단**(규칙 2), 뒤는 **품은 IPv4로 재판정**(규칙 1).
    const list = createBlockList();
    // 이 한 쌍이 이 파일에서 가장 날카롭다 — 같은 공개 IPv4를 품는데 처분이 반대다.
    expect(list.check("::ffff:0:8.8.8.8", "ipv6")).toBe(true);
    expect(list.check("::ffff:8.8.8.8", "ipv6")).toBe(false);
    // 메타데이터 쪽은 양쪽 다 차단이지만 **이유가 다르다**(통째 차단 / 품은 IPv4 재판정).
    expect(list.check("::ffff:0:169.254.169.254", "ipv6")).toBe(true);
    expect(list.check("::ffff:169.254.169.254", "ipv6")).toBe(true);
  });

  it("2001::/32(Teredo)가 이웃 셋과 겹치지 않는다 — 넷 다 두 번째 hextet이 다르다", () => {
    // §4 실측 문단이 이름으로 든 대조군이다. Teredo를 /32가 아니라 /16으로 잘못
    // 등록하면 2001:4860:…(공개 DNS)이 함께 죽는데, 그 실패는 "웹이 안 된다"로만 보인다.
    const list = createBlockList();
    expect(list.check("2001::1", "ipv6")).toBe(true); // Teredo
    expect(list.check("2001:2::1", "ipv6")).toBe(true); // benchmarking
    expect(list.check("2001:20::1", "ipv6")).toBe(true); // ORCHIDv2
    expect(list.check("2001:db8::1", "ipv6")).toBe(true); // 문서용
    expect(list.check("2001:4860:4860::8888", "ipv6")).toBe(false); // 대조군 — 공개 DNS
    expect(list.check("2001:1::1", "ipv6")).toBe(false); // Teredo 바로 바깥
  });
});

describe("표가 접혀도 남는 속성 (WEB-ACCESS §4)", () => {
  // §4는 `::/96`이 `::/128`·`::1/128`을 흡수하는 것을 허용하면서, 그 흡수가
  // unspecified·loopback을 판정에서 빼는 것이 아님의 **근거를 이 파일에 위임**했다:
  // "표가 접히더라도 그 속성은 표 모양과 독립으로 고정돼 있다".
  //
  // 즉 아래 두 줄은 위의 `::/96` describe와 중복이 아니라 **정본이 지목한 계약**이다.
  // `blocked6`에서 그 두 행을 지우면 정본의 이 문장이 거짓이 된다.
  it("`blocked6`가 `::`와 `::1`을 이름으로 계속 단언한다", () => {
    const named = blocked6.map(([address]) => address);
    expect(named).toContain("::");
    expect(named).toContain("::1");
  });

  it("`::`·`::1`이 실제로 차단된다", () => {
    const list = createBlockList();
    expect(list.check("::", "ipv6")).toBe(true);
    expect(list.check("::1", "ipv6")).toBe(true);
  });
});

describe("닫지 못하는 둘 — 막는 척하지 않는다 (WEB-ACCESS §4)", () => {
  // ⚠️⚠️ **이 describe는 「통과」를 단언한다. 버그가 아니다 — 지우지 마라.** ⚠️⚠️
  //
  // §4의 마지막 문단 제목이 "열거로는 도달할 수 없는 두 형식" 이고, 그 문단은 이
  // 한계를 "막는 척하지 않는다" 로 명시한다. 열거로 닫혔다고 오인하는 것이 F-1이
  // 났던 방식(결과 규정과 열거를 합쳐 읽었다)이므로, **한계를 기계로 고정한다.**
  //
  // 이 둘이 붉어지는 날은 둘 중 하나다:
  //   (a) 누군가 열거를 늘려 「닫히지 않는다」를 깼다 → 정본 §4의 한계 선언을 함께 고쳐야 한다.
  //   (b) 아래 주소가 다른 행의 관할에 들어갔다 → 주소를 바꿔야 한다(아래 함정 참고).
  // 어느 쪽이든 **정본 개정이 선행**이고, 트리거는 `kanban.md` `K-600`(대기 G1)이 든다:
  // "NAT64/IPv6 온리 망이 실사용 환경이 될 때".
  //
  // ⚠️ **함정 — 정본의 예시 주소를 베끼면 틀린다.** §4가 임의 NSP의 실측 예로 든
  // `2001:db8:1::a9fe:a9fe`는 같은 개정이 넣은 `2001:db8::/32`(문서용)에 **걸려 차단된다**.
  // 명제("열거로는 도달할 수 없다")는 그대로 참이고 예시 주소가 다른 행의 관할이었을
  // 뿐이다. 그래서 여기서는 문서용·link-local이 아닌 **글로벌 유니캐스트**에서 고른다.
  it("임의 NSP NAT64는 통과한다 — 평범한 글로벌 유니캐스트와 구별되지 않는다.", () => {
    const list = createBlockList();
    // 2a02::/16 · 2606::/16 — RIR이 배정한 글로벌 유니캐스트. 사업자가 자기 공간에서
    // NAT64 접두사를 고르면 겉모습이 정확히 이것이고, 열거는 그것을 볼 수 없다.
    expect(list.check("2a02:26f0::a9fe:a9fe", "ipv6")).toBe(false);
    expect(list.check("2606:4700::7f00:1", "ipv6")).toBe(false);
  });

  it("글로벌 접두사 ISATAP은 통과한다 — 접두사가 임의의 /64라 열거로 잡히지 않는다.", () => {
    const list = createBlockList();
    // `fe80::5efe:…` 형태는 link-local(fe80::/10)로 이미 막히지만, 그것은 ISATAP을
    // 잡은 것이 아니라 link-local을 잡은 것이다. 글로벌 /64 위의 같은 인터페이스
    // 식별자는 아래처럼 그대로 통과한다.
    expect(list.check("fe80::5efe:169.254.169.254", "ipv6")).toBe(true); // link-local이 잡는다
    expect(list.check("2a01:4f8:1:2:0:5efe:169.254.169.254", "ipv6")).toBe(false); // 글로벌 — 통과
  });
});

describe("IPv4-translated `::ffff:0:0:0/96` — 통째 차단 (WEB-ACCESS §4·§7)", () => {
  // **이 describe는 2026-09-09 `K-601`로 뒤집혔다.** 그전에는 「미규정 · 세 번째 임베드 형식」
  // 이라는 이름으로 「현재 통과한다」는 **오늘의 동작**을 고정점으로 박아 두고, 판정은 QA
  // 리포트의 「판정 필요」로 올려 둔 상태였다. 정본이 답한 자리는 넷이다 — 다음 독자가
  // 「왜 이 형식만 표에 늦게 들어왔나」를 처음부터 다시 조사하지 않도록 여기 남긴다:
  //
  //   - 자리 ①(「차단 대역」 열거)에 IPv4-translated가 들어왔다 (IPv6 열둘 → 열셋).
  //   - 자리 ②(「두 규칙」 표)에 행이 생겼다. 처분은 **통째 차단**, 근거는 RFC 6145가
  //     RFC 2765를 대체하며 이 형식을 삭제했고 "어느 망에서도 라우팅되지 않는다" 는 것.
  //   - **늦은 이유까지 정본이 든다**: "빼 두고 있던 것은 판정이 아니라 비대칭이었다".
  //     `fec0::/10`·`ff00::/8`이 같은 모양으로 발견됐다고 같은 행이 적는다. 즉 이 자리는
  //     설계 변경이 아니라 누락 교정이고, 그래서 소급 처분이 없다.
  //   - 자리 ⑥(§7 임베드 IPv4 추출 행)은 이것을 **레퍼런스보다 엄격한 방향**으로 든다:
  //     OpenClaw가 다루는 여섯 형식에 없는 "우리 표는 그 여섯에 없는 일곱째를 든다" 이고,
  //     그럼에도 "이 방향의 차이는 추출 코드를 늘리지 않는다 — 표에 한 줄이다".
  //
  // **막는 실익은 도달이 아니라 판정의 정직성**이라고 정본이 못박았다: 안 막으면 `verifyUrl`이
  // `ok: true`와 함께 «검증을 통과한 IP» 목록에 우리가 판정한 적 없는 IPv4를 품은 주소를
  // 싣는다. **그 문장이 실제로 재지는 자리는 아래 `verifyUrl` 층 넷뿐이다** — 대역 등록만
  // 재면 실익은 미측정으로 남고, 경계는 위 「통째 차단 여덟」의 `outside`가 함께 잰다.
  it.each([
    ["::ffff:0:169.254.169.254", "메타데이터 — 정본 실측이 이름으로 든 셋 중 하나"],
    ["::ffff:0:127.0.0.1", "loopback — 같은 셋"],
    ["::ffff:0:8.8.8.8", "공개 DNS — 통째 차단이므로 **막히는 것이 맞다**"],
  ])("%s (%s)를 차단한다", (address) => {
    expect(createBlockList().check(address, "ipv6")).toBe(true);
  });

  it("IPv4-mapped 경로가 회귀하지 않는다 — 등록이 이웃 형식을 건드리지 않았다", () => {
    // §4 실측: "`::ffff:169.254.169.254`는 여전히 차단·`::ffff:8.8.8.8`은 여전히 통과".
    const list = createBlockList();
    expect(list.check("::ffff:169.254.169.254", "ipv6")).toBe(true);
    expect(list.check("::ffff:8.8.8.8", "ipv6")).toBe(false);
  });

  it("나머지 대조군의 값이 안 움직였다 — `::`·`::1`·NAT64 그림자·공개 DNS", () => {
    // §4 실측이 이름으로 든 대조군 그대로다. 넷 중 하나라도 움직이면 이 등록이 자기
    // 대역 밖을 건드린 것이고, 그 실패는 「웹이 안 된다」로만 보인다.
    const list = createBlockList();
    expect(list.check("::", "ipv6")).toBe(true);
    expect(list.check("::1", "ipv6")).toBe(true);
    expect(list.check("64:ff9b::169.254.169.254", "ipv6")).toBe(true); // 그림자 — 차단
    expect(list.check("64:ff9b::8.8.8.8", "ipv6")).toBe(false); // 재판정 — 통과
    expect(list.check("2001:4860:4860::8888", "ipv6")).toBe(false); // 공개 DNS
  });

  it("dotted-quad 꼬리 표기도 같은 결과다 — 표기는 취향이다", () => {
    // §4 실측: "dotted-quad 꼬리(`::ffff:0:0.0.0.0`)로도 같은 결과라 표기는 취향이다".
    // 한쪽 표기로만 재면 등록이 리터럴 문자열에 의존하는지 알 수 없다.
    const list = createBlockList();
    expect(list.check("::ffff:0:0.0.0.0", "ipv6")).toBe(true);
    expect(list.check("::ffff:0:0:0", "ipv6")).toBe(true);
    expect(list.check("::ffff:0:a9fe:a9fe", "ipv6")).toBe(true);
    expect(list.check("::ffff:0:169.254.169.254", "ipv6")).toBe(true);
  });

  // ⚠️ 아래 넷은 **판정기 층**이다. 대역 등록이 그린이어도 `verifyUrl`이 리터럴 경로를
  // 안 지나거나 패밀리를 잘못 고르면 정본이 든 실익(«검증을 통과한 IP»의 정직성)은
  // 그대로 깨진다 — 그 실익은 대역표가 아니라 여기서만 재진다.
  it("verifyUrl이 IPv4-translated 리터럴을 거부한다 (2단계 — DNS를 건너뛰는 경로)", async () => {
    // 정본이 실측으로 든 그 URL이다: `verifyUrl("https://[::ffff:0:169.254.169.254]/")`가
    // `ok: true`를 냈다는 것이 이 형식을 표에 넣은 근거였다. 이제 `ok: false`여야 한다.
    const verdict = await verifyUrl("https://[::ffff:0:169.254.169.254]/");
    expect(verdict.ok).toBe(false);
  });

  it("verifyUrl이 IPv4-translated 해석 결과를 거부한다 (3~4단계)", async () => {
    const verdict = await verifyUrl("https://example.test/", {
      resolveHostname: async () => ["::ffff:0:169.254.169.254"],
    });
    expect(verdict.ok).toBe(false);
  });

  it("공개 IPv4를 품은 것도 판정 층에서 거부된다 — 통째 차단이 판정기까지 간다", async () => {
    // 여기서 `ok: true`가 나면 대역은 막았는데 판정기가 안 막은 것이고, 그것이 정확히
    // 정본이 거짓이라 부른 상태다 — «검증했다»는 이름이 붙은 미판정 IPv4.
    const verdict = await verifyUrl("https://example.test/", {
      resolveHostname: async () => ["::ffff:0:8.8.8.8"],
    });
    expect(verdict.ok).toBe(false);
  });

  it("대역 바로 바깥은 판정 층에서도 살아 있다 — 과차단 대조군", async () => {
    // `::ffff:1:0:0`은 접두사 최하위 비트를 세운 자리라 다른 행의 관할이 아니다(위 표 주석).
    // 이것까지 막히면 `/96`이 아니라 더 넓게 등록된 것이고, 순회는 그것을 못 잡는다.
    const verdict = await verifyUrl("https://example.test/", {
      resolveHostname: async () => ["::ffff:1:0:0"],
    });
    expect(verdict).toEqual({ ok: true, addresses: ["::ffff:1:0:0"] });
  });
});

describe("`fe00::/9` 존치 — 누락이 아니라 판정이다 (WEB-ACCESS §4)", () => {
  // ⚠️⚠️ **이 describe는 「통과」를 단언한다. 버그가 아니다 — 지우지 마라.** ⚠️⚠️
  //
  // 정본 자리 ③이 둘을 함께 못박았다:
  //   (1) **모집단** — 표에 오르는 「형식」은 "RFC·IANA가 이름과 목적을 준 접두사" 이고,
  //       "이름 없는 미할당 예약 공간은 이 표의 모집단이 아니다".
  //   (2) 그래서 `fe00::/9`는 막지 않는다. 이 공간이 `fc00::/7`·`fe80::/10`·`fec0::/10`
  //       어디에도 안 들어간다는 관측은 맞지만 "인접이 근거가 될 수 없다" — 막는 것들
  //       사이에 끼어 있다를 근거로 삼으면 같은 성질의 나머지 여덟을 뺄 이유가 사라진다.
  //
  // **재판정 트리거: IANA가 `fe00::/9`에서 배정을 낼 때.** "배정에 이름이 생기는 순간
  // 모집단 안으로 들어온다" — 그날 아래가 붉어지는 것이 정본 §4 재판정이 필요하다는 신호다.
  // 반대로 오늘 붉어지면 누군가 모집단 정의를 어기고 이름 없는 공간을 등록한 것이다.
  it.each([
    ["fe00::", "대역 시작"],
    ["fe00::1", "대역 시작 다음"],
    ["fe7f::1", "정본이 실측으로 든 주소 — 통과한다"],
    ["fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "대역 끝"],
  ])("%s (%s)는 통과한다 — 이름이 없어 표에 오르지 않는다", (address) => {
    expect(createBlockList().check(address, "ipv6")).toBe(false);
  });

  it("모집단 밖 예약 표본 둘이 `allowed6`에 남아 있다 — 아홉 중 하나만 재던 자리다", () => {
    // 정본은 이름 없는 예약을 **아홉** 드는데 그중 `fe00::/9` 하나만 대조군으로 쓰였다.
    // 나머지 여덟 중 하나를 등록해도 붉어지는 것이 없던 것이 그 상태이고, 표본 둘이
    // 그 구멍을 덮는다. 이 `it`은 표본이 조용히 빠지는 것을 막는다(위 `allowed6` 순회는
    // 행이 지워지면 0건 통과로 그린이 된다).
    const named = allowed6.map(([address]) => address);
    expect(named).toContain("4000::1");
    expect(named).toContain("f800::1");
  });

  it("`fec0::/10`·`ff00::/8`의 과차단 대조군이 이 판정에 기댄다 — 판별 지점이 여기뿐이다", () => {
    // 정본: 이 공간을 계약 테스트가 그 둘의 과차단 대조군으로 쓰고 있고 "그 둘의 **유일한
    // 판별 지점**이다". 즉 `fe00::/9`가 모집단 안으로 들어오는 날 그 둘은 대조군을 잃는다.
    // 그 **의존을 기계가 들게 한다** — 주석만 두면 다음 개정이 조용히 끊는다.
    const fe00 = new BlockList();
    fe00.addSubnet("fe00::", 9, "ipv6");
    const dependents = wholeBlocked6.filter(
      (entry) => entry.cidr === "fec0::/10" || entry.cidr === "ff00::/8",
    );
    expect(dependents).toHaveLength(2);
    for (const entry of dependents) {
      expect(entry.outside.length).toBeGreaterThan(0);
      for (const address of entry.outside) {
        expect(fe00.check(address, "ipv6"), `${entry.cidr}의 대조군 ${address}`).toBe(true);
      }
    }
  });
});
