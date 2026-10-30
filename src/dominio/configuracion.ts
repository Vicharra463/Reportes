// Configuración editable de TODO el sistema. Vive en localStorage (liviana).
// Cada modificación registra un CambioConfig para poder deshacer.

import type { MapeoColumnas } from '../tipos';
import {
  ALIAS_COLOR_SEMILLA,
  BONO_INCLUIDO_SEMILLA,
  COLORES_SEMILLA,
  EXCEPCIONES_SEMILLA,
  EXCEDENTES_CONFIRMADOS_SEMILLA,
  MODELOS_SEMILLA,
  PRECIOS_SEMILLA,
  REGEX_DSCTO_DEFECTO,
  REGEX_SEPARACION_DEFECTO,
  SINONIMOS_MODELO_SEMILLA,
  SKU_COLOR_SEMILLA,
  type ExcepcionPedido,
} from './catalogosSemilla';

export const CLAVE_CONFIG = 'tm_config_v1';
export const VERSION_CONFIG = 1;

export interface ModeloCat {
  nombre: string;
  marca: string;
  activo: boolean;
}
export interface ColorCat {
  nombre: string;
  activo: boolean;
}
export interface SinonimoCat {
  busqueda: string;
  tipo: 'modelo' | 'color';
  valor: string;
}
export interface PrecioCat {
  prefijo: string;
  precio: string; // decimal como string
  fuente: string;
}
export interface EstadoReservaCat {
  nombre: string;
  /** regla de derivación: 'pago-parcial' | 'pagada-100' | 'facturada' */
  regla: string;
  color: string;
}

export interface TcManual {
  /** 'YYYY-MM-DD' */
  fecha: string;
  /** soles por USD, decimal como string */
  tasa: string;
}

export interface Configuracion {
  version: number;
  moneda: string;
  simboloMoneda: string;
  igvPorcentaje: string;
  redondeo: { decimales: number; metodo: 'half-up' | 'half-even' };
  umbralConfianza: number;
  margenConflicto: number;
  prioridadFuentes: string[];
  prioridadColumnas: string[];
  regexDscto: string;
  regexSeparacion: string;
  formulaStock: string;
  duplicadosModo: 'avisar' | 'bloquear';
  catalogos: {
    modelos: ModeloCat[];
    colores: ColorCat[];
    sinonimos: SinonimoCat[];
    aliasColor: Record<string, string>;
    skuColor: Record<string, string>;
    precios: PrecioCat[];
    excepciones: ExcepcionPedido[];
    excedentesConfirmados: Record<string, string>;
    bonoIncluido: Record<string, number>;
    estadosReserva: EstadoReservaCat[];
  };
  mapeosPorTipo: Record<string, MapeoColumnas>;
  avisoCuotaMB: number;
  /** Tipo de cambio USD → soles: tabla manual por fecha + tasa por defecto. */
  tc: {
    defecto: string;
    manual: TcManual[];
  };
}

export const ESTADOS_RESERVA_SEMILLA: EstadoReservaCat[] = [
  { nombre: 'Pago parcial', regla: 'pago-parcial', color: '#E0A800' },
  { nombre: 'Pagada 100%', regla: 'pagada-100', color: '#1E8E3E' },
  { nombre: 'Facturada', regla: 'facturada', color: '#11003F' },
];

export function configPorDefecto(): Configuracion {
  return {
    version: VERSION_CONFIG,
    moneda: 'USD',
    simboloMoneda: '$',
    igvPorcentaje: '0',
    redondeo: { decimales: 2, metodo: 'half-up' },
    umbralConfianza: 0.75,
    margenConflicto: 0.1,
    prioridadFuentes: ['regla', 'columna-modelo', 'sku', 'join-pedidos', 'catalogo', 'sinonimo', 'fuzzy'],
    prioridadColumnas: [
      'Modelo',
      'Código (SKU)',
      'Código',
      'join:codigo',
      'join:descripcion',
      'Descripción',
      'glosa cabecera',
    ],
    regexDscto: REGEX_DSCTO_DEFECTO,
    regexSeparacion: REGEX_SEPARACION_DEFECTO,
    formulaStock: 'inicial - facturadas - reservas',
    duplicadosModo: 'avisar',
    catalogos: {
      modelos: MODELOS_SEMILLA.map((m) => ({ ...m, activo: true })),
      colores: COLORES_SEMILLA.map((c) => ({ nombre: c, activo: true })),
      sinonimos: SINONIMOS_MODELO_SEMILLA.map((s) => ({ ...s, tipo: 'modelo' as const })),
      aliasColor: { ...ALIAS_COLOR_SEMILLA },
      skuColor: { ...SKU_COLOR_SEMILLA },
      precios: PRECIOS_SEMILLA.map((p) => ({ ...p, precio: String(p.precio) })),
      excepciones: EXCEPCIONES_SEMILLA.map((e) => ({ ...e })),
      excedentesConfirmados: { ...EXCEDENTES_CONFIRMADOS_SEMILLA },
      bonoIncluido: { ...BONO_INCLUIDO_SEMILLA },
      estadosReserva: ESTADOS_RESERVA_SEMILLA.map((e) => ({ ...e })),
    },
    mapeosPorTipo: {
      ventas: {
        fecha: 'Fecha',
        documento: 'Documento',
        docReferencia: 'Doc. Referencia',
        pedido: 'N° Pedido',
        cliente: 'Cliente',
        categoria: 'Categorias',
        sku: 'Código (SKU)',
        descripcion: 'Descripción',
        glosa: 'glosa cabecera',
        vendedor: 'Vendedor',
        unidades: 'Unidades',
        modelo: 'Modelo',
        importeSoles: 'Importe Total s/.',
        importeUsd: 'Importe Total $',
        estado: 'Estado',
        lote: 'Lote',
      },
      pedidos: {
        fecha: 'Fecha',
        nroPedido: 'Nro Pedido',
        codigo: 'Código',
        descripcion: 'Descripción',
        vendedor: 'Vendedor',
        cantPedido: 'Cant. Pedido',
        puPedido: 'P.U. Pedido',
      },
      stock: {
        stockModelo: 'Modelo',
        stockColor: 'Color',
        stockInicial: 'Stock inicial',
        stockMarca: 'Marca',
      },
    },
    avisoCuotaMB: 4.5,
    tc: { defecto: '', manual: [] },
  };
}

export function cargarConfig(): Configuracion {
  try {
    const raw = localStorage.getItem(CLAVE_CONFIG);
    if (!raw) return configPorDefecto();
    const obj = JSON.parse(raw) as Partial<Configuracion>;
    return fusionarConfig(configPorDefecto(), obj);
  } catch {
    return configPorDefecto();
  }
}

/** Fusiona una config guardada (posiblemente de versión vieja) con los defaults. */
export function fusionarConfig(base: Configuracion, guardada: Partial<Configuracion>): Configuracion {
  const out: Configuracion = {
    ...base,
    ...guardada,
    version: VERSION_CONFIG,
    redondeo: { ...base.redondeo, ...(guardada.redondeo ?? {}) },
    catalogos: { ...base.catalogos, ...(guardada.catalogos ?? {}) },
    mapeosPorTipo: { ...base.mapeosPorTipo, ...(guardada.mapeosPorTipo ?? {}) },
    tc: { ...base.tc, ...(guardada.tc ?? {}), manual: guardada.tc?.manual ?? base.tc.manual },
  };
  return out;
}

export function guardarConfig(cfg: Configuracion): void {
  localStorage.setItem(CLAVE_CONFIG, JSON.stringify(cfg));
}
