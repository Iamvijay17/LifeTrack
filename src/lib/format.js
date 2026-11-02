/** 0.4 -> '40%'; null/undefined -> '—' (no data is not 0%). */
export const pctText = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`)
