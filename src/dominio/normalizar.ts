// Normalización de texto para matching tolerante a tildes, mayúsculas y signos.

export function quitarTildes(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Minúsculas, sin tildes, sin signos, espacios colapsados. */
export function normalizar(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  return quitarTildes(String(s))
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalización agresiva: sin espacios (para comparar SKUs/códigos). */
export function compactar(s: string | null | undefined): string {
  return normalizar(s).replace(/\s+/g, '');
}

/** Parseo tolerante de números en texto ("1.234,56", "1,234.56", "$ 1'234.56").
 *  Política: el separador que aparece último es el decimal; sin separadores de
 *  miles en texto (los números de Excel vienen como número y se toman tal cual). */
export function parseNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[$\s']/g, '');
  if (!s) return null;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    if (coma > punto) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (coma > -1) {
    s = s.replace(',', '.');
  }
  s = s.replace(/[^\d.\-]/g, '');
  if (!s || s === '.' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Parsing de fechas: Date, string ISO, dd/mm/yyyy, dd-mm-yyyy. */
export function parseFecha(v: unknown): { iso: string | null; valida: boolean } {
  if (v === null || v === undefined || v === '') return { iso: null, valida: false };
  if (v instanceof Date && !isNaN(v.getTime())) return { iso: v.toISOString().slice(0, 10), valida: true };
  if (typeof v === 'number') {
    // serial de Excel
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return { iso: d.toISOString().slice(0, 10), valida: true };
    return { iso: null, valida: false };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mes, anio] = m;
    let a = Number(anio);
    if (a < 100) a += 2000;
    const dt = new Date(a, Number(mes) - 1, Number(d));
    if (dt.getFullYear() === a && dt.getMonth() === Number(mes) - 1) {
      return { iso: `${a}-${String(Number(mes)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`, valida: true };
    }
    return { iso: null, valida: false };
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (dt.getMonth() === Number(m[2]) - 1) return { iso: s.slice(0, 10), valida: true };
    return { iso: null, valida: false };
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return { iso: dt.toISOString().slice(0, 10), valida: true };
  return { iso: null, valida: false };
}

/** Distancia de Levenshtein normalizada → similitud 0..1. */
export function similitud(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** ¿El texto contiene la palabra/valor como token (respeta bordes)? */
export function contieneToken(texto: string, valor: string): boolean {
  if (!valor) return false;
  const idx = texto.indexOf(valor);
  if (idx === -1) return false;
  const antes = idx === 0 ? ' ' : texto[idx - 1];
  const despues = idx + valor.length >= texto.length ? ' ' : texto[idx + valor.length];
  return /[^a-z0-9]/.test(antes) && /[^a-z0-9]/.test(despues);
}
