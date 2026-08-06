/**
 * 워크스페이스 경계 판정 — `docs/TOOLS-INTERFACE.md` §3.
 *
 * **판정기는 하나뿐이어야 한다.** 도구 실행과 승인 게이트가 같은 인스턴스를
 * 주입받아 쓴다 — 판정기가 둘이면 "게이트는 안이라 했는데 도구는 밖을 읽는"
 * 불일치가 생기고, 그 순간 게이트 매트릭스의 안/밖 구분이 무의미해진다.
 *
 * 레퍼런스(OpenClaw `sessions/tools/path-utils.ts`)는 워크스페이스 봉쇄를 하지
 * 않는다 — `~`와 절대 경로를 자유롭게 해석할 뿐이다. 이 파일의 봉쇄 판정은
 * 레퍼런스에 없는 우리 고유 설계다.
 */

import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

/**
 * `denied`는 `inside`/`outside`와 다른 축이다 — 위치가 아니라 **접근 자체가
 * 금지된 대상**을 뜻하며, 승인으로도 열리지 않는다(SAFE-DEFAULTS §1 매트릭스).
 */
export type PathScope = "inside" | "outside" | "denied";

export interface ResolvedPath {
  /** 심볼릭 링크를 해석한 최종 절대 경로 */
  path: string;
  scope: PathScope;
}

export interface WorkspaceBoundary {
  /** 생성 시 realpath로 정규화·동결된 워크스페이스 루트 */
  readonly root: string;
  resolve(input: string): ResolvedPath;
}

export interface WorkspaceBoundaryOptions {
  root: string;
  /** 홈 디렉터리. 기본 `os.homedir()` — 테스트가 실제 홈을 건드리지 않게 하는 주입 지점 */
  home?: string;
  /** 크리덴셜·설정 디렉터리 이름. 기본 `.neo-agent` */
  configDirName?: string;
}

/**
 * 조상 탐색의 상한. `dirname`은 루트에서 고정점이라 자연 종료하지만, 경로가
 * 비정상적으로 깊거나 플랫폼이 예상 밖으로 동작할 때 무한 루프가 되지 않게 막는다.
 */
const MAX_ANCESTOR_WALK = 4096;

/** 경로가 존재하지 않아서 realpath가 실패한 경우인지 — 그 외 실패는 판정 불가로 다룬다 */
function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

/**
 * 존재하는 최근접 조상까지 realpath를 적용하고 나머지 세그먼트를 이어 붙인다.
 *
 * 쓰기 대상은 아직 존재하지 않는 것이 정상이므로(새 파일 생성), 미존재를 이유로
 * 판정을 포기하면 write 도구가 경계 검사를 통째로 건너뛰게 된다.
 *
 * 존재하지 않는 것 외의 실패(권한 등)는 `null`을 돌려준다 — 호출자가 fail-closed로
 * 처리한다. 여기서 조상 판정으로 대신하면 "워크스페이스 안의 읽을 수 없는 심링크가
 * 밖을 가리키는" 경우가 inside로 오판된다.
 */
function realpathToNearestAncestor(absolute: string): string | null {
  let current = absolute;
  const trailing: string[] = [];

  for (let step = 0; step < MAX_ANCESTOR_WALK; step += 1) {
    try {
      const real = realpathSync(current);
      return trailing.length === 0 ? real : join(real, ...trailing.reverse());
    } catch (error) {
      if (!isMissingPathError(error)) return null;
      const parent = dirname(current);
      // 루트까지 올라갔는데도 없다 — 실재하지 않는 파일시스템이므로 입력을 그대로 쓴다.
      if (parent === current) return absolute;
      trailing.push(basename(current));
      current = parent;
    }
  }

  return null;
}

/**
 * 세그먼트 단위 봉쇄 판정. **문자열 prefix 비교를 쓰지 않는다** — `/ws`에 대해
 * `/ws-evil`이 통과하는 고전적 우회다. `path.relative`는 세그먼트 의미론을
 * 보장하므로 그 결과가 `..`로 시작하지 않는지만 보면 된다.
 */
function isWithin(root: string, target: string): boolean {
  if (target === root) return true;
  const rel = relative(root, target);
  if (rel === "") return true;
  return !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * denylist 비교는 **대소문자를 구분하지 않는다**(TOOLS-INTERFACE §3, 2026-08-06 정정).
 *
 * macOS 기본 파일시스템은 대소문자를 구분하지 않는데 `realpath(".ENV")`는 `.env`가
 * 실재해도 입력 표기를 그대로 돌려준다 — 실측으로 확인했다. 바이트 비교만 하면
 * `read_file({path: ".ENV"})` 한 번으로 크리덴셜 보호가 뚫린다.
 *
 * 봉쇄 판정(`isWithin`)까지 비구분으로 바꾸지 않는 이유는 오차의 방향이 반대이기
 * 때문이다: 봉쇄가 어긋나면 `outside`로 읽어 자동 허용을 놓칠 뿐이지만, denylist가
 * 어긋나면 막아야 할 것을 놓친다.
 *
 * `toLowerCase()`는 로케일 무관이다(`toLocaleLowerCase`와 달리 터키어 I 문제가 없다).
 */
function isWithinIgnoringCase(root: string, target: string): boolean {
  return isWithin(root.toLowerCase(), target.toLowerCase());
}

/**
 * `.env`·`.env.local`·`.env.production` … 시크릿이 실릴 수 있는 파일 전부.
 *
 * `.env.example` 같은 템플릿에 예외를 두지 않는다 — 예외가 있으면 그 이름으로 위장한
 * 실제 시크릿 파일이 통과하고, denylist는 예측 가능해야 방어 가치가 있다.
 */
function isDotenvName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === ".env" || lower.startsWith(".env.");
}

export function createWorkspaceBoundary(options: WorkspaceBoundaryOptions): WorkspaceBoundary {
  const home = options.home ?? homedir();
  const configDirName = options.configDirName ?? ".neo-agent";

  // 루트·홈을 생성 시 1회 정규화해 동결한다(SAFE-DEFAULTS §4). macOS의 `/var` →
  // `/private/var`처럼 심링크가 섞인 경로를 매번 다르게 해석하면 판정이 흔들린다.
  const root = existsSync(options.root) ? realpathSync(options.root) : resolve(options.root);
  const realHome = existsSync(home) ? realpathSync(home) : resolve(home);
  const configDir = join(realHome, configDirName);

  /** `~`·`~/…`만 확장한다. `~user` 형태는 지원하지 않고 리터럴 디렉터리명으로 둔다 */
  function expandHome(input: string): string {
    if (input === "~") return realHome;
    if (input.startsWith("~/")) return join(realHome, input.slice(2));
    return input;
  }

  function isDenied(target: string): boolean {
    // 설정 디렉터리는 credentials 파일만이 아니라 통째로 막는다. 에이전트가
    // `config.*`를 고치면 시작 시 동결(SAFE-DEFAULTS §4)이 막지 못하는 **다음 세션의
    // 게이트 약화**가 된다 — 지연된 권한상승 경로다.
    if (isWithinIgnoringCase(configDir, target)) return true;
    // 워크스페이스 안의 `.env`류. 클론된 저장소가 트래픽을 자기 엔드포인트로
    // 돌리는 경로를 막는다(SAFE-DEFAULTS §3 계약 4).
    return isWithinIgnoringCase(root, target) && isDotenvName(basename(target));
  }

  // 런타임 동결(SAFE-DEFAULTS §4). 타입 수준 `readonly`만으로는 `boundary.root = "/"`가
  // 실제로 먹힌다 — 판정기의 기준점이 실행 중에 바뀌면 경계 전체가 무의미해진다.
  // 코어의 `state.messages`가 타입 수준 보증에 그치는 것과 의도적으로 다르다:
  // 그쪽은 데이터 노출이고 이쪽은 보안 판정의 기준점이다.
  return Object.freeze({
    root,

    resolve(input: string): ResolvedPath {
      const expanded = expandHome(input);
      const absolute = isAbsolute(expanded) ? expanded : resolve(root, expanded);
      const real = realpathToNearestAncestor(absolute);

      // 판정 불가는 fail-closed로 — `inside`(자동 허용 대상)라고 잘못 말하는 것이
      // 최악이다. `denied`까지 가지 않는 이유는 오탐 시 승인으로도 열 수 없어
      // 사용성이 과하게 깨지기 때문이다.
      if (real === null) return { path: absolute, scope: "outside" };

      if (isDenied(real)) return { path: real, scope: "denied" };
      return { path: real, scope: isWithin(root, real) ? "inside" : "outside" };
    },
  });
}
