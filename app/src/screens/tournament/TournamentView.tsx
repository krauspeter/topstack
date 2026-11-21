import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, errorText } from '../../api/client';
import { useLive } from '../../api/live';
import type { Entry, GroupPlayer, GuestLink, Me, Tournament } from '../../api/types';
import type { GameEvent } from '../../domain/lifeEvents';
import type { MatchConfig } from '../../domain/match';
import { COLORLESS, type ColorChoice, MANA, choiceName, describeColors, toggleColor } from '../../domain/colors';
import { BOOSTERS_PER_PLAYER, drawSeats, neighbour } from '../../domain/seating';
import { buzz } from '../../hooks';
import { choiceSurface } from '../../theme';
import { DraftTable } from '../DraftTable';
import { ManaPips } from '../ManaPips';
import { QrCode } from '../QrCode';
import { TournamentPlay } from './TournamentPlay';

/** Ohne WebSocket alle 5 s nachladen, mit WebSocket nur zur Sicherheit alle 30 s. */
const POLL_MS = 5000;
const POLL_LIVE_MS = 30_000;
const SHUFFLE_MS = 1600;
const CHOICES: readonly ColorChoice[] = [...MANA, COLORLESS];

const STATUS_TEXT: Record<Tournament['status'], string> = {
  setup: 'Anmeldung offen',
  seated: 'Plätze ausgelost',
  drafting: 'Draft läuft',
  running: 'Turnier läuft',
  paused: 'Pausiert',
  finished: 'Beendet',
  cancelled: 'Abgebrochen',
};

const ENTRY_TEXT: Record<Entry['status'], string> = {
  invited: 'eingeladen',
  accepted: 'dabei',
  declined: 'abgesagt',
  removed: 'entfernt',
};

const KIND_TEXT: Partial<Record<Entry['kind'], string>> = { guest: 'Gast', reserved: 'ohne Konto' };

/** Gleicher Zufall auf allen Handys: einfacher Generator aus dem Seed des Servers (mulberry32). */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Props {
  id: string;
  me: Me;
  onBack(): void;
  onDeleted(): void;
  /** Life-Tracker für ein Turnier-Match öffnen (AP-6). */
  onPlay(config: MatchConfig, events: GameEvent[]): boolean;
}

/** Ein Turnier vorbereiten und spielen (UC-03 bis UC-17); der Ablauf ab Runde 1 steckt in TournamentPlay. */
export function TournamentView({ id, me, onBack, onDeleted, onPlay }: Props) {
  const [t, setT] = useState<Tournament | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guestLink, setGuestLink] = useState<GuestLink | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | 'request_cancel' | null>(null);
  /** Warnung vor dem Rundenstart (fehlende Farben, offene Matches), mit „trotzdem“. */
  const [warning, setWarning] = useState<string | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (busyRef.current) return; // keine alten Daten über eine laufende Änderung legen
    try {
      setT(await api<Tournament>(`/tournaments/${id}`));
    } catch (err) {
      setError(errorText(err));
    }
  }, [id]);

  const connected = useLive(id, () => void load());

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), connected ? POLL_LIVE_MS : POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, connected]);

  /** Eine Änderung zur Zeit; Knöpfe bleiben sichtbar gleich, damit nichts flackert. */
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const act = (path: string, method: 'POST' | 'PUT' | 'DELETE' = 'POST', body?: unknown) =>
    run(async () => setT(await api<Tournament>(`/tournaments/${id}${path}`, { method, body })));

  /** Runde starten; Warnungen des Servers fragen nach, mit Bestätigung geht es trotzdem. */
  const startRound = () =>
    run(async () => {
      try {
        setT(await api<Tournament>(`/tournaments/${id}/rounds/next`, { method: 'POST', body: { confirm: false } }));
      } catch (err) {
        const code = err instanceof ApiError ? err.extra.code : undefined;
        if (code === 'missing_colors' || code === 'open_matches') {
          setWarning((err as ApiError).message);
          return;
        }
        throw err;
      }
    });

  if (!t) {
    return <main className="page center muted">{error ?? 'Lade Turnier …'}</main>;
  }

  const can = (a: Tournament['actions'][number]) => t.actions.includes(a);
  const isAdmin = me.groups.some((g) => g.id === t.group_id && g.role === 'admin');
  const isStarter = t.my_player_id !== null && t.started_by === t.my_player_id;
  const mine = t.entries.find((e) => e.is_me);
  const accepted = t.entries.filter((e) => e.status === 'accepted');
  const seated = [...accepted].filter((e) => e.seat_no !== null).sort((a, b) => (a.seat_no ?? 0) - (b.seat_no ?? 0));
  const missingColors = seated.filter((e) => e.colors === null).length;

  const makeGuestLink = () =>
    run(async () => setGuestLink(await api<GuestLink>(`/tournaments/${id}/guest-link`, { method: 'POST' })));

  const canEditColors = (e: Entry) =>
    t.status !== 'setup' &&
    (e.is_me ? can('report_colors') : (isStarter || isAdmin) && (e.kind === 'guest' || e.kind === 'reserved'));

  /** Farben sofort anzeigen, dann speichern; bei einem Fehler den alten Stand zurückholen. */
  const setColors = (e: Entry, c: ColorChoice) => {
    const current = e.colors;
    const next = current === null ? (c === COLORLESS ? '' : c) : toggleColor(current, c);
    const before = t;
    setT({ ...t, entries: t.entries.map((x) => (x.player_id === e.player_id ? { ...x, colors: next } : x)) });
    void run(async () => {
      try {
        setT(await api<Tournament>(`/tournaments/${id}/entries/${e.player_id}/colors`, { method: 'PUT', body: { colors: next } }));
      } catch (err) {
        setT(before);
        throw err;
      }
    });
  };

  return (
    <main className="page">
      <header className="title-bar">
        <button className="btn ghost" onClick={onBack} aria-label="Zurück">
          ‹ Zurück
        </button>
        <div className="title">
          <h2>{t.set_code}</h2>
          <span className="badge">{STATUS_TEXT[t.status]}</span>
        </div>
      </header>

      {t.status === 'cancelled' && <p className="muted">Dieses Turnier wurde abgebrochen und zählt nicht.</p>}

      {mine?.status === 'invited' && t.status === 'setup' && (
        <section className="card">
          <h2>Du bist eingeladen</h2>
          <div className="row">
            <button className="btn primary big" onClick={() => act('/entries/me', 'PUT', { accept: true })}>
              Zusagen
            </button>
            <button className="btn big" onClick={() => act('/entries/me', 'PUT', { accept: false })}>
              Absagen
            </button>
          </div>
        </section>
      )}

      {t.status === 'setup' && (
        <section className="stack">
          <h3>Teilnehmer ({accepted.length} dabei)</h3>
          <ul className="entry-list" aria-label="Teilnehmer">
            {t.entries.map((e) => (
              <li key={e.player_id}>
                <span className="entry-name">
                  <strong>{e.display_name}</strong>
                  {KIND_TEXT[e.kind] && <span className="muted small"> · {KIND_TEXT[e.kind]}</span>}
                </span>
                <span className="muted small">{ENTRY_TEXT[e.status]}</span>
                {can('invite') && e.player_id !== t.started_by && (
                  <button
                    className="btn ghost icon"
                    aria-label={`${e.display_name} entfernen`}
                    onClick={() => act(`/entries/${e.player_id}`, 'DELETE')}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>

          {can('invite') &&
            (adding ? (
              <AddPlayers
                tournament={t}
                isAdmin={isAdmin}
                onInvite={async (ids) => {
                  await act('/entries', 'POST', { player_ids: ids });
                  setAdding(false);
                }}
                onClose={() => setAdding(false)}
              />
            ) : (
              <button className="btn big" onClick={() => setAdding(true)}>
                Spieler hinzufügen
              </button>
            ))}

          {can('invite') &&
            (guestLink ? (
              <section className="card">
                <h2>Gäste scannen diesen Code</h2>
                <QrCode text={guestLink.url} label="QR-Code für Gäste" />
                <p className="muted small break">{guestLink.url}</p>
                <p className="muted small">Gültig 12 Stunden, bis zur Auslosung.</p>
                <button className="btn" onClick={() => setGuestLink(null)}>
                  QR-Code ausblenden
                </button>
              </section>
            ) : (
              <button className="btn big" onClick={() => void makeGuestLink()}>
                Gäste-QR-Code zeigen
              </button>
            ))}

          {can('seat') && (
            <button className="btn primary big" onClick={() => act('/seating')} disabled={accepted.length < 2}>
              Plätze auslosen
            </button>
          )}
        </section>
      )}

      {(t.status === 'seated' || t.status === 'drafting') && t.seating && seated.length > 0 && (
        <SeatingView tournament={t} seated={seated} />
      )}

      {(t.status === 'seated' || t.status === 'drafting') && (
        <section className="stack">
          {can('seat') && (
            <button className="btn big" onClick={() => act('/seating')}>
              Neu auslosen
            </button>
          )}
          {can('start_draft') && (
            <button className="btn primary big" onClick={() => act('/draft')}>
              Draft beginnen
            </button>
          )}
          {can('start_round') && (
            <button className="btn primary big" onClick={() => void startRound()}>
              Runde 1 starten
            </button>
          )}
        </section>
      )}

      {t.rounds.length > 0 && (
        <TournamentPlay
          t={t}
          busy={busy}
          helper={isStarter || isAdmin}
          can={can}
          onNextRound={() => void startRound()}
          onAct={act}
          onPlay={onPlay}
        />
      )}

      {t.status === 'seated' && (
        <p className="muted small">Die Farben trägt jeder nach dem Draft beim Deckbau ein.</p>
      )}

      {(t.status === 'drafting' || t.status === 'running') && (
        <section className="stack">
          <h3>{t.status === 'running' ? 'Farben' : 'Farben nach dem Deckbau'}</h3>
          <p className="muted small" data-testid="colors-missing">
            {missingColors === 0
              ? 'Alle Farben gemeldet.'
              : `Noch ${missingColors} von ${seated.length} offen. Fehlen beim Start von Runde 1 noch Farben, fragt die App nach; nachtragen geht auch später.`}
          </p>
          <ul className="color-list" aria-label="Farben">
            {seated.map((e) => (
              <li key={e.player_id}>
                <div className="color-head">
                  <strong className="entry-name">{e.display_name}</strong>
                  <span className="color-pips">{e.colors !== null && <ManaPips colors={e.colors} />}</span>
                </div>
                {canEditColors(e) && (
                  <div className="color-grid" role="group" aria-label={`Farben für ${e.display_name}`}>
                    {CHOICES.map((c) => {
                      const surface = choiceSurface(c);
                      const current = e.colors;
                      const on = current !== null && (c === COLORLESS ? current === '' : current.includes(c));
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={on}
                          aria-label={choiceName(c)}
                          title={choiceName(c)}
                          className={on ? 'on' : ''}
                          style={{ background: surface.value, color: surface.tokens?.['--text'] ?? 'var(--text)' }}
                          onClick={() => setColors(e, c)}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                )}
                <span className="muted small color-text">{e.colors !== null ? describeColors(e.colors) : 'noch offen'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}

      {can('cancel') && (
        <button className="btn danger" onClick={() => setConfirm('cancel')}>
          Turnier abbrechen
        </button>
      )}
      {can('request_cancel') && !can('cancel') && !t.cancel_vote && (
        <button className="btn danger" onClick={() => setConfirm('request_cancel')}>
          Abbruch beantragen
        </button>
      )}

      {warning && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Warnung">
          <div className="sheet">
            <p>{warning}</p>
            <button
              className="btn primary big"
              disabled={busy}
              onClick={async () => {
                setWarning(null);
                await act('/rounds/next', 'POST', { confirm: true });
              }}
            >
              Trotzdem starten
            </button>
            <button className="btn big" onClick={() => setWarning(null)}>
              Zurück
            </button>
          </div>
        </div>
      )}
      {can('delete') && (
        <button className="btn danger" onClick={() => setConfirm('delete')}>
          Turnier löschen
        </button>
      )}

      {confirm && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={confirm === 'delete' ? 'Turnier löschen' : 'Turnier abbrechen'}>
          <div className="sheet">
            <p>
              {confirm === 'cancel'
                ? 'Turnier wirklich abbrechen? Es zählt dann nicht für Rangliste und Statistik.'
                : confirm === 'request_cancel'
                  ? 'Abbruch beantragen? Bestätigen mehr als die Hälfte der Teilnehmer, ist das Turnier abgebrochen und zählt nicht.'
                  : t.status === 'finished'
                    ? 'Abgeschlossenes Turnier endgültig löschen? Alle Ergebnisse, Endplätze und Ranglistenpunkte dieses Turniers sind danach weg und zählen nicht mehr für die Rangliste. Gäste aus diesem Turnier werden mit gelöscht.'
                    : 'Turnier endgültig löschen? Teilnehmer, Plätze und Farben sind danach weg. Gäste aus diesem Turnier werden mit gelöscht.'}
            </p>
            <button
              className="btn danger big"
              disabled={busy}
              onClick={async () => {
                const kind = confirm;
                setConfirm(null);
                if (kind === 'cancel') await act('/cancel');
                else if (kind === 'request_cancel') await act('/cancel-request');
                else
                  await run(async () => {
                    await api(`/tournaments/${id}`, { method: 'DELETE' });
                    onDeleted();
                  });
              }}
            >
              {confirm === 'delete' ? 'Ja, löschen' : confirm === 'cancel' ? 'Ja, abbrechen' : 'Ja, beantragen'}
            </button>
            <button className="btn big" onClick={() => setConfirm(null)}>
              Nein
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/** Spieler aus der Gruppe auswählen; Admins legen auch neue Spieler ohne Konto an (ADR-0015). */
function AddPlayers({
  tournament,
  isAdmin,
  onInvite,
  onClose,
}: {
  tournament: Tournament;
  isAdmin: boolean;
  onInvite(ids: string[]): Promise<void>;
  onClose(): void;
}) {
  const [players, setPlayers] = useState<GroupPlayer[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<GroupPlayer[]>(`/groups/${tournament.group_id}/players`)
      .then((rows) => active && setPlayers(rows))
      .catch((err: unknown) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
  }, [tournament.group_id]);

  const taken = new Set(tournament.entries.filter((e) => e.status !== 'declined').map((e) => e.player_id));
  const free = (players ?? []).filter((p) => !taken.has(p.id));

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const p = await api<GroupPlayer>(`/groups/${tournament.group_id}/players`, {
        method: 'POST',
        body: { display_name: name.trim() },
      });
      setPlayers((prev) => [...(prev ?? []), p]);
      setSelected((prev) => [...prev, p.id]);
      setName('');
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <section className="card left">
      <h2>Spieler hinzufügen</h2>
      {players === null && !error && <p className="muted">Lade Spieler …</p>}
      {players !== null && free.length === 0 && <p className="muted small">Alle Spieler der Gruppe sind schon dabei.</p>}
      <div className="chips-select" role="group" aria-label="Spieler der Gruppe">
        {free.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className={on ? 'chip on' : 'chip'}
              aria-pressed={on}
              onClick={() => setSelected((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
            >
              {p.display_name}
              {p.kind === 'reserved' && <span className="muted small"> · ohne Konto</span>}
            </button>
          );
        })}
      </div>
      {isAdmin && (
        <form className="row" onSubmit={create}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Neuer Spieler ohne Konto"
            aria-label="Neuer Spieler ohne Konto"
            maxLength={40}
            autoComplete="off"
          />
          <button className="btn" type="submit" disabled={!name.trim()}>
            Anlegen
          </button>
        </form>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary big" disabled={selected.length === 0} onClick={() => void onInvite(selected)}>
        {selected.length === 0 ? 'Spieler auswählen' : `${selected.length} hinzufügen`}
      </button>
      <button className="btn" onClick={onClose}>
        Schließen
      </button>
    </section>
  );
}

/** Tischgrafik mit den ausgelosten Plätzen; neue Auslosung = gleiche Animation auf allen Handys. */
function SeatingView({ tournament, seated }: { tournament: Tournament; seated: Entry[] }) {
  const names = seated.map((e) => e.display_name);
  const [shown, setShown] = useState<string[]>(names);
  const [shuffling, setShuffling] = useState(false);
  const [booster, setBooster] = useState(1);
  const lastDraw = useRef<number | null>(null);
  const draw = tournament.seating?.draw ?? 0;
  const seed = tournament.seating?.seed ?? 0;
  const key = names.join('|');

  useEffect(() => {
    const final = key.split('|');
    if (lastDraw.current === draw) {
      setShown(final);
      return;
    }
    const first = lastDraw.current === null;
    lastDraw.current = draw;
    // Beim ersten Öffnen nur animieren, wenn die Auslosung gerade frisch ist
    if (first && tournament.status !== 'seated') {
      setShown(final);
      return;
    }
    const rng = seededRng(seed);
    const startedAt = Date.now();
    setShuffling(true);
    setBooster(1);
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt >= SHUFFLE_MS) {
        window.clearInterval(timer);
        setShown(final);
        setShuffling(false);
        buzz(30);
      } else {
        setShown(drawSeats(final, rng));
      }
    }, 110);
    return () => window.clearInterval(timer);
  }, [draw, seed, key, tournament.status]);

  return (
    <section className="seating">
      <DraftTable
        seats={shown}
        booster={booster}
        shuffling={shuffling}
        onTap={() => {
          if (shuffling) return;
          setBooster((b) => (b % BOOSTERS_PER_PLAYER) + 1);
          buzz();
        }}
      />
      {!shuffling && (
        <ol className="pass-list" data-testid="tournament-seats">
          {shown.map((name) => (
            <li key={name}>
              <strong>{name}</strong> gibt an {neighbour(shown, name, booster)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
