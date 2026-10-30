// Tipo de cambio USD → soles, resuelto POR DÍA.
//
// Fuentes (en orden de prioridad):
//   1. tabla manual en Configuración (fecha exacta)
//   2. derivada de los propios datos: ratio importeSoles / importeUsd por día
//      (mediana por fecha, filtrada a un rango sano 0.5–10 para descartar ruido)
//   3. fecha previa más cercana (≤ 7 días) de cualquiera de las dos tablas
//   4. tasa por defecto de Configuración
//   5. null → no se muestra soles para esa fecha (nunca se inventa una tasa)

import type { Configuracion } from './configuracion';
import type { Registro } from '../tipos';

export interface TcEntrada {
  /** 'YYYY-MM-DD' */
  fecha: string;
  tasa: number;
}

export interface TcEstado {
  manual: TcEntrada[];
  derivadas: Map<string, number>;
  defecto: number | null;
}

/** Días máximos que puede retroceder la búsqueda de una tasa previa. */
export const TC_DIAS_TOLERANCIA = 7;
/** Ratio soles/USD considerado sano al derivar de los datos. */
export const TC_RANGO_SANO = { min: 0.5, max: 10 };

function aNumero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function diaDe(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function diasDe(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / 86400000;
}

/** Deriva la tasa de cada día desde los registros (mediana de ratios sanos). */
export function derivarTasas(registros: Registro[]): Map<string, number> {
  const porDia = new Map<string, number[]>();
  for (const r of registros) {
    const dia = diaDe(r.fechaISO);
    if (!dia) continue;
    const usd = aNumero(r.importeUsd);
    const pen = aNumero(r.importeSoles);
    if (usd === null || pen === null) continue;
    const ratio = pen / usd;
    if (ratio < TC_RANGO_SANO.min || ratio > TC_RANGO_SANO.max) continue;
    const arr = porDia.get(dia);
    if (arr) arr.push(ratio);
    else porDia.set(dia, [ratio]);
  }
  const out = new Map<string, number>();
  for (const [dia, ratios] of porDia) {
    ratios.sort((a, b) => a - b);
    const mid = Math.floor(ratios.length / 2);
    const mediana = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
    out.set(dia, Number(mediana.toFixed(4)));
  }
  return out;
}

/** Construye el estado del TC: tabla manual de la config + tasas derivadas de los datos. */
export function construirTc(cfg: Configuracion, registros: Registro[]): TcEstado {
  const manual: TcEntrada[] = [];
  for (const e of cfg.tc?.manual ?? []) {
    const dia = diaDe(e.fecha);
    const tasa = aNumero(e.tasa);
    if (dia && tasa !== null) manual.push({ fecha: dia, tasa });
  }
  manual.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { manual, derivadas: derivarTasas(registros), defecto: aNumero(cfg.tc?.defecto ?? null) };
}

/** Tasa para una fecha concreta; null = no hay tasa (no se inventa). */
export function tasaPara(tc: TcEstado, fechaISO: string | null | undefined): number | null {
  const dia = diaDe(fechaISO);
  if (!dia) return tc.defecto;

  // 1) exacta: manual manda sobre derivada
  const m = tc.manual.find((e) => e.fecha === dia);
  if (m) return m.tasa;
  const d = tc.derivadas.get(dia);
  if (d !== undefined) return d;

  // 2) previa más cercana (≤ tolerancia), manual sobre derivada en empate
  let mejor: { fecha: string; tasa: number } | null = null;
  for (const e of tc.manual) {
    if (e.fecha < dia && diasDe(e.fecha, dia) <= TC_DIAS_TOLERANCIA && (!mejor || e.fecha > mejor.fecha)) {
      mejor = { fecha: e.fecha, tasa: e.tasa };
    }
  }
  for (const [f, t] of tc.derivadas) {
    if (f < dia && diasDe(f, dia) <= TC_DIAS_TOLERANCIA && (!mejor || f > mejor.fecha)) {
      mejor = { fecha: f, tasa: t };
    }
  }
  if (mejor) return mejor.tasa;

  // 3) defecto
  return tc.defecto;
}

/** Tasa "vigente" para agregados sin fecha propia (último día conocido o defecto). */
export function tasaVigente(tc: TcEstado): number | null {
  // candidato manual primero: en empate de fecha, la manual gana sobre la derivada
  let mejor: { fecha: string; tasa: number } | null = null;
  for (const e of tc.manual) if (!mejor || e.fecha > mejor.fecha) mejor = { fecha: e.fecha, tasa: e.tasa };
  const vigenteManual = mejor;
  for (const [f, t] of tc.derivadas) {
    if (!vigenteManual || f > vigenteManual.fecha) mejor = { fecha: f, tasa: t };
  }
  return mejor ? mejor.tasa : tc.defecto;
}

/** ¿Hay al menos una tasa disponible (para decidir si se muestran columnas en soles)? */
export function hayTasas(tc: TcEstado): boolean {
  return tc.manual.length > 0 || tc.derivadas.size > 0 || tc.defecto !== null;
}

/** Convierte USD a soles; null si no hay tasa. */
export function enSoles(usd: number, tasa: number | null): number | null {
  if (tasa === null || !Number.isFinite(usd)) return null;
  return usd * tasa;
}
