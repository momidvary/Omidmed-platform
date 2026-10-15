"use client";

import { useEffect, useState } from "react";

export interface Loaded<T> {
  loading: boolean;
  failed: boolean;
  data: T | null;
}

/**
 * Load one section for a request key. State is tagged with the key it was
 * loaded for, so switching patient never shows the previous patient's rows
 * and nothing is set synchronously inside the effect.
 */
export function useSection<T>(
  key: string | null,
  load: () => Promise<T | null>
): Loaded<T> {
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setState({ key, data, failed: data === null });
      })
      .catch(() => {
        if (!cancelled) setState({ key, data: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
    // The key encodes every input of load().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return { loading: false, failed: false, data: null };
  const current = state?.key === key ? state : null;
  return {
    loading: !current,
    failed: current?.failed ?? false,
    data: current?.data ?? null,
  };
}
