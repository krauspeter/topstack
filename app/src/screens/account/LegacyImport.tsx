import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { ImportPreview, ImportRun } from '../../api/types';

/** Vorlagen wie in der Roadmap (CSV-Vorlage für Altdaten). */
export const TEMPLATE_TOURNAMENTS =
  'turnier_id,datum,set,spieler,platz\n2016-03-12-1,2016-03-12,SOI,Anna,1\n2016-03-12-1,2016-03-12,SOI,Ben,2\n2016-03-12-1,2016-03-12,SOI,Chris,3\n';
export const TEMPLATE_MATCHES =
  'turnier_id,runde,spieler_a,spieler_b,spiele_a,spiele_b\n2016-03-12-1,1,Anna,Ben,2,1\n2016-03-12-1,2,Anna,Chris,2,0\n2016-03-12-1,3,Ben,Chris,1,1\n';

const FILE_LABEL = { turniere: 'Turniere', matches: 'Matches', formular: 'Formular' } as const;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

/** Altdaten importieren (UC-19, UC-20, Phase 5 AP-4): CSV mit Vorschau, Formular, Rücknahme. */
export function LegacyImport({ groupId, groupName, onBack }: { groupId: string; groupName: string; onBack(): void }) {
  const [tournamentsCsv, setTournamentsCsv] = useState<{ name: string; text: string } | null>(null);
  const [matchesCsv, setMatchesCsv] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);

  const loadRuns = useCallback(() => {
    api<ImportRun[]>(`/groups/${groupId}/imports`)
      .then(setRuns)
      .catch(() => setRuns([]));
  }, [groupId]);
  useEffect(loadRuns, [loadRuns]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const read = async (file: File | undefined, set: (v: { name: string; text: string } | null) => void) => {
    setPreview(null);
    set(file ? { name: file.name, text: await file.text() } : null);
  };

  const send = (apply: boolean) =>
    run(async () => {
      if (!tournamentsCsv) return;
      const result = await api<ImportPreview>(`/groups/${groupId}/imports/csv`, {
        method: 'POST',
        body: {
          tournaments_csv: tournamentsCsv.text,
          matches_csv: matchesCsv?.text ?? null,
          source: [tournamentsCsv.name, matchesCsv?.name].filter(Boolean).join(' + '),
          apply,
        },
      });
      if (result.applied) {
        setPreview(null);
        setTournamentsCsv(null);
        setMatchesCsv(null);
        setMessage(`${result.tournaments.length} Turniere übernommen.`);
        loadRuns();
      } else {
        setPreview(result);
      }
    });

  const undo = (id: string) =>
    run(async () => {
      await api(`/groups/${groupId}/imports/${id}`, { method: 'DELETE' });
      setUndoing(null);
      setMessage('Import zurückgenommen.');
      loadRuns();
    });

  return (
    <main className="page">
      <header className="title-bar">
        <button className="btn ghost" onClick={onBack} aria-label="Zurück">
          ‹ Zurück
        </button>
        <div className="title">
          <h2>Altdaten</h2>
          <span className="muted small">{groupName}</span>
        </div>
      </header>

      <section className="stack">
        <h3>CSV importieren</h3>
        <p className="small">
          Eine Datei mit einer Zeile pro Spieler und Turnier (Pflicht: Datum, Spieler, Platz), dazu optional eine mit den Matches.
          Excel-Dateien „Speichern unter → CSV“; Komma oder Semikolon gehen beide.
        </p>
        <div className="nav-pair">
          <button className="btn small" onClick={() => download('turniere-vorlage.csv', TEMPLATE_TOURNAMENTS)}>
            Vorlage Turniere
          </button>
          <button className="btn small" onClick={() => download('matches-vorlage.csv', TEMPLATE_MATCHES)}>
            Vorlage Matches
          </button>
        </div>
        <label className="field">
          <span>Turniere (CSV)</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => void read(e.target.files?.[0], setTournamentsCsv)} />
        </label>
        <label className="field">
          <span>Matches (CSV, optional)</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => void read(e.target.files?.[0], setMatchesCsv)} />
        </label>
        <button className="btn" onClick={() => void send(false)} disabled={busy || !tournamentsCsv}>
          Prüfen
        </button>
      </section>

      {preview && <PreviewCard preview={preview} busy={busy} onApply={() => void send(true)} />}

      <ManualTournament
        groupId={groupId}
        busy={busy}
        run={run}
        onDone={(text) => {
          setMessage(text);
          loadRuns();
        }}
      />

      {message && (
        <p className="ok" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}

      {runs.length > 0 && (
        <section className="stack">
          <h3>Bisherige Importe</h3>
          <ul className="member-list" aria-label="Importläufe">
            {runs.map((r) => (
              <li key={r.id}>
                <span className="small">
                  {day(r.created_at)} · {r.source || 'Import'} · {r.tournaments} Turniere
                  {r.new_players > 0 && ` · ${r.new_players} Ehemalige neu`}
                  {r.created_by && ` · ${r.created_by}`}
                </span>
                {r.undone_at ? (
                  <span className="badge">zurückgenommen</span>
                ) : undoing === r.id ? (
                  <span className="stack">
                    <button className="btn danger small" onClick={() => void undo(r.id)} disabled={busy}>
                      Ja, zurücknehmen
                    </button>
                    <button className="btn ghost small" onClick={() => setUndoing(null)}>
                      Abbrechen
                    </button>
                  </span>
                ) : (
                  <button className="btn ghost small" onClick={() => setUndoing(r.id)} aria-label={`Import vom ${day(r.created_at)} zurücknehmen`}>
                    Zurücknehmen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function PreviewCard({ preview, busy, onApply }: { preview: ImportPreview; busy: boolean; onApply(): void }) {
  const ok = preview.problems.length === 0 && preview.tournaments.length > 0;
  return (
    <section className="card stack" aria-label="Vorschau">
      <h3>Vorschau</h3>
      <p className="small">
        {preview.tournaments.length} Turniere · {preview.known_players.length} bekannte Spieler · {preview.new_players.length} neue
        Ehemalige
      </p>
      {preview.new_players.length > 0 && (
        <p className="muted small">Neu als „Ehemalige“: {preview.new_players.join(', ')}. Später lassen sie sich mit Konten zusammenführen.</p>
      )}
      {preview.problems.length > 0 && (
        <ul className="stack" aria-label="Fehler">
          {preview.problems.map((p, i) => (
            <li key={i} className="warn small">
              {FILE_LABEL[p.file]}
              {p.line > 0 && `, Zeile ${p.line}`}: {p.message}
            </li>
          ))}
        </ul>
      )}
      {preview.warnings.map((w) => (
        <p key={w} className="muted small">
          ⚠ {w}
        </p>
      ))}
      {preview.tournaments.length > 0 && (
        <table className="table small">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Set</th>
              <th>Spieler</th>
              <th>Matches</th>
              <th>Sieger</th>
            </tr>
          </thead>
          <tbody>
            {preview.tournaments.map((t) => (
              <tr key={t.key}>
                <td>{day(t.held_on)}</td>
                <td>{t.set_code}</td>
                <td>{t.players}</td>
                <td>{t.matches}</td>
                <td>{t.winner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn primary" onClick={onApply} disabled={busy || !ok}>
        {ok ? `${preview.tournaments.length} Turniere übernehmen` : 'Erst die Fehler beheben'}
      </button>
    </section>
  );
}

/** Ein Turnier von Papier: Datum, Set, Spieler mit Platz (UC-19). */
function ManualTournament({
  groupId,
  busy,
  run,
  onDone,
}: {
  groupId: string;
  busy: boolean;
  run(action: () => Promise<void>): Promise<void>;
  onDone(message: string): void;
}) {
  const [heldOn, setHeldOn] = useState('');
  const [setCode, setSetCode] = useState('');
  const [rows, setRows] = useState([
    { name: '', place: 1 },
    { name: '', place: 2 },
  ]);
  const [problems, setProblems] = useState<string[]>([]);

  const filled = rows.filter((r) => r.name.trim());
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const body = { held_on: heldOn, set_code: setCode, entries: filled.map((r) => ({ name: r.name.trim(), place: r.place })) };
      const check = await api<ImportPreview>(`/groups/${groupId}/imports/manual`, { method: 'POST', body: { ...body, apply: false } });
      setProblems(check.problems.map((p) => p.message));
      if (check.problems.length > 0) return;
      await api<ImportPreview>(`/groups/${groupId}/imports/manual`, { method: 'POST', body: { ...body, apply: true } });
      setRows([
        { name: '', place: 1 },
        { name: '', place: 2 },
      ]);
      setHeldOn('');
      setSetCode('');
      onDone('Turnier eingetragen.');
    });
  };

  return (
    <details className="card stack">
      <summary>Ein Turnier von Hand eintragen</summary>
      <form className="stack" onSubmit={submit} aria-label="Turnier von Hand">
        <label className="field">
          <span>Datum</span>
          <input type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} required />
        </label>
        <label className="field">
          <span>Set (leer = unbekannt)</span>
          <input value={setCode} onChange={(e) => setSetCode(e.target.value)} maxLength={20} />
        </label>
        {rows.map((r, i) => (
          <div className="nav-pair" key={i}>
            <label className="field">
              <span>Spieler {i + 1}</span>
              <input
                value={r.name}
                maxLength={40}
                onChange={(e) => setRows((prev) => prev.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
              />
            </label>
            <label className="field">
              <span>Platz</span>
              <input
                type="number"
                min={1}
                max={40}
                value={r.place}
                onChange={(e) => setRows((prev) => prev.map((x, k) => (k === i ? { ...x, place: Number(e.target.value) || 1 } : x)))}
              />
            </label>
          </div>
        ))}
        <button type="button" className="btn ghost small" onClick={() => setRows((prev) => [...prev, { name: '', place: prev.length + 1 }])}>
          + Spieler
        </button>
        {problems.map((p) => (
          <p key={p} className="warn small">
            {p}
          </p>
        ))}
        <button type="submit" className="btn" disabled={busy || !heldOn || filled.length < 2}>
          Turnier eintragen
        </button>
      </form>
    </details>
  );
}
