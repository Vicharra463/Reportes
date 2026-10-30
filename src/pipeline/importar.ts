// Pipeline de importación: SIMULAR calcula todo sin tocar la base; CONFIRMAR
// persiste lote + registros + stock y recién ahí el dashboard se actualiza.

import type { ArchivoEnCola, Lote, ReglaAprendizaje, Registro, Simulacion, StockFila, TipoArchivo } from '../tipos';
import type { Configuracion } from '../dominio/configuracion';
import type { ModeloCalculado } from '../dominio/calcular';
import { claveRegistro } from '../dominio/validar';
import { canonicoColor, canonicoModelo } from '../dominio/clasificar';
import { hojaARegistros, obtenerLibro, primerasFilas } from '../io/leerExcel';
import { ejecutarCalculo } from './ejecutar';

export interface SimulacionConArchivos {
  simulaciones: Simulacion[];
  modelo: ModeloCalculado;
  registrosNuevos: Registro[];
  /** Filas de stock que se derivarían de archivos tipo stock (modelo+color→inicial). */
  stockNuevo: { modelo: string; color: string; inicial: string; archivo: string }[];
  avisos: string[];
}

function detectarFilaStock(r: Registro): { modelo: string; color: string; inicial: string } | null {
  if (!r.stockModelo) return null;
  return {
    modelo: r.stockModelo.trim(),
    color: (r.stockColor ?? '').trim() || 'Sin color',
    inicial: r.stockInicial ?? '0',
  };
}

export async function simularImportacion(params: {
  cola: ArchivoEnCola[];
  cfg: Configuracion;
  reglas: ReglaAprendizaje[];
  registrosExistentes: Registro[];
  stock: StockFila[];
  lotesExistentes: Lote[];
}): Promise<SimulacionConArchivos> {
  const { cola, cfg, reglas, registrosExistentes, stock, lotesExistentes } = params;
  const avisos: string[] = [];
  const registrosNuevos: Registro[] = [];
  const simulaciones: Simulacion[] = [];
  const stockNuevo: SimulacionConArchivos['stockNuevo'] = [];
  const hashes = new Set(lotesExistentes.filter((l) => l.estado === 'confirmado').map((l) => l.hash));
  const clavesExistentes = new Set(registrosExistentes.map(claveRegistro));

  let loteIdVirtual = 100000; // ids negativos en simulación, se reasignan al confirmar
  for (const a of cola) {
    loteIdVirtual += 1;
    const libro = obtenerLibro(a.file);
    if (!libro) {
      avisos.push(`No se pudo releer ${a.nombre}: quitáselo de la cola y volvé a elegirlo.`);
      continue;
    }
    if (a.hashCalculado && hashes.has(a.hash)) {
      simulaciones.push({
        archivo: a.nombre,
        hoja: a.hojaActiva,
        filasLeidas: 0,
        clasificados: 0,
        revision: 0,
        errores: [],
        duplicados: [],
        hashRepetido: true,
        ejemplos: [],
      });
      avisos.push(`${a.nombre} ya fue importado antes (mismo archivo): no se importa de nuevo.`);
      continue;
    }
    if (a.tipo === 'desconocido') {
      avisos.push(`${a.nombre}: no se reconoció el tipo de archivo. Revisá el mapeo de columnas antes de importar.`);
    }

    const omitirSubtotales = a.tipo === 'ventas';
    const registros = hojaARegistros({
      libro,
      archivo: a.nombre,
      hoja: a.hojaActiva,
      filaEncabezado: a.filaEncabezado,
      columnas: a.columnas,
      mapeo: a.mapeo,
      loteId: loteIdVirtual,
      omitirSubtotales,
    });
    for (const r of registros) {
      if (a.tipo === 'stock') {
        const sf = detectarFilaStock(r);
        if (sf) {
          stockNuevo.push({
            modelo: canonicoModelo(cfg, sf.modelo),
            color: canonicoColor(cfg, sf.color),
            inicial: sf.inicial,
            archivo: a.nombre,
          });
        }
      }
      registrosNuevos.push(r);
    }

    const errores: { fila: number; motivo: string }[] = [];
    const duplicados: { fila: number; clave: string }[] = [];
    let revision = 0;
    const vistosLote = new Set<string>();
    for (const r of registros) {
      const k = claveRegistro(r);
      if (k !== '|||' && !k.startsWith('PED||') && k !== '||||') {
        if (vistosLote.has(k) || clavesExistentes.has(k)) {
          duplicados.push({ fila: r.fila, clave: k });
        }
        vistosLote.add(k);
      }
      void errores;
      void revision;
    }
    simulaciones.push({
      archivo: a.nombre,
      hoja: a.hojaActiva,
      filasLeidas: registros.length,
      clasificados: 0,
      revision: 0,
      errores,
      duplicados,
      hashRepetido: false,
      ejemplos: primerasFilas(libro, a.hojaActiva, a.filaEncabezado, 8).map((f) => ({ ...f, archivo: a.nombre })),
    });
    void clavesExistentes;
  }

  const todos = [...registrosExistentes, ...registrosNuevos];
  const { resultado } = await ejecutarCalculo({ registros: todos, stock, cfg, reglas });

  // completar contadores de revisión/errores por simulación
  for (const sim of simulaciones) {
    if (sim.hashRepetido) continue;
    const filas = registrosNuevos.filter((r) => r.archivo === sim.archivo && r.hoja === sim.hoja);
    sim.revision = filas.filter((r) => r.estado === 'revision').length;
    sim.errores = filas
      .filter((r) => r.estado === 'error')
      .map((r) => ({ fila: r.fila, motivo: r.motivos[0] ?? 'error' }));
    sim.clasificados = filas.filter((r) => r.estado === 'clasificado' && (r.clasifModelo?.valor || r.clasifColor?.valor)).length;
  }

  // avisos de stock faltante (por cada modelo en reserva/facturación sin fila de stock)
  const clavesStock = new Set(stock.map((s) => `${s.modelo}||${s.color}`));
  for (const sf of stockNuevo) clavesStock.add(`${sf.modelo}||${sf.color}`);
  for (const g of resultado.grupos) {
    if (!clavesStock.has(`${g.modelo}||${g.color}`)) {
      avisos.push(`Sin stock cargado para ${g.modelo} · ${g.color}: el saldo de esa fila queda en 0. Cargá el stock inicial.`);
    }
  }

  return { simulaciones, modelo: resultado, registrosNuevos, stockNuevo, avisos };
}

export interface ConfirmacionResultado {
  lotesCreados: Lote[];
  registrosGuardados: number;
  stockActualizado: number;
  avisos: string[];
}

/** Persiste la importación ya simulada. Recalcula nada: los registros vienen con estado. */
export async function confirmarImportacion(params: {
  cola: ArchivoEnCola[];
  registros: Registro[]; // los registrosNuevos con estado ya calculado
  lotesExistentes: Lote[];
  ahoraISO: string;
  cfg: Configuracion;
  guardarLote: (l: Lote) => Promise<Lote>;
  guardarRegistros: (loteId: number, rs: Registro[]) => Promise<void>;
  upsertStock: (f: StockFila) => Promise<StockFila>;
}): Promise<ConfirmacionResultado> {
  const { cola, registros, lotesExistentes, ahoraISO, cfg } = params;
  const avisos: string[] = [];
  let registrosGuardados = 0;
  let stockActualizado = 0;
  const lotesCreados: Lote[] = [];
  let siguiente = lotesExistentes.reduce((m, l) => Math.max(m, l.id ?? 0), 0) + 1;

  for (const a of cola) {
    const filas = registros.filter((r) => r.archivo === a.nombre && r.hoja === a.hojaActiva);
    if (a.tipo === 'stock') {
      for (const r of filas) {
        if (!r.stockModelo) continue;
        await params.upsertStock({
          modelo: canonicoModelo(cfg, r.stockModelo),
          color: canonicoColor(cfg, r.stockColor ?? ''),
          inicial: r.stockInicial ?? '0',
          fechaISO: ahoraISO,
          origen: 'excel',
        });
        stockActualizado += 1;
      }
    }
    if (filas.length === 0) {
      avisos.push(`${a.nombre}: sin filas importadas.`);
      continue;
    }
    const lote: Lote = {
      id: siguiente++,
      hash: a.hash,
      archivo: a.nombre,
      tamano: a.tamano,
      modificado: a.modificado,
      fechaISO: ahoraISO,
      tipo: a.tipo as TipoArchivo,
      hojas: [a.hojaActiva],
      filasImportadas: filas.length,
      filasRevision: filas.filter((r) => r.estado === 'revision').length,
      filasError: filas.filter((r) => r.estado === 'error').length,
      duplicados: filas.filter((r) => r.duplicado).length,
      estado: 'confirmado',
      notas: [],
    };
    const creado = await params.guardarLote(lote);
    lotesCreados.push(creado);
    await params.guardarRegistros(creado.id!, filas.map((r) => ({ ...r, loteId: creado.id! })));
    registrosGuardados += filas.length;
  }

  return { lotesCreados, registrosGuardados, stockActualizado, avisos };
}
