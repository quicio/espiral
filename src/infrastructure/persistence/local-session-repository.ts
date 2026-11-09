import type { SessionRepositoryPort } from '../../domain/ports';

const SESSION_KEY = 'quicio-espiral-session-v1';

export class LocalSessionRepository implements SessionRepositoryPort {
  load(): unknown | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw === null) return null;
    return JSON.parse(raw) as unknown;
  }

  save(session: unknown): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}
