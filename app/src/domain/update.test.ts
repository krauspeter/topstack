import { describe, expect, it } from 'vitest';
import { alreadyReloadedFor, markReloadFor, newerOnServer } from './update';

describe('Update-Erkennung (AP-14)', () => {
  it('meldet nur einen neueren Server', () => {
    expect(newerOnServer('164', '198')).toBe(true);
    expect(newerOnServer('198', '198')).toBe(false);
    expect(newerOnServer('199', '198')).toBe(false); // während eines Deployments
  });

  it('ignoriert fehlende oder unbekannte Nummern', () => {
    expect(newerOnServer('', '198')).toBe(false);
    expect(newerOnServer('164', '')).toBe(false);
    expect(newerOnServer('164', null)).toBe(false);
    expect(newerOnServer('164', 'abc1234')).toBe(false);
  });

  it('merkt sich, für welchen Stand schon neu geladen wurde', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(alreadyReloadedFor('198', storage)).toBe(false);
    markReloadFor('198', storage);
    expect(alreadyReloadedFor('198', storage)).toBe(true);
    expect(alreadyReloadedFor('199', storage)).toBe(false);
  });
});
