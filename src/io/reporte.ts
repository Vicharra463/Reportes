// Reporte Excel con ExcelJS: 6 hojas, fórmulas vivas (SUM/COUNT sobre las
// propias hojas), formato moneda/porcentaje, filtros, congelado y resaltado
// rojo donde el avance de cobro < 50%. Gráfico de barras si Chart.js logra
// renderizar (navegador); si no, la hoja se genera igual sin gráfico.

import ExcelJS from 'exceljs';
import type { CambioConfig, Facturacion, GrupoModeloColor, ReglaAprendizaje, Reserva, ResumenDashboard } from '../tipos';
import type { Configuracion } from '../dominio/configuracion';
import type { FilaStock } from '../dominio/calcular';

export interface DatosReporte {
  dashboard: ResumenDashboard;
  reservas: Reserva[];
  facturaciones: Facturacion[];
  stockFilas: FilaStock[];
  cambios: CambioConfig[];
  reglas: ReglaAprendizaje[];
  cfg: Configuracion;
  generadoISO: string;
}

const MONEDA = '$#,##0.00';
const PORC = '0.0%';

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

export async function generarReporte(d: DatosReporte): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Top Motors Reporte';
  wb.created = new Date(d.generadoISO);

  // ---------------------------------------------------------------- Resumen
  const rs = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 4 }] });
  titulo(rs, 'Top Motors — Resumen de cobranza y estimado', `Generado ${d.generadoISO} · moneda ${d.cfg.simboloMoneda}${d.cfg.moneda} · IGV ${d.cfg.igvPorcentaje}%`);
  const kpis: [string, string | number, string | undefined][] = [
    ['Valor neto de reservas', num(d.dashboard.valorNeto), MONEDA],
    ['Cobrado', num(d.dashboard.cobrado), MONEDA],
    ['Saldo por cobrar', num(d.dashboard.saldo), MONEDA],
    ['Exceso cobrado', num(d.dashboard.exceso), MONEDA],
    ['Avance de cobro', d.dashboard.avance, PORC],
    ['Reservas (pedidos)', d.dashboard.reservas, '0'],
    ['Motos reservadas', d.dashboard.motosReservadas, '0'],
    ['Cobradas 100%', d.dashboard.cobradas100, '0'],
    ['Motos facturadas', d.dashboard.facturadasMotos, '0'],
    ['Facturado', num(d.dashboard.facturadoUsd), MONEDA],
    ['Stock inicial (motos)', d.dashboard.stockInicial, '0'],
    ['Facturadas desde stock', d.dashboard.stockFacturadas, '0'],
    ['Reservas desde stock', d.dashboard.stockReservas, '0'],
    ['Stock proyectado (motos)', d.dashboard.stockSaldo, '0'],
    ['Estimado neto en stock', num(d.dashboard.estimadoStockNeto), MONEDA],
    ['ESTIMADO NETO TOTAL', num(d.dashboard.estimadoNetoTotal), MONEDA],
    ['Estimado parcial (cobrado)', num(d.dashboard.estimadoParcialCobrado), MONEDA],
    ['Saldo por cobrar (estimado)', num(d.dashboard.estimadoSaldoPorCobrar), MONEDA],
  ];
  let r = 4;
  for (const [nombre, valor, fmt] of kpis) {
    rs.getCell(r, 1).value = nombre;
    rs.getCell(r, 1).font = { bold: nombre === 'ESTIMADO NETO TOTAL' };
    const c = rs.getCell(r, 2);
    c.value = valor as ExcelJS.CellValue;
    if (fmt) c.numFmt = fmt;
    if (nombre === 'ESTIMADO NETO TOTAL') {
      c.font = { bold: true, color: { argb: 'FF1E8E3E' } };
      rs.getCell(r, 1).font = { bold: true, color: { argb: 'FF1E8E3E' } };
    }
    r += 1;
  }
  r += 1;
  rs.getCell(r, 1).value = 'Controles de conciliación';
  rs.getCell(r, 1).font = { bold: true, size: 12 };
  r += 1;
  encabezado(rs, r, ['Control', 'Esperado', 'Obtenido', 'Diferencia', 'Estado', 'Detalle']);
  r += 1;
  for (const c of d.dashboard.conciliacion) {
    rs.getCell(r, 1).value = c.nombre;
    rs.getCell(r, 2).value = num(c.esperado);
    rs.getCell(r, 2).numFmt = MONEDA;
    rs.getCell(r, 3).value = num(c.obtenido);
    rs.getCell(r, 3).numFmt = MONEDA;
    rs.getCell(r, 4).value = num(c.diferencia);
    rs.getCell(r, 4).numFmt = MONEDA;
    const est = rs.getCell(r, 5);
    est.value = c.ok ? 'OK' : 'REVISAR';
    est.font = { bold: true, color: { argb: c.ok ? 'FF1E8E3E' : 'FFC5221F' } };
    rs.getCell(r, 6).value = c.detalle;
    r += 1;
  }
  rs.getColumn(1).width = 34;
  rs.getColumn(2).width = 16;
  rs.getColumn(3).width = 16;
  rs.getColumn(4).width = 14;
  rs.getColumn(5).width = 10;
  rs.getColumn(6).width = 80;

  // --------------------------------------------------------------- Reservas
  const rv = wb.addWorksheet('Reservas', { views: [{ state: 'frozen', ySplit: 3 }] });
  titulo(rv, 'Reservas (anticipos por pedido)');
  const colsR = ['Pedido', 'Fecha', 'Cliente', 'Vendedor', 'SKU', 'Modelo', 'Color', 'Motos', 'Precio lista', 'Fuente precio', 'Descuento', 'Valor neto', 'Cobrado', 'Saldo', 'Exceso', 'Pagos', 'Estado', 'Conf. modelo', 'Conf. color', 'Motivos'];
  encabezado(rv, 3, colsR);
  d.reservas.forEach((res, i) => {
    const fila = 4 + i;
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
  });
  const ult = 3 + d.reservas.length;
  if (d.reservas.length) {
    const tot = ult + 1;
    rv.getCell(tot, 1).value = 'TOTAL';
    rv.getCell(tot, 1).font = { bold: true };
    for (const col of [8, 12, 13, 14, 15]) {
      const letra = rv.getColumn(col).letter;
      rv.getCell(tot, col).value = { formula: `SUM(${letra}4:${letra}${ult})`, result: undefined } as ExcelJS.CellValue;
      rv.getCell(tot, col).font = { bold: true };
      if (col !== 8) rv.getCell(tot, col).numFmt = MONEDA;
    }
    rv.autoFilter = { from: { row: 3, column: 1 }, to: { row: ult, column: colsR.length } };
  }
  [12, 24, 10, 16, 12, 20, 12, 8, 14, 24, 12, 14, 14, 14, 12, 8, 14, 12, 12, 60].forEach((w, i) => {
    rv.getColumn(i + 1).width = w;
  });

  // -------------------------------------------------------- Modelo · Color
  const gm = wb.addWorksheet('Modelo_Color', { views: [{ state: 'frozen', ySplit: 3 }] });
  titulo(gm, 'Detalle por modelo y color');
  const colsG = ['Modelo', 'Color', 'Reservas', 'Motos', 'Valor neto', 'Cobrado', 'Saldo', 'Exceso', 'Avance', 'Facturadas'];
  encabezado(gm, 3, colsG);
  d.dashboard.porModelo.forEach((g: GrupoModeloColor, i) => {
    const fila = 4 + i;
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
  });
  if (d.dashboard.porModelo.length) {
    const ultG = 3 + d.dashboard.porModelo.length;
    gm.addConditionalFormatting({
      ref: `I4:I${ultG}`,
      rules: [{ type: 'cellIs', priority: 1, operator: 'lessThan', formulae: ['0.5'], style: { font: { color: { argb: 'FFC5221F' }, bold: true } } }],
    });
    gm.autoFilter = { from: { row: 3, column: 1 }, to: { row: ultG, column: colsG.length } };
  }
  [24, 14, 10, 8, 14, 14, 14, 12, 10, 12].forEach((w, i) => {
    gm.getColumn(i + 1).width = w;
  });

  // --------------------------------------------------------- Facturaciones
  const fc = wb.addWorksheet('Facturaciones', { views: [{ state: 'frozen', ySplit: 3 }] });
  titulo(fc, 'Vehículos facturados');
  const colsF = ['Fecha', 'Documento', 'Pedido', 'Cliente', 'Vendedor', 'Modelo', 'Color', 'USD'];
  encabezado(fc, 3, colsF);
  d.facturaciones.forEach((f, i) => {
    const fila = 4 + i;
    fc.getCell(fila, 1).value = f.fechaISO ?? '';
    fc.getCell(fila, 2).value = f.documento;
    fc.getCell(fila, 3).value = f.pedido ?? '';
    fc.getCell(fila, 4).value = f.cliente ?? '';
    fc.getCell(fila, 5).value = f.vendedor ?? '';
    fc.getCell(fila, 6).value = f.modelo ?? '';
    fc.getCell(fila, 7).value = f.color ?? '';
    fc.getCell(fila, 8).value = num(f.usd);
    fc.getCell(fila, 8).numFmt = MONEDA;
  });
  if (d.facturaciones.length) {
    const ultF = 3 + d.facturaciones.length;
    fc.getCell(ultF + 1, 1).value = 'TOTAL';
    fc.getCell(ultF + 1, 1).font = { bold: true };
    fc.getCell(ultF + 1, 8).value = { formula: `SUM(H4:H${ultF})`, result: undefined } as ExcelJS.CellValue;
    fc.getCell(ultF + 1, 8).numFmt = MONEDA;
    fc.getCell(ultF + 1, 8).font = { bold: true };
    fc.autoFilter = { from: { row: 3, column: 1 }, to: { row: ultF, column: colsF.length } };
  }
  [12, 14, 10, 28, 20, 24, 14, 14].forEach((w, i) => {
    fc.getColumn(i + 1).width = w;
  });

  // ----------------------------------------------------------------- Stock
  const st = wb.addWorksheet('Stock', { views: [{ state: 'frozen', ySplit: 3 }] });
  titulo(st, 'Stock proyectado y estimado neto', `Fórmula: ${d.cfg.formulaStock}`);
  const colsS = ['Modelo', 'Color', 'Inicial', 'Facturadas', 'Reservas', 'Saldo proyectado', 'Precio lista', 'Fuente precio', 'Estimado neto'];
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
  });
  if (d.stockFilas.length) {
    const ultS = 3 + d.stockFilas.length;
    st.getCell(ultS + 1, 1).value = 'TOTAL';
    st.getCell(ultS + 1, 1).font = { bold: true };
    for (const col of [3, 4, 5, 6, 9]) {
      const letra = st.getColumn(col).letter;
      st.getCell(ultS + 1, col).value = { formula: `SUM(${letra}4:${letra}${ultS})`, result: undefined } as ExcelJS.CellValue;
      st.getCell(ultS + 1, col).font = { bold: true };
      if (col === 9) st.getCell(ultS + 1, col).numFmt = MONEDA;
    }
    st.autoFilter = { from: { row: 3, column: 1 }, to: { row: ultS, column: colsS.length } };
  }
  [24, 14, 10, 12, 10, 16, 14, 28, 16].forEach((w, i) => {
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

  // ------------------------------------------------------ gráfico (opcional)
  try {
    await agregarGrafico(wb, rs, d.dashboard.porModelo, d.cfg);
  } catch {
    /* sin gráfico: el reporte sigue siendo válido */
  }

  return wb;
}

async function agregarGrafico(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, grupos: GrupoModeloColor[], cfg: Configuracion): Promise<void> {
  if (typeof document === 'undefined' || !grupos.length) return;
  const top = [...grupos]
    .sort((a, b) => num(b.valorNeto) - num(a.valorNeto))
    .slice(0, 12);
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 480;
  const Chart = (await import('chart.js/auto')).default;
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: top.map((g) => `${g.modelo} · ${g.color}`),
      datasets: [
        { label: 'Cobrado', data: top.map((g) => num(g.cobrado)), backgroundColor: '#1E8E3E' },
        { label: 'Saldo', data: top.map((g) => num(g.saldo)), backgroundColor: '#E0A800' },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { title: { display: true, text: `Top modelos por valor neto (${cfg.simboloMoneda})` } },
      scales: { y: { ticks: { callback: (v) => `${cfg.simboloMoneda}${v}` } } },
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
    ws.addImage(id, { tl: { col: 7.5, row: 3 }, ext: { width: 900, height: 480 } });
  }
  chart.destroy();
}

export async function descargarReporte(d: DatosReporte): Promise<void> {
  const wb = await generarReporte(d);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `top-motors-reporte-${d.generadoISO.slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
