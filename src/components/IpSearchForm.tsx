"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AutocompleteSuggestion } from "@/lib/autocomplete";
import {
  detectSearchQueryType,
  type SearchQueryType,
} from "@/lib/ip-validation";
import {
  addRecentSearch,
  getRecentSearches,
  type RecentSearch,
} from "@/lib/search-history";

interface IpSearchFormProps {
  defaultIp?: string;
  clientIp?: string;
  onSearch: (query: string, type: SearchQueryType) => void;
  loading?: boolean;
  disabled?: boolean;
  disabledMessage?: string;
}

function recentToSuggestion(item: RecentSearch): AutocompleteSuggestion {
  return {
    id: `recent-${item.type}-${item.at}`,
    label: item.label,
    sublabel:
      item.type === "ip"
        ? "최근 검색 · IP"
        : item.type === "coords"
          ? "최근 검색 · 좌표"
          : "최근 검색 · 주소",
    value: item.value,
    type: item.type,
    group: "recent",
  };
}

export default function IpSearchForm({
  defaultIp = "",
  clientIp = "",
  onSearch,
  loading,
  disabled,
  disabledMessage,
}: IpSearchFormProps) {
  const [query, setQuery] = useState(defaultIp);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [fetching, setFetching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (defaultIp) setQuery(defaultIp);
  }, [defaultIp]);

  const runSearch = useCallback(
    (value: string, type: SearchQueryType, label?: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      addRecentSearch(trimmed, type, label ?? trimmed);
      setOpen(false);
      setSuggestions([]);
      onSearch(trimmed, type);
    },
    [onSearch],
  );

  const fetchSuggestions = useCallback(
    async (value: string) => {
      if (disabled) {
        setSuggestions([]);
        setOpen(false);
        return;
      }

      const trimmed = value.trim();

      if (trimmed.length < 2) {
        const recent = getRecentSearches().map(recentToSuggestion);
        setSuggestions(recent);
        setOpen(recent.length > 0);
        setActiveIndex(-1);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setFetching(true);
      try {
        const res = await fetch(
          `/api/autocomplete?q=${encodeURIComponent(trimmed)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const json = await res.json();
        const list = (json.suggestions ?? []) as AutocompleteSuggestion[];
        if (controller.signal.aborted) return;
        setSuggestions(list);
        setOpen(list.length > 0);
        setActiveIndex(-1);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSuggestions([]);
        setOpen(false);
      } finally {
        if (!controller.signal.aborted) setFetching(false);
      }
    },
    [disabled],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(query);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSuggestions]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pickSuggestion(item: AutocompleteSuggestion) {
    if (item.id === "ip-partial-hint" || item.id === "coords-lat-only") {
      setQuery(item.value);
      return;
    }
    setQuery(item.value);
    runSearch(item.value, item.type, item.label);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setOpen(false);
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      pickSuggestion(suggestions[activeIndex]);
      return;
    }
    runSearch(trimmed, detectSearchQueryType(trimmed));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIndex]);
    }
  }

  const locked = disabled || loading;
  const typeBadge = (type: AutocompleteSuggestion["type"]) => {
    if (type === "ip") return "IP";
    if (type === "coords") return "좌표";
    return "주소";
  };

  const showRecentHeader =
    suggestions.length > 0 && suggestions.every((s) => s.group === "recent");

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <label htmlFor="location-search" className="sr-only">
        IP · 주소 · 위도경도 검색
      </label>
      <div ref={wrapRef} className="relative flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            id="location-search"
            type="text"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="search-suggestions"
            placeholder="IP · 주소 · 위도,경도 (자동완성)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) {
                setOpen(true);
                return;
              }
              if (!disabled && query.trim().length < 2) {
                const recent = getRecentSearches().map(recentToSuggestion);
                setSuggestions(recent);
                setOpen(recent.length > 0);
              }
            }}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
            disabled={locked}
          />
          {fetching && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              …
            </span>
          )}

          {open && suggestions.length > 0 && (
            <ul
              id="search-suggestions"
              role="listbox"
              className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            >
              {showRecentHeader && (
                <li className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  최근 검색
                </li>
              )}
              {suggestions.map((item, index) => (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={index === activeIndex}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(item)}
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-blue-50 ${
                      index === activeIndex ? "bg-blue-50" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.group === "recent"
                          ? "bg-violet-100 text-violet-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.group === "recent" ? "최근" : typeBadge(item.type)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">
                        {item.label}
                      </span>
                      {item.sublabel && (
                        <span className="block truncate text-xs text-slate-500">
                          {item.sublabel}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {open &&
            !fetching &&
            query.trim().length >= 2 &&
            suggestions.length === 0 && (
              <p className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg">
                자동완성 결과가 없습니다. Enter로 직접 검색하세요.
              </p>
            )}
        </div>
        <button
          type="submit"
          disabled={locked || !query.trim()}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "조회 중..." : "주소검색"}
        </button>
      </div>
      {disabled && disabledMessage ? (
        <p className="mt-1.5 text-xs text-amber-700">{disabledMessage}</p>
      ) : (
        <p className="mt-1.5 text-xs text-slate-500">
          <strong className="text-violet-700">자동완성</strong> — 주소·IP·좌표
          · ↑↓ 선택 · 포커스 시 최근 검색
          {clientIp ? ` · 내 IP: ${clientIp}` : ""}
        </p>
      )}
    </form>
  );
}
