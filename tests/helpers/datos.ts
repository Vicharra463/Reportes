// Utilidades para tests: registros sintéticos y carga de los Excel reales
// (se omiten si los archivos no están presentes).

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import type { Registro } from '../../src/tipos';
import { detectarFilaEncabezado, hojaARegistros } from '../../src/io/leerExcel';
import { configPorDefecto } from '../../src/dominio/configuracion';

// vitest corre con cwd = app/: los datos viven un nivel arriba
const dirDatos = path.resolve(process.cwd(), '..', 'datos');

export const RUTA_VENTAS = path.join(dirDatos, 'Analisis_Ventas2026_corte_26.10.xlsx');
export const RUTA_PEDIDOS = path.join(dirDatos, 'AnalisisPedido_27.10.xlsx');
export const hayVentas = fs.existsSync(RUTA_VENTAS);
export const hayPedidos = fs.existsSync(RUTA_PEDIDOS);

export function leerLibroFs(ruta: string): XLSX.WorkBook {
  return XLSX.read(fs.readFileSync(ruta), { cellDates: true });
}

export function registrosDeArchivo(ruta: string, tipo: 'ventas' | 'pedidos'): Registro[] {
  const libro = leerLibroFs(ruta);
  const hoja = libro.SheetNames[0];
  const ws = libro.Sheets[hoja];
  const matriz = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false }) as (
    string | number | boolean | null | undefined
  )[][];
  const det = detectarFilaEncabezado(matriz);
  const cfg = configPorDefecto();
  return hojaARegistros({
    libro,
    archivo: path.basename(ruta),
    hoja,
    filaEncabezado: det.fila,
    columnas: det.columnas,
    mapeo: cfg.mapeosPorTipo[tipo],
    loteId: 1,
    omitirSubtotales: tipo === 'ventas',
  });
}

export function mkReg(p: Partial<Registro>): Registro {
  return {
    loteId: 1,
    archivo: 'test.xlsx',
    hoja: 'Hoja1',
    fila: 1,
    celdas: {},
    tipo: 'otro',
    categoria: null,
    documento: null,
    docReferencia: null,
    pedido: null,
    cliente: null,
    sku: null,
    descripcion: null,
    glosa: null,
    vendedor: null,
    fechaISO: null,
    fechaValida: true,
    importeUsd: null,
    importeSoles: null,
    unidades: null,
    modeloColumna: null,
    lote: null,
    vin: null,
    documentoTipo: null,
    anulado: false,
    ncParcial: false,
    duplicado: false,
    clasifModelo: null,
    clasifColor: null,
    estado: 'clasificado',
    motivos: [],
    nroPedido: null,
    codigoPedido: null,
    cantPedido: null,
    puPedido: null,
    stockModelo: null,
    stockColor: null,
    stockInicial: null,
    ...p,
  };
}

export function approx(valor: string, esperado: number, tolerancia = 0.02): void {
  const v = Number(valor);
  if (!Number.isFinite(v) || Math.abs(v - esperado) > tolerancia) {
    throw new Error(`esperaba ≈${esperado} (±${tolerancia}) pero llegó ${valor}`);
  }
}
