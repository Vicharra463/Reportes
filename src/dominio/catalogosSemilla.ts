// Semillas de catálogos extraídas de los datos reales (Fase 1) y del motor de
// referencia (actualizar_dashboard.py). TODO es editable desde la app; esto es
// solo el estado inicial.

import type { TipoArchivo } from '../tipos';

export const MODELOS_SEMILLA: { nombre: string; marca: string }[] = [
  { nombre: 'CB TWISTER 300 ABS', marca: 'Honda' },
  { nombre: 'CB100', marca: 'Honda' },
  { nombre: 'CB125F TWISTER', marca: 'Honda' },
  { nombre: 'CB190R 2.0', marca: 'Honda' },
  { nombre: 'CB350DR', marca: 'Honda' },
  { nombre: 'CB350DS', marca: 'Honda' },
  { nombre: 'CB350DV', marca: 'Honda' },
  { nombre: 'CBF125Z', marca: 'Honda' },
  { nombre: 'CBR500RAN', marca: 'Honda' },
  { nombre: 'CL500AS', marca: 'Honda' },
  { nombre: 'CMX500A2S', marca: 'Honda' },
  { nombre: 'CRF1100AT', marca: 'Honda' },
  { nombre: 'CRF1100D4T', marca: 'Honda' },
  { nombre: 'CRF300LAT', marca: 'Honda' },
  { nombre: 'DIO', marca: 'Honda' },
  { nombre: 'ELITE 125', marca: 'Honda' },
  { nombre: 'GL125', marca: 'Honda' },
  { nombre: 'GL150', marca: 'Honda' },
  { nombre: 'MOTOKAR 150', marca: 'Honda' },
  { nombre: 'NAVI', marca: 'Honda' },
  { nombre: 'NX190', marca: 'Honda' },
  { nombre: 'NX500', marca: 'Honda' },
  { nombre: 'PCX160', marca: 'Honda' },
  { nombre: 'TRX420FA2T', marca: 'Honda' },
  { nombre: 'TRX420FM1S', marca: 'Honda' },
  { nombre: 'WAVE110S', marca: 'Honda' },
  { nombre: 'X-BLADE', marca: 'Honda' },
  { nombre: 'XL750 TRANSALP', marca: 'Honda' },
  { nombre: 'XR150L', marca: 'Honda' },
  { nombre: 'XR190CT', marca: 'Honda' },
  { nombre: 'XR190L', marca: 'Honda' },
  { nombre: 'XR300L', marca: 'Honda' },
  { nombre: 'XRE300', marca: 'Honda' },
];

/** Los 85 SKUs reales del archivo de pedidos → modelo canónico. */
export const SKU_A_MODELO: Record<string, string> = {
  'CB TWISTER 300-AZU': 'CB TWISTER 300 ABS',
  'CB TWISTER 300-GRI': 'CB TWISTER 300 ABS',
  'CB TWISTER 300-ROJ': 'CB TWISTER 300 ABS',
  'CB100-AZU2': 'CB100',
  'CB100-GRI2': 'CB100',
  'CB100-ROJ': 'CB100',
  'CB100-ROJ2': 'CB100',
  'CB125FT DLX-GRI_CB': 'CB125F TWISTER',
  'CB125FT DLX-ROJ_CB': 'CB125F TWISTER',
  'CB125FT-AZ': 'CB125F TWISTER',
  'CB125FT-NEG_CB V2': 'CB125F TWISTER',
  'CB125FT-NEG_SB V2': 'CB125F TWISTER',
  'CB190R 2.0-NEGBRI2': 'CB190R 2.0',
  'CB190R 2.0-ROJ-2': 'CB190R 2.0',
  'CB350DR-VER': 'CB350DR',
  'CB350DS-GRI': 'CB350DS',
  'CB350DS-ROJ': 'CB350DS',
  'CB350DS-VER': 'CB350DS',
  'CB350DV-GRIPER': 'CB350DV',
  'CB350DV-NEG': 'CB350DV',
  'CB350DV-ROJ': 'CB350DV',
  'CBF125Z-AMA': 'CBF125Z',
  'CBF125Z-AZU': 'CBF125Z',
  'CBF125Z-NEG': 'CBF125Z',
  'CBF125Z-ROJ': 'CBF125Z',
  'CBR500RAN-ROJ': 'CBR500RAN',
  'CL500AS-MAR': 'CL500AS',
  'CL500AS-NEG': 'CL500AS',
  'CMX500A2S-ANA': 'CMX500A2S',
  'CMX500A2S-NEG': 'CMX500A2S',
  'CRF1100AT-BLA': 'CRF1100AT',
  'CRF1100D4T-BLA': 'CRF1100D4T',
  'CRF300LAT-ROJ': 'CRF300LAT',
  'CRF300LRAP-ROJ': 'CRF300LAT',
  'DIO-GRIMET_CB_CP': 'DIO',
  'DIO-ROJ_CB_CP': 'DIO',
  'DIO-RO_CB': 'DIO',
  'ELITE 125-AZU': 'ELITE 125',
  'ELITE 125-AZU2': 'ELITE 125',
  'ELITE 125-GRIMET': 'ELITE 125',
  'ELITE 125-GRIPER2': 'ELITE 125',
  'ELITE 125-NEG2': 'ELITE 125',
  'GL125 E3-NE_CB': 'GL125',
  'GL125 E3-RO_CB': 'GL125',
  'NAVI-ANA_CB_CP V2': 'NAVI',
  'NAVI-BLA_CB_CP V2': 'NAVI',
  'NAVI-BLA_SB_CP V2': 'NAVI',
  'NAVI-NEG_CB_CP V2': 'NAVI',
  'NAVI-ROJ_CB_CP V2': 'NAVI',
  'NAVI-ROS_CB_CP V2': 'NAVI',
  'NAVI-ROS_CB_SP V2': 'NAVI',
  'NAVI-VER_CB_CP V2': 'NAVI',
  'NX190-NEG-2': 'NX190',
  'NX190-ROJ-2': 'NX190',
  'NX500-BLA2LA': 'NX500',
  'NX500-NEG': 'NX500',
  'NX500-NEG2LA': 'NX500',
  'NX500-NEGLA': 'NX500',
  'NX500-ROJ': 'NX500',
  'PCX160A ABS-BLA': 'PCX160',
  'PCX160A ABS-GRI': 'PCX160',
  'WAVE110S CD-BLA V2': 'WAVE110S',
  'WAVE110S CD-GRI V2': 'WAVE110S',
  'WAVE110S CD-ROJ V2': 'WAVE110S',
  'XBLADE-GRIPER_CB2': 'X-BLADE',
  'XBLADE-GRI_CB2': 'X-BLADE',
  'XBLADE-NEG_CB': 'X-BLADE',
  'XBLADE-ROJ_CB2': 'X-BLADE',
  'XL750 TRANSALP_BLA': 'XL750 TRANSALP',
  'XL750 TRANSALP_GRI': 'XL750 TRANSALP',
  'XL750 TRANSALP_NEG': 'XL750 TRANSALP',
  'XL750CT-BLA': 'XL750 TRANSALP',
  'XL750T-GRI': 'XL750 TRANSALP',
  'XL750T-NEG': 'XL750 TRANSALP',
  'XR150L-BLA_CB V4': 'XR150L',
  'XR150L-NEG_CB V4': 'XR150L',
  'XR150L-ROJ_CB V4': 'XR150L',
  'XR190CT-BEI_CB': 'XR190CT',
  'XR190CT-ROJ_CB': 'XR190CT',
  'XR190L RO_CB': 'XR190L',
  'XR190L-BEI_CB V5': 'XR190L',
  'XR190L-BLA_CB V5': 'XR190L',
  'XR190L-ROJ_CB V5': 'XR190L',
  'XR300L TORNADO-ROJ': 'XR300L',
  'XRE300 SAHARA-GRMET': 'XRE300',
};

/** Colores en orden de búsqueda (compuestos primero). El primero que matchea gana. */
export const COLORES_SEMILLA = [
  'NEGRO BRILLANTE',
  'NEGRO METÁLICO',
  'NEGRO METALICO',
  'GRIS PERLADO',
  'GRIS METÁLICO',
  'GRIS METALICO',
  'BLANCO',
  'BLANCA',
  'ROJO',
  'ROJA',
  'AZUL',
  'ANARANJADO',
  'NARANJA',
  'ROSADO',
  'FUCSIA',
  'VERDE',
  'GRIS',
  'NEGRO',
  'NEGRA',
  'BEIGE',
  'AMARILLO',
  'AMARILLA',
  'MARRÓN',
  'MARRON',
  'PLATA',
  'TURQUESA',
];

/** Alias de color: cómo se escribe → nombre canónico del catálogo. */
export const ALIAS_COLOR_SEMILLA: Record<string, string> = {
  ROJA: 'Rojo',
  NARANJA: 'Anaranjado',
  FUCSIA: 'Rosado',
  MARRON: 'Marrón',
  BLANCA: 'Blanco',
  NEGRA: 'Negro',
  AMARILLA: 'Amarillo',
  'NEGRO METALICO': 'Negro Metálico',
  'GRIS METALICO': 'Gris Metálico',
};

/** Sufijos de color codificados en el SKU (cuando no hay descripción). */
export const SKU_COLOR_SEMILLA: Record<string, string> = {
  NEGBRI: 'Negro Brillante',
  GRIMET: 'Gris Metálico',
  GRIPER: 'Gris Perlado',
  GRIPER2: 'Gris Perlado',
  GRIMET2: 'Gris Metálico',
  AZU: 'Azul',
  AZ: 'Azul',
  GRI: 'Gris',
  ROJ: 'Rojo',
  RO: 'Rojo',
  NEG: 'Negro',
  BLA: 'Blanco',
  VER: 'Verde',
  BEI: 'Beige',
  ANA: 'Anaranjado',
  MAR: 'Marrón',
  ROS: 'Rosado',
  AMA: 'Amarillo',
};

/** Sinónimos/abreviaturas: texto contenido → valor del catálogo (orden: más largo primero). */
export const SINONIMOS_MODELO_SEMILLA = [
  { busqueda: 'cb125 hornet', valor: 'CBF125Z' },
  { busqueda: 'hornet', valor: 'CBF125Z' },
  { busqueda: 'cb300 twister', valor: 'CB TWISTER 300 ABS' },
  { busqueda: 'cb twister 300', valor: 'CB TWISTER 300 ABS' },
  { busqueda: 'transalp 750', valor: 'XL750 TRANSALP' },
  { busqueda: 'transalp', valor: 'XL750 TRANSALP' },
  { busqueda: 'africa twin', valor: 'CRF1100AT' },
  { busqueda: 'crf300l rap', valor: 'CRF300LAT' },
  { busqueda: 'crf300l', valor: 'CRF300LAT' },
  { busqueda: 'x blade', valor: 'X-BLADE' },
  { busqueda: 'xblade', valor: 'X-BLADE' },
  { busqueda: 'pcx 160', valor: 'PCX160' },
  { busqueda: 'pcx160a', valor: 'PCX160' },
  { busqueda: 'wave 110', valor: 'WAVE110S' },
  { busqueda: 'wave110s', valor: 'WAVE110S' },
  { busqueda: 'wave', valor: 'WAVE110S' },
  { busqueda: 'gl 125', valor: 'GL125' },
  { busqueda: 'gl125e3', valor: 'GL125' },
  { busqueda: 'gl125', valor: 'GL125' },
  { busqueda: 'dio 110', valor: 'DIO' },
  { busqueda: 'elite', valor: 'ELITE 125' },
  { busqueda: 'nx 500', valor: 'NX500' },
  { busqueda: 'nx 190', valor: 'NX190' },
  { busqueda: 'xr 190l', valor: 'XR190L' },
  { busqueda: 'xr 150l', valor: 'XR150L' },
  { busqueda: 'xr190 ct', valor: 'XR190CT' },
  { busqueda: 'xr 300', valor: 'XR300L' },
  { busqueda: 'cb190r 2.0', valor: 'CB190R 2.0' },
  { busqueda: 'cb190r', valor: 'CB190R 2.0' },
  { busqueda: 'cb350 hness', valor: 'CB350DV' },
  { busqueda: 'hness', valor: 'CB350DV' },
  { busqueda: 'xre 300', valor: 'XRE300' },
  { busqueda: 'xr300 tornado', valor: 'XR300L' },
  { busqueda: 'cb125f twister', valor: 'CB125F TWISTER' },
  { busqueda: 'cb125 twister', valor: 'CB125F TWISTER' },
  { busqueda: 'cb125f', valor: 'CB125F TWISTER' },
  { busqueda: 'crf300l rap', valor: 'CRF300LAT' },
  { busqueda: 'navi pack', valor: 'NAVI' },
  { busqueda: 'motokar', valor: 'MOTOKAR 150' },
];

/** Precios: coincidencia por PREFIJO del SKU (el primero que coincide gana). */
export const PRECIOS_SEMILLA: { prefijo: string; precio: number; fuente: string }[] = [
  { prefijo: 'CB TWISTER 300', precio: 4390, fuente: 'Lista Oct-26' },
  { prefijo: 'CB190R', precio: 2949, fuente: 'Lista Oct-26' },
  { prefijo: 'NAVI', precio: 1549, fuente: 'Lista Oct-26' },
  { prefijo: 'XL750 TRANSALP_BLA', precio: 13290, fuente: 'Lista Oct-26' },
  { prefijo: 'XL750CT-BLA', precio: 13290, fuente: 'Lista Oct-26' },
  { prefijo: 'XL750', precio: 12790, fuente: 'Lista Oct-26' },
  { prefijo: 'ELITE 125', precio: 2269, fuente: 'Lista Oct-26' },
  { prefijo: 'PCX160', precio: 3950, fuente: 'Lista Oct-26' },
  { prefijo: 'NX500', precio: 8990, fuente: 'Lista Oct-26' },
  { prefijo: 'CRF1100AT', precio: 19500, fuente: 'Lista Oct-26' },
  { prefijo: 'CRF300LAT', precio: 6990, fuente: 'Lista Oct-26' },
  { prefijo: 'CRF300LRAP', precio: 6990, fuente: 'Lista Oct-26' },
  { prefijo: 'XBLADE', precio: 2485, fuente: 'Lista Oct-26' },
  { prefijo: 'CBF125Z', precio: 2299, fuente: 'Lista Oct-26' },
  { prefijo: 'CB350DV', precio: 4190, fuente: 'Lista Oct-26' },
  { prefijo: 'XR190L', precio: 3272, fuente: 'Lista Oct-26' },
  { prefijo: 'DIO', precio: 1670, fuente: 'Lista Oct-26' },
  { prefijo: 'NX190', precio: 3850, fuente: 'Lista Oct-26' },
  { prefijo: 'XR150L', precio: 2674, fuente: 'Lista Oct-26' },
  { prefijo: 'CB100', precio: 1199, fuente: 'Lista Oct-26' },
  { prefijo: 'GL125', precio: 1794, fuente: 'Lista Oct-26' },
  { prefijo: 'WAVE', precio: 1759, fuente: 'Lista Oct-26' },
  { prefijo: 'XR190CT', precio: 4114, fuente: 'Lista Oct-26' },
  { prefijo: 'CB125FT', precio: 1824, fuente: 'Lista Oct-26 (PDF)' },
  { prefijo: 'TRX420FA', precio: 10599, fuente: 'Lista Oct-26 (PDF)' },
  { prefijo: 'TRX420FM', precio: 8999, fuente: 'Lista Oct-26 (PDF)' },
  { prefijo: 'CRF1100D4T', precio: 25090, fuente: 'Lista Finanzas' },
  { prefijo: 'CBR500RAN', precio: 11000, fuente: 'Precio aprox. (Finanzas)' },
];

/** Excepciones por N° de pedido confirmadas por Finanzas (editables). */
export interface ExcepcionPedido {
  pedido: number;
  precio?: number;
  dsctoPorMoto?: number;
  dsctoIgualASaldo?: boolean;
  detalle: string;
}

export const EXCEPCIONES_SEMILLA: ExcepcionPedido[] = [
  {
    pedido: 35152,
    precio: 13290,
    dsctoPorMoto: 500,
    detalle: 'Transalp E-Clutch, venta a empresa: dscto $500 por moto (3 motos)',
  },
  { pedido: 40391, dsctoIgualASaldo: true, detalle: 'Descuento confirmado por Finanzas' },
];

/** Cobros mayores al precio ya revisados por Finanzas. */
export const EXCEDENTES_CONFIRMADOS_SEMILLA: Record<number, string> = {
  40381: 'Incluye Pack Navi S/850',
  40275: 'Incluye adicional por comisión de financiera',
};

/** El bono de $200 de la CB190R 2.0 ya está en el precio de lista: no se resta. */
export const BONO_INCLUIDO_SEMILLA: Record<string, number> = {
  'CB190R 2.0': 200,
};

/** Regex de descuento de glosa = comportamiento del motor de referencia (editable). */
export const REGEX_DSCTO_DEFECTO =
  '(?:DSCTO?|DSTO|DESCUENTO|BONO)\\s*\\$\\s*\\.?\\s*([\\d,]+(?:\\.\\d+)?)|\\$\\s*([\\d,]+(?:\\.\\d+)?)\\s*(?:DSCTO?|DSTO|DESCUENTO|DCTO)';

/** Regla "SEPARACIÓN DE N" → cantidad de motos en la reserva. */
export const REGEX_SEPARACION_DEFECTO = 'SEPARACI[OÓ]N DE (\\d+)';

/** Alias de encabezado → rol de columna (para detectar el mapeo automáticamente). */
export const ALIASES_COLUMNA: Record<string, string[]> = {
  fecha: ['fecha', 'fecha pedido', 'fecha documento', 'fecha comprobante'],
  documento: ['documento', 'nro documento', 'comprobante'],
  docReferencia: ['doc. referencia', 'doc referencia', 'documento referencia', 'referencia'],
  tipoDocIdentidad: ['tipo doc. identidad', 'tipo doc identidad', 'tipo documento identidad'],
  pedido: ['n° pedido', 'nro pedido', 'n°. pedido', 'nro. pedido', 'pedido', 'nº pedido'],
  cliente: ['cliente', 'nombre cliente', 'razon social'],
  categoria: ['categorias', 'categoria', 'categoría'],
  sku: ['codigo (sku)', 'codigo sku', 'código (sku)', 'sku', 'codigo', 'código'],
  descripcion: ['descripcion', 'descripción', 'desc'],
  glosa: ['glosa cabecera', 'glosa', 'observacion', 'observación'],
  vendedor: ['vendedor', 'asesor'],
  unidades: ['unidades', 'cant', 'cantidad', 'uds'],
  modelo: ['modelo'],
  importeSoles: ['importe total s/.', 'importe total soles', 'importe s/.', 'importe soles'],
  importeUsd: ['importe total $', 'importe total usd', 'importe $', 'importe usd', 'total $'],
  estado: ['estado'],
  lote: ['lote', 'vin', 'serie'],
  nroPedido: ['nro pedido', 'n° pedido', 'nro. pedido', 'pedido'],
  codigo: ['codigo', 'código'],
  cantPedido: ['cant. pedido', 'cant pedido', 'cantidad', 'cant'],
  puPedido: ['p.u. pedido', 'pu pedido', 'precio unitario', 'p. u. pedido'],
  stockModelo: ['modelo', 'moto'],
  stockColor: ['color'],
  stockInicial: ['stock inicial', 'inicial', 'stock', 'unidades iniciales'],
  stockMarca: ['marca'],
};

/** Detección de tipo de archivo por los encabezados presentes. */
export function detectarTipoArchivo(columnas: string[]): TipoArchivo {
  const norm = columnas.map((c) => c.trim().toLowerCase());
  const tiene = (alias: string[]) => alias.some((a) => norm.includes(a));
  if (tiene(ALIASES_COLUMNA.categoria) && tiene(ALIASES_COLUMNA.documento)) return 'ventas';
  if (tiene(['cant. pedido', 'p.u. pedido']) || (tiene(['nro pedido']) && tiene(['codigo']))) return 'pedidos';
  if (tiene(['stock inicial']) || (tiene(['color']) && tiene(['modelo']) && !tiene(['documento']))) return 'stock';
  if (tiene(ALIASES_COLUMNA.categoria)) return 'ventas';
  return 'desconocido';
}

/** Roles que aplican a cada tipo de archivo (evita que "N° Pedido" de ventas
 *  se mapee como columna de pedidos y rompa el join). */
const ROLES_POR_TIPO: Record<TipoArchivo, string[]> = {
  ventas: [
    'fecha', 'documento', 'docReferencia', 'tipoDocIdentidad', 'pedido', 'cliente', 'categoria',
    'sku', 'descripcion', 'glosa', 'vendedor', 'unidades', 'modelo', 'importeSoles', 'importeUsd', 'estado', 'lote',
  ],
  pedidos: ['fecha', 'nroPedido', 'codigo', 'descripcion', 'vendedor', 'cantPedido', 'puPedido'],
  stock: ['stockModelo', 'stockColor', 'stockInicial', 'stockMarca'],
  desconocido: [],
};

/** Encabezado (ya normalizado) → rol, filtrado por tipo de archivo. */
export function detectarMapeo(columnas: string[], tipo?: TipoArchivo): Record<string, string> {
  const permitidos = new Set(
    tipo && tipo !== 'desconocido' ? ROLES_POR_TIPO[tipo] : Object.keys(ALIASES_COLUMNA),
  );
  const mapeo: Record<string, string> = {};
  const normCols = columnas.map((c) => c.trim().toLowerCase());
  for (const [rol, alias] of Object.entries(ALIASES_COLUMNA)) {
    if (!permitidos.has(rol)) continue;
    for (let i = 0; i < normCols.length; i++) {
      if (alias.includes(normCols[i])) {
        mapeo[rol] = columnas[i];
        break;
      }
    }
  }
  return mapeo;
}
