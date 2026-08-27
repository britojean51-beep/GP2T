// ============================================================================
// format.js — Formatação de números/datas em pt-BR.
// ============================================================================
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const fmt = {
  n1: (v) => nf1.format(Number(v) || 0),
  n2: (v) => nf2.format(Number(v) || 0),
  n3: (v) => nf3.format(Number(v) || 0),
};

export function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export function dataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function dataHoraBR(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? NaN : Number(v));
export const round = (v, d = 2) => {
  const p = Math.pow(10, d);
  return Math.round((Number(v) + Number.EPSILON) * p) / p;
};
