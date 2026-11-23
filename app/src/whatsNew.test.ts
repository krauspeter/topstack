import { describe, expect, it } from 'vitest';
import { WHATS_NEW, pendingWhatsNew, whatsNewEntries } from './whatsNew';

describe('Was ist neu', () => {
  it('erscheint einmal nach einem Update auf eine Version mit Einträgen', () => {
    expect(pendingWhatsNew('0.9.0', '0.1.0')).toEqual(WHATS_NEW['0.9.0']);
    expect(pendingWhatsNew('0.9.0', '0.9.0')).toEqual([]);
  });

  it('nicht beim allerersten Start und nicht ohne Version', () => {
    expect(pendingWhatsNew('0.9.0', null)).toEqual([]);
    expect(pendingWhatsNew('', '0.9.0')).toEqual([]);
  });

  it('Vorabversion nutzt die Einträge der Endversion, unbekannte Version nichts', () => {
    expect(whatsNewEntries('0.9.0-rc.1')).toEqual(WHATS_NEW['0.9.0']);
    expect(whatsNewEntries('0.9.1')).toEqual([]);
  });

  it('kurze Hinweise: höchstens vier Punkte pro Version', () => {
    for (const entries of Object.values(WHATS_NEW)) expect(entries.length).toBeLessThanOrEqual(4);
  });
});
