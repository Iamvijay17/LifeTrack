/** Random id for client-generated keys (e.g. recurring-task series). Uses crypto.randomUUID when available. */
export const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
