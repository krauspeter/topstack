import { useEffect, useState } from 'react';
import { applyStagingDocument, cachedEnvironment, isStaging, rememberEnvironment } from './environment';

/** Auffälliges Band auf Staging, damit niemand die Testumgebung mit der echten App verwechselt. */
export function EnvBand() {
  const [env, setEnv] = useState(cachedEnvironment);

  useEffect(() => {
    let active = true;
    fetch('/api/v1/health')
      .then((r) => r.json() as Promise<{ environment?: string }>)
      .then((h) => {
        if (!active || typeof h.environment !== 'string') return;
        rememberEnvironment(h.environment);
        setEnv(h.environment);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isStaging(env)) applyStagingDocument(document);
  }, [env]);

  if (!isStaging(env)) return null;
  return (
    <div className="env-band" role="note" aria-label="Testumgebung">
      BETA · Testumgebung
    </div>
  );
}
