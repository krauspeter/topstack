import { describe, expect, it } from 'vitest';
import { isStaging } from './environment';

describe('Umgebung', () => {
  it('nur staging bekommt das Beta-Band', () => {
    expect(isStaging('staging')).toBe(true);
    for (const env of ['prod', 'dev', '', 'Staging']) expect(isStaging(env)).toBe(false);
  });
});
