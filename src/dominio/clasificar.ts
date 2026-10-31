// Clasificación de modelo/color buscando en TODAS las columnas de cada fila.
// Devuelve valor + columna + texto del match + confianza. Si hay conflicto
// irresoluble (dos valores con confianzas parecidas), el registro va a revisión.

import type { Clasificacion, ReglaAprendizaje } from '../tipos';
import type { Configuracion } from './configuracion';
import { SKU_A_MODELO } from './catalogosSemilla';
import { compactar, contieneToken, normalizar, similitud } from './normalizar';

export interface TextoFuente {
  columna: string;
  texto: string | number | null | undefined;
}

export interface ResultadoClasificacion {
  clasif: Clasificacion | null;
  conflicto: string | null;
}

interface Candidato {
  valor: string;
  conf: number;
  columna: string;
  texto: string;
  fuente: string;
  rankMetodo: number; // 0 regla · 1 exacto · 2 sinónimo · 3 fuzzy
  rankColumna: number;
}

const FUENTE_RANK: Record<string, number> = {
  regla: 0,
  'columna-modelo': 1,
  sku: 2,
  'join-pedidos': 3,
  catalogo: 4,
  sinonimo: 5,
  fuzzy: 6,
};

function rankColumna(col: string, cfg: Configuracion): number {
  const i = cfg.prioridadColumnas.indexOf(col);
  return i === -1 ? 100 : i;
}

function textoOriginal(t: TextoFuente): string {
  if (t.texto === null || t.texto === undefined) return '';
  return String(t.texto).trim();
}

function esColumnaSku(col: string): boolean {
  return col === 'Código (SKU)' || col === 'Código' || col === 'join:codigo';
}

function esJoin(col: string): boolean {
  return col.startsWith('join:');
}

function fuentePorColumna(col: string, metodo: number, mapa: Record<string, string>): string {
  if (metodo === 0) return 'regla';
  if (esColumnaSku(col)) return 'sku';
  if (col === 'Modelo') return 'columna-modelo';
  if (esJoin(col)) return 'join-pedidos';
  return mapa[col] ?? 'catalogo';
}

// ---------------------------------------------------------------------------
// MODELO
// ---------------------------------------------------------------------------

export function clasificarModelo(
  textos: TextoFuente[],
  cfg: Configuracion,
  reglas: ReglaAprendizaje[],
): ResultadoClasificacion {
  const modelos = cfg.catalogos.modelos.filter((m) => m.activo).map((m) => m.nombre);
  const ordenados = [...modelos].sort((a, b) => b.length - a.length);
  const cand: Candidato[] = [];
  const fuenteMapa: Record<string, string> = { 'Descripción': 'catalogo', 'glosa cabecera': 'catalogo' };

  for (const t of textos) {
    const raw = textoOriginal(t);
    if (!raw) continue;
    const norm = normalizar(raw);
    if (!norm) continue;
    const rc = rankColumna(t.columna, cfg);

    // 0) Reglas de aprendizaje (aplican solo a su columna de origen, o a todas).
    // Match por borde de palabra: una regla corta como "moto" NO debe pisar
    // todo "MOTOCICLETA XR190L…" — solo palabras completas ("navi", "x blade").
    for (const r of reglas) {
      if (r.tipo !== 'modelo' || !r.activa) continue;
      if (r.columna && r.columna !== t.columna) continue;
      if (r.busqueda && contieneToken(norm, r.busqueda)) {
        cand.push({ valor: r.valor, conf: 0.99, columna: t.columna, texto: raw, fuente: 'regla', rankMetodo: 0, rankColumna: rc });
      }
    }

    // 1) SKU exacto del catálogo
    if (esColumnaSku(t.columna)) {
      const m = SKU_A_MODELO[raw.toUpperCase()];
      if (m) {
        cand.push({ valor: m, conf: 0.99, columna: t.columna, texto: raw, fuente: 'sku', rankMetodo: 1, rankColumna: rc });
      }
    }

    // 2) Catálogo (coincidencia exacta o contenida)
    for (const modelo of ordenados) {
      const mn = normalizar(modelo);
      if (!mn) continue;
      const exacto = norm === mn;
      const contenido = contieneToken(norm, mn) || (mn.includes(' ') && norm.includes(mn));
      if (exacto || contenido) {
        const fuente = fuentePorColumna(t.columna, 1, fuenteMapa);
        const confBase = t.columna === 'Modelo' ? (exacto ? 1.0 : 0.97) : esJoin(t.columna) ? 0.96 : 0.95;
        cand.push({ valor: modelo, conf: confBase, columna: t.columna, texto: raw, fuente, rankMetodo: 1, rankColumna: rc });
        break; // el más largo primero: el primero que matchea gana en esta columna
      }
    }

    // 3) Sinónimos
    for (const s of cfg.catalogos.sinonimos) {
      if (s.tipo !== 'modelo') continue;
      const sn = normalizar(s.busqueda);
      if (sn && norm.includes(sn)) {
        cand.push({ valor: s.valor, conf: 0.9, columna: t.columna, texto: raw, fuente: 'sinonimo', rankMetodo: 2, rankColumna: rc });
        break;
      }
    }

    // 4) Fuzzy (Levenshtein sobre ventanas de palabras)
    const mejor = mejorFuzzy(norm, modelos, cfg.umbralConfianza);
    if (mejor) {
      cand.push({ valor: mejor.valor, conf: mejor.conf, columna: t.columna, texto: raw, fuente: 'fuzzy', rankMetodo: 3, rankColumna: rc });
    }
  }

  return resolver(cand, 'Modelo', cfg.margenConflicto);
}

// ---------------------------------------------------------------------------
// COLOR
// ---------------------------------------------------------------------------

export function clasificarColor(
  textos: TextoFuente[],
  cfg: Configuracion,
  reglas: ReglaAprendizaje[],
): ResultadoClasificacion {
  // Compuestos primero; entre simples se respeta el orden del catálogo
  // (semilla = orden de la referencia: AZUL antes de AMARILLO, etc.).
  const coloresIdx = cfg.catalogos.colores.map((c, i) => ({ ...c, i }));
  const ordenados = coloresIdx
    .filter((c) => c.activo)
    .sort((a, b) => palabrasDe(a.nombre) - palabrasDe(b.nombre) || a.i - b.i)
    .map((c) => c.nombre);
  const cand: Candidato[] = [];

  const canonico = (c: string): string => cfg.catalogos.aliasColor[c] ?? titleCase(c);

  for (const t of textos) {
    const raw = textoOriginal(t);
    if (!raw) continue;
    const norm = normalizar(raw);
    if (!norm) continue;
    const rc = rankColumna(t.columna, cfg);

    for (const r of reglas) {
      if (r.tipo !== 'color' || !r.activa) continue;
      if (r.columna && r.columna !== t.columna) continue;
      if (r.busqueda && contieneToken(norm, r.busqueda)) {
        cand.push({ valor: r.valor, conf: 0.99, columna: t.columna, texto: raw, fuente: 'regla', rankMetodo: 0, rankColumna: rc });
      }
    }

    // Catálogo de color en orden (compuestos primero)
    for (const color of ordenados) {
      const cn = normalizar(color);
      if (cn && contieneToken(norm, cn)) {
        const valor = canonico(color);
        const fuente = esJoin(t.columna) ? 'join-pedidos' : 'catalogo';
        const conf = esJoin(t.columna) ? 0.96 : 0.93;
        cand.push({ valor, conf, columna: t.columna, texto: raw, fuente, rankMetodo: 1, rankColumna: rc });
        break;
      }
    }

    // Color codificado en el sufijo del SKU
    if (esColumnaSku(t.columna)) {
      const suf = sufijoColorSku(raw, cfg);
      if (suf) {
        cand.push({ valor: suf, conf: 0.92, columna: t.columna, texto: raw, fuente: 'sku', rankMetodo: 1, rankColumna: rc });
      }
    }

    const mejor = mejorFuzzy(norm, ordenados, cfg.umbralConfianza);
    if (mejor) {
      cand.push({ valor: canonico(mejor.valor), conf: mejor.conf, columna: t.columna, texto: raw, fuente: 'fuzzy', rankMetodo: 3, rankColumna: rc });
    }
  }

  return resolver(cand, 'Color', cfg.margenConflicto);
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-])([a-záéíóúñ])/g, (_m, p1, p2) => p1 + p2.toUpperCase());
}

function palabrasDe(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function sufijoColorSku(sku: string, cfg: Configuracion): string | null {
  const idx = sku.lastIndexOf('-');
  if (idx === -1) return null;
  let suf = sku.slice(idx + 1).trim().toUpperCase();
  suf = suf.replace(/[0-9_]+$/, '').replace(/_.*$/, '');
  if (!suf) return null;
  const mapa = cfg.catalogos.skuColor;
  if (mapa[suf]) return mapa[suf];
  // intentos por prefijo (NEGBRI2 → NEGBRI)
  const claves = Object.keys(mapa).sort((a, b) => b.length - a.length);
  for (const k of claves) {
    if (suf.startsWith(k)) return mapa[k];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resolución de conflictos
// ---------------------------------------------------------------------------

function resolver(cand: Candidato[], etiqueta: string, margen: number): ResultadoClasificacion {
  if (!cand.length) return { clasif: null, conflicto: null };
  const orden = [...cand].sort(
    (a, b) =>
      a.rankColumna - b.rankColumna ||
      a.rankMetodo - b.rankMetodo ||
      FUENTE_RANK[a.fuente] - FUENTE_RANK[b.fuente] ||
      b.conf - a.conf,
  );
  const mejor = orden[0];

  // ¿Hay otro candidato de nivel comparable con valor distinto y confianza parecida?
  for (const otro of orden.slice(1)) {
    if (otro.valor === mejor.valor) continue;
    if (otro.rankColumna !== mejor.rankColumna) continue;
    if (Math.abs(otro.conf - mejor.conf) < margen) {
      return {
        clasif: null,
        conflicto: `${etiqueta} "${mejor.valor}" vs "${otro.valor}" detectados juntos (${mejor.columna}: "${mejor.texto.slice(0, 60)}" / ${otro.columna}: "${otro.texto.slice(0, 60)}")`,
      };
    }
  }

  return {
    clasif: {
      valor: mejor.valor,
      tipo: etiqueta === 'Modelo' ? 'modelo' : 'color',
      columna: mejor.columna,
      textoMatch: mejor.texto,
      confianza: Math.round(mejor.conf * 1000) / 1000,
      fuente: mejor.fuente,
    },
    conflicto: null,
  };
}

function mejorFuzzy(
  norm: string,
  valores: string[],
  umbral: number,
): { valor: string; conf: number } | null {
  let mejor: { valor: string; conf: number } | null = null;
  const compacto = compactar(norm);
  const palabras = norm.split(' ').filter(Boolean);

  for (const v of valores) {
    const vn = normalizar(v);
    if (!vn) continue;
    let conf = 0;
    // similitud contra texto completo compactado
    conf = Math.max(conf, similitud(compacto, compactar(vn)));
    // similitud contra ventanas del mismo número de palabras
    const n = vn.split(' ').length;
    for (let i = 0; i + n <= palabras.length; i++) {
      const win = palabras.slice(i, i + n).join(' ');
      conf = Math.max(conf, similitud(win, vn));
    }
    if (palabras.length === 1 && n === 1) conf = Math.max(conf, similitud(norm, vn));
    if (conf >= umbral && (!mejor || conf > mejor.conf)) {
      mejor = { valor: v, conf: Math.round(conf * 1000) / 1000 };
    }
  }
  return mejor;
}

/** Canoniza un modelo escrito a mano contra el catálogo (no adivina: solo igualdad normalizada o sinónimo exacto). */
export function canonicoModelo(cfg: Configuracion, v: string): string {
  const t = v.trim();
  const n = normalizar(t);
  if (!n) return t;
  const exacto = cfg.catalogos.modelos.find((m) => normalizar(m.nombre) === n);
  if (exacto) return exacto.nombre;
  const sin = cfg.catalogos.sinonimos.find((s) => s.tipo === 'modelo' && normalizar(s.busqueda) === n);
  if (sin) return sin.valor;
  return t;
}

/** Canoniza un color escrito a mano: alias del catálogo, igualdad normalizada o Title Case. */
export function canonicoColor(cfg: Configuracion, v: string): string {
  const t = v.trim();
  const n = normalizar(t);
  if (!n) return 'Sin color';
  const aliasDirecto = cfg.catalogos.aliasColor[t] ?? cfg.catalogos.aliasColor[t.toUpperCase()];
  if (aliasDirecto) return aliasDirecto;
  const exacto = cfg.catalogos.colores.find((c) => normalizar(c.nombre) === n);
  if (exacto) return exacto.nombre;
  const porAlias = Object.entries(cfg.catalogos.aliasColor).find(([k]) => normalizar(k) === n);
  if (porAlias) return porAlias[1];
  return titleCase(t);
}
