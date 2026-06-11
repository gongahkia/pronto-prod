type CircuitState = {
  failures: number;
  openedUntil: number;
};

const states = new Map<string, CircuitState>();
const FAILURE_THRESHOLD = 3;
const OPEN_MS = 60_000;

export function canCallProvider(provider: string, now = Date.now()): boolean {
  const state = states.get(provider);
  return !state || state.openedUntil <= now;
}

export function recordProviderSuccess(provider: string): void {
  states.delete(provider);
}

export function recordProviderFailure(provider: string, now = Date.now()): void {
  const current = states.get(provider) ?? { failures: 0, openedUntil: 0 };
  const failures = current.failures + 1;
  states.set(provider, {
    failures,
    openedUntil: failures >= FAILURE_THRESHOLD ? now + OPEN_MS : current.openedUntil,
  });
}

