import { DEFAULT_SETTINGS } from "./defaults";
import type { AppSettings, QueryRecord } from "./types";

const SETTINGS_KEY = "zy-trans:settings";
const HISTORY_KEY = "zy-trans:history";
const CACHE_KEY = "zy-trans:cache";

type CacheIndex = Record<string, QueryRecord>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadSettings(): AppSettings {
  return readJson<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function saveSettings(settings: AppSettings) {
  writeJson(SETTINGS_KEY, settings);
}

export function loadHistory(): QueryRecord[] {
  return readJson<QueryRecord[]>(HISTORY_KEY, []);
}

export function saveHistory(history: QueryRecord[]) {
  writeJson(HISTORY_KEY, history.slice(0, 100));
}

export function loadCache(): CacheIndex {
  return readJson<CacheIndex>(CACHE_KEY, {});
}

export function saveCache(cache: CacheIndex) {
  writeJson(CACHE_KEY, cache);
}

export function buildCacheKey(parts: {
  normalizedText: string;
  mode: string;
  promptVersion: string;
  providerId: string;
  model: string;
}) {
  return [
    parts.providerId,
    parts.model,
    parts.mode,
    parts.promptVersion,
    parts.normalizedText
  ].join("::");
}
