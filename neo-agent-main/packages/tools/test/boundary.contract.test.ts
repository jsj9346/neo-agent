/**
 * 워크스페이스 경계 — 계약 독립 검증 (QA-A).
 *
 * 기대값의 출처는 구현이 아니라 문서다:
 *   - `docs/TOOLS-INTERFACE.md` §3 (판정 알고리즘 3단계, 규칙 5개)
 *   - `docs/SAFE-DEFAULTS.md` §1 매트릭스 · §3 계약 2·4
 *
 * SAFE-DEFAULTS §6이 "경계 판정이 뚫리면 §1 매트릭스의 안/밖 구분이 무의미해진다"며
 * 도구 검증의 1급 대상으로 지목한 지점이다. 우회 시도를 8종으로 나눠 전수한다.
 *
 * 인용 계약 — `DOC-CITATION.md` §6 U-b.
 *
 * 이 파일의 주석이 `neo-agent-main/docs/`의 설계 정본 문면을 인용하는 자리에는 §3.4의
 * 대조 축(`U-1`·`D-1`·`D-2`)이 걸린다 — 인용부호로 감싼 문면은 대상 문서에 문자 그대로
 * 있는 부분 문자열이어야 하고, 갈리면 인용부호를 벗기고 서술로 쓴다. 형식 축(`D-3`~`D-5`)은
 * 이 자리에 안 왔으나 대조를 면제하지 않는다. 문서를 줄번호로 가리키는 자리는 이 규약의
 * 게이트가 안 재고 이 선언이 든다 — 지목은 절 번호와 필드 이름으로 한다.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkspaceBoundary, type WorkspaceBoundary } from "../src/index.ts";

describe("WorkspaceBoundary 계약 (TOOLS-INTERFACE §3)", () => {
  let sandbox: string;
  let root: string;
  let home: string;
  let outside: string;
  let boundary: WorkspaceBoundary;

  beforeAll(() => {
    // macOS tmpdir은 `/var` → `/private/var` 심링크다. realpath로 고정하지 않으면
    // 기대값 자체가 틀어져 테스트가 구현이 아니라 플랫폼을 검증하게 된다.
    sandbox = realpathSync(mkdtempSync(join(tmpdir(), "neo-qa-boundary-")));
    root = join(sandbox, "ws");
    home = join(sandbox, "home");
    outside = join(sandbox, "elsewhere");

    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "nested"), { recursive: true });
    mkdirSync(join(home, ".neo-agent", "sub", "deep"), { recursive: true });
    mkdirSync(join(home, ".neo-agent-evil"), { recursive: true });
    mkdirSync(outside, { recursive: true });
    // §3 판정 1: 문자열 prefix 우회의 고전 — 루트와 같은 접두어를 가진 형제 디렉터리
    mkdirSync(join(sandbox, "ws-evil"), { recursive: true });

    writeFileSync(join(root, "src", "app.ts"), "export {};\n");
    writeFileSync(join(root, ".env"), "SECRET=1\n");
    writeFileSync(join(root, ".env.local"), "SECRET=2\n");
    writeFileSync(join(root, ".env.production"), "SECRET=3\n");
    writeFileSync(join(root, ".env.example"), "SECRET=\n");
    writeFileSync(join(root, ".envrc"), "export X=1\n");
    writeFileSync(join(root, "nested", ".env"), "SECRET=4\n");
    writeFileSync(join(home, ".neo-agent", "credentials"), "key\n");
    writeFileSync(join(home, ".neo-agent", "sub", "deep", "x"), "deep\n");
    writeFileSync(join(home, ".neo-agent-evil", "x.txt"), "not the config dir\n");
    writeFileSync(join(home, ".env"), "HOME_SECRET=1\n");
    writeFileSync(join(outside, "secret.txt"), "private\n");
    writeFileSync(join(sandbox, "ws-evil", "x.txt"), "sibling\n");

    // 심볼릭 링크 — 위치가 아니라 실체가 판정 대상이라는 규칙의 검증 재료
    symlinkSync(join(outside, "secret.txt"), join(root, "link-out.txt"));
    symlinkSync(join(root, "link-out.txt"), join(root, "link-chain.txt"));
    symlinkSync(outside, join(root, "link-dir"));
    symlinkSync(join(root, ".env"), join(root, "link-env.txt"));
    symlinkSync(join(home, ".neo-agent"), join(root, "link-config-dir"));
    symlinkSync(join(home, ".neo-agent", "credentials"), join(root, "link-cred.txt"));
    symlinkSync(join(root, "src", "app.ts"), join(root, "link-in.txt"));
    // 루트 자체를 가리키는 링크 — 생성 시 정규화·동결(§3 판정 알고리즘 전제)의 재료
    symlinkSync(root, join(sandbox, "ws-link"));

    boundary = createWorkspaceBoundary({ root, home });
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  // ── 1. prefix 공격 ────────────────────────────────────────────────────────
  describe("1. 문자열 prefix 우회", () => {
    it("루트와 접두어가 같은 형제 디렉터리는 outside다", () => {
      expect(boundary.resolve(join(sandbox, "ws-evil", "x.txt")).scope).toBe("outside");
    });

    it("루트 이름에 문자를 이어붙인 형태도 outside다", () => {
      expect(boundary.resolve(`${root}-evil/x.txt`).scope).toBe("outside");
    });

    it("루트 자신은 inside다", () => {
      expect(boundary.resolve(root).scope).toBe("inside");
    });
  });

  // ── 2. `..` 이스케이프 ────────────────────────────────────────────────────
  describe("2. `..` 이스케이프", () => {
    it("단순 상위 탈출은 outside다", () => {
      expect(boundary.resolve("../elsewhere/secret.txt").scope).toBe("outside");
    });

    it("중첩 탈출(a/../../..)도 outside다", () => {
      expect(boundary.resolve("src/../../..").scope).toBe("outside");
    });

    it("절대 경로에 섞인 `..`도 정규화 후 판정한다", () => {
      expect(boundary.resolve(join(root, "src", "..", "..", "elsewhere", "secret.txt")).scope).toBe(
        "outside",
      );
    });

    it("나갔다 돌아오는 경로는 inside다", () => {
      const resolved = boundary.resolve("src/../../ws/src/app.ts");
      expect(resolved.scope).toBe("inside");
      expect(resolved.path).toBe(join(root, "src", "app.ts"));
    });

    it("`..` 정규화 후 denylist 대상에 닿으면 denied다", () => {
      expect(boundary.resolve("src/../.env").scope).toBe("denied");
    });
  });

  // ── 3. 심볼릭 링크 ────────────────────────────────────────────────────────
  describe("3. 심볼릭 링크 — 판정은 실경로 기준", () => {
    it("워크스페이스 안 링크가 밖을 가리키면 outside다", () => {
      const resolved = boundary.resolve("link-out.txt");
      expect(resolved.scope).toBe("outside");
      expect(resolved.path).toBe(join(outside, "secret.txt"));
    });

    it("링크 체인도 끝까지 따라간다", () => {
      expect(boundary.resolve("link-chain.txt").path).toBe(join(outside, "secret.txt"));
      expect(boundary.resolve("link-chain.txt").scope).toBe("outside");
    });

    it("디렉터리 링크 경유 하위 경로도 outside다", () => {
      expect(boundary.resolve("link-dir/secret.txt").scope).toBe("outside");
    });

    it("디렉터리 링크 경유 미존재 하위 경로도 outside다", () => {
      expect(boundary.resolve("link-dir/deep/new/file.txt").scope).toBe("outside");
    });

    it("워크스페이스 안을 가리키는 링크는 inside다", () => {
      expect(boundary.resolve("link-in.txt").scope).toBe("inside");
    });

    it("링크가 워크스페이스 `.env`를 가리키면 denied다", () => {
      expect(boundary.resolve("link-env.txt").scope).toBe("denied");
    });

    it("링크가 크리덴셜 파일을 가리키면 denied다", () => {
      expect(boundary.resolve("link-cred.txt").scope).toBe("denied");
    });

    it("링크가 설정 디렉터리를 가리키면 그 하위도 denied다", () => {
      expect(boundary.resolve("link-config-dir/credentials").scope).toBe("denied");
      expect(boundary.resolve("link-config-dir/sub/deep/x").scope).toBe("denied");
      // 미존재 파일도 마찬가지 — 쓰기 경로가 판정을 건너뛰지 않는다
      expect(boundary.resolve("link-config-dir/config.json").scope).toBe("denied");
    });
  });

  // ── 4. `~` 확장 ───────────────────────────────────────────────────────────
  describe("4. `~` 확장", () => {
    it("`~` 단독은 홈으로 확장되고, 홈은 워크스페이스 밖이다", () => {
      const resolved = boundary.resolve("~");
      expect(resolved.path).toBe(home);
      expect(resolved.scope).toBe("outside");
    });

    it("`~/x`는 홈 하위로 확장된다", () => {
      expect(boundary.resolve("~/.env").path).toBe(join(home, ".env"));
    });

    it("`~/.neo-agent/...`는 denied다", () => {
      expect(boundary.resolve("~/.neo-agent/credentials").scope).toBe("denied");
    });

    it("`~user` 형태는 확장 대상이 아니므로 워크스페이스 기준 상대 경로다", () => {
      // §3 판정 1은 확장 대상을 `~`와 `~/…` 둘로 한정하고, 나머지 상대 경로는
      // 루트 기준 resolve라고 규정한다. `~alice`는 전자에 해당하지 않는다.
      const resolved = boundary.resolve("~alice/x");
      expect(resolved.path).toBe(join(root, "~alice", "x"));
      expect(resolved.scope).toBe("inside");
    });
  });

  // ── 5. 미존재 깊은 경로 ───────────────────────────────────────────────────
  describe("5. 미존재 경로 — 쓰기 대상이 판정을 건너뛰지 않는다", () => {
    it("워크스페이스 안의 깊은 미존재 경로는 inside다", () => {
      expect(boundary.resolve("a/b/c/d/e/new.txt").scope).toBe("inside");
    });

    it("워크스페이스 밖의 깊은 미존재 경로는 outside다", () => {
      expect(boundary.resolve("../elsewhere/a/b/c/new.txt").scope).toBe("outside");
      expect(boundary.resolve(join(sandbox, "brand", "new", "tree", "x")).scope).toBe("outside");
    });

    it("존재하는 최근접 조상까지 realpath를 적용한다", () => {
      // link-dir는 존재하는 심링크(→ elsewhere), 그 아래는 미존재. 조상 해석이
      // 없으면 이 경로가 inside로 새어 쓰기가 워크스페이스 밖에 일어난다.
      expect(boundary.resolve("link-dir/x/y/z.txt").path).toBe(join(outside, "x", "y", "z.txt"));
    });
  });

  // ── 6. denylist 하위 경로 ─────────────────────────────────────────────────
  describe("6. 크리덴셜 denylist (SAFE-DEFAULTS §3 계약 2)", () => {
    it("설정 디렉터리 자신이 denied다", () => {
      expect(boundary.resolve("~/.neo-agent").scope).toBe("denied");
    });

    it("설정 디렉터리 하위 전체가 denied다 — credentials만이 아니다", () => {
      expect(boundary.resolve("~/.neo-agent/config.json").scope).toBe("denied");
      expect(boundary.resolve("~/.neo-agent/sub/deep/x").scope).toBe("denied");
      expect(boundary.resolve(join(home, ".neo-agent", "sub", "deep", "새파일")).scope).toBe(
        "denied",
      );
    });

    it("denylist 판정도 세그먼트 단위다 — `.neo-agent-evil`은 denied가 아니다", () => {
      // denied가 prefix 비교였다면 여기가 통과한다. 반대 방향(과잉 차단)도 결함이다.
      expect(boundary.resolve(join(home, ".neo-agent-evil", "x.txt")).scope).toBe("outside");
    });
  });

  // ── 7. 워크스페이스 `.env` 변형 ───────────────────────────────────────────
  describe("7. 워크스페이스 `.env` 변형 (SAFE-DEFAULTS §3 계약 4)", () => {
    it(".env는 denied다", () => {
      expect(boundary.resolve(".env").scope).toBe("denied");
    });

    it(".env.local / .env.production은 denied다", () => {
      expect(boundary.resolve(".env.local").scope).toBe("denied");
      expect(boundary.resolve(".env.production").scope).toBe("denied");
    });

    it(".env.example도 denied다 — 예외를 두면 그 이름으로 위장한 시크릿이 통과한다", () => {
      expect(boundary.resolve(".env.example").scope).toBe("denied");
    });

    it("미존재 `.env.*`도 denied다 — 쓰기로 시크릿 파일을 만들 수 없다", () => {
      expect(boundary.resolve(".env.staging").scope).toBe("denied");
    });

    it("`.envrc`는 `.env`도 `.env.*`도 아니므로 denied가 아니다", () => {
      // [미규정] §3은 `.env`·`.env.*`만 지목한다. `.envrc`(direnv)도 시크릿을 담는
      // 관행이 있으나 문서가 규정하지 않았다 — 판정 필요.
      expect(boundary.resolve(".envrc").scope).toBe("inside");
    });

    it("하위 디렉터리의 `.env`도 denied다", () => {
      // [미규정] §3은 "워크스페이스의 `.env`·`.env.*`"라고만 쓴다. 루트 직속만인지
      // 워크스페이스 안 전체인지 문서가 명시하지 않는다. 계약 4의 취지(클론된
      // 저장소의 `.env`)를 보면 하위까지 막는 쪽이 방향이 맞다 — 판정 필요.
      expect(boundary.resolve("nested/.env").scope).toBe("denied");
    });

    it("워크스페이스 밖의 `.env`는 denied가 아니라 outside다", () => {
      // 계약 4는 "워크스페이스의 `.env`"를 지목한다. 홈의 `.env`는 §1 매트릭스의
      // "워크스페이스 밖 읽기 = 승인" 행에 속한다 — 승인으로 열릴 수 있어야 한다.
      expect(boundary.resolve("~/.env").scope).toBe("outside");
    });
  });

  // ── 8. 경로 표기 변형 ─────────────────────────────────────────────────────
  describe("8. 경로 표기 변형", () => {
    it("후행 슬래시는 판정에 영향을 주지 않는다", () => {
      expect(boundary.resolve("src/").scope).toBe("inside");
      expect(boundary.resolve(".env/").scope).toBe("denied");
      expect(boundary.resolve("../elsewhere/").scope).toBe("outside");
    });

    it("중복 슬래시는 정규화된다", () => {
      expect(boundary.resolve("src//app.ts").path).toBe(join(root, "src", "app.ts"));
      expect(boundary.resolve(`${root}//.env`).scope).toBe("denied");
    });

    it("`.` 세그먼트는 정규화된다", () => {
      expect(boundary.resolve("./src/./app.ts").path).toBe(join(root, "src", "app.ts"));
      expect(boundary.resolve("./.env").scope).toBe("denied");
    });

    it("빈 문자열은 루트로 해석된다", () => {
      // [미규정] §3은 빈 입력을 규정하지 않는다. 루트 해석(inside)이 상대 경로
      // 규칙의 자연스러운 귀결이라 기대값으로 삼았다 — 판정 필요.
      expect(boundary.resolve("").scope).toBe("inside");
    });

    it("대소문자만 다른 `.ENV`도 denied여야 한다 (대소문자 비구분 파일시스템)", () => {
      // 이 파일시스템에서 `.ENV`와 `.env`는 **같은 파일**이다. denylist가 바이트
      // 비교면 basename `.ENV`가 비껴가고, 그 결과 SAFE-DEFAULTS §1 매트릭스의
      // "승인으로도 불가" 행이 실제로 뚫린다. §3이 2026-08-06 정정으로
      // "denylist 판정은 대소문자를 구분하지 않는다"를 명문화했다.
      expect(boundary.resolve(".ENV").scope).toBe("denied");
      expect(boundary.resolve(".Env.Local").scope).toBe("denied");
    });

    it("대소문자만 다른 `~/.NEO-AGENT/credentials`도 denied여야 한다", () => {
      expect(boundary.resolve("~/.NEO-AGENT/credentials").scope).toBe("denied");
      expect(boundary.resolve("~/.Neo-Agent/config.json").scope).toBe("denied");
    });

    it("봉쇄 판정은 대소문자를 구분한 채로 둔다 — 오차 방향의 비대칭 (§3 정정)", () => {
      // §3은 두 판정을 의도적으로 다르게 규정한다: 봉쇄가 어긋나면 `outside`로
      // 읽어 자동 허용을 놓칠 뿐(안전 방향)이고, denylist가 어긋나면 막아야 할
      // 것을 놓친다(위험 방향). 이 비대칭이 유지되는지 확인한다.
      expect(boundary.resolve(join(sandbox, "WS", "src", "app.ts")).scope).toBe("outside");
      // 다만 같은 경로의 `.env`는 denylist 쪽이 잡아야 한다
      expect(boundary.resolve(join(sandbox, "WS", ".env")).scope).toBe("denied");
    });
  });

  // ── 부가: 루트 동결 ───────────────────────────────────────────────────────
  describe("루트 정규화·동결 (§3 인터페이스 주석 · SAFE-DEFAULTS §4)", () => {
    it("심링크 경로로 만든 경계도 root는 실경로다", () => {
      const viaLink = createWorkspaceBoundary({ root: join(sandbox, "ws-link"), home });
      expect(viaLink.root).toBe(root);
      expect(viaLink.resolve("src/app.ts").scope).toBe("inside");
      expect(viaLink.resolve(join(root, "src", "app.ts")).scope).toBe("inside");
    });

    it("root 속성은 재할당으로 바뀌지 않는다 (§3 — 런타임 동결)", () => {
      // §3이 2026-08-06 명문화: 타입 수준 `readonly`만으로는 부족하고 재할당이
      // 실제로 불가능해야 한다. 판정기의 기준점이 실행 중에 바뀌면 경계가 무의미해진다.
      // 공유 인스턴스를 오염시키지 않도록 전용 인스턴스로 시도한다
      const victim = createWorkspaceBoundary({ root, home });
      const mutable = victim as { root: string };
      try {
        mutable.root = "/tmp/attacker";
      } catch {
        // 동결돼 있으면 strict 모드에서 throw — 그것도 계약 만족이다
      }
      expect(victim.root).toBe(root);
    });
  });
});
