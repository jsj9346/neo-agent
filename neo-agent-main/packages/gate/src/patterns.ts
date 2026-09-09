/**
 * 하드라인 블록리스트와 위험 패턴 — `docs/APPROVAL-GATE.md` §2 계층 1·4.
 *
 * 두 목록의 성격이 다르다는 것이 이 파일의 핵심이다:
 *
 * - **하드라인(계층 1)** 은 모드 무관 즉시 차단이다. `off`에서도 동작하므로
 *   **의도적으로 최소**로 유지한다(SAFE-DEFAULTS §1). 넓히면 "어차피 다 막네"가
 *   되어 `off` 옵트인의 의미가 사라진다 — 목록을 늘리고 싶을 때마다
 *   "이건 위험 패턴(플래그)이면 충분하지 않은가"를 먼저 묻는다.
 * - **위험 패턴(계층 4)** 은 차단이 아니라 플래그다. allowlist 숏컷을 무효화하고
 *   프롬프트 경고에 실린다. 오탐의 대가가 "한 번 더 물어본다"뿐이라 하드라인보다
 *   훨씬 넓게 잡아도 된다.
 *
 * **정규식은 유계 필러만 쓴다** — `(?:\s+\S{1,64}){0,8}` 형태. 무계 `.*`는 모델이
 * 만든 긴 문자열에서 백트래킹으로 판정기를 묶는 ReDoS 경로다(hermes
 * `threat_patterns.py`의 유계 필러 규율).
 *
 * 형태 판정이 정규식보다 토큰 스캔으로 더 정확한 경우(`rm`의 플래그·피연산자,
 * 명령 선두 판정)에는 유계 토큰 스캐너를 쓴다. 목적은 "정규식으로 쓴다"가 아니라
 * "입력 길이에 선형이고 오탐이 적다"이므로 조건을 만족하는 쪽을 고른다.
 */

export interface GatePattern {
  /** 안정적인 식별자. 경고 문구가 바뀌어도 테스트·로그가 흔들리지 않게 */
  readonly id: string;
  /** 사용자에게 보이는 한 줄. 프롬프트 경고와 차단 사유에 그대로 실린다 */
  readonly message: string;
  readonly match: (text: string) => boolean;
}

/** 위험 패턴이 어느 판정 대상에 적용되는가 */
export interface RiskPattern extends GatePattern {
  readonly appliesTo: "command" | "path" | "both";
}

/** 토큰 스캔 상한 — 한 명령에서 이만큼만 본다(유계 보장) */
const MAX_TOKENS = 512;

/**
 * 공백 단위 토큰. 셸 파싱이 아니다 — 명백한 파괴 형태를 잡는 것이 목적이고,
 * 정확히 파싱하더라도 우회는 남는다는 것을 계약이 이미 인정한다.
 */
function tokenize(text: string): string[] {
  const parts: string[] = [];
  for (const token of text.split(/\s+/)) {
    if (token.length === 0) continue;
    parts.push(token);
    if (parts.length >= MAX_TOKENS) break;
  }
  return parts;
}

/** 경로 접두를 떼어낸 실행 파일 이름. `/sbin/reboot` → `reboot` */
function basename(token: string): string {
  const cut = token.lastIndexOf("/");
  return cut < 0 ? token : token.slice(cut + 1);
}

/** 셸 연산자 토큰 — 여기서 다음 명령이 시작된다고 본다 */
const OPERATOR_TOKEN = /^(?:&&|\|\||[;&|]|\d?>{1,2}|<)$/;

/**
 * 명령 선두들. `sudo`·환경변수 대입·`nohup` 같은 접두사는 건너뛰고 실제 실행
 * 파일 이름을 모은다. 이 정밀도가 필요한 이유는 `npm run reboot`이 셧다운
 * 하드라인에 걸리면 안 되기 때문이다 — 하드라인은 오탐이 곧 사용 불가다.
 */
export function commandHeads(text: string): string[] {
  const heads: string[] = [];
  const segments = text.split(/(?:\|\||&&|[;&|\n]|\$\(|`|\))/);
  for (const segment of segments) {
    const parts = tokenize(segment);
    for (const token of parts) {
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
      const name = basename(token);
      if (["sudo", "doas", "env", "nohup", "time", "command", "exec", "builtin"].includes(name)) {
        continue;
      }
      if (token.startsWith("-")) continue;
      heads.push(name);
      break;
    }
  }
  return heads;
}

/**
 * allowlist 학습 불가 판정 — 셸 연산자를 포함한 복합 명령.
 * `ls`를 학습시킨 뒤 `ls; rm -rf ~`가 통과하는 숏컷을 차단한다
 * (hermes `_has_allowlist_shell_operator` 대응, APPROVAL-GATE §2 계층 6).
 *
 * `ls ";"`처럼 리터럴 세미콜론을 인자로 준 경우도 함께 걸리지만, 그 대가는
 * "이 명령은 항상 허용으로 학습되지 않는다"뿐이다 — 안전한 방향의 오탐이다.
 */
export function hasShellOperator(command: string): boolean {
  return /(?:\n|&&|\|\||[;&|<>`]|\$\()/.test(command);
}

/**
 * allowlist 학습 불가 판정 — 키 문법을 깨뜨리는 작업 디렉터리
 * (APPROVAL-GATE §4, 2026-09-09).
 *
 * 셸 키는 `shell:<cwd>:<정규화된 명령>`이고, 이 표현이 (cwd, 명령) 쌍을 **유일하게**
 * 나타내려면 `cwd` 필드가 `:`을 갖지 않아야 한다. 아니면 `(/ws/a, "npm test")`와
 * `(/ws, "a:npm test")`가 같은 문자열이 되어 **한쪽 승인이 다른 쪽을 통과시킨다** —
 * 키를 좁히러 온 개정이 새 넓힘을 심는 자리다. 보장이 서면 첫 `:`이 언제나 경계이므로
 * 명령 쪽은 `:`을 자유롭게 가져도 된다.
 *
 * 개행을 함께 막는 것은 파일 포맷 때문이다 — allowlist는 한 줄이 키 하나이고
 * (`CLI-INTERFACE.md` §10), 그 「한 줄」을 지키는 주체는 파일 구현이 아니라 게이트다.
 * 명령 쪽은 `hasShellOperator`가 `\n`을 이미 잡아 키를 주지 않으므로 **양쪽이 대칭**이 된다.
 *
 * NUL은 검사하지 않는다 — POSIX 경로가 가질 수 없다.
 *
 * 걸렸을 때의 대가는 `hasShellOperator`와 같다: "이 명령은 항상 허용으로 학습되지
 * 않는다"뿐이고, 안전한 방향의 오탐이다.
 */
export function cwdBreaksKeySyntax(cwd: string): boolean {
  return /[:\n\r]/.test(cwd);
}

// ── 하드라인 ────────────────────────────────────────────────────────────

/** 루트 자체를 가리키는 피연산자만 본다. `/etc`·`/usr`는 하드라인이 아니다(최소 원칙) */
const ROOT_OPERAND = /^\/(?:\*|\.{1,2})?$/;

/**
 * 루트 파일시스템 파괴. `rm`의 플래그·피연산자를 유계로 스캔한다.
 * 재귀 플래그 + 루트 피연산자면 걸린다 — `-f`는 요구하지 않는다.
 * `rm -r /`도 파괴적이고, 강제 플래그 유무는 파괴 여부를 바꾸지 않는다.
 */
function isRootFilesystemDelete(text: string): boolean {
  const parts = tokenize(text);
  for (let i = 0; i < parts.length; i += 1) {
    if (basename(parts[i] ?? "") !== "rm") continue;

    let recursive = false;
    let noPreserveRoot = false;
    const operands: string[] = [];
    // 한 명령의 인자만 본다 — 24개면 실사용을 덮고 상한도 지킨다
    for (let j = i + 1; j < parts.length && j <= i + 24; j += 1) {
      const arg = parts[j] ?? "";
      if (OPERATOR_TOKEN.test(arg)) break;
      if (arg === "--no-preserve-root") {
        noPreserveRoot = true;
        continue;
      }
      if (arg.startsWith("--")) {
        if (arg === "--recursive") recursive = true;
        continue;
      }
      if (arg.startsWith("-") && arg.length > 1) {
        if (/[rR]/.test(arg)) recursive = true;
        continue;
      }
      operands.push(arg);
    }

    if (!recursive && !noPreserveRoot) continue;
    if (operands.some((operand) => ROOT_OPERAND.test(operand))) return true;
  }
  return false;
}

/** 디스크 블록 디바이스. 파티션·전체 디스크 양쪽을 본다 */
const BLOCK_DEVICE =
  "/dev/(?:sd[a-z]{1,2}[0-9]{0,3}|hd[a-z]{1,2}[0-9]{0,3}|vd[a-z]{1,2}[0-9]{0,3}|nvme[0-9]{1,3}n[0-9]{1,3}(?:p[0-9]{1,3})?|mmcblk[0-9]{1,3}(?:p[0-9]{1,3})?|r?disk[0-9]{1,3}(?:s[0-9]{1,3})?)";

/** `dd ... of=/dev/sda` — 필러는 유계 토큰 반복 */
const DD_TO_BLOCK_DEVICE = new RegExp(`\\bdd\\b(?:\\s+\\S{1,128}){0,12}\\s+of=${BLOCK_DEVICE}`);

/** `> /dev/sda` 리다이렉션 */
const REDIRECT_TO_BLOCK_DEVICE = new RegExp(`>{1,2}\\s*${BLOCK_DEVICE}`);

/** `mkfs.ext4 /dev/sda1` — 파일시스템 생성은 기존 내용의 전면 파괴다 */
const MKFS_ON_BLOCK_DEVICE = new RegExp(
  `\\bmkfs(?:\\.[a-z0-9]{1,10})?\\b(?:\\s+-{1,2}[\\w-]{1,24}(?:\\s+\\S{1,64})?){0,8}\\s+${BLOCK_DEVICE}`,
);

const SHUTDOWN_COMMANDS = new Set(["shutdown", "reboot", "poweroff", "halt"]);

/** `systemctl poweroff` / `init 0` 같은 간접 형태 */
const INDIRECT_SHUTDOWN =
  /\b(?:systemctl\s+(?:--\S{1,32}\s+){0,4}(?:poweroff|reboot|halt|kexec)|init\s+[06]\b|launchctl\s+reboot)/;

/**
 * 하드라인 목록 — 3종. 루트 FS 파괴·블록 디바이스 덮어쓰기·셧다운급.
 * SAFE-DEFAULTS §1이 명시한 범위 그대로이며, 여기에 항목을 더하려면
 * 문서를 먼저 고친다(목록이 계약보다 앞서 자라는 것을 막는다).
 *
 * 포크 폭탄(`:(){:|:&};:`)은 **일부러 하드라인에 넣지 않았다** — 머신을 못 쓰게
 * 만드는 것은 맞지만 문서가 정한 3범주 밖이고, 최소 원칙을 지키는 쪽이
 * `off` 옵트인의 의미를 지킨다. 위험 패턴으로 플래그된다.
 */
export const HARDLINE_PATTERNS: readonly GatePattern[] = [
  {
    id: "root-filesystem-delete",
    message: "recursive delete of the root filesystem",
    match: isRootFilesystemDelete,
  },
  {
    id: "block-device-overwrite",
    message: "direct overwrite of a block device",
    match: (text) =>
      DD_TO_BLOCK_DEVICE.test(text) ||
      REDIRECT_TO_BLOCK_DEVICE.test(text) ||
      MKFS_ON_BLOCK_DEVICE.test(text),
  },
  {
    id: "system-shutdown",
    message: "system shutdown or reboot",
    match: (text) =>
      commandHeads(text).some((head) => SHUTDOWN_COMMANDS.has(head)) ||
      INDIRECT_SHUTDOWN.test(text),
  },
];

/** 경로 자체가 블록 디바이스인지 — 경로 전체가 대상이므로 앵커를 건다 */
const BLOCK_DEVICE_PATH = new RegExp(`^${BLOCK_DEVICE}$`);

/**
 * 파일 쓰기·편집 **경로**에 적용하는 하드라인.
 *
 * 하드라인이 금지하는 것은 특정 도구가 아니라 **결과**다. `dd of=/dev/sda`를 막으면서
 * `write_file({path: "/dev/sda"})`를 열어두면 같은 파괴에 다른 문으로 도달하고,
 * "승인으로도 불가"라는 정의가 실효를 잃는다(APPROVAL-GATE §2, QA 검증에서 발견).
 *
 * 읽기는 대상이 아니다 — 계약이 금지하는 것은 덮어쓰기다.
 */
export const HARDLINE_PATH_PATTERNS: readonly GatePattern[] = [
  {
    id: "block-device-write",
    message: "writing directly to a block device",
    match: (text) => BLOCK_DEVICE_PATH.test(text),
  },
];

// ── 위험 패턴 ───────────────────────────────────────────────────────────

/**
 * 크리덴셜·시크릿 경로. TOOLS-INTERFACE §3의 도구 자체 denylist(`~/.neo-agent/`,
 * 워크스페이스 `.env`)가 못 덮는 나머지를 최선 노력으로 잡는다 —
 * 셸 명령은 경로로 환원되지 않아 classifier가 판정할 수 없다(같은 문서 §3의 인정).
 *
 * 전부 리터럴 대안이라 필러가 없다 = 백트래킹 표면도 없다.
 */
const CREDENTIAL_PATHS =
  /(?:\.neo-agent\b|\.ssh\b|\.aws\b|\.gnupg\b|\.netrc\b|\.kube\b|\.docker\/config|\.git-credentials\b|\.npmrc\b|\.pypirc\b|\bid_rsa\b|\bid_ecdsa\b|\bid_ed25519\b|\bcredentials\.json\b|\.env(?:\.[\w.-]{1,32})?(?:$|[^\w-]))/i;

/** macOS 키체인 직접 조회 — 크리덴셜 절취의 정형 */
const KEYCHAIN_READ = /\bsecurity\s+(?:-\S{1,16}\s+){0,4}find-(?:generic|internet)-password\b/i;

/** `rm -r` 계열. 하드라인과 달리 대상을 가리지 않는다 */
const RECURSIVE_DELETE =
  /\brm\b(?:\s+\S{1,64}){0,8}\s+-{1,2}(?:[a-zA-Z]{0,10}[rR][a-zA-Z]{0,10}|recursive)\b|\brm\s+-{1,2}(?:[a-zA-Z]{0,10}[rR][a-zA-Z]{0,10}|recursive)\b/;

/** 권한 상승 */
const PRIVILEGE_ESCALATION = /(?:^|[\s;&|(])(?:sudo|doas)\s|(?:^|[\s;&|(])su\s+(?:-|root)\b/;

/** 내려받아 바로 실행 — 원격 코드 실행의 정형 */
const PIPE_TO_SHELL =
  /\b(?:curl|wget|fetch)\b(?:\s+\S{1,256}){0,16}\s*\|\s*(?:sudo\s+){0,1}(?:\/usr\/bin\/|\/bin\/){0,1}(?:ba|z|k|da|fi)?sh\b/;

/** 권한 확대 */
const PERMISSION_WIDENING =
  /\bchmod\b(?:\s+-{1,2}[\w-]{1,16}){0,4}\s+(?:0?777|a\+rwx|o\+w)\b|\bchmod\s+-{1,2}[\w-]{0,8}R\b|\bchown\s+-{1,2}[\w-]{0,8}R\b/;

/** 포크 폭탄. `.{0,40}`은 유계 필러 */
const FORK_BOMB = /:\s*\(\s*\)\s*\{.{0,40}\|.{0,40}&.{0,20}\}\s*;\s*:/;

/** 되돌릴 수 없는 VCS 조작 — 에이전트가 사용자의 작업을 지우는 가장 흔한 경로 */
const DESTRUCTIVE_VCS =
  /\bgit\b(?:\s+\S{1,64}){0,8}\s+(?:push\b(?:\s+\S{1,64}){0,6}\s+(?:--force(?![-\w])|-f(?![-\w]))|reset\b(?:\s+\S{1,64}){0,4}\s+--hard\b|clean\b(?:\s+-{1,2}[\w-]{1,16}){1,4})/;

/** 예약 실행 등록 — 세션이 끝난 뒤에도 남는 부작용 */
const PERSISTENCE = /\bcrontab\b|\bat\s+now\b|\bsystemctl\s+enable\b|\blaunchctl\s+load\b/;

/** 원시 디스크 쓰기(하드라인에 못 미치는 것) */
const RAW_DISK_WRITE = /\bdd\b(?:\s+\S{1,128}){0,12}\s+of=\/dev\//;

/**
 * 위험 패턴 목록. **차단이 아니라 플래그다** — 여기 걸려도 판정은 프롬프트로
 * 가고, 사용자가 허용하면 실행된다. 다만 allowlist 숏컷은 무효화된다.
 */
export const RISK_PATTERNS: readonly RiskPattern[] = [
  {
    id: "credential-path",
    message: "크리덴셜·시크릿 경로에 접근한다",
    appliesTo: "both",
    match: (text) => CREDENTIAL_PATHS.test(text),
  },
  {
    id: "keychain-read",
    message: "OS 키체인에서 비밀번호를 읽으려 한다",
    appliesTo: "command",
    match: (text) => KEYCHAIN_READ.test(text),
  },
  {
    id: "recursive-delete",
    message: "재귀 삭제 — 되돌릴 수 없다",
    appliesTo: "command",
    match: (text) => RECURSIVE_DELETE.test(text),
  },
  {
    id: "privilege-escalation",
    message: "권한 상승(sudo·su)을 요구한다",
    appliesTo: "command",
    match: (text) => PRIVILEGE_ESCALATION.test(text),
  },
  {
    id: "pipe-to-shell",
    message: "내려받은 스크립트를 검토 없이 바로 실행한다",
    appliesTo: "command",
    match: (text) => PIPE_TO_SHELL.test(text),
  },
  {
    id: "permission-widening",
    message: "파일 권한·소유자를 넓힌다",
    appliesTo: "command",
    match: (text) => PERMISSION_WIDENING.test(text),
  },
  {
    id: "fork-bomb",
    message: "포크 폭탄 형태 — 머신이 응답하지 않게 된다",
    appliesTo: "command",
    match: (text) => FORK_BOMB.test(text),
  },
  {
    id: "destructive-vcs",
    message: "커밋되지 않았거나 푸시된 작업을 되돌릴 수 없게 만든다",
    appliesTo: "command",
    match: (text) => DESTRUCTIVE_VCS.test(text),
  },
  {
    id: "persistence",
    message: "세션이 끝난 뒤에도 남는 예약 실행을 등록한다",
    appliesTo: "command",
    match: (text) => PERSISTENCE.test(text),
  },
  {
    id: "raw-disk-write",
    message: "디바이스 파일에 직접 쓴다",
    appliesTo: "command",
    match: (text) => RAW_DISK_WRITE.test(text),
  },
];

/** 후보 문자열 전부에 대해 하드라인을 시도한다 — 한 변형만 보면 나머지가 우회로다 */
export function matchHardline(variants: readonly string[]): GatePattern | undefined {
  return firstMatch(HARDLINE_PATTERNS, variants);
}

/** 파일 쓰기·편집 경로용 하드라인 — 셸 명령용과 목록이 다르다 */
export function matchPathHardline(variants: readonly string[]): GatePattern | undefined {
  return firstMatch(HARDLINE_PATH_PATTERNS, variants);
}

function firstMatch(
  patterns: readonly GatePattern[],
  variants: readonly string[],
): GatePattern | undefined {
  for (const pattern of patterns) {
    for (const text of variants) {
      if (pattern.match(text)) return pattern;
    }
  }
  return undefined;
}

/** 걸린 위험 패턴 전부. 사용자에게 하나만 보여주면 나머지를 놓친다 */
export function matchRisks(
  variants: readonly string[],
  target: "command" | "path",
): readonly RiskPattern[] {
  const hits: RiskPattern[] = [];
  for (const pattern of RISK_PATTERNS) {
    if (pattern.appliesTo !== "both" && pattern.appliesTo !== target) continue;
    if (variants.some((text) => pattern.match(text))) hits.push(pattern);
  }
  return hits;
}
