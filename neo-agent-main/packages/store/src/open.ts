/**
 * DB 열기 — 경로·권한·PRAGMA (`docs/SESSION-STORE.md` §6).
 *
 * 전제는 문서 머리와 같다: **여기 있는 어떤 것도 보안 경계가 아니다.** 파일 권한은
 * 사고를 줄이는 장치이지 적대적 코드를 막는 경계가 아니다.
 *
 * 경로가 `~/.neo-agent/` 아래인 것은 부수 효과가 하나 있고 우연이 아니다:
 * `SAFE-DEFAULTS.md` §3의 크리덴셜 denylist가 그 디렉터리 전체이므로
 * **에이전트는 자기 대화 DB를 도구로 읽을 수 없다**(`workspace.ts`의 `isDenied`).
 */

import { chmodSync, closeSync, mkdirSync, openSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrate.ts";

/** 디렉터리 700 · 파일 600으로 만든다(§6) */
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
/** group·other 비트 — 하나라도 서 있으면 "느슨하다" */
const EXPOSED_BITS = 0o077;

/**
 * SQLite의 특수 경로. 파일이 아니므로 디렉터리·권한 단계를 건너뛴다 — 건너뛰지
 * 않으면 현재 디렉터리에 `:memory:`라는 이름의 파일이 실제로 만들어진다.
 *
 * 열리지는 않는다: 메모리 DB는 WAL을 지원하지 않아 아래 PRAGMA 검사에서 거부된다.
 * 저장소는 파일 기반이라는 것이 계약이고(§6), 이 상수의 역할은 그 거부가 **엉뚱한
 * 파일을 만든 뒤에** 일어나지 않게 하는 것이다.
 */
const IN_MEMORY_PATH = ":memory:";

/** 파일·디렉터리가 예상보다 느슨할 때(§6). 열기는 하되 고치지 않는다 */
export interface LoosePermissionsWarning {
  kind: "loose-directory-permissions" | "loose-file-permissions";
  path: string;
  /** 실측된 권한 비트 (예: `0o644`) */
  mode: number;
  message: string;
}

/**
 * 재개 시 프롬프트 캐시가 깨지는 불일치(§5). 워크스페이스 불일치와 달리 **경고 후
 * 진행**한다 — 결과가 틀린 것이 아니라 비싼 것이기 때문이다.
 */
export interface ResumeMismatchWarning {
  kind: "system-prompt-mismatch" | "model-mismatch";
  sessionId: string;
  stored: string;
  current: string;
  message: string;
}

/**
 * 기존 DB의 스키마가 승격됐다(§2 — 2026-08-06 B-13 판정). 마이그레이션은 되돌릴 수
 * 없는 변경이고(다운그레이드 경로 없음이 규율) 구 버전 바이너리는 이후 이 DB를
 * 거부하므로, 일어났다는 사실이 보여야 한다(§2.6). **신규 DB 생성은 통지하지 않는다**
 * — 생성은 승격이 아니고, 매 신규 설치가 경고로 시작하는 것은 §2.3에 어긋난다.
 */
export interface SchemaMigratedWarning {
  kind: "schema-migrated";
  from: number;
  to: number;
  message: string;
}

/**
 * 검색 인덱스 백필이 읽을 수 없는 행을 만나 **그 행만** 색인에서 제외했다
 * (`SEARCH.md` §6, 검색 플랜 D-1 확정).
 *
 * 마이그레이션은 성공한다 — 손상 행 하나로 DB 전체를 봉쇄하지 않는 것이 스키마 v2의
 * E-21이 세운 폭발 반경 규율이고, 결정적으로 SESSION-STORE §7이 검증 범위를
 * `active = 1` 행으로 한정하며 "비활성 행의 손상은 열기를 막지 않는다"고 명문화했다.
 * 백필은 색인 대칭 때문에 `active = 0` 행도 읽으므로, 여기서 실패 처리하면 §7이
 * 명시적으로 열기를 막지 않는다고 정한 행이 DB 전체를 봉쇄하게 된다.
 *
 * 그럼에도 **조용히 건너뛰지는 않는다**(§6) — 그것이 D-1이 이 통지를 조건으로 단
 * 이유다. 해당 세션을 열면 `loadSession`이 여전히 던지므로 소리는 두 곳에서 난다.
 */
export interface CorruptMessageSkippedWarning {
  kind: "corrupt-message-skipped";
  sessionId: string;
  /** `messages.id` — v2 DDL이 NULL을 허용하므로(E-21) 없을 수 있다 */
  messageId: string | null;
  /** 세션 내 순서. id가 NULL인 행을 지목할 수 있는 유일한 좌표다 */
  seq: number;
  message: string;
}

export type StoreWarning =
  | LoosePermissionsWarning
  | ResumeMismatchWarning
  | SchemaMigratedWarning
  | CorruptMessageSkippedWarning;

export type StoreWarningHandler = (warning: StoreWarning) => void;

export interface OpenDatabaseOptions {
  /** DB 파일 경로. 기본 `~/.neo-agent/sessions.db` */
  path?: string;
  /** 홈 디렉터리. 기본 `os.homedir()` — 테스트가 실제 홈을 건드리지 않게 하는 주입 지점 */
  home?: string;
  /**
   * 권한 경고 수신자. 기본 `console.warn`.
   *
   * 콜백으로 받는 이유는 두 가지다 — 경고가 났다는 사실을 테스트가 단정할 수 있어야
   * 하고, 나중에 CLI가 자기 렌더러로 보여줄 자리가 필요하다.
   */
  onWarning?: StoreWarningHandler;
}

/** `~/.neo-agent/sessions.db` — WAL 부산물(`-wal`·`-shm`)이 같은 디렉터리에 동거한다 */
export function defaultDatabasePath(home?: string): string {
  return join(home ?? homedir(), ".neo-agent", "sessions.db");
}

/**
 * DB를 열고 PRAGMA를 적용한 뒤 마이그레이션까지 끝낸 핸들을 돌려준다.
 *
 * 여는 도중 실패하면 핸들을 닫고 던진다 — 반쯤 열린 DB를 호출자에게 넘기지 않는다.
 */
export function openDatabase(options: OpenDatabaseOptions = {}): DatabaseSync {
  const path = options.path ?? defaultDatabasePath(options.home);
  const warn = options.onWarning ?? defaultWarningHandler;

  if (path !== IN_MEMORY_PATH) {
    ensureDirectory(dirname(path), warn);
    ensureFile(path, warn);
  }

  const db = new DatabaseSync(path);
  try {
    applyPragmas(db);
    migrate(db, {
      onUpgrade: (from, to) =>
        warn({
          kind: "schema-migrated",
          from,
          to,
          message:
            `세션 DB 스키마를 v${from} → v${to}로 마이그레이션했다 — ` +
            "이전 버전의 neo-agent는 이제 이 DB를 열지 않는다.",
        }),
      // 백필이 건너뛴 손상 행은 열기 경고와 같은 채널로 나간다 — 사용자에게는 한
      // 채널이고, 저장소는 표시 방식을 모른다(§1).
      onWarning: warn,
    });
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

/**
 * 기본 경고 수신자. `console.warn`으로 나가는 것이 계약이 아니라 **어딘가로는
 * 나가는 것**이 계약이다(§6 "노출 사실이 보여야 한다") — CLI가 자기 렌더러를
 * 주입하면 그쪽으로 간다.
 */
export function defaultWarningHandler(warning: StoreWarning): void {
  console.warn(warning.message);
}

/**
 * 디렉터리를 0700으로 확보한다.
 *
 * `mkdirSync`가 만든 경로를 돌려주면 우리가 만든 것이고, 그때만 `chmod`한다 —
 * umask가 모드를 깎을 수 있어서다(umask `0277`이면 `mkdir(0700)`이 `0500`이 된다,
 * 실측). **기존 디렉터리는 고치지 않는다**: 자동 chmod로 조용히 고치면 노출 사실이
 * 보이지 않게 된다(§6, 크리덴셜과 같은 취급).
 */
function ensureDirectory(directory: string, warn: StoreWarningHandler): void {
  const created = mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
  if (created !== undefined) {
    chmodSync(directory, DIRECTORY_MODE);
    return;
  }

  const mode = statSync(directory).mode & 0o777;
  if ((mode & EXPOSED_BITS) !== 0) {
    warn({
      kind: "loose-directory-permissions",
      path: directory,
      mode,
      message:
        `${directory} is readable by other users (mode ${toOctal(mode)}). ` +
        `neo-agent creates it as ${toOctal(DIRECTORY_MODE)} and will not change it for you — ` +
        `run \`chmod ${toOctal(DIRECTORY_MODE)} ${directory}\` if that is not intended.`,
    });
  }
}

/**
 * DB 파일을 **우리가 먼저** 0600으로 만든다.
 *
 * SQLite에게 생성을 맡기면 umask가 적용된 `0644`가 되고(실측), 그때 chmod로 좁히면
 * 파일이 잠깐 노출되는 창이 생긴다. 빈 파일(0바이트)은 SQLite가 유효한 빈 DB로
 * 취급하므로 선생성이 안전하다 — 그리고 SQLite는 `-wal`·`-shm`의 권한을 **본
 * 파일에서 복사한다**(실측: 0600 DB → 0600 부산물, 0644 DB → 0644 부산물). 즉
 * 본 파일만 잡으면 부산물도 따라온다.
 *
 * `wx`(배타 생성)를 쓰는 이유는 "우리가 만들었다"를 명확히 알기 위해서다 —
 * `EEXIST`면 남이 만든 파일이고, 그 모드는 **경고만 하고 고치지 않는다**.
 */
function ensureFile(path: string, warn: StoreWarningHandler): void {
  try {
    closeSync(openSync(path, "wx", FILE_MODE));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

    const mode = statSync(path).mode & 0o777;
    if ((mode & EXPOSED_BITS) !== 0) {
      warn({
        kind: "loose-file-permissions",
        path,
        mode,
        message:
          `${path} holds your full conversation history and is readable by other users ` +
          `(mode ${toOctal(mode)}). neo-agent creates it as ${toOctal(FILE_MODE)} and will not ` +
          `change it for you — run \`chmod ${toOctal(FILE_MODE)} ${path}\` if that is not intended.`,
      });
    }
    return;
  }

  // umask가 깎은 비트를 되돌려 모드를 결정적으로 만든다. 방금 우리가 만든 파일이라
  // "남의 느슨한 파일을 조용히 고친다"에 해당하지 않는다.
  chmodSync(path, FILE_MODE);
}

function toOctal(mode: number): string {
  return `0${mode.toString(8).padStart(3, "0")}`;
}

/**
 * PRAGMA 4종 (§6). **전부 설정 후 조회로 확인한다** — PRAGMA는 실패해도 던지지 않고
 * 다른 값을 돌려주는 것이 있어서, 설정만 하고 넘어가면 silent 폴백이 된다
 * (REUSE-MAP §2.4가 금지한 바로 그것).
 */
function applyPragmas(db: DatabaseSync): void {
  // `PRAGMA journal_mode = WAL`은 **실패해도 예외를 던지지 않고 적용된 모드를
  // 돌려준다** — `:memory:`에서 `"memory"`가 나오는 것을 실측했다. 반환값 검사가
  // 유일한 감지 수단이다.
  const journalMode = pragmaValue(db, "PRAGMA journal_mode = WAL");
  if (journalMode !== "wal") {
    throw new Error(
      `Could not enable WAL journaling on the session database (SQLite reported "${String(journalMode)}"). ` +
        "neo-agent does not fall back silently — a different journal mode changes the durability " +
        "and concurrency guarantees this store is built on.",
    );
  }

  // `node:sqlite`는 FK를 기본으로 켜지만(`enableForeignKeyConstraints` 기본 true,
  // 실측) 그것은 **런타임의 기본값이지 SQLite의 기본값이 아니다** — SQLite 자체는
  // off다. 명시하고 조회로 확인해서, 런타임 기본값이 바뀌어도 FK가 조용히 장식이
  // 되지 않게 한다.
  db.exec("PRAGMA foreign_keys = ON");
  const foreignKeys = pragmaValue(db, "PRAGMA foreign_keys");
  if (foreignKeys !== 1) {
    throw new Error(
      `Could not enable foreign key enforcement (PRAGMA foreign_keys reported "${String(foreignKeys)}"). ` +
        "Without it the REFERENCES clauses in the schema are decoration.",
    );
  }

  // 두 터미널이 같은 DB를 열었을 때의 잠금 대기(§6). 조회 시 컬럼 이름은
  // `busy_timeout`이 아니라 `timeout`이다(실측).
  db.exec("PRAGMA busy_timeout = 5000");
  const busyTimeout = pragmaValue(db, "PRAGMA busy_timeout");
  if (busyTimeout !== 5000) {
    throw new Error(`Could not set busy_timeout (SQLite reported "${String(busyTimeout)}").`);
  }

  // WAL 권장값. FULL은 개인 로컬에 과하다(§6). NORMAL은 조회 시 정수 1이다.
  db.exec("PRAGMA synchronous = NORMAL");
  const synchronous = pragmaValue(db, "PRAGMA synchronous");
  if (synchronous !== 1) {
    throw new Error(`Could not set synchronous=NORMAL (SQLite reported "${String(synchronous)}").`);
  }
}

/** PRAGMA 문의 첫 행 첫 값. 값을 돌려주지 않는 PRAGMA면 `undefined` */
function pragmaValue(db: DatabaseSync, statement: string): unknown {
  const row = db.prepare(statement).get();
  if (row === undefined || row === null) return undefined;
  const values = Object.values(row as Record<string, unknown>);
  return values.length === 0 ? undefined : values[0];
}
