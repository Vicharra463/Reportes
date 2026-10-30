// Lectura de Excel/CSV con SheetJS: detección de fila de encabezados, mapeo de
// columnas editable, celdas combinadas (valor propagado desde la primera fila)
// y conversión a Registros. NO modifica ni envía los archivos originales.

import * as XLSX from 'xlsx';
import type { ArchivoEnCola, FilaLeida, HojaInfo, MapeoColumnas, Registro, TipoArchivo } from '../tipos';
import { detectarMapeo, detectarTipoArchivo } from '../dominio/catalogosSemilla';
import { parseFecha, parseNumero } from '../dominio/normalizar';
import { hashArchivo } from './hash';

export interface LibroLeido {
  libro: XLSX.WorkBook;
  hojas: HojaInfo[];
}

const cacheLibros = new WeakMap<File, XLSX.WorkBook>();

/** Devuelve el libro ya parseado (caché por File) sin releer el disco. */
export function obtenerLibro(file: File): XLSX.WorkBook | null {
  return cacheLibros.get(file) ?? null;
}

export async function leerLibro(file: File): Promise<LibroLeido> {
  const enCache = cacheLibros.get(file);
  if (enCache) return { libro: enCache, hojas: hojasDe(enCache) };
  const buf = await aArrayBuffer(file);
  const libro = XLSX.read(buf, { cellDates: true, cellStyles: false, cellNF: false, cellHTML: false });
  cacheLibros.set(file, libro);
  return { libro, hojas: hojasDe(libro) };
}

/** ArrayBuffer del File con fallback FileReader (jsdom/entornos viejos sin blob.arrayBuffer). */
export async function aArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof (file as Blob).arrayBuffer === 'function') return (file as Blob).arrayBuffer();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error ?? new Error('No se pudo leer el archivo'));
    fr.readAsArrayBuffer(file);
  });
}

function hojasDe(libro: XLSX.WorkBook): HojaInfo[] {
  return libro.SheetNames.map((nombre) => {
    const ws = libro.Sheets[nombre];
    const ref = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
    return {
      nombre,
      filas: ref ? ref.e.r - ref.s.r + 1 : 0,
      columnas: ref ? ref.e.c - ref.s.c + 1 : 0,
    };
  });
}

function hojaAMatriz(ws: XLSX.WorkSheet): (string | number | boolean | null | undefined)[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false }) as (
    string | number | boolean | null | undefined
  )[][];
}

/** Encuentra la fila de encabezados: la fila con más celdas de texto no vacías
 *  (los Excel del sistema traen una fila de título tipo "Grand Total" antes). */
export function detectarFilaEncabezado(matriz: (string | number | boolean | null | undefined)[][]): {
  fila: number;
  columnas: string[];
} {
  let mejorFila = 0;
  let mejorScore = -1;
  let mejorCols: string[] = [];
  const limite = Math.min(matriz.length, 12);
  for (let i = 0; i < limite; i++) {
    const fila = matriz[i] ?? [];
    const textos = fila.filter((v) => typeof v === 'string' && v.trim() !== '');
    const score = textos.length;
    if (score > mejorScore) {
      mejorScore = score;
      mejorFila = i;
      mejorCols = fila.map((v) => (v === null || v === undefined ? '' : String(v).trim()));
    }
  }
  // descartar columnas vacías del final
  while (mejorCols.length && mejorCols[mejorCols.length - 1] === '') mejorCols.pop();
  return { fila: mejorFila, columnas: mejorCols };
}

/** Propaga el valor de celdas combinadas (solo primera fila del rango tiene valor). */
function expandirCombinadas(ws: XLSX.WorkSheet, matriz: (string | number | boolean | null | undefined)[][]): void {
  const merges = (ws['!merges'] ?? []) as XLSX.Range[];
  for (const r of merges) {
    const v = matriz[r.s.r]?.[r.s.c];
    if (v === null || v === undefined || v === '') continue;
    for (let rr = r.s.r; rr <= Math.min(r.e.r, matriz.length - 1); rr++) {
      const fila = matriz[rr];
      if (!fila) continue;
      for (let cc = r.s.c; cc <= r.e.c; cc++) {
        if (fila[cc] === null || fila[cc] === undefined || fila[cc] === '') fila[cc] = v;
      }
    }
  }
}

export function tipoDeArchivo(columnas: string[]): TipoArchivo {
  return detectarTipoArchivo(columnas);
}

export function mapeoSugerido(columnas: string[], tipo: TipoArchivo): MapeoColumnas {
  return detectarMapeo(columnas, tipo) as MapeoColumnas;
}

/** Extrae las primeras filas reales para la previsualización. */
export function primerasFilas(libro: XLSX.WorkBook, hoja: string, filaEncabezado: number, n = 8): FilaLeida[] {
  const ws = libro.Sheets[hoja];
  if (!ws) return [];
  const matriz = hojaAMatriz(ws);
  expandirCombinadas(ws, matriz);
  const columnas = (matriz[filaEncabezado] ?? []).map((v) => (v === null || v === undefined ? '' : String(v).trim()));
  const out: FilaLeida[] = [];
  for (let i = filaEncabezado + 1; i < Math.min(matriz.length, filaEncabezado + 1 + n); i++) {
    const celdas: Record<string, string | number | boolean | null> = {};
    let hayValor = false;
    for (let c = 0; c < columnas.length; c++) {
      if (!columnas[c]) continue;
      const v = matriz[i]?.[c];
      const val = v === undefined ? null : (v as string | number | boolean | null);
      celdas[columnas[c]] = val;
      if (val !== null && val !== '') hayValor = true;
    }
    if (hayValor) out.push({ archivo: '', hoja, fila: i + 1, celdas });
  }
  return out;
}

/** Convierte una fila de la matriz en Registro (campos por mapeo + celdas crudas). */
export function filaARegistro(params: {
  celdas: Record<string, string | number | boolean | null>;
  archivo: string;
  hoja: string;
  fila: number;
  loteId: number;
  mapeo: MapeoColumnas;
}): Registro {
  const { celdas, archivo, hoja, fila, loteId, mapeo } = params;
  const get = (rol: keyof MapeoColumnas): string | number | boolean | null => {
    const col = mapeo[rol];
    return col ? (celdas[col] ?? null) : null;
  };
  const str = (rol: keyof MapeoColumnas): string | null => {
    const v = get(rol);
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };
  const num = (rol: keyof MapeoColumnas): number | null => {
    const v = get(rol);
    if (v === null || v === undefined || v === '') return null;
    const n = parseNumero(v);
    return n;
  };

  const fechaRaw = get('fecha');
  const fecha = parseFecha(fechaRaw);
  const documento = str('documento');
  const docRef = str('docReferencia');
  const categoria = str('categoria');
  const sku = str('sku') ?? str('codigo');
  const nroPedidoRaw = get('nroPedido') ?? get('pedido');
  const nroPedido = nroPedidoRaw === null || nroPedidoRaw === undefined || nroPedidoRaw === '' ? null : Math.trunc(Number(parseNumero(nroPedidoRaw) ?? NaN));
  const pedidoVal = get('pedido');
  const pedido =
    pedidoVal === null || pedidoVal === undefined || pedidoVal === '' ? null : Math.trunc(Number(parseNumero(pedidoVal) ?? NaN));
  const lote = str('lote');
  const vin = lote ? (/SERIE:([^|]+)/.exec(lote)?.[1]?.trim() ?? null) : null;
  const importeNum = num('importeUsd');

  let tipoDoc: Registro['documentoTipo'] = 'OTRO';
  if (documento) {
    const p = documento.slice(0, 2).toUpperCase();
    if (p === 'BV' || p === 'FT' || p === 'NC' || p === 'ND') tipoDoc = p;
  }

  const esPedidos = mapeo.nroPedido !== undefined || mapeo.codigo !== undefined;
  const esStock = mapeo.stockModelo !== undefined;

  let tipo: Registro['tipo'] = 'otro';
  if (categoria === 'ANTICIPOS') tipo = 'anticipo';
  else if (categoria === 'VEHICULOS') tipo = 'facturacion';

  const registro: Registro = {
    loteId,
    archivo,
    hoja,
    fila,
    celdas,
    tipo,
    categoria,
    documento,
    docReferencia: docRef,
    pedido: Number.isFinite(pedido!) ? pedido : null,
    cliente: str('cliente'),
    sku,
    descripcion: str('descripcion'),
    glosa: str('glosa'),
    vendedor: str('vendedor'),
    fechaISO: fecha.iso,
    fechaValida: fechaRaw === null || fechaRaw === undefined || fechaRaw === '' ? true : fecha.valida,
    importeUsd: importeNum === null ? null : importeNum.toFixed(2),
    importeSoles: (() => {
      const n = num('importeSoles');
      return n === null ? null : String(n);
    })(),
    unidades: (() => {
      const n = num('unidades');
      if (n !== null) return n;
      const v = get('unidades');
      if (v !== null && v !== undefined && String(v).trim() !== '') return NaN; // texto en numérica
      return null;
    })(),
    modeloColumna: str('modelo'),
    lote,
    vin,
    documentoTipo: tipoDoc,
    anulado: false,
    ncParcial: false,
    duplicado: false,
    clasifModelo: null,
    clasifColor: null,
    estado: 'clasificado',
    motivos: [],
    nroPedido: esPedidos && Number.isFinite(nroPedido!) ? nroPedido : null,
    codigoPedido: esPedidos ? str('codigo') : null,
    cantPedido: esPedidos ? num('cantPedido') : null,
    puPedido: esPedidos
      ? (() => {
          const n = num('puPedido');
          return n === null ? null : String(n);
        })()
      : null,
    stockModelo: esStock ? str('stockModelo') : null,
    stockColor: esStock ? str('stockColor') : null,
    stockInicial: esStock
      ? (() => {
          const n = num('stockInicial');
          return n === null ? null : String(n);
        })()
      : null,
  };

  if (registro.pedido === null && nroPedido !== null && Number.isFinite(nroPedido)) {
    registro.pedido = nroPedido;
  }
  if (esPedidos && registro.sku === null) registro.sku = registro.codigoPedido;

  return registro;
}

/** Lee todas las filas de una hoja como registros (excluye fila de encabezado y filas vacías). */
export function hojaARegistros(params: {
  libro: XLSX.WorkBook;
  archivo: string;
  hoja: string;
  filaEncabezado: number;
  columnas: string[];
  mapeo: MapeoColumnas;
  loteId: number;
  omitirSubtotales: boolean;
}): Registro[] {
  const ws = params.libro.Sheets[params.hoja];
  if (!ws) return [];
  const matriz = hojaAMatriz(ws);
  expandirCombinadas(ws, matriz);
  const registros: Registro[] = [];
  const primeraCol = params.columnas[0] ?? '';
  for (let i = params.filaEncabezado + 1; i < matriz.length; i++) {
    const fila = matriz[i];
    if (!fila) continue;
    const celdas: Record<string, string | number | boolean | null> = {};
    let hayValor = false;
    for (let c = 0; c < params.columnas.length; c++) {
      const nombre = params.columnas[c];
      if (!nombre) continue;
      const v = fila[c];
      const val = v === undefined ? null : (v as string | number | boolean | null);
      celdas[nombre] = val;
      if (val !== null && val !== '') hayValor = true;
    }
    if (!hayValor) continue;
    // subtotales de tabla dinámica: la primera columna dice "… Total"
    if (params.omitirSubtotales && primeraCol) {
      const v0 = fila[0];
      if (typeof v0 === 'string' && /total/i.test(v0)) continue;
    }
    registros.push(
      filaARegistro({
        celdas,
        archivo: params.archivo,
        hoja: params.hoja,
        fila: i + 1,
        loteId: params.loteId,
        mapeo: params.mapeo,
      }),
    );
  }
  return registros;
}

/** Arma un ArchivoEnCola a partir de un File recién elegido. */
export async function prepararArchivo(file: File, id: string): Promise<ArchivoEnCola> {
  const { libro, hojas } = await leerLibro(file);
  const hash = await hashArchivo(file);
  const hojaActiva = hojas[0]?.nombre ?? '';
  let columnas: string[] = [];
  let filaEncabezado = 0;
  if (hojaActiva) {
    const ws = libro.Sheets[hojaActiva];
    const matriz = hojaAMatriz(ws);
    const det = detectarFilaEncabezado(matriz);
    filaEncabezado = det.fila;
    columnas = det.columnas;
  }
  const tipo = detectarTipoArchivo(columnas);
  return {
    id,
    nombre: file.name,
    tamano: file.size,
    modificado: file.lastModified,
    hash,
    hashCalculado: hash.length > 0,
    tipo,
    hojas: hojas.map((h) => ({ ...h })),
    hojaActiva,
    filaEncabezado,
    columnas,
    mapeo: mapeoSugerido(columnas, tipo),
    duplicadoDeLote: false,
    file,
  };
}

/** Recalcula encabezados/mapeo al cambiar de hoja. */
export function refrescarHoja(archivo: ArchivoEnCola, libro: XLSX.WorkBook): Partial<ArchivoEnCola> {
  const ws = libro.Sheets[archivo.hojaActiva];
  if (!ws) return {};
  const matriz = hojaAMatriz(ws);
  const det = detectarFilaEncabezado(matriz);
  const tipo = detectarTipoArchivo(det.columnas);
  return {
    filaEncabezado: det.fila,
    columnas: det.columnas,
    tipo,
    mapeo: mapeoSugerido(det.columnas, tipo),
  };
}
