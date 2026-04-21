import { useEffect, useRef } from 'react';
import { BASE_PATH } from '../basePath';

const BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION ?? 'dev';
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_MS = 10_000;

export function VersionChecker() {
  const lastCheck = useRef(0);

  useEffect(() => {
    async function check() {
      const now = Date.now();
      if (now - lastCheck.current < DEBOUNCE_MS) return;
      lastCheck.current = now;
      try {
        const res = await fetch(`${BASE_PATH}/api/version`, { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = await res.json();
        if (version && version !== BUILD_VERSION) {
          window.location.reload();
        }
      } catch { /* non-critical */ }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') check();
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);

  return null;
}
