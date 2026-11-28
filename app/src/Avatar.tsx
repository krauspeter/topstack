import type { CSSProperties } from 'react';
import { avatarView, initialsBackground } from './domain/avatars';
import sprite from './avatars/sprite.svg?raw';

/** Die 16 Wesen einmal ins Dokument legen; ``Avatar`` verweist mit <use> darauf (AP-15). */
export function AvatarSprite() {
  return <div className="avatar-sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />;
}

interface Props {
  /** „preset:<Wesen>“, Adresse eines eigenen Bildes oder leer. */
  avatar?: string | null;
  name: string;
  /** Lieblings- oder Deckfarben für die Initialen. */
  colors?: string | null;
  size?: number;
}

/** Profilbild: Wesen, eigenes Bild oder Initialen in den Farben des Spielers. */
export function Avatar({ avatar, name, colors, size = 36 }: Props) {
  const view = avatarView(avatar, name);
  const style = { '--av-size': `${size}px` } as CSSProperties;
  if (view.kind === 'preset') {
    return (
      <span className={`avatar mana-${view.preset.mana}`} style={style} role="img" aria-label={`${name}: ${view.preset.name}`}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle className="ring" cx="32" cy="32" r="30.5" />
          <use href={`#${view.preset.key}`} />
        </svg>
      </span>
    );
  }
  if (view.kind === 'image') {
    return (
      <span className="avatar" style={style}>
        <img src={view.url} alt={`Profilbild von ${name}`} loading="lazy" />
      </span>
    );
  }
  return (
    // Initialen per CSS, damit sie nicht im Text der Zeile landen (Namen stehen ja daneben)
    <span className="avatar initials" data-initials={view.text} style={{ ...style, background: initialsBackground(colors) }} aria-hidden="true" />
  );
}
