import { useCallback, useEffect, useState } from 'react';

/** Minimaler Router über die History-API: Pfad und Query der aktuellen Seite. */
export function useLocation(): { url: URL; navigate(path: string, replace?: boolean): void } {
  const [href, setHref] = useState(() => window.location.href);

  useEffect(() => {
    const onPop = () => setHref(window.location.href);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((path: string, replace = false) => {
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    setHref(window.location.href);
  }, []);

  return { url: new URL(href), navigate };
}
