// Motor de cálculo: clasificación final, reservas, facturaciones, grupos,
// stock, estimado de ganancia y conciliación. Todo con decimal.js (nunca float)
// y todo derivado de datos crudos — se re-ejecuta completo en cada cambio.

import Decimal from 'decimal.js';
import type {
  ControlConciliacion,
  Facturacion,
  GrupoModelo,
  GrupoModeloColor,
  Registro,
  ReglaAprendizaje,
  Reserva,
  ResumenDashboard,
  StockFila,
} from '../tipos';
import type { Configuracion } from './configuracion';
import { clasificarColor, clasificarModelo, type TextoFuente } from './clasificar';
import { compactar, normalizar } from './normalizar';
import { aplicarAnulaciones, claveRegistro, validarFila } from './validar';

const P_CALC = 'cálculo: ';
const P_VAL = 'validación: ';

export interface ContextoCalculo {
  registros: Registro[];
  stock: StockFila[];
  cfg: Configuracion;
  reglas: ReglaAprendizaje[];
}

export interface FilaStock {
  modelo: string;
  color: string;
  inicial: number;
  /** Facturadas efectivas: el override manual si existe, si no el conteo del Excel. */
  facturadas: number;
  /** Conteo derivado del Excel de ventas (sin overrides). */
  facturadasCalculadas: number;
  /** Override manual cargado por el usuario; null = sin override. */
  facturadasManual: number | null;
  reservas: number;
  saldo: number | null;
  precio: string | null;
  precioFuente: string | null;
  estimadoNeto: string;
}

export interface ModeloCalculado {
  reservas: Reserva[];
  facturaciones: Facturacion[];
  revision: Registro[];
  errores: Registro[];
  duplicados: Registro[];
  grupos: GrupoModeloColor[];
  stockFilas: FilaStock[];
  dashboard: ResumenDashboard;
  avisos: string[];
}

// ---------------------------------------------------------------------------
// Dinero
// ---------------------------------------------------------------------------

export function dec(v: string | number | Decimal | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return new Decimal(0);
  if (v instanceof Decimal) return v;
  try {
    return new Decimal(typeof v === 'number' ? String(v) : v);
  } catch {
    return new Decimal(0);
  }
}

function redondeo(cfg: Configuracion): Decimal.Rounding {
  return cfg.redondeo.metodo === 'half-even' ? Decimal.ROUND_HALF_EVEN : Decimal.ROUND_HALF_UP;
}

/** Dinero formateado con la configuración de redondeo (solo presentación). */
export function money(v: string | number | Decimal | null | undefined, cfg: Configuracion): string {
  return dec(v).toDecimalPlaces(cfg.redondeo.decimales, redondeo(cfg)).toFixed(cfg.redondeo.decimales);
}

function red2(v: Decimal, cfg: Configuracion): Decimal {
  return v.toDecimalPlaces(cfg.redondeo.decimales, redondeo(cfg));
}

// ---------------------------------------------------------------------------
// Fórmula de stock (evaluador seguro: solo identificadores conocidos y operadores)
// ---------------------------------------------------------------------------

export function evaluarFormula(
  formula: string,
  v: { inicial: number; facturadas: number; reservas: number },
): number | null {
  const f = formula.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!f) return null;
  const tokens = f.match(/[a-z_]+|\d+(?:\.\d+)?|[+\-*/()]/g);
  if (!tokens || tokens.join('').replace(/\s+/g, '') !== f.replace(/\s+/g, '')) return null;
  const vars: Record<string, number> = {
    inicial: v.inicial,
    facturadas: v.facturadas,
    reservas: v.reservas,
  };
  let i = 0;
  let fallo = false;
  const peek = () => tokens[i];
  const consume = () => tokens[i++];
  function expr(): number {
    let a = term();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const b = term();
      a = op === '+' ? a + b : a - b;
    }
    return a;
  }
  function term(): number {
    let a = factor();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const b = factor();
      a = op === '*' ? a * b : b === 0 ? ((fallo = true), 0) : a / b;
    }
    return a;
  }
  function factor(): number {
    const t = consume();
    if (t === undefined) return ((fallo = true), 0);
    if (t === '(') {
      const a = expr();
      if (peek() !== ')') fallo = true;
      else consume();
      return a;
    }
    if (t === '-') return -factor();
    if (t === '+') return factor();
    if (/^[a-z_]+$/.test(t)) return t in vars ? vars[t] : ((fallo = true), 0);
    const n = Number(t);
    if (Number.isFinite(n)) return n;
    fallo = true;
    return 0;
  }
  const res = expr();
  if (i !== tokens.length || fallo || !Number.isFinite(res)) return null;
  return res;
}

// ---------------------------------------------------------------------------
// Textos para clasificar (TODAS las columnas de la fila)
// ---------------------------------------------------------------------------

function columnasExcluidas(cfg: Configuracion): Set<string> {
  const set = new Set<string>([
    'Cliente', 'Vendedor', 'Documento', 'Doc. Referencia', 'Doc. Identidad',
    'Tipo Doc. Identidad', 'Lote', 'Estado', 'Fecha', 'Categorias', 'Doc. Almacen',
    'Costo Promedio', 'Importe Gratuito', 'Grand Total',
  ]);
  for (const mapeo of Object.values(cfg.mapeosPorTipo)) {
    for (const h of Object.values(mapeo)) if (h) set.add(h);
  }
  return set;
}

function textosDe(r: Registro, ped: Registro | undefined, cfg: Configuracion): TextoFuente[] {
  const out: TextoFuente[] = [];
  const add = (columna: string, v: string | number | null | undefined) => {
    if (v === null || v === undefined) return;
    const s = String(v).trim();
    if (s) out.push({ columna, texto: s });
  };
  add('Modelo', r.modeloColumna);
  add('Código (SKU)', r.sku);
  add('Descripción', r.descripcion);
  add('glosa cabecera', r.glosa);
  if (ped) {
    add('join:codigo', ped.sku ?? ped.codigoPedido);
    add('join:descripcion', ped.descripcion);
  }
  const excl = columnasExcluidas(cfg);
  for (const [k, v] of Object.entries(r.celdas)) {
    if (excl.has(k)) continue;
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (s.length < 4) continue;
    add(k, s);
  }
  return out;
}

function mejorClasif(cs: (Registro['clasifModelo'])[], prioridad: string[]): Registro['clasifModelo'] {
  let mejor: Registro['clasifModelo'] = null;
  for (const c of cs) {
    if (!c || !c.valor) continue;
    if (!mejor) {
      mejor = c;
      continue;
    }
    const rA = prioridad.indexOf(c.fuente);
    const rB = prioridad.indexOf(mejor.fuente);
    if (c.confianza > mejor.confianza || (c.confianza === mejor.confianza && (rA === -1 ? 99 : rA) < (rB === -1 ? 99 : rB))) {
      mejor = c;
    }
  }
  return mejor;
}

// ---------------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------------

function precioPorSku(sku: string, cfg: Configuracion): { precio: Decimal; fuente: string } | null {
  const s = sku.toUpperCase();
  for (const p of cfg.catalogos.precios) {
    if (s.startsWith(p.prefijo.toUpperCase())) return { precio: dec(p.precio), fuente: p.fuente };
  }
  return null;
}

function construirPreciosPorModelo(cfg: Configuracion): Map<string, { precio: Decimal; fuente: string }> {
  const map = new Map<string, { precio: Decimal; fuente: string }>();
  for (const m of cfg.catalogos.modelos) {
    const cm = compactar(m.nombre);
    for (const p of cfg.catalogos.precios) {
      if (cm.startsWith(compactar(p.prefijo))) {
        map.set(m.nombre, { precio: dec(p.precio), fuente: p.fuente });
        break;
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// CÁLCULO PRINCIPAL
// ---------------------------------------------------------------------------

export function calcular(ctx: ContextoCalculo): ModeloCalculado {
  const { registros, stock, cfg, reglas } = ctx;
  const avisos: string[] = [];

  // 0) reiniciar estado derivado (los motivos de importación no existen: todo se deriva)
  for (const r of registros) {
    r.motivos = [];
    r.anulado = false;
    r.ncParcial = false;
    r.duplicado = false;
    r.estado = 'clasificado';
  }

  // 1) validación por fila
  for (const r of registros) {
    const { errores, advertencias } = validarFila(r, cfg);
    for (const e of errores) r.motivos.push(P_VAL + e);
    for (const a of advertencias) r.motivos.push(P_VAL + a);
    if (errores.length) r.estado = 'error';
  }

  // 2) anulaciones NC/ND
  const anul = aplicarAnulaciones(registros);
  for (const r of registros) {
    if (r.ncParcial) {
      r.motivos.push(`${P_CALC}NC parcial ${r.documento} sobre ${r.docReferencia} (US$ ${r.importeUsd}): el documento no se anuló; revisar`);
      const orig = registros.find((x) => x.documento === r.docReferencia);
      if (orig) orig.motivos.push(`${P_CALC}NC parcial ${r.documento} afecta este documento (US$ ${r.importeUsd})`);
    }
  }
  if (anul.anulados) avisos.push(`${anul.anulados} documentos anulados por nota de crédito/débito (excluidos con su NC).`);

  // 3) duplicados globales (orden de carga: el primero cuenta)
  const vistos = new Set<string>();
  const duplicados: Registro[] = [];
  for (const r of registros) {
    const k = claveRegistro(r);
    const vacia = k === '|||' || k.startsWith('PED||') || k === '||||';
    if (!vacia && vistos.has(k)) {
      r.duplicado = true;
      duplicados.push(r);
      if (cfg.duplicadosModo === 'bloquear') {
        r.estado = 'error';
        r.motivos.push(`${P_CALC}duplicado bloqueado: ${k}`);
      } else {
        r.motivos.push(`${P_CALC}duplicado: excluido de los totales (${k})`);
      }
    }
    if (!vacia) vistos.add(k);
  }

  // 4) índice de pedidos
  const pedidosIdx = new Map<number, Registro>();
  const pedsDups = new Set<number>();
  for (const r of registros) {
    if (r.nroPedido === null) continue;
    if (pedidosIdx.has(r.nroPedido)) pedsDups.add(r.nroPedido);
    else pedidosIdx.set(r.nroPedido, r);
  }
  if (pedsDups.size) avisos.push(`Pedidos duplicados en el archivo de pedidos (se usó la primera fila): ${[...pedsDups].join(', ')}`);

  // 5) clasificación de TODOS los registros (con join del pedido si existe)
  for (const r of registros) {
    const ped = r.pedido !== null && r.nroPedido === null ? pedidosIdx.get(r.pedido) : undefined;
    const textos = textosDe(r, ped, cfg);
    const rm = clasificarModelo(textos, cfg, reglas);
    const rc = clasificarColor(textos, cfg, reglas);
    r.clasifModelo = rm.clasif;
    r.clasifColor = rc.clasif;
    if (rm.conflicto) {
      r.estado = r.estado === 'error' ? 'error' : 'revision';
      r.motivos.push(P_CALC + 'conflicto — ' + rm.conflicto);
    }
    if (rc.conflicto) {
      r.estado = r.estado === 'error' ? 'error' : 'revision';
      r.motivos.push(P_CALC + 'conflicto — ' + rc.conflicto);
    }
    // umbral de confianza: por debajo → nunca se adivina
    if (r.clasifModelo && r.clasifModelo.confianza < cfg.umbralConfianza) {
      r.motivos.push(`${P_CALC}confianza de modelo ${r.clasifModelo.confianza.toFixed(2)} < umbral ${cfg.umbralConfianza.toFixed(2)}`);
      r.clasifModelo = null;
    }
    if (r.clasifColor && r.clasifColor.confianza < cfg.umbralConfianza) {
      r.motivos.push(`${P_CALC}confianza de color ${r.clasifColor.confianza.toFixed(2)} < umbral ${cfg.umbralConfianza.toFixed(2)}`);
      r.clasifColor = null;
    }
  }

  // 5b) propagación por evidencia entre filas: si una fila ya quedó clasificada
  // con confianza suficiente, otras filas con la MISMA clave de texto (SKU,
  // descripción o glosa normalizada) heredan esa relación. No es adivinar:
  // es reutilizar una relación ya demostrada en los propios datos, y solo
  // cuando TODAS las filas con esa clave coinciden en el mismo valor.
  {
    const eVista = new Map<string, { valores: Set<string>; conf: number }>();
    const clavesDe = (r: Registro): string[] => {
      const ks: string[] = [];
      if (r.sku) ks.push(`sku:${normalizar(r.sku)}`);
      if (r.descripcion) ks.push(`desc:${normalizar(r.descripcion)}`);
      if (r.glosa) ks.push(`glosa:${normalizar(r.glosa)}`);
      return ks.filter((k) => k.split(':')[1].length >= 5);
    };
    for (const r of registros) {
      if (r.estado === 'error' || r.duplicado) continue;
      const vals: [string, string][] = [];
      if (r.clasifModelo?.valor) vals.push(['modelo', r.clasifModelo.valor]);
      if (r.clasifColor?.valor) vals.push(['color', r.clasifColor.valor]);
      for (const [tipo, valor] of vals) {
        for (const k of clavesDe(r)) {
          const kk = `${tipo}|${k}`;
          const e = eVista.get(kk);
          const conf = tipo === 'modelo' ? (r.clasifModelo?.confianza ?? 1) : (r.clasifColor?.confianza ?? 1);
          if (!e) eVista.set(kk, { valores: new Set([valor]), conf });
          else {
            e.valores.add(valor);
            if (conf < e.conf) e.conf = conf;
          }
        }
      }
    }
    let heredadas = 0;
    for (const r of registros) {
      if (r.estado === 'error' || r.duplicado) continue;
      for (const [tipo, actual] of [
        ['modelo', r.clasifModelo],
        ['color', r.clasifColor],
      ] as const) {
        if (actual && actual.valor) continue; // ya clasificado: no se pisa
        for (const k of clavesDe(r)) {
          const e = eVista.get(`${tipo}|${k}`);
          if (!e || e.valores.size !== 1) continue; // solo unanimidad
          const valor = [...e.valores][0];
          const conf = Math.min(e.conf, 0.97);
          if (conf < cfg.umbralConfianza) continue;
          const nueva = {
            valor,
            tipo: tipo as 'modelo' | 'color',
            columna: 'evidencia',
            textoMatch: k,
            confianza: Math.round(conf * 1000) / 1000,
            fuente: 'evidencia',
          };
          if (tipo === 'modelo') r.clasifModelo = nueva;
          else r.clasifColor = nueva;
          heredadas++;
          break;
        }
      }
    }
    if (heredadas) {
      avisos.push(
        `${heredadas} clasificación(es) resueltas por evidencia: otra fila con el mismo texto/SKU ya estaba clasificada (relación heredada, sin adivinar).`,
      );
    }
  }

  const esAnticipo = (r: Registro) =>
    r.categoria === 'ANTICIPOS' &&
    (r.documentoTipo === 'BV' || r.documentoTipo === 'FT') &&
    !r.anulado &&
    !r.duplicado &&
    r.estado !== 'error';
  const esFacturacion = (r: Registro) =>
    r.categoria === 'VEHICULOS' &&
    (r.documentoTipo === 'BV' || r.documentoTipo === 'FT') &&
    !r.anulado &&
    !r.duplicado &&
    r.estado !== 'error';

  // 6) facturaciones (primero: alimenta el estado "Facturada" de las reservas)
  const facturaciones: Facturacion[] = [];
  const factPedidos = new Set<number>();
  for (const r of registros) {
    if (!esFacturacion(r)) continue;
    if (!r.clasifModelo || !r.clasifModelo.valor) {
      if (r.estado !== 'error') {
        r.estado = 'revision';
        r.motivos.push(`${P_CALC}modelo no detectado en factura ${r.documento ?? ''} — asigná el modelo desde Por revisar`);
      }
      continue;
    }
    if (!r.clasifColor || !r.clasifColor.valor) {
      if (r.estado !== 'error') {
        r.estado = 'revision';
        r.motivos.push(`${P_CALC}color no detectado en factura ${r.documento ?? ''} — asigná el color desde Por revisar`);
      }
      continue;
    }
    facturaciones.push({
      fechaISO: r.fechaISO,
      documento: r.documento ?? '',
      pedido: r.pedido,
      cliente: r.cliente,
      vendedor: r.vendedor,
      modelo: r.clasifModelo.valor,
      color: r.clasifColor.valor,
      usd: money(r.importeUsd, cfg),
    });
    if (r.pedido !== null) factPedidos.add(r.pedido);
  }

  // VIN duplicado → aviso explícito
  const vinMap = new Map<string, Registro[]>();
  for (const r of registros) {
    if (!esFacturacion(r) || !r.vin) continue;
    const arr = vinMap.get(r.vin) ?? [];
    arr.push(r);
    vinMap.set(r.vin, arr);
  }
  for (const [vin, filas] of vinMap) {
    if (filas.length > 1) {
      const docs = filas.map((f) => f.documento).join(', ');
      avisos.push(`VIN DUPLICADO ${vin}: ${docs} — revisar`);
      for (const f of filas) f.motivos.push(`${P_CALC}VIN duplicado ${vin} (${docs})`);
    }
  }

  // 7) reservas (anticipos agrupados por pedido)
  const gruposPed = new Map<number, Registro[]>();
  const sinPedido: Registro[] = [];
  for (const r of registros) {
    if (!esAnticipo(r)) continue;
    if (r.pedido === null) {
      sinPedido.push(r);
      continue;
    }
    const arr = gruposPed.get(r.pedido) ?? [];
    arr.push(r);
    gruposPed.set(r.pedido, arr);
  }
  for (const r of sinPedido) {
    r.estado = 'revision';
    r.motivos.push(`${P_CALC}anticipo sin N° de pedido (${r.documento}) — no se puede reservar`);
  }

  const excepciones = new Map(cfg.catalogos.excepciones.map((e) => [e.pedido, e]));
  const excedentesConf = new Map<number, string>(
    Object.entries(cfg.catalogos.excedentesConfirmados).map(([k, v]) => [Number(k), v]),
  );
  const reservas: Reserva[] = [];
  let rxDscto: RegExp | null = null;
  let rxSep: RegExp | null = null;
  try {
    rxDscto = new RegExp(cfg.regexDscto, 'i');
  } catch {
    avisos.push('La regla de descuento (regex) es inválida: se ignoran los descuentos de glosa. Corregila en Configuración.');
  }
  try {
    rxSep = new RegExp(cfg.regexSeparacion, 'i');
  } catch {
    avisos.push('La regla de "SEPARACIÓN DE N" (regex) es inválida. Corregila en Configuración.');
  }

  for (const [pedido, rows] of gruposPed) {
    const ped = pedidosIdx.get(pedido);
    if (!ped) {
      for (const r of rows) {
        r.estado = 'revision';
        r.motivos.push(`${P_CALC}pedido ${pedido} no está en el archivo de pedidos — cargá el Excel de pedidos`);
      }
      avisos.push(`Pedido ${pedido}: no está en el archivo de pedidos (anticipos no incluidos).`);
      continue;
    }

    const cm = mejorClasif(rows.map((r) => r.clasifModelo), cfg.prioridadFuentes);
    const cc = mejorClasif(rows.map((r) => r.clasifColor), cfg.prioridadFuentes);
    if (!cm || !cm.valor) {
      for (const r of rows) {
        r.estado = 'revision';
        r.motivos.push(`${P_CALC}modelo no detectado para el pedido ${pedido} — asigná el modelo desde Por revisar`);
      }
      continue;
    }
    if (!cc || !cc.valor) {
      for (const r of rows) {
        r.estado = 'revision';
        r.motivos.push(`${P_CALC}color no detectado para el pedido ${pedido} — asigná el color desde Por revisar`);
      }
      continue;
    }

    const sku = ped.sku ?? '';
    const glosas = [...new Set(rows.map((r) => r.glosa).filter((g): g is string => !!g))];
    const glosa = glosas.join(' | ');

    // cantidad de motos
    let n = 1;
    const ms = rxSep ? rxSep.exec(glosa) : null;
    if (ms && ms[1]) n = parseInt(ms[1], 10) || 1;
    if (n > 1 && !excepciones.has(pedido)) {
      avisos.push(`Pedido ${pedido}: la glosa indica ${n} unidades; se calcularon ${n} motos.`);
    }

    // precio de lista (por moto: el P.U. de la tabla de pedidos está por documento,
    // la referencia divide por Cant. Pedido — misma regla que el dashboard Python)
    const ex = excepciones.get(pedido);
    const cantPed = ped.cantPedido !== null && ped.cantPedido > 0 ? ped.cantPedido : 1;
    let lpInfo = precioPorSku(sku, cfg);
    if (ex && ex.precio !== undefined) lpInfo = { precio: dec(ex.precio), fuente: 'Excepción Finanzas' };
    const motivosReserva: string[] = [];
    if (!lpInfo) {
      const precioUnitario = dec(ped.puPedido).div(cantPed);
      lpInfo = { precio: precioUnitario, fuente: 'Precio de pedido (confirmar)' };
      motivosReserva.push(`sin precio de lista para ${sku || cm.valor}: se usó el precio del pedido — confirmar con Finanzas`);
      avisos.push(`Pedido ${pedido}: modelo ${sku || cm.valor} sin precio de lista; se usó el precio del pedido (${money(precioUnitario, cfg)}).`);
    }

    // descuento de la glosa
    let dsc: Decimal = new Decimal(0);
    let detDsc = '';
    const dm = rxDscto ? rxDscto.exec(glosa) : null;
    if (dm) {
      const bruto = (dm[1] || dm[2] || '').replace(/,/g, '').replace(/\.$/, '');
      if (bruto) {
        const bono = cfg.catalogos.bonoIncluido[cm.valor];
        if (bono !== undefined && Number(bono) === Number(bruto)) {
          dsc = new Decimal(0);
          detDsc = `Bono $${bono} ya incluido en precio de lista`;
        } else {
          dsc = dec(bruto);
          detDsc = `Dscto $${bruto} (glosa)`;
        }
      }
    }

    // cobrado
    const cob = red2(
      rows.reduce((acc, r) => acc.add(dec(r.importeUsd)), new Decimal(0)),
      cfg,
    );

    // excepciones de Finanzas
    if (ex) {
      if (ex.dsctoPorMoto !== undefined) dsc = dec(ex.dsctoPorMoto);
      if (ex.dsctoIgualASaldo) dsc = red2(lpInfo.precio.minus(cob.div(n)), cfg);
      if (ex.detalle) detDsc = ex.detalle;
    }

    const valor = red2(lpInfo.precio.mul(n).minus(dsc.mul(n)), cfg);
    const saldoRaw = valor.minus(cob);
    const saldo = saldoRaw.isNegative() ? new Decimal(0) : saldoRaw;
    const exceso = saldoRaw.isNegative() ? saldoRaw.negated() : new Decimal(0);

    if (saldoRaw.lessThan(-0.5)) {
      const extra =
        excedentesConf.get(pedido) ??
        (/NAVI\s*PACK/i.test(glosa) ? 'Incluye Pack Navi S/850' : 'Cobrado mayor al precio (adicional / comisión financiera)');
      if (!excedentesConf.has(pedido)) {
        avisos.push(`Pedido ${pedido} (${cm.valor}): cobrado ${money(cob, cfg)} supera el valor ${money(valor, cfg)} en ${money(exceso, cfg)} → ${extra}`);
      }
      motivosReserva.push(extra);
    }
    if (detDsc) motivosReserva.push(detDsc);

    // estado de reserva: facturada > pagada 100% > pago parcial
    let estado: string;
    if (factPedidos.has(pedido)) {
      estado = cfg.catalogos.estadosReserva.find((e) => e.regla === 'facturada')?.nombre ?? 'Facturada';
    } else if (saldoRaw.lte(0.005)) {
      estado = cfg.catalogos.estadosReserva.find((e) => e.regla === 'pagada-100')?.nombre ?? 'Pagada 100%';
    } else {
      estado = cfg.catalogos.estadosReserva.find((e) => e.regla === 'pago-parcial')?.nombre ?? 'Pago parcial';
    }

    const primera = rows[0];
    const reserva: Reserva = {
      pedido,
      fechaISO: rows.map((r) => r.fechaISO).filter(Boolean).sort()[0] ?? null,
      cliente: primera.cliente,
      vendedor: primera.vendedor,
      sku,
      modelo: cm.valor,
      color: cc.valor,
      motos: n,
      precioLista: money(lpInfo.precio, cfg),
      fuentePrecio: lpInfo.fuente,
      descuento: money(dsc.mul(n), cfg),
      detalleDescuento: detDsc,
      valorNeto: money(valor, cfg),
      cobrado: money(cob, cfg),
      saldo: money(saldo, cfg),
      exceso: money(exceso, cfg),
      pagos: rows.length,
      documentos: rows.map((r) => r.documento ?? ''),
      estado,
      confianzaModelo: cm.confianza,
      confianzaColor: cc.confianza,
      pendienteRevision: motivosReserva.some((m) => /confirmar|mayor al precio/i.test(m)),
      motivos: motivosReserva,
    };
    reservas.push(reserva);
  }

  // 8) grupos por modelo + color
  const gruposMap = new Map<string, GrupoModeloColor>();
  const claveG = (m: string, c: string) => `${m}||${c}`;
  /** Clientes distintos (clave normalizada) por grupo y por modelo. */
  const clientesGrupo = new Map<string, Set<string>>();
  const clientesModelo = new Map<string, Set<string>>();
  const asegurar = (m: string, c: string): GrupoModeloColor => {
    const k = claveG(m, c);
    let g = gruposMap.get(k);
    if (!g) {
      g = { modelo: m, color: c, clientes: 0, reservas: 0, motos: 0, valorNeto: '0', cobrado: '0', saldo: '0', exceso: '0', avance: 0, facturadas: 0 };
      gruposMap.set(k, g);
    }
    return g;
  };
  for (const r of reservas) {
    const g = asegurar(r.modelo ?? '(sin modelo)', r.color ?? '(sin color)');
    g.reservas += 1;
    g.motos += r.motos;
    g.valorNeto = money(dec(g.valorNeto).plus(dec(r.valorNeto)), cfg);
    g.cobrado = money(dec(g.cobrado).plus(dec(r.cobrado)), cfg);
    g.saldo = money(dec(g.saldo).plus(dec(r.saldo)), cfg);
    g.exceso = money(dec(g.exceso).plus(dec(r.exceso)), cfg);
    if (r.cliente && normalizar(r.cliente)) {
      const kG = claveG(g.modelo, g.color);
      const setG = clientesGrupo.get(kG) ?? new Set<string>();
      setG.add(normalizar(r.cliente));
      clientesGrupo.set(kG, setG);
      const setM = clientesModelo.get(g.modelo) ?? new Set<string>();
      setM.add(normalizar(r.cliente));
      clientesModelo.set(g.modelo, setM);
    }
  }
  for (const f of facturaciones) {
    const g = asegurar(f.modelo ?? '(sin modelo)', f.color ?? '(sin color)');
    g.facturadas += 1;
  }
  for (const g of gruposMap.values()) {
    g.clientes = clientesGrupo.get(claveG(g.modelo, g.color))?.size ?? 0;
    const v = dec(g.valorNeto);
    g.avance = v.isZero() ? 0 : dec(g.cobrado).div(v).toNumber();
  }
  const porModelo = [...gruposMap.values()].sort((a, b) => dec(b.valorNeto).minus(dec(a.valorNeto)).toNumber());

  // 8b) resumen por modelo (sin color): clientes distintos con reserva activa
  const factPorModelo = new Map<string, number>();
  for (const f of facturaciones) {
    const m = f.modelo ?? '(sin modelo)';
    factPorModelo.set(m, (factPorModelo.get(m) ?? 0) + 1);
  }
  const modelosMap = new Map<string, GrupoModelo>();
  for (const g of porModelo) {
    let m = modelosMap.get(g.modelo);
    if (!m) {
      m = {
        modelo: g.modelo,
        clientes: 0,
        reservas: 0,
        motos: 0,
        valorNeto: '0',
        cobrado: '0',
        saldo: '0',
        exceso: '0',
        avance: 0,
        facturadas: 0,
      };
      modelosMap.set(g.modelo, m);
    }
    m.reservas += g.reservas;
    m.motos += g.motos;
    m.valorNeto = money(dec(m.valorNeto).plus(dec(g.valorNeto)), cfg);
    m.cobrado = money(dec(m.cobrado).plus(dec(g.cobrado)), cfg);
    m.saldo = money(dec(m.saldo).plus(dec(g.saldo)), cfg);
    m.exceso = money(dec(m.exceso).plus(dec(g.exceso)), cfg);
  }
  for (const m of modelosMap.values()) {
    m.clientes = clientesModelo.get(m.modelo)?.size ?? 0;
    m.facturadas = factPorModelo.get(m.modelo) ?? 0;
    const v = dec(m.valorNeto);
    m.avance = v.isZero() ? 0 : dec(m.cobrado).div(v).toNumber();
  }
  const resumenModelos = [...modelosMap.values()].sort((a, b) => dec(b.valorNeto).minus(dec(a.valorNeto)).toNumber());

  // 9) stock + estimado
  const preciosPorModelo = construirPreciosPorModelo(cfg);
  const stockMap = new Map<string, FilaStock>();
  const asegurarStock = (modelo: string, color: string): FilaStock => {
    const k = claveG(modelo, color);
    let f = stockMap.get(k);
    if (!f) {
      const precio = preciosPorModelo.get(modelo);
      f = {
        modelo,
        color,
        inicial: 0,
        facturadas: 0,
        facturadasCalculadas: 0,
        facturadasManual: null,
        reservas: 0,
        saldo: null,
        precio: precio ? money(precio.precio, cfg) : null,
        precioFuente: precio?.fuente ?? null,
        estimadoNeto: '0',
      };
      stockMap.set(k, f);
    }
    return f;
  };
  for (const s of stock) {
    const f = asegurarStock(s.modelo, s.color);
    f.inicial += Number(s.inicial) || 0;
    if (s.facturadasManual !== null && s.facturadasManual !== undefined && s.facturadasManual !== '') {
      const n = Number(s.facturadasManual);
      if (Number.isFinite(n) && n >= 0) f.facturadasManual = n;
    }
  }
  for (const g of gruposMap.values()) {
    const f = asegurarStock(g.modelo, g.color);
    f.facturadasCalculadas = g.facturadas;
    f.reservas = g.motos;
  }
  for (const f of stockMap.values()) {
    f.facturadas = f.facturadasManual ?? f.facturadasCalculadas;
    if (f.facturadasManual !== null && f.facturadasManual !== f.facturadasCalculadas) {
      avisos.push(
        `Facturadas manuales en ${f.modelo} / ${f.color}: se usó ${f.facturadasManual} (el Excel calcula ${f.facturadasCalculadas}).`,
      );
    }
  }
  let stockInicial = 0;
  let stockFacturadas = 0;
  let stockReservas = 0;
  let stockSaldo = 0;
  let formulaOk = true;
  for (const f of stockMap.values()) {
    const saldo = evaluarFormula(cfg.formulaStock, { inicial: f.inicial, facturadas: f.facturadas, reservas: f.reservas });
    f.saldo = saldo;
    if (saldo === null) formulaOk = false;
    stockInicial += f.inicial;
    stockFacturadas += f.facturadas;
    stockReservas += f.reservas;
    if (saldo !== null) {
      stockSaldo += saldo;
      if (saldo > 0 && f.precio !== null) {
        f.estimadoNeto = money(new Decimal(saldo).mul(dec(f.precio)), cfg);
      } else {
        f.estimadoNeto = '0';
      }
      if (saldo > 0 && f.precio === null) {
        avisos.push(`Sin precio de lista para ${f.modelo}: el saldo proyectado de esa fila no suma al estimado neto.`);
      }
    }
  }
  const stockFilas = [...stockMap.values()].sort(
    (a, b) => dec(b.estimadoNeto).minus(dec(a.estimadoNeto)).toNumber(),
  );

  // 10) totales y conciliación
  const sum = (xs: string[]) => xs.reduce((a, x) => a.plus(dec(x)), new Decimal(0));
  const totalNeto = sum(reservas.map((r) => r.valorNeto));
  const totalCob = sum(reservas.map((r) => r.cobrado));
  const totalSaldo = sum(reservas.map((r) => r.saldo));
  const totalExceso = sum(reservas.map((r) => r.exceso));
  const totalFact = sum(facturaciones.map((f) => f.usd));

  const gNeto = sum(porModelo.map((g) => g.valorNeto));
  const gCob = sum(porModelo.map((g) => g.cobrado));
  const gSaldo = sum(porModelo.map((g) => g.saldo));

  // fuente: anticipos BV/FT no anulados, no duplicados (los que el usuario cargó)
  const fuenteCob = registros
    .filter(
      (r) =>
        r.categoria === 'ANTICIPOS' &&
        (r.documentoTipo === 'BV' || r.documentoTipo === 'FT') &&
        !r.anulado &&
        !r.duplicado,
    )
    .reduce((a, r) => a.plus(dec(r.importeUsd)), new Decimal(0));
  const fuenteFact = registros
    .filter(
      (r) =>
        r.categoria === 'VEHICULOS' &&
        (r.documentoTipo === 'BV' || r.documentoTipo === 'FT') &&
        !r.anulado &&
        !r.duplicado,
    )
    .reduce((a, r) => a.plus(dec(r.importeUsd)), new Decimal(0));

  const tol = new Decimal('0.01');
  const dif = (a: Decimal, b: Decimal) => a.minus(b).abs();
  const controles: ControlConciliacion[] = [];
  const control = (
    id: string,
    nombre: string,
    detalle: string,
    esperado: Decimal,
    obtenido: Decimal,
    extra?: string,
  ) => {
    const d = dif(esperado, obtenido);
    controles.push({
      id,
      nombre,
      detalle,
      esperado: money(esperado, cfg),
      obtenido: money(obtenido, cfg),
      diferencia: money(d, cfg),
      ok: d.lte(tol),
    });
    void extra;
  };

  control(
    'neto',
    'Valor neto = Cobrado + Saldo − Exceso',
    'Los anticipos cobrados más el saldo por cobrar deben reconstruir el valor neto de las reservas.',
    totalNeto,
    totalCob.plus(totalSaldo).minus(totalExceso),
  );
  control(
    'grupos',
    'Detalle por modelo/color = Total del dashboard',
    'La suma de la tabla por modelo y color debe coincidir con los KPIs (neto, cobrado y saldo).',
    totalNeto.plus(totalCob).plus(totalSaldo),
    gNeto.plus(gCob).plus(gSaldo),
  );
  control(
    'cobrado-fuente',
    'Cobrado = Datos fuente (archivo de ventas)',
    'Suma de los anticipos vigentes del archivo original vs. lo que suma el dashboard. La diferencia son filas excluidas en revisión.',
    fuenteCob,
    totalCob,
  );
  control(
    'facturacion-fuente',
    'Facturación = Datos fuente (archivo de ventas)',
    'Suma de los vehículos facturados del archivo original vs. el KPI de facturación.',
    fuenteFact,
    totalFact,
  );
  const esperadoStock = evaluarFormula(cfg.formulaStock, {
    inicial: stockInicial,
    facturadas: stockFacturadas,
    reservas: stockReservas,
  });
  controles.push({
    id: 'stock',
    nombre: 'Stock: Σ saldo = fórmula(Σ totales)',
    detalle: `Fórmula aplicada: ${cfg.formulaStock}`,
    esperado: formulaOk && esperadoStock !== null ? money(esperadoStock, cfg) : '—',
    obtenido: formulaOk ? money(stockSaldo, cfg) : '—',
    diferencia: formulaOk && esperadoStock !== null ? money(Math.abs(esperadoStock - stockSaldo), cfg) : '—',
    ok: formulaOk && esperadoStock !== null && Math.abs(esperadoStock - stockSaldo) <= 0.01,
  });

  const valido = controles.every((c) => c.ok);

  const reservas100 = reservas.filter((r) => dec(r.saldo).lte(0.005)).reduce((a, r) => a + r.motos, 0);
  const estimadoStockNeto = stockFilas.reduce((a, f) => a.plus(dec(f.estimadoNeto)), new Decimal(0));

  const dashboard: ResumenDashboard = {
    valorNeto: money(totalNeto, cfg),
    cobrado: money(totalCob, cfg),
    saldo: money(totalSaldo, cfg),
    exceso: money(totalExceso, cfg),
    avance: totalNeto.isZero() ? 0 : totalCob.div(totalNeto).toNumber(),
    reservas: reservas.length,
    motosReservadas: reservas.reduce((a, r) => a + r.motos, 0),
    cobradas100: reservas100,
    facturadasMotos: facturaciones.length,
    facturadoUsd: money(totalFact, cfg),
    stockInicial,
    stockFacturadas,
    stockReservas,
    stockSaldo,
    estimadoStockNeto: money(estimadoStockNeto, cfg),
    estimadoNetoTotal: money(totalNeto.plus(estimadoStockNeto), cfg),
    estimadoParcialCobrado: money(totalCob, cfg),
    estimadoSaldoPorCobrar: money(totalSaldo, cfg),
    porModelo,
    resumenModelos,
    conciliacion: controles,
    valido,
  };

  const revision = registros.filter((r) => r.estado === 'revision');
  const errores = registros.filter((r) => r.estado === 'error');

  return { reservas, facturaciones, revision, errores, duplicados, grupos: porModelo, stockFilas, dashboard, avisos };
}
