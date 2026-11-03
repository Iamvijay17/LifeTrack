// Counters that must be added to INSIDE the database so concurrent additions (two devices, two quick taps) never overwrite each other.
// fn = Postgres function (migration 0006); table = the table whose row it returns, so stores can patch their cache.
export const ATOMIC_OPS = Object.freeze({
  add_water: 'health_logs',
  add_savings: 'savings_goals',
})
