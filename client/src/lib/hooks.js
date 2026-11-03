import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads data with loading/error state and a reload(). Ignores stale responses. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useRef(0);
  const load = useCallback(() => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => id === run.current && setState({ data, error: null, loading: false }))
      .catch((error) => id === run.current && setState({ data: null, error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function useCountdown(isoTarget) {
  const [left, setLeft] = useState(() => (isoTarget ? new Date(isoTarget) - Date.now() : 0));
  useEffect(() => {
    if (!isoTarget) return undefined;
    const tick = () => setLeft(new Date(isoTarget) - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [isoTarget]);
  return Math.max(0, Math.floor(left / 1000));
}

export function useTitle(title) {
  useEffect(() => { document.title = title ? `${title} · Company A Resort` : 'Company A Resort, Chikkamagaluru'; }, [title]);
}
