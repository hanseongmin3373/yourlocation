import type { SearchQueryType } from "./ip-validation";

const STORAGE_KEY = "yourlocation_recent_searches";
const MAX_ITEMS = 8;

export type RecentSearch = {
  value: string;
  type: SearchQueryType;
  label: string;
  at: number;
};

export function getRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSearch[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.value === "string" &&
          typeof item.type === "string",
      )
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function addRecentSearch(
  value: string,
  type: SearchQueryType,
  label?: string,
): void {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  if (!trimmed) return;

  const entry: RecentSearch = {
    value: trimmed,
    type,
    label: label?.trim() || trimmed,
    at: Date.now(),
  };

  const prev = getRecentSearches().filter(
    (item) => !(item.type === type && item.value === trimmed),
  );
  const next = [entry, ...prev].slice(0, MAX_ITEMS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearRecentSearches(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
