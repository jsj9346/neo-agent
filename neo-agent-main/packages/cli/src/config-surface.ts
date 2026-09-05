/**
 * 설정 쓰기 표면 — `docs/CLI-INTERFACE.md` §3.2.
 *
 * §3이 정한 것은 파일에서 **무엇을 읽는가**이고, 이 모듈이 지는 것은 그 값을 사용자가
 * **어떻게 보고 바꾸는가**의 재료다: 여덟 키의 표시 메타데이터(계약 8), 사용자가 친 한
 * 토큰을 그 키의 값으로 만드는 파서(계약 5), 그리고 원자적 설정 쓰기(계약 1·2·4).
 * 배선과 문면은 여기 없다 — 이 모듈은 **화면을 모른다**.
 *
 * **왜 `config.ts`가 아니라 별도 모듈인가.** 저 파일이 지는 것은 *"시작 시 1회 읽고
 * 동결한다"*이고 여기가 지는 것은 그 반대 방향(사용자 → 파일)이다. 한 파일에 두면
 * 동결 계약을 읽는 사람이 쓰기 경로를 함께 읽게 되고, 계약 2가 금하는 것이 정확히 그
 * 두 경로의 접촉이다.
 *
 * **동결된 설정 객체는 이 모듈에 들어오지 않는다** (계약 2). 어떤 함수도 `CliConfig`
 * **값**을 인자로 받지 않고 — `CliConfig`는 키 집합을 얻는 **타입**으로만 쓴다 — 쓰기는
 * 파일을 다시 읽어 시작한다. 쓰기가 이 프로세스의 동작을 바꾸는 경로는 없다.
 *
 * **검증은 여기에 없다** (계약 4). 미지 키·타입·구간(E-42·E-43)·고정 태그 판정은 전부
 * `validateConfigRecord` 하나가 지고, 이 모듈은 「현재 파일 레코드 + 바꿀 키 하나」를
 * 만들어 그 검증기에 통과시킨 뒤에만 쓴다. 아래 토큰 파서가 하는 일은 **타입 변환**뿐이다
 * — `"true"`를 불리언으로, `"0.75"`를 수치로. 값이 유효한 범위인가는 파서가 묻지 않는다.
 * 그래서 닫힌 유니온(`approvalMode`·`sandbox`)에는 전용 파서가 없다: JSON에서도 문자열이라
 * 변환할 것이 없고, 목록 밖의 토큰을 여기서 한 번 더 거르면 같은 판정이 두 곳에 서서
 * 문면이 갈린다. 이것이 계약 4가 막으려는 형태다.
 *
 * 토큰 파싱 규칙 자체가 구현 세부라는 것은 2026-09-05 유저 결정이고(플랜 D-1(a)),
 * `docs/CLI-INTERFACE.md` §12가 그 사실을 든다.
 */

import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { type CliConfig, readConfigRecord, validateConfigRecord } from "./config.ts";

/** 파일 모드 `0600` · 디렉터리 `0700` — 같은 트리의 기존 규율 그대로(§3.2 「원자적 쓰기」). */
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;

/**
 * 한 토큰이 될 수 있는 값의 전부.
 *
 * 배열이 없는 것이 계약 5의 타입 측 실체다 — 한 토큰은 스칼라만 만들 수 있고, 그래서
 * `denyRules`(`string[]`)는 이 표면으로 쓸 수 없다.
 */
export type ConfigScalar = string | number | boolean;

/**
 * 토큰 → 값 변환의 결과. **읽을 수 없는 토큰은 값이 아니라 사용법 에러다**(§5 — 닫힌
 * 목록 밖 argv와 같은 근거). `expected`는 무엇을 기대했는지를 사람 언어로 든다 — 계약 7의
 * 「다음 행동」을 짓는 재료이고, 문면 자체는 세부다(문서 머리의 「조정 가능」).
 */
export type ConfigTokenResult =
  | { readonly ok: true; readonly value: ConfigScalar }
  | { readonly ok: false; readonly expected: string };

/** 조회에는 나오지만 이 명령으로는 못 쓰는 키 — 오늘은 `denyRules` 하나다(계약 5). */
export interface ReadOnlyConfigKeyMeta {
  /** 사람 언어 라벨 — `approvalMode`를 그대로 내는 것은 안내가 아니다(계약 8) */
  readonly label: string;
  readonly writable: false;
  /** 왜 이 명령으로 못 바꾸는가. 거부 고지가 손편집 경로와 함께 내는 것이다(계약 7) */
  readonly readOnlyReason: string;
}

/** `set <키> <값>` 하나로 닫히는 키 — 오늘은 일곱이다(계약 5). */
export interface WritableConfigKeyMeta {
  readonly label: string;
  readonly writable: true;
  /**
   * 어떤 값을 쓸 수 있는가의 **안내 문면**. 판정이 아니다 — 판정은 검증기 하나가 지고
   * (계약 4) 이 문자열은 거부 고지의 「다음 행동」에 실린다.
   */
  readonly valueHint: string;
  /** 토큰을 이 키의 타입으로 만든다. 유효 범위는 묻지 않는다 — 위 모듈 주석 참조 */
  readonly parseToken: (token: string) => ConfigTokenResult;
}

export type ConfigKeyMeta = ReadOnlyConfigKeyMeta | WritableConfigKeyMeta;

// ---------------------------------------------------------------------------
// 토큰 파서 — 타입 변환만 한다
// ---------------------------------------------------------------------------

/** 문자열 키(`model`·`sandboxImage`·닫힌 유니온 둘)는 토큰이 곧 값이다. */
function parseTextToken(token: string): ConfigTokenResult {
  return { ok: true, value: token };
}

/** JSON 불리언은 문자열이 아니므로 변환이 필요하다. 그 밖의 토큰은 읽을 수 없다. */
function parseBooleanToken(token: string): ConfigTokenResult {
  if (token === "true") return { ok: true, value: true };
  if (token === "false") return { ok: true, value: false };
  return { ok: false, expected: "true 또는 false" };
}

/**
 * 10진 수치 표기만 받는다.
 *
 * `Number()`에 직접 넘기지 않는 이유는 그 함수가 빈 문자열을 `0`으로, `"0x10"`을 `16`으로
 * 읽기 때문이다 — 사용자가 치지 않은 값이 조용히 만들어지는 형태다(ARCHITECTURE §2.6).
 * `Infinity`·`NaN`도 이 문법 밖이라 여기서 걸린다.
 *
 * **[미규정]** 부호·지수 표기(`+3`·`1e-1`)의 허용 여부를 §3.2가 정하지 않는다. 받는 쪽을
 * 택했다 — 둘 다 유한한 10진 수치의 정당한 표기이고, 값이 구간 안인지는 검증기가 다시
 * 잰다(E-42·E-43). 거부하면 정확히 같은 수를 다르게 적은 사용자만 막는다.
 */
const DECIMAL_TOKEN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseNumberToken(token: string): ConfigTokenResult {
  if (!DECIMAL_TOKEN.test(token)) return { ok: false, expected: "10진 수치" };
  const value = Number(token);
  if (!Number.isFinite(value)) return { ok: false, expected: "10진 수치" };
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// 키 메타데이터 — 완전 레코드 (계약 8)
// ---------------------------------------------------------------------------

/**
 * 여덟 키의 표시 메타데이터. **`Record<keyof CliConfig, …>`이므로 키가 늘면 컴파일이
 * 깨진다** — 계약 8이 요구하는 것이 그것 하나다. 손으로 유지되는 표였다면 §3 표·
 * `KNOWN_KEYS`·화면 셋이 갈렸을 자리다.
 *
 * 어노테이션이 아니라 `satisfies`인 이유는 **쓰기 가능 집합을 여기서 한 번만 적기**
 * 위해서다 — 아래 `WritableConfigKey`가 이 리터럴에서 파생되므로 `writable` 플래그가
 * 계약 5의 「일곱」을 데이터로도 타입으로도 동시에 든다. 어노테이션을 쓰면 리터럴 타입이
 * 지워져 그 파생이 성립하지 않고, 쓰기 가능 목록을 두 번째로 적게 된다.
 *
 * 선언 순서가 곧 표시 순서이고 §3 표의 순서와 같다.
 */
export const CONFIG_KEY_META = {
  approvalMode: {
    label: "승인 모드",
    writable: true,
    valueHint: "manual 또는 off",
    parseToken: parseTextToken,
  },
  denyRules: {
    label: "거부 규칙",
    writable: false,
    readOnlyReason:
      "값이 문자열 배열이라 한 토큰으로 닫히지 않는다. 규칙을 늘리거나 지우려면 설정 파일을 직접 고친다",
  },
  model: {
    label: "모델",
    writable: true,
    valueHint: "모델 id 한 토큰",
    parseToken: parseTextToken,
  },
  compactionAuto: {
    label: "자동 압축",
    writable: true,
    valueHint: "true 또는 false",
    parseToken: parseBooleanToken,
  },
  compactionThreshold: {
    label: "압축 임계 비율",
    writable: true,
    valueHint: "0보다 크고 1 이하인 비율",
    parseToken: parseNumberToken,
  },
  compactionKeepRecentTurns: {
    label: "원문 유지 턴 수",
    writable: true,
    valueHint: "1 이상의 정수",
    parseToken: parseNumberToken,
  },
  sandbox: {
    label: "셸 격리",
    writable: true,
    valueHint: "on 또는 off",
    parseToken: parseTextToken,
  },
  sandboxImage: {
    label: "컨테이너 이미지",
    writable: true,
    valueHint: "고정 태그를 가진 이미지 이름",
    parseToken: parseTextToken,
  },
} satisfies Record<keyof CliConfig, ConfigKeyMeta>;

/**
 * 쓰기 가능한 키 — 계약 5의 「일곱」. **위 레코드에서 파생되므로 목록을 따로 적지 않는다.**
 * 어떤 키를 `writable: false`로 돌리면 이 타입에서 즉시 빠지고, 그 키를 쓰던 자리는
 * 컴파일이 깨진다.
 */
export type WritableConfigKey = {
  [K in keyof typeof CONFIG_KEY_META]: (typeof CONFIG_KEY_META)[K]["writable"] extends true
    ? K
    : never;
}[keyof typeof CONFIG_KEY_META];

/**
 * 여덟 키를 표시 순서로. 메타데이터 레코드가 완전하므로(계약 8) 이 목록도 완전하다 —
 * 별도 배열로 적으면 그것이 갈릴 수 있는 아홉 번째 자리가 된다.
 */
export const CONFIG_KEYS: readonly (keyof CliConfig)[] = Object.keys(
  CONFIG_KEY_META,
) as (keyof CliConfig)[];

/** 그중 쓰기 가능한 일곱. 순서는 위와 같다. */
export const WRITABLE_CONFIG_KEYS: readonly WritableConfigKey[] = CONFIG_KEYS.filter(
  (key): key is WritableConfigKey => CONFIG_KEY_META[key].writable,
);

/**
 * `/config set <키> …`의 첫 토큰 판정 결과.
 *
 * 닫힌 유니온이라 호출부가 갈래를 빠뜨릴 수 없다 — 모르는 키와 조회 전용 키는 **서로 다른
 * 거부**이고(§5 — 둘 다 사용법 에러이나 「다음 행동」이 다르다), 조용히 한쪽으로 뭉개면
 * `denyRules`를 친 사용자가 오타를 냈다고 읽는다.
 */
export type ConfigKeyLookup =
  | { readonly kind: "unknown"; readonly key: string }
  | {
      readonly kind: "read-only";
      readonly key: keyof CliConfig;
      readonly meta: ReadOnlyConfigKeyMeta;
    }
  | {
      readonly kind: "writable";
      readonly key: WritableConfigKey;
      readonly meta: WritableConfigKeyMeta;
    };

function isConfigKey(key: string): key is keyof CliConfig {
  return (CONFIG_KEYS as readonly string[]).includes(key);
}

export function lookupConfigKey(key: string): ConfigKeyLookup {
  if (!isConfigKey(key)) return { kind: "unknown", key };
  const meta = CONFIG_KEY_META[key];
  if (!meta.writable) return { kind: "read-only", key, meta };
  // `meta.writable`이 참인 키의 집합이 곧 `WritableConfigKey`의 정의다(위 파생 타입).
  // 그 동치를 타입 시스템이 좁혀 주지 못하는 자리는 여기 하나뿐이다.
  return { kind: "writable", key: key as WritableConfigKey, meta };
}

// ---------------------------------------------------------------------------
// 원자적 쓰기 (계약 1·2·4 + 「원자적 쓰기」 문단)
// ---------------------------------------------------------------------------

/**
 * 쓰기가 거부되는 갈래. 셋을 가르는 것은 **「다음 행동」이 서로 다르기 때문**이다(계약 7):
 * 파일이 깨졌으면 사용자가 파일을 고쳐야 하고, 값이 나쁘면 값을 다시 치면 되고, 쓰기가
 * 실패했으면 고칠 것은 파일시스템이다.
 */
export type ConfigWriteRefusalReason =
  | "current-file-invalid"
  | "new-value-invalid"
  | "write-failed";

export interface ConfigWriteApplied {
  readonly outcome: "applied";
  readonly configPath: string;
  readonly key: WritableConfigKey;
  /** 기본값이 채워진 이전 값 — 고지의 「무엇이 무엇으로 바뀌었는가」 앞쪽이다(계약 6) */
  readonly previous: ConfigScalar;
  readonly next: ConfigScalar;
  /** 그 키가 파일에 있었는가. 없었으면 이전 값은 기본값이었다는 뜻이다 */
  readonly keyWasInFile: boolean;
  /** 이번 쓰기가 파일을 새로 만들었는가 — 파일 부재는 §3이 유효한 상태로 둔다 */
  readonly createdFile: boolean;
}

export interface ConfigWriteRefused {
  readonly outcome: "refused";
  readonly configPath: string;
  readonly reason: ConfigWriteRefusalReason;
  /** 검증기나 파일시스템이 낸 문면 그대로. 시작 시 검증과 같은 문장이 여기 선다(계약 4) */
  readonly detail: string;
}

export type ConfigWriteResult = ConfigWriteApplied | ConfigWriteRefused;

/**
 * 키 하나를 설정 파일에 쓴다. **파일만 만진다** — 이 프로세스의 동결 설정에 닿는 경로는
 * 이 함수에 없고, 적용 시점은 다음 시작이다(계약 1·2).
 *
 * 순서가 계약이다:
 *   ① 파일을 **다시 읽는다** — 세션이 뜬 뒤 사용자가 손으로 고쳤을 수 있다
 *   ② 지금 레코드가 유효한지 검증기로 판정한다. 유효하지 않으면 **거부**(fail-closed)
 *   ③ 파일이 없으면 빈 레코드로 시작한다 — 그 상태의 `set`은 파일을 새로 만든다
 *   ④ 「현재 파일 레코드 + 바꿀 키 하나」를 **같은 검증기**에 통과시킨다
 *   ⑤ 통과한 뒤에만 쓴다
 *
 * ②가 fail-closed인 근거는 §3.2가 든다 — 깨진 파일에서 한 키만 고쳐 다시 쓰면 사용자가
 * 안 고친 다른 위반을 조용히 덮어쓰게 되고, 어느 쪽이 의도였는지 알 방법이 없다.
 *
 * **직렬화하는 것은 검증 결과가 아니라 레코드다.** 검증기가 돌려주는 `CliConfig`는 기본값이
 * 채워진 여덟 키라, 그것을 쓰면 `set` 한 번에 오늘의 기본값 전부가 사용자 파일에 동결된다.
 */
export function writeConfigValue(
  configPath: string,
  key: WritableConfigKey,
  value: ConfigScalar,
): ConfigWriteResult {
  let record: Record<string, unknown> | undefined;
  try {
    record = readConfigRecord(configPath);
  } catch (error) {
    // 읽을 수 없는 것과 JSON이 깨진 것은 여기서 같은 갈래다 — 둘 다 「지금 무엇이 설정돼
    // 있는가」를 세울 수 없다는 뜻이고, 사용자가 할 일도 같다(파일을 연다).
    return refuse(configPath, "current-file-invalid", messageOf(error));
  }

  const current = record ?? {};
  let currentValid: CliConfig;
  try {
    currentValid = validateConfigRecord(current, configPath);
  } catch (error) {
    return refuse(configPath, "current-file-invalid", messageOf(error));
  }

  // 스프레드 뒤의 계산된 키는 이미 있던 자리를 그대로 덮으므로 기존 키 순서가 보존되고,
  // 새 키만 끝에 붙는다(§3.2 「원자적 쓰기」).
  const next = { ...current, [key]: value };
  let validated: CliConfig;
  try {
    validated = validateConfigRecord(next, configPath);
  } catch (error) {
    return refuse(configPath, "new-value-invalid", messageOf(error));
  }

  try {
    writeRecordAtomically(configPath, next);
  } catch (error) {
    return refuse(configPath, "write-failed", messageOf(error));
  }

  return {
    outcome: "applied",
    configPath,
    key,
    previous: currentValid[key],
    next: validated[key],
    keyWasInFile: Object.hasOwn(current, key),
    createdFile: record === undefined,
  };
}

/**
 * 임시 파일 + rename. **임시 파일은 대상 디렉터리 안**이다 — 다른 파일시스템에 만들면
 * rename이 원자적이지 않다. 형태는 `packages/memory/src/store.ts`의 원자적 쓰기와 같고,
 * 이름의 난수는 전역 `crypto`가 낸다(§1의 허용 내장 다섯에 `node:crypto`가 없다).
 *
 * 쓰다 죽어서 읽을 수 없는 설정 파일이 남으면 다음 시작이 거부되고, 그것이 이 명령이 만들
 * 수 있는 가장 나쁜 결과다. 실패 시 임시 파일 정리는 최선 노력이며 **원본은 그대로다.**
 */
function writeRecordAtomically(configPath: string, record: Record<string, unknown>): void {
  const directory = dirname(configPath);
  const temporary = join(directory, `.${basename(configPath)}.tmp-${crypto.randomUUID()}`);
  const text = `${JSON.stringify(record, null, 2)}\n`;

  try {
    mkdirSync(directory, { recursive: true, mode: DIRECTORY_MODE });
  } catch (error) {
    throw new Error(
      `${directory}를 만들 수 없다 (${errorCode(error)}). 설정은 저장되지 않았고 기존 파일은 그대로다.`,
    );
  }

  try {
    writeFileSync(temporary, text, { encoding: "utf8", mode: FILE_MODE });
  } catch (error) {
    throw new Error(
      `${configPath}에 쓸 수 없다 (${errorCode(error)}). 설정은 저장되지 않았고 기존 파일은 그대로다.`,
    );
  }

  try {
    renameSync(temporary, configPath);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // 임시 파일 정리는 최선 노력이다. 실패해도 원본은 그대로이므로 계약은 지켜진다.
    }
    throw new Error(
      `${configPath}를 교체할 수 없다 (${errorCode(error)}). 설정은 저장되지 않았고 기존 파일은 그대로다.`,
    );
  }
}

function refuse(
  configPath: string,
  reason: ConfigWriteRefusalReason,
  detail: string,
): ConfigWriteRefused {
  return { outcome: "refused", configPath, reason, detail };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException | undefined)?.code ?? "unknown";
}
