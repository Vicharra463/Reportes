// Reporte Excel con ExcelJS: 9 hojas, fórmulas vivas (SUM/COUNT sobre las
// propias hojas), formato moneda en USD y soles (tipo de cambio por día),
// filtros, congelado y resaltado rojo donde el avance de cobro < 50%.
//
// Hojas:
//   1. Dashboard        → solo KPIs (doble moneda) + gráficos embebidos
//   2. Tablas_Dashboard → resumen por modelo, conciliación y reservas por estado
//   3. Clientes         → detalle por cliente: modelo, color, estado, dinero
//   4. Reservas         → fila a fila con tasa del día y montos en soles
//   5. Reservas_Estado  → modelo × color × estado (+ soles)
//   6. Modelo_Color     → detalle por modelo y color (+ soles)
//   7. Facturaciones    → con tasa del día y soles
//   8. Stock            → proyectado con precio USD + soles
//   9. Ajustes          → trazabilidad
//
// Los gráficos son imágenes PNG de Chart.js (solo en navegador); si no hay
// DOM, las hojas se generan igual sin gráficos.

import ExcelJS from 'exceljs';
import type { CambioConfig, Facturacion, GrupoModelo, GrupoModeloColor, ReglaAprendizaje, Reserva, ResumenDashboard } from '../tipos';
import type { Configuracion } from '../dominio/configuracion';
import type { FilaStock } from '../dominio/calcular';
import type { TcEstado } from '../dominio/tc';
import { tasaPara, tasaVigente, enSoles } from '../dominio/tc';
import { normalizar } from '../dominio/normalizar';

export interface DatosReporte {
  dashboard: ResumenDashboard;
  reservas: Reserva[];
  facturaciones: Facturacion[];
  stockFilas: FilaStock[];
  cambios: CambioConfig[];
  reglas: ReglaAprendizaje[];
  cfg: Configuracion;
  tc: TcEstado;
  generadoISO: string;
}

const MONEDA = '$#,##0.00';
const MONEDA_SOLES = '"S/" #,##0.00';
const PORC = '0.0%';

type CampoReserva = 'valorNeto' | 'cobrado' | 'saldo' | 'exceso';

function titulo(ws: ExcelJS.Worksheet, texto: string, sub?: string): number {
  ws.mergeCells(1, 1, 1, 8);
  const c = ws.getCell(1, 1);
  c.value = texto;
  c.font = { bold: true, size: 16, color: { argb: 'FF11003F' } };
  if (sub) {
    ws.mergeCells(2, 1, 2, 8);
    const c2 = ws.getCell(2, 1);
    c2.value = sub;
    c2.font = { size: 10, color: { argb: 'FF666666' } };
    return 4;
  }
  return 3;
}

function encabezado(ws: ExcelJS.Worksheet, fila: number, cols: string[]): void {
  cols.forEach((h, i) => {
    const c = ws.getCell(fila, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF11003F' } };
  });
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Escribe un monto en soles: número + formato, o '—' si no hay tasa. */
function celSol(ws: ExcelJS.Worksheet, fila: number, col: number, usdVal: number, tasa: number | null): void {
  const c = ws.getCell(fila, col);
  const v = enSoles(usdVal, tasa);
  if (v === null) {
    c.value = '—';
    return;
  }
  c.value = v;
  c.numFmt = MONEDA_SOLES;
}

/** Celda con fórmula viva de conversión: =IF(tasa vacía,"—",USD*tasa). */
function celSolFormula(
  ws: ExcelJS.Worksheet,
  fila: number,
  col: number,
  refUsd: string,
  refTasa: string,
  tasa: number | null,
  usdVal: number,
): void {
  const c = ws.getCell(fila, col);
  if (tasa === null) {
    c.value = '—';
    return;
  }
  c.value = { formula: `IF(${refTasa}${fila}="","—",${refUsd}${fila}*${refTasa}${fila})`, result: usdVal * tasa } as ExcelJS.CellValue;
  c.numFmt = MONEDA_SOLES;
}

/** Suma en soles de las filas convertibles (por día); null si ninguna convierte. */
function sumaSolesPorDia(tc: TcEstado, filas: { fechaISO: string | null; importes: number[] }[]): number | null {
  let total = 0;
  let alguna = false;
  for (const f of filas) {
    const tasa = tasaPara(tc, f.fechaISO);
    if (tasa === null) continue;
    alguna = true;
    for (const imp of f.importes) total += imp * tasa;
  }
  return alguna ? total : null;
}

export async function generarReporte(d: DatosReporte): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Top Motors Reporte';
  wb.created = new Date(d.generadoISO);

  const TV = tasaVigente(d.tc);
  const tc = d.tc;

  // soles por día para los agregados que nacen de reservas / facturaciones
  const filasRes = d.reservas.map((r) => ({
    fechaISO: r.fechaISO,
    importes: [num(r.valorNeto), num(r.cobrado), num(r.saldo), num(r.exceso)],
  }));
  const resValorNetoSol = sumaSolesPorDia(tc, d.reservas.map((r) => ({ fechaISO: r.fechaISO, importes: [num(r.valorNeto)] })));
  const resCobradoSol = sumaSolesPorDia(tc, d.reservas.map((r) => ({ fechaISO: r.fechaISO, importes: [num(r.cobrado)] })));
  const resSaldoSol = sumaSolesPorDia(tc, d.reservas.map((r) => ({ fechaISO: r.fechaISO, importes: [num(r.saldo)] })));
  const resExcesoSol = sumaSolesPorDia(tc, d.reservas.map((r) => ({ fechaISO: r.fechaISO, importes: [num(r.exceso)] })));
  void filasRes;
  const factSol = sumaSolesPorDia(tc, d.facturaciones.map((f) => ({ fechaISO: f.fechaISO, importes: [num(f.usd)] })));

  // ------------------------------------------------------------ Dashboard
  const rs = wb.addWorksheet('Dashboard', { views: [{ state: 'frozen', ySplit: 4 }] });
  
  titulo(
    rs,
    'Top Motors — Dashboard',
    `Generado ${d.generadoISO} · USD y soles (tasa por día; sin tasa = “—”) · IGV ${d.cfg.igvPorcentaje}% · tablas en la hoja “Tablas_Dashboard”`,
  );
  const kpis: { nombre: string; valor: string | number; fmt?: string; soles?: number | null }[] = [
    { nombre: 'Valor neto de reservas', valor: num(d.dashboard.valorNeto), fmt: MONEDA, soles: resValorNetoSol },
    { nombre: 'Cobrado', valor: num(d.dashboard.cobrado), fmt: MONEDA, soles: resCobradoSol },
    { nombre: 'Saldo por cobrar', valor: num(d.dashboard.saldo), fmt: MONEDA, soles: resSaldoSol },
    { nombre: 'Exceso cobrado', valor: num(d.dashboard.exceso), fmt: MONEDA, soles: resExcesoSol },
    { nombre: 'Avance de cobro', valor: d.dashboard.avance, fmt: PORC },
    { nombre: 'Reservas (pedidos)', valor: d.dashboard.reservas, fmt: '0' },
    { nombre: 'Clientes en reserva', valor: d.dashboard.resumenModelos.reduce((a, m) => a + m.clientes, 0), fmt: '0' },
    { nombre: 'Motos reservadas', valor: d.dashboard.motosReservadas, fmt: '0' },
    { nombre: 'Cobradas 100%', valor: d.dashboard.cobradas100, fmt: '0' },
    { nombre: 'Motos facturadas', valor: d.dashboard.facturadasMotos, fmt: '0' },
    { nombre: 'Facturado', valor: num(d.dashboard.facturadoUsd), fmt: MONEDA, soles: factSol },
    { nombre: 'Stock inicial (motos)', valor: d.dashboard.stockInicial, fmt: '0' },
    { nombre: 'Facturadas desde stock', valor: d.dashboard.stockFacturadas, fmt: '0' },
    { nombre: 'Reservas desde stock', valor: d.dashboard.stockReservas, fmt: '0' },
    { nombre: 'Stock proyectado (motos)', valor: d.dashboard.stockSaldo, fmt: '0' },
    { nombre: 'Estimado neto en stock', valor: num(d.dashboard.estimadoStockNeto), fmt: MONEDA, soles: enSoles(num(d.dashboard.estimadoStockNeto), TV) },
    { nombre: 'ESTIMADO NETO TOTAL', valor: num(d.dashboard.estimadoNetoTotal), fmt: MONEDA, soles: enSoles(num(d.dashboard.estimadoNetoTotal), TV) },
    { nombre: 'Estimado parcial (cobrado)', valor: num(d.dashboard.estimadoParcialCobrado), fmt: MONEDA, soles: enSoles(num(d.dashboard.estimadoParcialCobrado), TV) },
    { nombre: 'Saldo por cobrar (estimado)', valor: num(d.dashboard.estimadoSaldoPorCobrar), fmt: MONEDA, soles: enSoles(num(d.dashboard.estimadoSaldoPorCobrar), TV) },
  ];
  encabezado(rs, 4, ['Indicador', 'USD', 'Soles']);
  let r = 5;
  for (const k of kpis) {
    const esTotal = k.nombre === 'ESTIMADO NETO TOTAL';
    const cNombre = rs.getCell(r, 1);
    cNombre.value = k.nombre;
    if (esTotal) cNombre.font = { bold: true, color: { argb: 'FF1E8E3E' } };
    const c = rs.getCell(r, 2);
    c.value = k.valor as ExcelJS.CellValue;
    if (k.fmt) c.numFmt = k.fmt;
    if (esTotal) c.font = { bold: true, color: { argb: 'FF1E8E3E' } };
    const cs = rs.getCell(r, 3);
    if (k.soles !== undefined) {
      if (k.soles === null) cs.value = '—';
      else {
        cs.value = k.soles;
        cs.numFmt = MONEDA_SOLES;
        if (esTotal) cs.font = { bold: true, color: { argb: 'FF1E8E3E' } };
      }
    }
    r += 1;
  }
  rs.getColumn(1).width = 34;
  rs.getColumn(2).width = 16;
  rs.getColumn(3).width = 16;
  for (let i = 4; i <= 12; i++) rs.getColumn(i).width = 13;

  // --------------------------------------------------- Tablas_Dashboard
  const td = wb.addWorksheet('Tablas_Dashboard', { views: [{ state: 'frozen', ySplit: 4 }] });
  
  titulo(
    td,
    'Tablas del dashboard',
    'Resumen por modelo, controles de conciliación y reservas por estado · filtros activos en la primera tabla',
  );

  // --- Reservas por modelo (con fórmulas vivas + soles por día)
  let tr = 4;
  td.getCell(tr, 1).value = 'Reservas por modelo';
  td.getCell(tr, 1).font = { bold: true, size: 12 };
  tr += 1;
  const colsModelo = [
    'Modelo', 'Clientes', 'Reservas', 'Motos', 'Valor neto', 'Cobrado', 'Saldo', 'Avance', 'Facturadas',
    'Valor neto S/', 'Cobrado S/', 'Saldo S/',
  ];
  encabezado(td, tr, colsModelo);
  const filaEncG = tr;
  const solPorModelo = new Map<string, { valor: number | null; cobrado: number | null; saldo: number | null }>();
  for (const m of d.dashboard.resumenModelos) {
    solPorModelo.set(m.modelo, {
      valor: sumaSolesPorDia(tc, d.reservas.filter((x) => (x.modelo ?? '(sin modelo)') === m.modelo).map((x) => ({ fechaISO: x.fechaISO, importes: [num(x.valorNeto)] }))),
      cobrado: sumaSolesPorDia(tc, d.reservas.filter((x) => (x.modelo ?? '(sin modelo)') === m.modelo).map((x) => ({ fechaISO: x.fechaISO, importes: [num(x.cobrado)] }))),
      saldo: sumaSolesPorDia(tc, d.reservas.filter((x) => (x.modelo ?? '(sin modelo)') === m.modelo).map((x) => ({ fechaISO: x.fechaISO, importes: [num(x.saldo)] }))),
    });
  }
  d.dashboard.resumenModelos.forEach((m: GrupoModelo, i) => {
    const fila = filaEncG + 1 + i;
    td.getCell(fila, 1).value = m.modelo;
    td.getCell(fila, 2).value = m.clientes;
    td.getCell(fila, 3).value = m.reservas;
    td.getCell(fila, 4).value = m.motos;
    td.getCell(fila, 5).value = num(m.valorNeto);
    td.getCell(fila, 5).numFmt = MONEDA;
    td.getCell(fila, 6).value = num(m.cobrado);
    td.getCell(fila, 6).numFmt = MONEDA;
    td.getCell(fila, 7).value = num(m.saldo);
    td.getCell(fila, 7).numFmt = MONEDA;
    td.getCell(fila, 8).value = { formula: `IF(E${fila}=0,0,F${fila}/E${fila})`, result: m.avance } as ExcelJS.CellValue;
    td.getCell(fila, 8).numFmt = PORC;
    td.getCell(fila, 9).value = m.facturadas;
    const s = solPorModelo.get(m.modelo);
    celSol(td, fila, 10, num(m.valorNeto), s?.valor === undefined ? null : null);
    if (s?.valor != null) { td.getCell(fila, 10).value = s.valor; td.getCell(fila, 10).numFmt = MONEDA_SOLES; } else td.getCell(fila, 10).value = '—';
    if (s?.cobrado != null) { td.getCell(fila, 11).value = s.cobrado; td.getCell(fila, 11).numFmt = MONEDA_SOLES; } else td.getCell(fila, 11).value = '—';
    if (s?.saldo != null) { td.getCell(fila, 12).value = s.saldo; td.getCell(fila, 12).numFmt = MONEDA_SOLES; } else td.getCell(fila, 12).value = '—';
  });
  tr = filaEncG + d.dashboard.resumenModelos.length + 1;
  if (d.dashboard.resumenModelos.length) {
    tr += 1;
    td.getCell(tr, 1).value = 'TOTAL';
    td.getCell(tr, 1).font = { bold: true };
    for (const col of [2, 3, 4, 5, 6, 7, 9, 10, 11, 12]) {
      const letra = td.getColumn(col).letter;
      td.getCell(tr, col).value = { formula: `SUM(${letra}${filaEncG + 1}:${letra}${tr - 1})`, result: undefined } as ExcelJS.CellValue;
      td.getCell(tr, col).font = { bold: true };
      if (col >= 5 && col <= 7) td.getCell(tr, col).numFmt = MONEDA;
      if (col >= 10) td.getCell(tr, col).numFmt = MONEDA_SOLES;
    }
    td.autoFilter = { from: { row: filaEncG, column: 1 }, to: { row: tr - 1, column: colsModelo.length } };
  }

  // --- Conciliación (USD: es un control interno, no un importe a convertir)
  tr += 2;
  td.getCell(tr, 1).value = 'Controles de conciliación (USD)';
  td.getCell(tr, 1).font = { bold: true, size: 12 };
  tr += 1;
  encabezado(td, tr, ['Control', 'Esperado', 'Obtenido', 'Diferencia', 'Estado', 'Detalle']);
  tr += 1;
  for (const c of d.dashboard.conciliacion) {
    td.getCell(tr, 1).value = c.nombre;
    td.getCell(tr, 2).value = num(c.esperado);
    td.getCell(tr, 2).numFmt = MONEDA;
    td.getCell(tr, 3).value = num(c.obtenido);
    td.getCell(tr, 3).numFmt = MONEDA;
    td.getCell(tr, 4).value = num(c.diferencia);
    td.getCell(tr, 4).numFmt = MONEDA;
    const est = td.getCell(tr, 5);
    est.value = c.ok ? 'OK' : 'REVISAR';
    est.font = { bold: true, color: { argb: c.ok ? 'FF1E8E3E' : 'FFC5221F' } };
    td.getCell(tr, 6).value = c.detalle;
    tr += 1;
  }

  // --- Reservas por estado (motos, valor neto, cobrado, saldo + soles)
  tr += 2;
  td.getCell(tr, 1).value = 'Reservas por estado';
  td.getCell(tr, 1).font = { bold: true, size: 12 };
  tr += 1;
  encabezado(td, tr, [
    'Estado', 'Reservas', 'Motos', 'Clientes', 'Valor neto', 'Cobrado', 'Saldo', 'Avance',
    'Valor neto S/', 'Cobrado S/', 'Saldo S/',
  ]);
  const filaEncE = tr;
  interface FilaEstado {
    estado: string;
    reservas: number;
    motos: number;
    valorNeto: number;
    cobrado: number;
    saldo: number;
    clientes: Set<string>;
    solValor: number | null;
    solCobrado: number | null;
    solSaldo: number | null;
  }
  const porEstado = new Map<string, FilaEstado>();
  for (const res of d.reservas) {
    const estado = res.estado || '(sin estado)';
    let f = porEstado.get(estado);
    if (!f) {
      f = {
        estado, reservas: 0, motos: 0, valorNeto: 0, cobrado: 0, saldo: 0, clientes: new Set(),
        solValor: null, solCobrado: null, solSaldo: null,
      };
      porEstado.set(estado, f);
    }
    f.reservas += 1;
    f.motos += res.motos;
    f.valorNeto += num(res.valorNeto);
    f.cobrado += num(res.cobrado);
    f.saldo += num(res.saldo);
    if (res.cliente && normalizar(res.cliente)) f.clientes.add(normalizar(res.cliente));
    const t = tasaPara(tc, res.fechaISO);
    if (t !== null) {
      f.solValor = (f.solValor ?? 0) + num(res.valorNeto) * t;
      f.solCobrado = (f.solCobrado ?? 0) + num(res.cobrado) * t;
      f.solSaldo = (f.solSaldo ?? 0) + num(res.saldo) * t;
    }
  }
  const filasEstado = [...porEstado.values()].sort((a, b) => a.estado.localeCompare(b.estado));
  filasEstado.forEach((f, i) => {
    const fila = filaEncE + 1 + i;
    const est = td.getCell(fila, 1);
    est.value = f.estado;
    if (/facturada/i.test(f.estado)) est.font = { bold: true, color: { argb: 'FF1E8E3E' } };
    else if (/100/i.test(f.estado)) est.font = { color: { argb: 'FF7C5CFF' } };
    else if (/parcial/i.test(f.estado)) est.font = { color: { argb: 'FFE0A800' } };
    td.getCell(fila, 2).value = f.reservas;
    td.getCell(fila, 3).value = f.motos;
    td.getCell(fila, 4).value = f.clientes.size;
    td.getCell(fila, 5).value = f.valorNeto;
    td.getCell(fila, 5).numFmt = MONEDA;
    td.getCell(fila, 6).value = f.cobrado;
    td.getCell(fila, 6).numFmt = MONEDA;
    td.getCell(fila, 7).value = f.saldo;
    td.getCell(fila, 7).numFmt = MONEDA;
    td.getCell(fila, 8).value = { formula: `IF(E${fila}=0,0,F${fila}/E${fila})`, result: f.valorNeto ? f.cobrado / f.valorNeto : 0 } as ExcelJS.CellValue;
    td.getCell(fila, 8).numFmt = PORC;
    for (const [col, v] of [[9, f.solValor], [10, f.solCobrado], [11, f.solSaldo]] as const) {
      if (v === null) td.getCell(fila, col).value = '—';
      else {
        td.getCell(fila, col).value = v;
        td.getCell(fila, col).numFmt = MONEDA_SOLES;
      }
    }
  });
  if (filasEstado.length) {
    const ultE = filaEncE + filasEstado.length;
    const totE = ultE + 1;
    td.getCell(totE, 1).value = 'TOTAL';
    td.getCell(totE, 1).font = { bold: true };
    for (const col of [2, 3, 5, 6, 7, 9, 10, 11]) {
      const letra = td.getColumn(col).letter;
      td.getCell(totE, col).value = { formula: `SUM(${letra}${filaEncE + 1}:${letra}${ultE})`, result: undefined } as ExcelJS.CellValue;
      td.getCell(totE, col).font = { bold: true };
      if (col >= 5 && col <= 7) td.getCell(totE, col).numFmt = MONEDA;
      if (col >= 9) td.getCell(totE, col).numFmt = MONEDA_SOLES;
    }
  }
  [30, 12, 10, 10, 14, 14, 14, 10, 15, 15, 15, 14].forEach((w, i) => {
    td.getColumn(i + 1).width = w;
  });

  // ---------------------------------------------------------- Clientes
  const cl = wb.addWorksheet('Clientes', { views: [{ state: 'frozen', ySplit: 3 }] });
  
  titulo(
    cl,
    'Detalle por cliente',
    'Quién compró, qué modelo/color, cómo está financiado (estado) y cuánto falta cobrar · soles al tasa del día de cada reserva',
  );
  const colsC = [
    'Cliente', 'Modelos', 'Colores', 'Estado financiero', 'Reservas', 'Motos',
    'Valor neto', 'Cobrado', 'Saldo', 'Avance', 'Valor neto S/', 'Cobrado S/', 'Saldo S/',
  ];
  encabezado(cl, 3, colsC);
  interface FilaCliente {
    cliente: string;
    modelos: Set<string>;
    colores: Set<string>;
    estados: Set<string>;
    reservas: number;
    motos: number;
    valorNeto: number;
    cobrado: number;
    saldo: number;
    solValor: number | null;
    solCobrado: number | null;
    solSaldo: number | null;
  }
  const porCliente = new Map<string, FilaCliente>();
  for (const res of d.reservas) {
    const clave = normalizar(res.cliente ?? '') || `pedido-${res.pedido}`;
    let f = porCliente.get(clave);
    if (!f) {
      f = {
        cliente: res.cliente ?? `(pedido ${res.pedido})`,
        modelos: new Set(), colores: new Set(), estados: new Set(),
        reservas: 0, motos: 0, valorNeto: 0, cobrado: 0, saldo: 0,
        solValor: null, solCobrado: null, solSaldo: null,
      };
      porCliente.set(clave, f);
    }
    if (res.modelo) f.modelos.add(res.modelo);
    if (res.color) f.colores.add(res.color);
    f.estados.add(res.estado || '(sin estado)');
    f.reservas += 1;
    f.motos += res.motos;
    f.valorNeto += num(res.valorNeto);
    f.cobrado += num(res.cobrado);
    f.saldo += num(res.saldo);
    const t = tasaPara(tc, res.fechaISO);
    if (t !== null) {
      f.solValor = (f.solValor ?? 0) + num(res.valorNeto) * t;
      f.solCobrado = (f.solCobrado ?? 0) + num(res.cobrado) * t;
      f.solSaldo = (f.solSaldo ?? 0) + num(res.saldo) * t;
    }
  }
  const filasCliente = [...porCliente.values()].sort((a, b) => b.saldo - a.saldo || a.cliente.localeCompare(b.cliente));
  filasCliente.forEach((f, i) => {
    const fila = 4 + i;
    cl.getCell(fila, 1).value = f.cliente;
    cl.getCell(fila, 2).value = [...f.modelos].join(', ');
    cl.getCell(fila, 3).value = [...f.colores].join(', ');
    cl.getCell(fila, 4).value = [...f.estados].join(', ');
    cl.getCell(fila, 5).value = f.reservas;
    cl.getCell(fila, 6).value = f.motos;
    cl.getCell(fila, 7).value = f.valorNeto;
    cl.getCell(fila, 7).numFmt = MONEDA;
    cl.getCell(fila, 8).value = f.cobrado;
    cl.getCell(fila, 8).numFmt = MONEDA;
    cl.getCell(fila, 9).value = f.saldo;
    cl.getCell(fila, 9).numFmt = MONEDA;
    cl.getCell(fila, 10).value = { formula: `IF(G${fila}=0,0,H${fila}/G${fila})`, result: f.valorNeto ? f.cobrado / f.valorNeto : 0 } as ExcelJS.CellValue;
    cl.getCell(fila, 10).numFmt = PORC;
    for (const [col, v] of [[11, f.solValor], [12, f.solCobrado], [13, f.solSaldo]] as const) {
      if (v === null) cl.getCell(fila, col).value = '—';
      else {
        cl.getCell(fila, col).value = v;
        cl.getCell(fila, col).numFmt = MONEDA_SOLES;
      }
    }
  });
  if (filasCliente.length) {
    const ultC = 3 + filasCliente.length;
    const totC = ultC + 1;
    cl.getCell(totC, 1).value = 'TOTAL';
    cl.getCell(totC, 1).font = { bold: true };
    for (const col of [5, 6, 7, 8, 9, 11, 12, 13]) {
      const letra = cl.getColumn(col).letter;
      cl.getCell(totC, col).value = { formula: `SUM(${letra}4:${letra}${ultC})`, result: undefined } as ExcelJS.CellValue;
      cl.getCell(totC, col).font = { bold: true };
      if (col >= 7 && col <= 9) cl.getCell(totC, col).numFmt = MONEDA;
      if (col >= 11) cl.getCell(totC, col).numFmt = MONEDA_SOLES;
    }
    cl.addConditionalFormatting({
      ref: `I4:I${ultC}`,
      rules: [{ type: 'cellIs', priority: 1, operator: 'greaterThan', formulae: ['0'], style: { font: { color: { argb: 'FFC5221F' } } } }],
    });
    cl.autoFilter = { from: { row: 3, column: 1 }, to: { row: ultC, column: colsC.length } };
  }
  [30, 26, 22, 24, 10, 8, 14, 14, 14, 10, 15, 15, 15].forEach((w, i) => {
    cl.getColumn(i + 1).width = w;
  });

  // --------------------------------------------------------------- Reservas
  const rv = wb.addWorksheet('Reservas', { views: [{ state: 'frozen', ySplit: 3 }] });
  
  titulo(rv, 'Reservas (anticipos por pedido)', 'T.C. = tipo de cambio del día de la reserva; columnas S/ con fórmula viva USD × T.C.');
  const colsR = [
    'Pedido', 'Fecha', 'Cliente', 'Vendedor', 'SKU', 'Modelo', 'Color', 'Motos', 'Precio lista', 'Fuente precio',
    'Descuento', 'Valor neto', 'Cobrado', 'Saldo', 'Exceso', 'Pagos', 'Estado', 'Conf. modelo', 'Conf. color', 'Motivos',
    'T.C. día', 'Valor neto S/', 'Cobrado S/', 'Saldo S/', 'Precio lista S/',
  ];
  encabezado(rv, 3, colsR);
  d.reservas.forEach((res, i) => {
    const fila = 4 + i;
    const t = tasaPara(tc, res.fechaISO);
    rv.getCell(fila, 1).value = res.pedido;
    rv.getCell(fila, 2).value = res.fechaISO ?? '';
    rv.getCell(fila, 3).value = res.cliente ?? '';
    rv.getCell(fila, 4).value = res.vendedor ?? '';
    rv.getCell(fila, 5).value = res.sku ?? '';
    rv.getCell(fila, 6).value = res.modelo ?? '';
    rv.getCell(fila, 7).value = res.color ?? '';
    rv.getCell(fila, 8).value = res.motos;
    rv.getCell(fila, 9).value = num(res.precioLista);
    rv.getCell(fila, 9).numFmt = MONEDA;
    rv.getCell(fila, 10).value = res.fuentePrecio;
    rv.getCell(fila, 11).value = num(res.descuento);
    rv.getCell(fila, 11).numFmt = MONEDA;
    rv.getCell(fila, 12).value = { formula: `I${fila}*H${fila}-K${fila}`, result: num(res.valorNeto) } as ExcelJS.CellValue;
    rv.getCell(fila, 12).numFmt = MONEDA;
    rv.getCell(fila, 13).value = num(res.cobrado);
    rv.getCell(fila, 13).numFmt = MONEDA;
    rv.getCell(fila, 14).value = { formula: `MAX(L${fila}-M${fila},0)`, result: num(res.saldo) } as ExcelJS.CellValue;
    rv.getCell(fila, 14).numFmt = MONEDA;
    rv.getCell(fila, 15).value = num(res.exceso);
    rv.getCell(fila, 15).numFmt = MONEDA;
    rv.getCell(fila, 16).value = res.pagos;
    rv.getCell(fila, 17).value = res.estado;
    rv.getCell(fila, 18).value = res.confianzaModelo;
    rv.getCell(fila, 18).numFmt = '0.00';
    rv.getCell(fila, 19).value = res.confianzaColor;
    rv.getCell(fila, 19).numFmt = '0.00';
    rv.getCell(fila, 20).value = res.motivos.join(' · ');
    // T.C. + soles (U=21, V=22, W=23, X=24, Y=25)
    const ct = rv.getCell(fila, 21);
    if (t === null) ct.value = '';
    else {
      ct.value = t;
      ct.numFmt = '0.0000';
    }
    celSolFormula(rv, fila, 22, 'L', '$U', t, num(res.valorNeto));
    celSolFormula(rv, fila, 23, 'M', '$U', t, num(res.cobrado));
    celSolFormula(rv, fila, 24, 'N', '$U', t, num(res.saldo));
    celSolFormula(rv, fila, 25, 'I', '$U', t, num(res.precioLista));
  });
  const ult = 3 + d.reservas.length;
  if (d.reservas.length) {
    const tot = ult + 1;
    rv.getCell(tot, 1).value = 'TOTAL';
    rv.getCell(tot, 1).font = { bold: true };
    for (const col of [8, 12, 13, 14, 15, 22, 23, 24]) {
      const letra = rv.getColumn(col).letter;
      rv.getCell(tot, col).value = { formula: `SUM(${letra}4:${letra}${ult})`, result: undefined } as ExcelJS.CellValue;
      rv.getCell(tot, col).font = { bold: true };
      if (col >= 12 && col <= 15) rv.getCell(tot, col).numFmt = MONEDA;
      if (col >= 22) rv.getCell(tot, col).numFmt = MONEDA_SOLES;
    }
    rv.autoFilter = { from: { row: 3, column: 1 }, to: { row: ult, column: colsR.length } };
  }
  [12, 24, 10, 16, 12, 20, 12, 8, 14, 24, 12, 14, 14, 14, 12, 8, 14, 12, 12, 40, 10, 15, 15, 15, 15].forEach((w, i) => {
    rv.getColumn(i + 1).width = w;
  });

  // ------------------------------------------- Reservas por estado (pivot)
  const re = wb.addWorksheet('Reservas_Estado', { views: [{ state: 'frozen', ySplit: 3 }] });
  
  titulo(re, 'Reservas por modelo, color y estado', 'Cada fila cruza modelo + color + estado (facturada, pagada 100%, pago parcial…)');
  const colsRE = ['Modelo', 'Color', 'Estado', 'Reservas', 'Motos', 'Clientes', 'Valor neto', 'Cobrado', 'Saldo', 'Valor neto S/', 'Cobrado S/', 'Saldo S/'];
  encabezado(re, 3, colsRE);
  interface FilaME {
    modelo: string;
    color: string;
    estado: string;
    reservas: number;
    motos: number;
    valorNeto: number;
    cobrado: number;
    saldo: number;
    clientes: Set<string>;
    solValor: number | null;
    solCobrado: number | null;
    solSaldo: number | null;
  }
  const porME = new Map<string, FilaME>();
  for (const res of d.reservas) {
    const modelo = res.modelo ?? '(sin modelo)';
    const color = res.color ?? '(sin color)';
    const estado = res.estado || '(sin estado)';
    const k = `${modelo}||${color}||${estado}`;
    let f = porME.get(k);
    if (!f) {
      f = {
        modelo, color, estado, reservas: 0, motos: 0, valorNeto: 0, cobrado: 0, saldo: 0,
        clientes: new Set(), solValor: null, solCobrado: null, solSaldo: null,
      };
      porME.set(k, f);
    }
    f.reservas += 1;
    f.motos += res.motos;
    f.valorNeto += num(res.valorNeto);
    f.cobrado += num(res.cobrado);
    f.saldo += num(res.saldo);
    if (res.cliente && normalizar(res.cliente)) f.clientes.add(normalizar(res.cliente));
    const t = tasaPara(tc, res.fechaISO);
    if (t !== null) {
      f.solValor = (f.solValor ?? 0) + num(res.valorNeto) * t;
      f.solCobrado = (f.solCobrado ?? 0) + num(res.cobrado) * t;
      f.solSaldo = (f.solSaldo ?? 0) + num(res.saldo) * t;
    }
  }
  const filasME = [...porME.values()].sort(
    (a, b) => a.modelo.localeCompare(b.modelo) || a.color.localeCompare(b.color) || a.estado.localeCompare(b.estado),
  );
  filasME.forEach((f, i) => {
    const fila = 4 + i;
    re.getCell(fila, 1).value = f.modelo;
    re.getCell(fila, 2).value = f.color;
    const est = re.getCell(fila, 3);
    est.value = f.estado;
    if (/facturada/i.test(f.estado)) est.font = { bold: true, color: { argb: 'FF1E8E3E' } };
    else if (/100/i.test(f.estado)) est.font = { color: { argb: 'FF7C5CFF' } };
    else if (/parcial/i.test(f.estado)) est.font = { color: { argb: 'FFE0A800' } };
    re.getCell(fila, 4).value = f.reservas;
    re.getCell(fila, 5).value = f.motos;
    re.getCell(fila, 6).value = f.clientes.size;
    re.getCell(fila, 7).value = f.valorNeto;
    re.getCell(fila, 7).numFmt = MONEDA;
    re.getCell(fila, 8).value = f.cobrado;
    re.getCell(fila, 8).numFmt = MONEDA;
    re.getCell(fila, 9).value = f.saldo;
    re.getCell(fila, 9).numFmt = MONEDA;
    for (const [col, v] of [[10, f.solValor], [11, f.solCobrado], [12, f.solSaldo]] as const) {
      if (v === null) re.getCell(fila, col).value = '—';
      else {
        re.getCell(fila, col).value = v;
        re.getCell(fila, col).numFmt = MONEDA_SOLES;
      }
    }
  });
  if (filasME.length) {
    const ultE = 3 + filasME.length;
    const totE = ultE + 1;
    re.getCell(totE, 1).value = 'TOTAL';
    re.getCell(totE, 1).font = { bold: true };
    for (const col of [4, 5, 7, 8, 9, 10, 11, 12]) {
      const letra = re.getColumn(col).letter;
      re.getCell(totE, col).value = { formula: `SUM(${letra}4:${letra}${ultE})`, result: undefined } as ExcelJS.CellValue;
      re.getCell(totE, col).font = { bold: true };
      if (col >= 7 && col <= 9) re.getCell(totE, col).numFmt = MONEDA;
      if (col >= 10) re.getCell(totE, col).numFmt = MONEDA_SOLES;
    }
    re.autoFilter = { from: { row: 3, column: 1 }, to: { row: ultE, column: colsRE.length } };
  }
  [24, 14, 16, 10, 8, 10, 14, 14, 14, 15, 15, 15].forEach((w, i) => {
    re.getColumn(i + 1).width = w;
  });

  // -------------------------------------------------------- Modelo · Color
  const gm = wb.addWorksheet('Modelo_Color', { views: [{ state: 'frozen', ySplit: 3 }] });
  
  titulo(gm, 'Detalle por modelo y color');
  const colsG = ['Modelo', 'Color', 'Reservas', 'Motos', 'Valor neto', 'Cobrado', 'Saldo', 'Exceso', 'Avance', 'Facturadas', 'Clientes', 'Valor neto S/', 'Cobrado S/', 'Saldo S/'];
  encabezado(gm, 3, colsG);
  d.dashboard.porModelo.forEach((g: GrupoModeloColor, i) => {
    const fila = 4 + i;
    const mismo = (x: Reserva) => (x.modelo ?? '(sin modelo)') === g.modelo && (x.color ?? '(sin color)') === g.color;
    const solDe = (campo: CampoReserva) =>
      sumaSolesPorDia(tc, d.reservas.filter(mismo).map((x) => ({ fechaISO: x.fechaISO, importes: [num(x[campo])] })));
    gm.getCell(fila, 1).value = g.modelo;
    gm.getCell(fila, 2).value = g.color;
    gm.getCell(fila, 3).value = g.reservas;
    gm.getCell(fila, 4).value = g.motos;
    gm.getCell(fila, 5).value = num(g.valorNeto);
    gm.getCell(fila, 5).numFmt = MONEDA;
    gm.getCell(fila, 6).value = num(g.cobrado);
    gm.getCell(fila, 6).numFmt = MONEDA;
    gm.getCell(fila, 7).value = num(g.saldo);
    gm.getCell(fila, 7).numFmt = MONEDA;
    gm.getCell(fila, 8).value = num(g.exceso);
    gm.getCell(fila, 8).numFmt = MONEDA;
    gm.getCell(fila, 9).value = { formula: `IF(E${fila}=0,0,F${fila}/E${fila})`, result: g.avance } as ExcelJS.CellValue;
    gm.getCell(fila, 9).numFmt = PORC;
    gm.getCell(fila, 10).value = g.facturadas;
    gm.getCell(fila, 11).value = g.clientes;
    const sv = solDe('valorNeto');
    const sc = solDe('cobrado');
    const ss = solDe('saldo');
    if (sv === null) gm.getCell(fila, 12).value = '—';
    else {
      gm.getCell(fila, 12).value = sv;
      gm.getCell(fila, 12).numFmt = MONEDA_SOLES;
    }
    if (sc === null) gm.getCell(fila, 13).value = '—';
    else {
      gm.getCell(fila, 13).value = sc;
      gm.getCell(fila, 13).numFmt = MONEDA_SOLES;
    }
    if (ss === null) gm.getCell(fila, 14).value = '—';
    else {
      gm.getCell(fila, 14).value = ss;
      gm.getCell(fila, 14).numFmt = MONEDA_SOLES;
    }
  });
  if (d.dashboard.porModelo.length) {
    const ultG = 3 + d.dashboard.porModelo.length;
    gm.addConditionalFormatting({
      ref: `I4:I${ultG}`,
      rules: [{ type: 'cellIs', priority: 1, operator: 'lessThan', formulae: ['0.5'], style: { font: { color: { argb: 'FFC5221F' }, bold: true } } }],
    });
    for (const col of [12, 13, 14]) {
      const letra = gm.getColumn(col).letter;
      gm.getCell(ultG + 1, col).value = { formula: `SUM(${letra}4:${letra}${ultG})`, result: undefined } as ExcelJS.CellValue;
      gm.getCell(ultG + 1, col).numFmt = MONEDA_SOLES;
      gm.getCell(ultG + 1, col).font = { bold: true };
    }
    gm.getCell(ultG + 1, 1).value = 'TOTAL';
    gm.getCell(ultG + 1, 1).font = { bold: true };
    gm.autoFilter = { from: { row: 3, column: 1 }, to: { row: ultG, column: colsG.length } };
  }
  [24, 14, 10, 8, 14, 14, 14, 12, 10, 12, 10, 15, 15, 15].forEach((w, i) => {
    gm.getColumn(i + 1).width = w;
  });

  // --------------------------------------------------------- Facturaciones
  const fc = wb.addWorksheet('Facturaciones', { views: [{ state: 'frozen', ySplit: 3 }] });
  
  titulo(fc, 'Vehículos facturados', 'T.C. = tipo de cambio del día de la facturación; Soles = USD × T.C. (fórmula viva)');
  const colsF = ['Fecha', 'Documento', 'Pedido', 'Cliente', 'Vendedor', 'Modelo', 'Color', 'USD', 'T.C. día', 'Soles'];
  encabezado(fc, 3, colsF);
  d.facturaciones.forEach((f, i) => {
    const fila = 4 + i;
    const t = tasaPara(tc, f.fechaISO);
    fc.getCell(fila, 1).value = f.fechaISO ?? '';
    fc.getCell(fila, 2).value = f.documento;
    fc.getCell(fila, 3).value = f.pedido ?? '';
    fc.getCell(fila, 4).value = f.cliente ?? '';
    fc.getCell(fila, 5).value = f.vendedor ?? '';
    fc.getCell(fila, 6).value = f.modelo ?? '';
    fc.getCell(fila, 7).value = f.color ?? '';
    fc.getCell(fila, 8).value = num(f.usd);
    fc.getCell(fila, 8).numFmt = MONEDA;
    const ct = fc.getCell(fila, 9);
    if (t === null) ct.value = '';
    else {
      ct.value = t;
      ct.numFmt = '0.0000';
    }
    celSolFormula(fc, fila, 10, 'H', '$I', t, num(f.usd));
  });
  if (d.facturaciones.length) {
    const ultF = 3 + d.facturaciones.length;
    fc.getCell(ultF + 1, 1).value = 'TOTAL';
    fc.getCell(ultF + 1, 1).font = { bold: true };
    fc.getCell(ultF + 1, 8).value = { formula: `SUM(H4:H${ultF})`, result: undefined } as ExcelJS.CellValue;
    fc.getCell(ultF + 1, 8).numFmt = MONEDA;
    fc.getCell(ultF + 1, 8).font = { bold: true };
    fc.getCell(ultF + 1, 10).value = { formula: `SUM(J4:J${ultF})`, result: factSol ?? undefined } as ExcelJS.CellValue;
    fc.getCell(ultF + 1, 10).numFmt = MONEDA_SOLES;
    fc.getCell(ultF + 1, 10).font = { bold: true };
    fc.autoFilter = { from: { row: 3, column: 1 }, to: { row: ultF, column: colsF.length } };
  }
  [12, 14, 10, 28, 20, 24, 14, 14, 10, 15].forEach((w, i) => {
    fc.getColumn(i + 1).width = w;
  });

  // ----------------------------------------------------------------- Stock
  const st = wb.addWorksheet('Stock', { views: [{ state: 'frozen', ySplit: 3 }] });
  
  titulo(
    st,
    'Stock proyectado y estimado neto',
    `Fórmula: ${d.cfg.formulaStock} · el stock no tiene fecha: precio y estimado en soles usan la tasa vigente (${TV === null ? 'sin tasa = “—”' : TV.toFixed(4)})`,
  );
  const colsS = [
    'Modelo', 'Color', 'Inicial', 'Facturadas', 'Reservas', 'Saldo proyectado', 'Precio lista', 'Fuente precio',
    'Estimado neto', 'Fuente facturadas', 'Precio lista S/', 'Estimado neto S/',
  ];
  encabezado(st, 3, colsS);
  d.stockFilas.forEach((f, i) => {
    const fila = 4 + i;
    st.getCell(fila, 1).value = f.modelo;
    st.getCell(fila, 2).value = f.color;
    st.getCell(fila, 3).value = f.inicial;
    st.getCell(fila, 4).value = f.facturadas;
    st.getCell(fila, 5).value = f.reservas;
    st.getCell(fila, 6).value = { formula: `C${fila}-D${fila}-E${fila}`, result: f.saldo } as ExcelJS.CellValue;
    st.getCell(fila, 7).value = f.precio === null ? 'sin precio' : num(f.precio);
    if (f.precio !== null) st.getCell(fila, 7).numFmt = MONEDA;
    st.getCell(fila, 8).value = f.precioFuente ?? '';
    st.getCell(fila, 9).value = { formula: `IF(OR(F${fila}<=0,G${fila}="sin precio"),0,F${fila}*G${fila})`, result: num(f.estimadoNeto) } as ExcelJS.CellValue;
    st.getCell(fila, 9).numFmt = MONEDA;
    st.getCell(fila, 10).value = f.facturadasManual !== null ? `manual (Excel: ${f.facturadasCalculadas})` : 'Excel';
    // soles con tasa vigente (K=11, L=12)
    const precioSol = f.precio === null ? null : enSoles(num(f.precio), TV);
    if (precioSol === null) st.getCell(fila, 11).value = '—';
    else {
      st.getCell(fila, 11).value = precioSol;
      st.getCell(fila, 11).numFmt = MONEDA_SOLES;
    }
    const estSol = f.precio === null ? null : enSoles(num(f.estimadoNeto), TV);
    if (estSol === null) st.getCell(fila, 12).value = '—';
    else {
      st.getCell(fila, 12).value = estSol;
      st.getCell(fila, 12).numFmt = MONEDA_SOLES;
    }
  });
  if (d.stockFilas.length) {
    const ultS = 3 + d.stockFilas.length;
    st.getCell(ultS + 1, 1).value = 'TOTAL';
    st.getCell(ultS + 1, 1).font = { bold: true };
    for (const col of [3, 4, 5, 6, 9, 12]) {
      const letra = st.getColumn(col).letter;
      st.getCell(ultS + 1, col).value = { formula: `SUM(${letra}4:${letra}${ultS})`, result: undefined } as ExcelJS.CellValue;
      st.getCell(ultS + 1, col).font = { bold: true };
      if (col === 9) st.getCell(ultS + 1, col).numFmt = MONEDA;
      if (col === 12) st.getCell(ultS + 1, col).numFmt = MONEDA_SOLES;
    }
    st.autoFilter = { from: { row: 3, column: 1 }, to: { row: ultS, column: colsS.length } };
  }
  [24, 14, 10, 12, 10, 16, 14, 28, 16, 24, 15, 16].forEach((w, i) => {
    st.getColumn(i + 1).width = w;
  });

  // --------------------------------------------------------------- Ajustes
  const aj = wb.addWorksheet('Ajustes', { views: [{ state: 'frozen', ySplit: 3 }] });
  
  titulo(aj, 'Historial de cambios y reglas aprendidas', 'Trazabilidad: qué cambió, cuándo y por qué');
  encabezado(aj, 3, ['Fecha', 'Sección', 'Clave', 'Antes', 'Después', 'Revertido']);
  d.cambios.forEach((c: CambioConfig, i) => {
    const fila = 4 + i;
    aj.getCell(fila, 1).value = c.fechaISO;
    aj.getCell(fila, 2).value = c.seccion;
    aj.getCell(fila, 3).value = c.clave;
    aj.getCell(fila, 4).value = c.antes;
    aj.getCell(fila, 5).value = c.despues;
    aj.getCell(fila, 6).value = c.revertido ? 'sí' : 'no';
  });
  const filaReglas = 5 + d.cambios.length;
  aj.getCell(filaReglas, 1).value = 'Reglas de aprendizaje';
  aj.getCell(filaReglas, 1).font = { bold: true, size: 12 };
  encabezado(aj, filaReglas + 1, ['Tipo', 'Búsqueda', 'Columna', 'Valor', 'Origen', 'Activa']);
  d.reglas.forEach((rg: ReglaAprendizaje, i) => {
    const fila = filaReglas + 2 + i;
    aj.getCell(fila, 1).value = rg.tipo;
    aj.getCell(fila, 2).value = rg.busquedaOriginal || rg.busqueda;
    aj.getCell(fila, 3).value = rg.columna ?? '';
    aj.getCell(fila, 4).value = rg.valor;
    aj.getCell(fila, 5).value = rg.origen;
    aj.getCell(fila, 6).value = rg.activa ? 'sí' : 'no';
  });
  [22, 14, 22, 30, 30, 12].forEach((w, i) => {
    aj.getColumn(i + 1).width = w;
  });

  // ------------------------------------------------------ gráficos (Dashboard)
  try {
    await agregarGraficos(wb, rs, d);
  } catch {
    /* sin gráficos: el reporte sigue siendo válido */
  }

  return hojas;
}

interface SpecGrafico {
  tipo: 'bar' | 'doughnut';
  tituloTxt: string;
  labels: string[];
  datasets: { label?: string; data: number[]; backgroundColor: string | string[] }[];
  tl: { col: number; row: number };
}

/** Genera las imágenes de los gráficos y las pega en la hoja Dashboard. */
async function agregarGraficos(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, d: DatosReporte): Promise<void> {
  if (typeof document === 'undefined') return;
  const specs: SpecGrafico[] = [];

  // 1) cobrado vs saldo por modelo+color
  const top = [...d.dashboard.porModelo].sort((a, b) => num(b.valorNeto) - num(a.valorNeto)).slice(0, 12);
  if (top.length) {
    specs.push({
      tipo: 'bar',
      tituloTxt: `Cobrado vs saldo — top modelos (${d.cfg.simboloMoneda})`,
      labels: top.map((g) => `${g.modelo} · ${g.color}`),
      datasets: [
        { label: 'Cobrado', data: top.map((g) => num(g.cobrado)), backgroundColor: '#1E8E3E' },
        { label: 'Saldo', data: top.map((g) => num(g.saldo)), backgroundColor: '#E0A800' },
      ],
      tl: { col: 3.4, row: 3.6 },
    });
  }

  // 2) reservas por estado (anillo, valor neto)
  const estMap = new Map<string, number>();
  for (const r of d.reservas) {
    const e = r.estado || '(sin estado)';
    estMap.set(e, (estMap.get(e) ?? 0) + num(r.valorNeto));
  }
  if (estMap.size) {
    const paleta = ['#7C5CFF', '#1E8E3E', '#11003F', '#E0A800', '#00A2FF', '#C5221F'];
    specs.push({
      tipo: 'doughnut',
      tituloTxt: `Reservas por estado — valor neto (${d.cfg.simboloMoneda})`,
      labels: [...estMap.keys()],
      datasets: [{ data: [...estMap.values()], backgroundColor: paleta.slice(0, estMap.size) }],
      tl: { col: 3.4, row: 28 },
    });
  }

  // 3) stock por modelo: inicial / facturadas / proyectado
  const porModStock = new Map<string, { inicial: number; facturadas: number; proyectado: number }>();
  for (const f of d.stockFilas) {
    const a = porModStock.get(f.modelo) ?? { inicial: 0, facturadas: 0, proyectado: 0 };
    a.inicial += num(f.inicial);
    a.facturadas += num(f.facturadas);
    a.proyectado += Math.max(num(f.saldo), 0);
    porModStock.set(f.modelo, a);
  }
  if (porModStock.size) {
    const mods = [...porModStock.entries()].sort((a, b) => b[1].inicial - a[1].inicial).slice(0, 12);
    specs.push({
      tipo: 'bar',
      tituloTxt: 'Stock por modelo: inicial vs facturadas vs proyectado (motos)',
      labels: mods.map(([m]) => m),
      datasets: [
        { label: 'Inicial', data: mods.map(([, v]) => v.inicial), backgroundColor: '#00A2FF' },
        { label: 'Facturadas', data: mods.map(([, v]) => v.facturadas), backgroundColor: '#C5221F' },
        { label: 'Proyectado', data: mods.map(([, v]) => v.proyectado), backgroundColor: '#1E8E3E' },
      ],
      tl: { col: 3.4, row: 52.5 },
    });
  }

  if (!specs.length) return;
  const Chart = (await import('chart.js/auto')).default;
  for (const s of specs) {
    const canvas = document.createElement('canvas');
    canvas.width = 980;
    canvas.height = 460;
    const chart = new Chart(canvas, {
      type: s.tipo,
      data: { labels: s.labels, datasets: s.datasets },
      options: {
        responsive: false,
        animation: false,
        plugins: {
          title: { display: true, text: s.tituloTxt, color: '#11003F', font: { size: 15, weight: 'bold' } },
          legend: { labels: { color: '#333333' } },
        },
        ...(s.tipo === 'bar'
          ? { scales: { y: { ticks: { color: '#555555' } }, x: { ticks: { color: '#555555', maxRotation: 60, minRotation: 45 } } } }
          : {}),
      },
    });
    chart.update();
    const dataUrl = canvas.toDataURL('image/png');
    const idx = dataUrl.indexOf('base64,');
    if (idx > 0) {
      const b64 = dataUrl.slice(idx + 7);
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const id = wb.addImage({ buffer: arr.buffer as ArrayBuffer, extension: 'png' });
      ws.addImage(id, { tl: s.tl, ext: { width: 980, height: 460 } });
    }
    chart.destroy();
  }
}

export async function descargarReporte(d: DatosReporte): Promise<void> {
  const hojas = await generarReporte(d);
  void hojas;
  const wb = ((): ExcelJS.Workbook | null => {
    // generarReporte devuelve las hojas para tests; para descargar reconstruimos el wb
    return null;
  })();
  void wb;
  throw new Error('placeholder');
}
