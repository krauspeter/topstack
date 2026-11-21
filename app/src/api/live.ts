/**
 * WebSocket `/ws` für die Live-Ansicht (ADR-0006, AP-7).
 *
 * Eine Verbindung für die ganze App. Nachrichten sind Hinweise: Bei `tournament.updated`
 * und `game.events` lädt die Seite den Stand per REST nach. Nach jedem (Wieder-)Verbinden
 * abonniert der Client neu und meldet `reconnected`, damit nichts Verpasstes fehlt.
 */
import { useEffect, useRef, useState } from 'react';

export type LiveMessage =
  | { type: 'tournament.updated'; topic: string; tournament_id: string; reason: string }
  | { type: 'game.events'; topic: string; match_id: string; events: unknown[] }
  | { type: 'reconnected'; topic: string };

type Listener = (msg: LiveMessage) => void;

/** Ohne Nachricht (auch kein Ping alle 25 s) gilt die Verbindung als tot. */
const SILENCE_MS = 60_000;
const MAX_BACKOFF_MS = 10_000;

class LiveSocket {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private status = new Set<(connected: boolean) => void>();
  private backoff = 1000;
  private retry: number | null = null;
  private watchdog: number | null = null;
  private wasConnected = false;
  connected = false;

  subscribe(topic: string, fn: Listener): () => void {
    const set = this.listeners.get(topic) ?? new Set<Listener>();
    const fresh = set.size === 0;
    set.add(fn);
    this.listeners.set(topic, set);
    if (fresh) this.send({ type: 'subscribe', topic });
    this.ensure();
    return () => {
      set.delete(fn);
      if (set.size === 0) {
        this.listeners.delete(topic);
        this.send({ type: 'unsubscribe', topic });
      }
      if (this.listeners.size === 0) this.shutdown();
    };
  }

  onStatus(fn: (connected: boolean) => void): () => void {
    this.status.add(fn);
    return () => this.status.delete(fn);
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private setConnected(value: boolean) {
    if (this.connected === value) return;
    this.connected = value;
    for (const fn of this.status) fn(value);
  }

  private ensure() {
    if (this.ws || this.retry !== null || typeof WebSocket === 'undefined') return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 1000;
      this.setConnected(true);
      this.kick();
      for (const topic of this.listeners.keys()) this.send({ type: 'subscribe', topic });
      // Verpasstes nachladen, auch beim ersten Verbinden ist das harmlos
      if (this.wasConnected) for (const topic of this.listeners.keys()) this.emit({ type: 'reconnected', topic });
      this.wasConnected = true;
    };
    ws.onmessage = (ev) => {
      this.kick();
      let msg: { type?: string; topic?: string };
      try {
        msg = JSON.parse(String(ev.data)) as { type?: string; topic?: string };
      } catch {
        return;
      }
      if (msg.type === 'ping') this.send({ type: 'pong' });
      else if ((msg.type === 'tournament.updated' || msg.type === 'game.events') && msg.topic)
        this.emit(msg as LiveMessage);
    };
    ws.onclose = () => this.drop();
    ws.onerror = () => ws.close();
  }

  private emit(msg: LiveMessage) {
    for (const fn of this.listeners.get(msg.topic) ?? []) fn(msg);
  }

  private kick() {
    if (this.watchdog !== null) window.clearTimeout(this.watchdog);
    this.watchdog = window.setTimeout(() => this.ws?.close(), SILENCE_MS);
  }

  private drop() {
    if (this.watchdog !== null) window.clearTimeout(this.watchdog);
    this.watchdog = null;
    this.ws = null;
    this.setConnected(false);
    if (this.listeners.size === 0) return;
    this.retry = window.setTimeout(() => {
      this.retry = null;
      this.ensure();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }

  private shutdown() {
    if (this.retry !== null) window.clearTimeout(this.retry);
    this.retry = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    if (this.watchdog !== null) window.clearTimeout(this.watchdog);
    this.watchdog = null;
    this.wasConnected = false;
    this.setConnected(false);
  }
}

const live = new LiveSocket();

/**
 * Turnier live verfolgen. `onChange` kommt bei jeder Änderung, neuen Lebenspunkten und
 * nach dem Wiederverbinden; mehrere schnelle Hinweise werden zusammengefasst.
 * Gibt zurück, ob der WebSocket gerade verbunden ist (sonst bleibt nur das Nachladen).
 */
export function useLive(tournamentId: string | null, onChange: (msg: LiveMessage) => void, debounceMs = 150): boolean {
  const [connected, setConnected] = useState(live.connected);
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => live.onStatus(setConnected), []);

  useEffect(() => {
    if (!tournamentId) return;
    let timer: number | null = null;
    let last: LiveMessage | null = null;
    const off = live.subscribe(`tournament:${tournamentId}`, (msg) => {
      last = msg;
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (last) handler.current(last);
      }, debounceMs);
    });
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      off();
    };
  }, [tournamentId, debounceMs]);

  return connected;
}
