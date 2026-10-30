// Persistencia local: Dexie/IndexedDB para datos pesados (registros, lotes,
// reglas, historial) con fallback en memoria si IndexedDB no está disponible
// (modo archivo / navegadores restringidos). Nunca se guarda el archivo Excel
// original en la base — solo metadatos y las filas parseadas.

import type { CambioConfig, Lote, ReglaAprendizaje, Registro, StockFila } from '../tipos';

export interface Almacen {
  lotes: Lote[];
  registros: Registro[];
  reglas: ReglaAprendizaje[];
  cambiosConfig: CambioConfig[];
  stock: StockFila[];
}

type Listener = () => void;

class MemoriaAlmacen implements Almacen {
  lotes: Lote[] = [];
  registros: Registro[] = [];
  reglas: ReglaAprendizaje[] = [];
  cambiosConfig: CambioConfig[] = [];
  stock: StockFila[] = [];
}

let almacen: Almacen = new MemoriaAlmacen();
let dexie: import('dexie').Dexie | null = null;
let seqId = 1;
const listeners = new Set<Listener>();

export function escuchar(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notificar(): void {
  for (const cb of listeners) cb();
}

function clampReg(r: Registro): Registro {
  return {
    ...r,
    id: r.id ?? seqId++,
    clasifModelo: r.clasifModelo ?? null,
    clasifColor: r.clasifColor ?? null,
    motivos: r.motivos ?? [],
    celdas: r.celdas ?? {},
  };
}

function clampLote(l: Lote): Lote {
  return { ...l, id: l.id ?? seqId++, notas: l.notas ?? [] };
}

function clampRegla(rg: ReglaAprendizaje): ReglaAprendizaje {
  return { ...rg, id: rg.id ?? seqId++ };
}

function clampStock(sf: StockFila): StockFila {
  return { ...sf, id: sf.id ?? seqId++ };
}

async function initDexie(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const mod = await import('dexie');
    const D = mod.default ?? (mod as unknown as { default: typeof import('dexie').Dexie }).default;
    const db = new D('topmotors');
    db.version(1).stores({
      lotes: '++id, hash, fechaISO, tipo, estado',
      registros: '++id, loteId, tipo, categoria, estado, documentoTipo, pedido',
      reglas: '++id, tipo, busqueda, activa',
      cambiosConfig: '++id, seccion, clave, fechaISO, revertido',
      stock: '++id, modelo, color',
    });
    dexie = db;
  } catch {
    dexie = null;
    almacen = new MemoriaAlmacen();
  }
}

let initPromise: Promise<void> | null = null;
export function asegurarAlmacen(): Promise<void> {
  if (!initPromise) initPromise = initDexie();
  return initPromise;
}

/** ¿Estamos en memoria (sin IndexedDB)? La UI lo muestra como advertencia. */
export function esMemoria(): boolean {
  return dexie === null;
}

// ---------------------------------------------------------------------------
// Lecturas (devuelven arrays planos)
// ---------------------------------------------------------------------------

export async function cargarLotes(): Promise<Lote[]> {
  await asegurarAlmacen();
  if (dexie) return (await dexie.table('lotes').toArray()) as Lote[];
  return [...almacen.lotes];
}

export async function cargarRegistros(loteId?: number): Promise<Registro[]> {
  await asegurarAlmacen();
  if (dexie) {
    const t = dexie.table('registros');
    return (loteId === undefined ? await t.toArray() : await t.where('loteId').equals(loteId).toArray()) as Registro[];
  }
  const all = almacen.registros;
  return loteId === undefined ? [...all] : all.filter((r) => r.loteId === loteId);
}

export async function cargarReglas(): Promise<ReglaAprendizaje[]> {
  await asegurarAlmacen();
  if (dexie) return (await dexie.table('reglas').toArray()) as ReglaAprendizaje[];
  return [...almacen.reglas];
}

export async function cargarCambios(): Promise<CambioConfig[]> {
  await asegurarAlmacen();
  if (dexie) return (await dexie.table('cambiosConfig').toArray()) as CambioConfig[];
  return [...almacen.cambiosConfig];
}

export async function cargarStock(): Promise<StockFila[]> {
  await asegurarAlmacen();
  if (dexie) return (await dexie.table('stock').toArray()) as StockFila[];
  return [...almacen.stock];
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

export async function guardarLote(l: Lote): Promise<Lote> {
  await asegurarAlmacen();
  const clamped = clampLote(l);
  if (dexie) {
    const id = await dexie.table('lotes').add(clamped as never);
    return { ...clamped, id: Number(id) };
  }
  almacen.lotes.push(clamped);
  notificar();
  return clamped;
}

export async function actualizarLote(l: Lote): Promise<void> {
  await asegurarAlmacen();
  if (dexie) {
    await dexie.table('lotes').put(l as never);
  } else {
    const i = almacen.lotes.findIndex((x) => x.id === l.id);
    if (i >= 0) almacen.lotes[i] = l;
  }
  notificar();
}

export async function guardarRegistros(registros: Registro[]): Promise<void> {
  await asegurarAlmacen();
  const clamped = registros.map(clampReg);
  if (dexie) {
    await dexie.table('registros').bulkPut(clamped as never);
  } else {
    for (const r of clamped) {
      const i = almacen.registros.findIndex((x) => x.id === r.id);
      if (i >= 0) almacen.registros[i] = r;
      else almacen.registros.push(r);
    }
  }
  notificar();
}

export async function reemplazarRegistrosDeLote(loteId: number, nuevos: Registro[]): Promise<void> {
  await asegurarAlmacen();
  if (dexie) {
    const t = dexie.table('registros');
    await t.where('loteId').equals(loteId).delete();
    await t.bulkAdd(nuevos.map(clampReg) as never);
  } else {
    almacen.registros = almacen.registros.filter((r) => r.loteId !== loteId).concat(nuevos.map(clampReg));
  }
  notificar();
}

export async function revertirLote(loteId: number): Promise<void> {
  await asegurarAlmacen();
  if (dexie) {
    const t = dexie.table('registros');
    await t.where('loteId').equals(loteId).delete();
  } else {
    almacen.registros = almacen.registros.filter((r) => r.loteId !== loteId);
  }
  notificar();
}

export async function borrarLote(loteId: number): Promise<void> {
  await asegurarAlmacen();
  await revertirLote(loteId);
  if (dexie) {
    const t = dexie.table('lotes');
    await t.where('id').equals(loteId).delete();
  } else {
    almacen.lotes = almacen.lotes.filter((l) => l.id !== loteId);
  }
  notificar();
}

export async function guardarReglas(reglas: ReglaAprendizaje[]): Promise<void> {
  await asegurarAlmacen();
  const clamped = reglas.map(clampRegla);
  if (dexie) {
    await dexie.table('reglas').clear();
    await dexie.table('reglas').bulkAdd(clamped as never);
  } else {
    almacen.reglas = clamped;
  }
  notificar();
}

export async function agregarRegla(rg: ReglaAprendizaje): Promise<ReglaAprendizaje> {
  await asegurarAlmacen();
  const clamped = clampRegla(rg);
  if (dexie) {
    const id = await dexie.table('reglas').add(clamped as never);
    return { ...clamped, id: Number(id) };
  }
  almacen.reglas.push(clamped);
  notificar();
  return clamped;
}

export async function actualizarRegla(rg: ReglaAprendizaje): Promise<void> {
  await asegurarAlmacen();
  if (dexie) await dexie.table('reglas').put(rg as never);
  else {
    const i = almacen.reglas.findIndex((x) => x.id === rg.id);
    if (i >= 0) almacen.reglas[i] = rg;
  }
  notificar();
}

export async function eliminarRegla(id: number): Promise<void> {
  await asegurarAlmacen();
  if (dexie) await dexie.table('reglas').delete(id);
  else almacen.reglas = almacen.reglas.filter((r) => r.id !== id);
  notificar();
}

export async function guardarCambio(c: CambioConfig): Promise<CambioConfig> {
  await asegurarAlmacen();
  const clamped = { ...c, id: c.id ?? seqId++ };
  if (dexie) {
    const id = await dexie.table('cambiosConfig').add(clamped as never);
    return { ...clamped, id: Number(id) };
  }
  almacen.cambiosConfig.push(clamped);
  notificar();
  return clamped;
}

export async function actualizarCambio(c: CambioConfig): Promise<void> {
  await asegurarAlmacen();
  if (dexie) await dexie.table('cambiosConfig').put(c as never);
  else {
    const i = almacen.cambiosConfig.findIndex((x) => x.id === c.id);
    if (i >= 0) almacen.cambiosConfig[i] = c;
  }
  notificar();
}

export async function guardarStock(filas: StockFila[]): Promise<void> {
  await asegurarAlmacen();
  const clamped = filas.map(clampStock);
  if (dexie) {
    await dexie.table('stock').clear();
    await dexie.table('stock').bulkAdd(clamped as never);
  } else {
    almacen.stock = clamped;
  }
  notificar();
}

export async function upsertStock(fila: StockFila): Promise<StockFila> {
  await asegurarAlmacen();
  const clamped = clampStock(fila);
  if (dexie) {
    const t = dexie.table('stock');
    const existente = (await t.where('modelo').equals(clamped.modelo).and((x: StockFila) => x.color === clamped.color).first()) as
      | StockFila
      | undefined;
    if (existente) {
      const merged = { ...existente, ...clamped, id: existente.id };
      await t.put(merged as never);
      return merged;
    }
    const id = await t.add(clamped as never);
    return { ...clamped, id: Number(id) };
  }
  const i = almacen.stock.findIndex((x) => x.modelo === clamped.modelo && x.color === clamped.color);
  if (i >= 0) {
    almacen.stock[i] = { ...almacen.stock[i], ...clamped, id: almacen.stock[i].id };
    notificar();
    return almacen.stock[i];
  }
  almacen.stock.push(clamped);
  notificar();
  return clamped;
}

export async function borrarStock(id: number): Promise<void> {
  await asegurarAlmacen();
  if (dexie) await dexie.table('stock').delete(id);
  else almacen.stock = almacen.stock.filter((s) => s.id !== id);
  notificar();
}

/** Todo vacío: sirve para tests y para "reiniciar". */
export async function vaciarTodo(): Promise<void> {
  await asegurarAlmacen();
  if (dexie) {
    for (const t of ['lotes', 'registros', 'reglas', 'cambiosConfig', 'stock']) {
      await dexie.table(t).clear();
    }
  } else {
    almacen = new MemoriaAlmacen();
  }
  notificar();
}

export function memoriaAlmacen(): Almacen {
  return almacen;
}
