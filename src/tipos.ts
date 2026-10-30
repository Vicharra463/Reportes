// Tipos centrales de la aplicación. Todo el dominio habla estos tipos.

export type TipoArchivo = 'ventas' | 'pedidos' | 'stock' | 'desconocido';

export type EstadoRegistro = 'clasificado' | 'revision' | 'error';

export type TipoMovimiento = 'anticipo' | 'facturacion' | 'otro';

/** Rol lógico de una columna de los Excel de entrada. Editable por el usuario. */
export interface MapeoColumnas {
  fecha?: string;
  documento?: string;
  docReferencia?: string;
  tipoDocIdentidad?: string;
  pedido?: string;
  cliente?: string;
  categoria?: string;
  sku?: string;
  descripcion?: string;
  glosa?: string;
  vendedor?: string;
  unidades?: string;
  modelo?: string;
  importeSoles?: string;
  importeUsd?: string;
  estado?: string;
  lote?: string;
  // específicos del archivo de pedidos
  nroPedido?: string;
  codigo?: string;
  cantPedido?: string;
  puPedido?: string;
  // específicos del archivo de stock
  stockModelo?: string;
  stockColor?: string;
  stockInicial?: string;
  stockMarca?: string;
}

export interface HojaInfo {
  nombre: string;
  filas: number;
  columnas: number;
}

export interface ArchivoEnCola {
  id: string;
  nombre: string;
  tamano: number;
  modificado: number;
  hash: string;
  hashCalculado: boolean;
  tipo: TipoArchivo;
  hojas: HojaInfo[];
  hojaActiva: string;
  filaEncabezado: number;
  columnas: string[];
  mapeo: MapeoColumnas;
  duplicadoDeLote: boolean;
  file: File;
}

export interface FilaLeida {
  archivo: string;
  hoja: string;
  fila: number;
  celdas: Record<string, string | number | boolean | null>;
}

/** Clasificación de un registro: qué se asignó, dónde y con qué confianza. */
export interface Clasificacion {
  valor: string | null;
  tipo: 'modelo' | 'color';
  columna: string | null;
  textoMatch: string | null;
  confianza: number; // 0..1
  fuente: string; // 'columna-modelo' | 'sku' | 'catalogo' | 'sinonimo' | 'fuzzy' | 'regla' | 'join-pedidos'
}

export interface Registro {
  id?: number;
  loteId: number;
  archivo: string;
  hoja: string;
  fila: number;
  /** Todas las celdas crudas de la fila (header → valor) para trazabilidad y búsqueda. */
  celdas: Record<string, string | number | boolean | null>;
  tipo: TipoMovimiento;
  categoria: string | null;
  documento: string | null;
  docReferencia: string | null;
  pedido: number | null;
  cliente: string | null;
  sku: string | null;
  descripcion: string | null;
  glosa: string | null;
  vendedor: string | null;
  fechaISO: string | null;
  fechaValida: boolean;
  importeUsd: string | null; // decimal como string
  importeSoles: string | null;
  unidades: number | null;
  modeloColumna: string | null;
  lote: string | null;
  vin: string | null;
  documentoTipo: 'BV' | 'FT' | 'NC' | 'ND' | 'OTRO' | null;
  anulado: boolean;
  ncParcial: boolean;
  duplicado: boolean;
  clasifModelo: Clasificacion | null;
  clasifColor: Clasificacion | null;
  estado: EstadoRegistro;
  motivos: string[]; // por qué está en revisión o en error
  // para filas de pedidos
  nroPedido: number | null;
  codigoPedido: string | null;
  cantPedido: number | null;
  puPedido: string | null;
  // para filas de stock
  stockModelo: string | null;
  stockColor: string | null;
  stockInicial: string | null;
}

export interface Lote {
  id?: number;
  hash: string;
  archivo: string;
  tamano: number;
  modificado: number;
  fechaISO: string;
  tipo: TipoArchivo;
  hojas: string[];
  filasImportadas: number;
  filasRevision: number;
  filasError: number;
  duplicados: number;
  estado: 'confirmado' | 'revertido';
  notas: string[];
}

/** Resultado de la simulación (previsualización) — se calcula ANTES de guardar. */
export interface Simulacion {
  archivo: string;
  hoja: string;
  filasLeidas: number;
  clasificados: number;
  revision: number;
  errores: { fila: number; motivo: string }[];
  duplicados: { fila: number; clave: string }[];
  hashRepetido: boolean;
  ejemplos: FilaLeida[];
}

/** Pedido con anticipo agrupado (unidad de "reserva"). */
export interface Reserva {
  pedido: number;
  fechaISO: string | null;
  cliente: string | null;
  vendedor: string | null;
  sku: string | null;
  modelo: string | null;
  color: string | null;
  motos: number;
  precioLista: string;
  fuentePrecio: string;
  descuento: string;
  detalleDescuento: string;
  valorNeto: string;
  cobrado: string;
  saldo: string;
  exceso: string;
  pagos: number;
  documentos: string[];
  estado: string;
  confianzaModelo: number;
  confianzaColor: number;
  pendienteRevision: boolean;
  motivos: string[];
}

export interface Facturacion {
  fechaISO: string | null;
  documento: string;
  pedido: number | null;
  cliente: string | null;
  vendedor: string | null;
  modelo: string | null;
  color: string | null;
  usd: string;
}

export interface GrupoModeloColor {
  modelo: string;
  color: string;
  reservas: number;
  motos: number;
  valorNeto: string;
  cobrado: string;
  saldo: string;
  exceso: string;
  avance: number; // 0..1
  facturadas: number;
}

export interface ControlConciliacion {
  id: string;
  nombre: string;
  detalle: string;
  esperado: string;
  obtenido: string;
  diferencia: string;
  ok: boolean;
}

export interface ResumenDashboard {
  valorNeto: string;
  cobrado: string;
  saldo: string;
  exceso: string;
  avance: number;
  reservas: number;
  motosReservadas: number;
  cobradas100: number;
  facturadasMotos: number;
  facturadoUsd: string;
  // stock / estimado
  stockInicial: number;
  stockFacturadas: number;
  stockReservas: number;
  stockSaldo: number;
  estimadoStockNeto: string;
  estimadoNetoTotal: string;
  estimadoParcialCobrado: string;
  estimadoSaldoPorCobrar: string;
  porModelo: GrupoModeloColor[];
  conciliacion: ControlConciliacion[];
  valido: boolean;
}

export interface ReglaAprendizaje {
  id?: number;
  tipo: 'modelo' | 'color';
  busqueda: string; // texto normalizado que dispara la regla
  busquedaOriginal: string;
  /** Columna de origen de la regla; null = aplica en cualquier columna. */
  columna: string | null;
  valor: string;
  prioridad: number;
  activa: boolean;
  origen: 'manual' | 'correccion';
  fechaISO: string;
  notas?: string;
}

export interface CambioConfig {
  id?: number;
  seccion: string;
  clave: string;
  antes: string;
  despues: string;
  fechaISO: string;
  revertido: boolean;
}

/** Fila de stock por modelo+color: el "stock inicial" vigente (editable). */
export interface StockFila {
  id?: number;
  modelo: string;
  color: string;
  inicial: string;
  fechaISO: string;
  origen: 'manual' | 'excel' | 'derivado';
  loteId?: number;
}
