import { useCallback, useEffect, useState } from "react";

/** A short message that goes away by itself after a few seconds. */
export const useNotice = (durationMs = 6000) => {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), durationMs);
    return () => clearTimeout(timer);
  }, [notice, durationMs]);
  return [notice, useCallback((message: string) => setNotice(message), [])] as const;
};
