"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { hasKanji, matchesSearch, normalizeJa } from "@/lib/ja-normalize";

/** 漢字・ひらがな・カタカナのどれで入力しても絞り込めるようにする */
export function useSearchMatcher(query: string) {
  const q = query.trim();
  const needsReading = hasKanji(q);
  const [remote, setRemote] = useState<{ q: string; terms: string[] } | null>(null);

  useEffect(() => {
    if (!needsReading) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search/reading?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { terms: [] }))
        .then((j: { terms: string[] }) => setRemote({ q, terms: j.terms }))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, needsReading]);

  const terms = useMemo(() => {
    if (needsReading) return remote?.q === q ? remote.terms : [];
    return q
      .split(/[\s　]+/)
      .map(normalizeJa)
      .filter(Boolean);
  }, [q, needsReading, remote]);

  return useCallback((text: string, reading: string) => matchesSearch(q, text, reading, terms), [q, terms]);
}
