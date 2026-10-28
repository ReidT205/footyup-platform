import { useCallback, useEffect, useState } from "react";
import { SessionExpired } from "./api";

export function useLoad<T>(load: () => Promise<T>, onExpired: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (err) {
      if (err instanceof SessionExpired) onExpired();
      else setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [load, onExpired]);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, error, loading, reload: run };
}
