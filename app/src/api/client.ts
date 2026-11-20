/**
 * Zugriff auf die TopStack-API unter /api/v1 (gleiche Domain, Sitzung im HttpOnly-Cookie).
 * Fehler kommen als RFC 9457 Problem Details; ApiError trägt Status und Text weiter.
 */

/** Zusatzfelder aus Problem Details, z. B. `code: "missing_colors"` mit `names`. */
export interface ProblemExtra {
  code?: string;
  names?: string[];
  count?: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: ProblemExtra = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api/v1';

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function api<T>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  const response = await fetch(BASE + path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = '';
    let extra: ProblemExtra = {};
    try {
      const problem = (await response.json()) as { detail?: unknown; title?: unknown } & ProblemExtra;
      if (typeof problem.detail === 'string') detail = problem.detail;
      else if (typeof problem.title === 'string') detail = problem.title;
      extra = { code: problem.code, names: problem.names, count: problem.count };
    } catch {
      // keine JSON-Antwort, z. B. Server nicht erreichbar
    }
    throw new ApiError(response.status, detail || `Fehler ${response.status}`, extra);
  }
  if (response.status === 204 || response.status === 202) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Text für die Anzeige: Server-Meldung oder ein Hinweis auf fehlendes Netz. */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Keine Verbindung zum Server. Bist du online?';
}
