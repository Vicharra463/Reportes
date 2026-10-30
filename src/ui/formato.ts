import type { Configuracion } from '../dominio/configuracion';

export const SIMBOLO_SOLES = 'S/';

export function usd(v: string | number | null | undefined, cfg: Configuracion): string {
  const n = Number(v ?? 0);
  const s = Number.isFinite(n) ? n : 0;
  return `${cfg.simboloMoneda}${s.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Monto en soles; null si no hay tasa (muestra '—', nunca inventa). */
export function soles(v: string | number | null | undefined, tasa: number | null): string {
  if (tasa === null) return '—';
  const n = Number(v ?? 0);
  const s = Number.isFinite(n) ? n : 0;
  return `${SIMBOLO_SOLES}${(s * tasa).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Doble moneda: '$1,234.00 · S/ 4,567.89' (o solo USD si no hay tasa). */
export function dual(
  v: string | number | null | undefined,
  tasa: number | null,
  cfg: Configuracion,
): string {
  const base = usd(v, cfg);
  return tasa === null ? base : `${base} · ${soles(v, tasa)}`;
}

export function numPlain(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });
}

export function pct(n: number | null | undefined): string {
  return `${((n ?? 0) * 100).toFixed(1)}%`;
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function ahoraISO(): string {
  return new Date().toISOString();
}

export function nombreArchivoSeguro(nombre: string): string {
  return nombre.replace(/[^\w.\-]+/g, '_');
}
