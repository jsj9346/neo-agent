/**
 * 설정 파일 — `docs/CLI-INTERFACE.md` §3.
 *
 * `~/.neo-agent/config.json`은 **동작 설정 전용**이다. 시크릿을 두지 않는다
 * (`SAFE-DEFAULTS.md` §3 — hermes 규율). 파일이 없으면 전부 기본값으로 동작한다:
 * "안 만진 상태가 가장 안전"(ARCHITECTURE §2.3)의 이행이다.
 *
 * 전 키는 시작 시 1회 읽고 동결한다(SAFE-DEFAULTS §4). 세션 중 변경의 적용 시점은
 * 다음 프로세스 시작이며, 이 모듈에는 다시 읽는 경로가 없다 — 재읽기는 곧 프로세스
 * 안에서 도는 코드가 게이트를 약화시킬 수 있는 경로다.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ApprovalMode } from "@neo-agent/gate";

/**
 * 기본 모델 (§12 "기본 모델 문자열 — 구현 시 확정"의 해소).
 *
 * 값 자체는 세부이고 **기본값이 존재한다는 것**이 계약이다(§3). 실재하는 모델 id를
 * 골랐고, 저장소가 이미 라이브 스모크에서 쓰는 것과 같은 값이다
 * (`packages/providers/test/live-smoke.test.ts`) — 개인 사용의 상시 대화에는
 * 비용·지연이 낮은 모델이 기본값으로 맞다.
 */
export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** 승인 모드 기본값 — `SAFE-DEFAULTS.md` §1이 정본 */
export const DEFAULT_APPROVAL_MODE: ApprovalMode = "manual";

/**
 * 압축 기본값 — `COMPACTION.md` §3이 정본(`CLI-INTERFACE.md` §3 표에 수치가 실려 있다).
 *
 * **자동이 기본이다**: 안 만진 기본값이 하드 한도 충돌을 만나지 않는 것이 §2.3(안전한
 * 기본값)의 이행이다. 수치는 `COMPACTION.md` 머리가 "조정 가능(세부)"으로 분류한다.
 */
export const DEFAULT_COMPACTION_AUTO = true;
export const DEFAULT_COMPACTION_THRESHOLD = 0.75;
export const DEFAULT_COMPACTION_KEEP_RECENT_TURNS = 2;

export interface CliConfig {
  readonly approvalMode: ApprovalMode;
  readonly denyRules: readonly string[];
  readonly model: string;
  /** 자동 압축 트리거 활성 여부 (`COMPACTION.md` §3) */
  readonly compactionAuto: boolean;
  /** `contextTokens > contextWindowTokens × threshold`면 자동 압축 (`COMPACTION.md` §3) */
  readonly compactionThreshold: number;
  /** 원문 유지할 최근 user 턴 수 (`COMPACTION.md` §4) */
  readonly compactionKeepRecentTurns: number;
}

/** 닫힌 키 목록. 여기 없는 키는 시작 에러다(§3) */
const KNOWN_KEYS = [
  "approvalMode",
  "denyRules",
  "model",
  "compactionAuto",
  "compactionThreshold",
  "compactionKeepRecentTurns",
] as const;

const APPROVAL_MODES: readonly ApprovalMode[] = ["manual", "off"];

export function defaultConfigPath(home?: string): string {
  return join(home ?? homedir(), ".neo-agent", "config.json");
}

/**
 * 설정을 1회 읽고 동결해서 돌려준다.
 *
 * 파일이 없으면 기본값. 그 밖의 모든 이상(파싱 실패, 미지의 키, 타입 불일치)은
 * **시작 에러**다 — 오타 난 보안 키(`approvalmode` 등)가 조용히 무시되고 기본값으로
 * 도는 것이 침묵 실패이기 때문이다(§3, ARCHITECTURE §2.6).
 *
 * 시크릿 키(`apiKey` 등)를 넣어도 미지의 키로 걸려 기동이 거부된다 — "설정 파일에
 * 시크릿을 두지 않는다"가 안내 문구가 아니라 동작으로 강제된다.
 */
export function loadConfig(configPath: string): CliConfig {
  const raw = readConfigFile(configPath);
  if (raw === undefined) return freezeConfig({});

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${configPath}를 읽을 수 없다 — JSON 파싱에 실패했다 (${(error as Error).message}). ` +
        "설정을 고치거나 파일을 지우면 기본값으로 동작한다.",
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${configPath}의 최상위는 JSON 객체여야 한다 — ${describe(parsed)}가 왔다.`);
  }

  const record = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) => !(KNOWN_KEYS as readonly string[]).includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `${configPath}에 모르는 키가 있다: ${unknownKeys.map((k) => `"${k}"`).join(", ")}. ` +
        `쓸 수 있는 키는 ${KNOWN_KEYS.join(", ")}뿐이다. ` +
        "오타 난 키를 조용히 무시하면 설정한 줄 알고 기본값으로 도는 상태가 된다.",
    );
  }

  return freezeConfig({
    approvalMode: readApprovalMode(record, configPath),
    denyRules: readDenyRules(record, configPath),
    model: readModel(record, configPath),
    compactionAuto: readBoolean(record, "compactionAuto", DEFAULT_COMPACTION_AUTO, configPath),
    compactionThreshold: readThreshold(record, configPath),
    compactionKeepRecentTurns: readKeepRecentTurns(record, configPath),
  });
}

/** 파일이 없으면 `undefined`. 그 밖의 읽기 실패는 던진다 — 부분 기동을 만들지 않는다(§2) */
function readConfigFile(configPath: string): string | undefined {
  try {
    return readFileSync(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(
      `${configPath}를 읽을 수 없다 (${(error as NodeJS.ErrnoException).code ?? "unknown"}). ` +
        "파일 권한을 확인하라.",
    );
  }
}

function readApprovalMode(record: Record<string, unknown>, configPath: string): ApprovalMode {
  const value = record.approvalMode;
  if (value === undefined) return DEFAULT_APPROVAL_MODE;
  if (typeof value !== "string" || !APPROVAL_MODES.includes(value as ApprovalMode)) {
    throw new Error(
      `${configPath}의 approvalMode는 ${APPROVAL_MODES.map((m) => `"${m}"`).join(" 또는 ")}여야 한다 — ${describe(value)}가 왔다.`,
    );
  }
  return value as ApprovalMode;
}

function readDenyRules(record: Record<string, unknown>, configPath: string): string[] {
  const value = record.denyRules;
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((rule) => typeof rule !== "string")) {
    throw new Error(
      `${configPath}의 denyRules는 문자열 배열이어야 한다 — ${describe(value)}가 왔다.`,
    );
  }
  return [...(value as string[])];
}

function readModel(record: Record<string, unknown>, configPath: string): string {
  const value = record.model;
  if (value === undefined) return DEFAULT_MODEL;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `${configPath}의 model은 비어 있지 않은 문자열이어야 한다 — ${describe(value)}가 왔다.`,
    );
  }
  return value;
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
  fallback: boolean,
  configPath: string,
): boolean {
  const value = record[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(
      `${configPath}의 ${key}는 true 또는 false여야 한다 — ${describe(value)}가 왔다.`,
    );
  }
  return value;
}

/**
 * `compactionThreshold` — 유효 구간 `0 < t <= 1`.
 *
 * [미규정 E-42] 문서(`CLI-INTERFACE.md` §3·`COMPACTION.md` §3)는 기본값 0.75만 정하고
 * 유효 구간을 정하지 않았다. **비율**이므로 구간을 닫는 것을 택했다 — 근거는 §3의
 * 미지 키 규율과 같다: `1.5`처럼 트리거가 영원히 안 걸리는 값이나 `-1`처럼 매 idle마다
 * 걸리는 값이 조용히 수리되면 "자동 압축을 켰다고 믿는데 안 도는" 침묵 실패가 된다.
 * `0`은 배제하고 `1`은 허용한다 — 1은 "창을 다 채우기 전엔 안 한다"는 일관된 의도이고,
 * 0은 항상 트리거라 `compactionAuto: false`와 달리 의도를 표현하지 못한다.
 */
function readThreshold(record: Record<string, unknown>, configPath: string): number {
  const value = record.compactionThreshold;
  if (value === undefined) return DEFAULT_COMPACTION_THRESHOLD;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(
      `${configPath}의 compactionThreshold는 0보다 크고 1 이하인 비율이어야 한다 — ${describe(value)}가 왔다.`,
    );
  }
  return value;
}

/**
 * `compactionKeepRecentTurns` — 1 이상의 정수.
 *
 * [미규정 E-43] 유효 구간 미규정은 위와 같다. `COMPACTION.md` §4의 유지 구간은
 * "뒤에서부터 K번째 user 메시지"에서 시작하므로 `0`이면 유지 구간이 비어 트랜스크립트
 * 전부가 요약으로 대체된다 — 압축이 아니라 대화 초기화이고, 그 의도는 `/new`가 이미
 * 표현한다. 소수(`1.5`)는 "K번째 user 메시지"에 대응하는 것이 없다.
 */
function readKeepRecentTurns(record: Record<string, unknown>, configPath: string): number {
  const value = record.compactionKeepRecentTurns;
  if (value === undefined) return DEFAULT_COMPACTION_KEEP_RECENT_TURNS;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(
      `${configPath}의 compactionKeepRecentTurns는 1 이상의 정수여야 한다 — ${describe(value)}가 왔다.`,
    );
  }
  return value;
}

/**
 * 반환 전 동결(§3·SAFE-DEFAULTS §4).
 *
 * `denyRules` 배열까지 동결한다 — 객체만 얼리면 `config.denyRules.push(...)`로
 * 게이트 입력이 세션 중에 바뀔 수 있고, 그것이 정확히 동결이 막으려는 것이다.
 */
function freezeConfig(partial: Partial<CliConfig>): CliConfig {
  return Object.freeze({
    approvalMode: partial.approvalMode ?? DEFAULT_APPROVAL_MODE,
    denyRules: Object.freeze([...(partial.denyRules ?? [])]),
    model: partial.model ?? DEFAULT_MODEL,
    compactionAuto: partial.compactionAuto ?? DEFAULT_COMPACTION_AUTO,
    compactionThreshold: partial.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD,
    compactionKeepRecentTurns:
      partial.compactionKeepRecentTurns ?? DEFAULT_COMPACTION_KEEP_RECENT_TURNS,
  });
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `배열(${value.length}개)`;
  return `${typeof value} ${JSON.stringify(value)}`;
}
