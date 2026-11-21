import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import { pushErrorText } from './Notifications';

describe('pushErrorText', () => {
  it('zeigt den echten Grund statt „Keine Verbindung“', () => {
    expect(pushErrorText(new Error('Push ist auf dem Server noch nicht eingerichtet.'))).toBe(
      'Push ist auf dem Server noch nicht eingerichtet.',
    );
    expect(pushErrorText(new ApiError(503, 'VAPID fehlt'))).toBe('VAPID fehlt');
    expect(pushErrorText(new DOMException('x', 'NotAllowedError'))).toBe('Benachrichtigungen wurden nicht erlaubt.');
    expect(pushErrorText(new DOMException('bad key', 'InvalidAccessError'))).toContain('VAPID');
    expect(pushErrorText(new TypeError('Failed to fetch'))).toBe('Keine Verbindung zum Server. Bist du online?');
  });
});
