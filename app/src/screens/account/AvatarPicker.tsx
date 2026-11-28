import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../../api/client';
import type { Me } from '../../api/types';
import { Avatar } from '../../Avatar';
import { AVATAR_PX, PRESETS, cropRect } from '../../domain/avatars';

/** Profilbild wählen (Phase 5, AP-15): Wesen aus der Vorauswahl oder eigenes Bild mit Ausschnitt. */
export function AvatarPicker({ me, onChange }: { me: Me; onChange(me: Me): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<ImageBitmap | null>(null);

  const send = async (body: { preset: string } | { image: string } | null) => {
    setBusy(true);
    setError(null);
    try {
      const updated = body ? await api<Me>('/me/avatar', { method: 'PUT', body }) : await api<Me>('/me/avatar', { method: 'DELETE' });
      onChange(updated);
      setFile(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      setError('Bitte ein PNG- oder JPEG-Bild wählen.');
      return;
    }
    try {
      setFile(await createImageBitmap(f));
    } catch {
      setError('Das Bild ließ sich nicht öffnen.');
    }
  };

  return (
    <section className="stack" aria-label="Profilbild">
      <h3>Profilbild</h3>
      <div className="avatar-current">
        <Avatar avatar={me.avatar} name={me.display_name} colors={me.favorite_colors} size={72} />
        <p className="muted small">Erscheint in Siegerehrung, Rangliste, Duellen und Live-Ansicht, in allen deinen Gruppen.</p>
      </div>
      {file ? (
        <Cropper bitmap={file} busy={busy} onCancel={() => setFile(null)} onDone={(image) => void send({ image })} />
      ) : (
        <>
          <div className="avatar-grid" role="group" aria-label="Wesen wählen">
            {PRESETS.map((p) => {
              const on = me.avatar === `preset:${p.key}`;
              return (
                <button
                  key={p.key}
                  type="button"
                  className={on ? 'avatar-choice on' : 'avatar-choice'}
                  aria-pressed={on}
                  aria-label={p.name}
                  disabled={busy}
                  onClick={() => void send({ preset: p.key })}
                >
                  <Avatar avatar={`preset:${p.key}`} name={p.name} size={52} />
                </button>
              );
            })}
          </div>
          <label className="btn file-btn">
            Eigenes Bild hochladen
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void choose(e.target.files?.[0])} />
          </label>
          {me.avatar && (
            <button className="btn ghost" onClick={() => void send(null)} disabled={busy}>
              Profilbild entfernen
            </button>
          )}
        </>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Runden Ausschnitt wählen: verschieben per Ziehen, Größe per Regler; Ergebnis 256 px JPEG. */
function Cropper({ bitmap, busy, onCancel, onDone }: { bitmap: ImageBitmap; busy: boolean; onCancel(): void; onDone(dataUrl: string): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const { sx, sy, side } = cropRect(bitmap.width, bitmap.height, zoom, pos.x, pos.y);
    ctx.clearRect(0, 0, AVATAR_PX, AVATAR_PX);
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  }, [bitmap, zoom, pos]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // 200 px Ziehen verschiebt einmal über den ganzen möglichen Bereich
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    setPos({ x: clamp(d.px - (e.clientX - d.x) / 100), y: clamp(d.py - (e.clientY - d.y) / 100) });
  };

  return (
    <div className="stack cropper">
      <canvas
        ref={canvas}
        width={AVATAR_PX}
        height={AVATAR_PX}
        className="crop-canvas"
        aria-label="Ausschnitt: zum Verschieben ziehen"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      <label className="field">
        <span>Größe</span>
        <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
      </label>
      <button className="btn primary" disabled={busy} onClick={() => canvas.current && onDone(canvas.current.toDataURL('image/jpeg', 0.85))}>
        Als Profilbild speichern
      </button>
      <button className="btn ghost" onClick={onCancel} disabled={busy}>
        Abbrechen
      </button>
    </div>
  );
}
