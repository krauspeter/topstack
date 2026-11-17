import { type PointerEvent, type MouseEvent, useEffect, useRef, useState } from 'react';

/**
 * Hält den Bildschirm an, solange `active` gilt (N-02). Wird nach dem Zurückkehren
 * in die App neu angefordert, weil der Browser die Sperre beim Verlassen freigibt.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;

    const request = async () => {
      try {
        if (document.visibilityState !== 'visible' || stopped) return;
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // z. B. Energiesparmodus: dann bleibt es beim normalen Verhalten
      }
    };
    const onVisible = () => void request();

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}

/** Aktuelle Zeit, die sich alle `intervalMs` aktualisiert (für Timer und das Ausblenden der letzten Änderung). */
export function useNow(intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Tippen und langes Drücken auf derselben Fläche: Tippen ruft `onTap`, Halten nach `delayMs`
 * ruft `onHold` und wiederholt es alle `repeatMs`, solange der Finger liegt.
 */
export function useHold(onTap: () => void, onHold: () => void, delayMs = 450, repeatMs = 650) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const handlers = useRef({ onTap, onHold });
  handlers.current = { onTap, onHold };

  const clear = () => {
    window.clearTimeout(timer.current);
    window.clearInterval(timer.current);
    timer.current = undefined;
  };

  useEffect(() => clear, []);

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      held.current = false;
      clear();
      timer.current = window.setTimeout(() => {
        held.current = true;
        handlers.current.onHold();
        timer.current = window.setInterval(() => handlers.current.onHold(), repeatMs);
      }, delayMs);
    },
    onPointerUp: () => {
      const wasPending = timer.current !== undefined;
      clear();
      if (wasPending && !held.current) handlers.current.onTap();
    },
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
    // Tastatur (Enter/Leertaste) erzeugt einen Klick ohne Zeigerereignis
    onClick: (e: MouseEvent) => {
      if (e.detail === 0) handlers.current.onTap();
    },
  };
}

/** Kurze Vibration als Rückmeldung (Android; iOS-Safari unterstützt das nicht). */
export function buzz(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // nicht unterstützt
  }
}
