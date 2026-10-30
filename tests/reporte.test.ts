import { describe, expect, it, vi } from 'vitest';
import { generarReporte, descargarReporte, type DatosReporte } from '../src/io/reporte';
import { calcular } from '../src/dominio/calcular';
import { configPorDefecto } from '../src/dominio/configuracion';
import { construirTc } from '../src/dominio/tc';
import { hayPedidos, hayVentas, mkReg, registrosDeArchivo, RUTA_PEDIDOS, RUTA_VENTAS } from './helpers/datos';

const cfg = configPorDefecto();

function datosEjemplo(): DatosReporte {
  const registros = [
    mkReg({ tipo: 'otro', nroPedido: 10, pedido: 10, sku: 'CB190R-AZU_CB', descripcion: 'CB190R AZUL', cantPedido: 1, puPedido: '2690' }),
    mkReg({ fila: 2, tipo: 'anticipo', categoria: 'ANTICIPOS', documento: 'BV-1', documentoTipo: 'BV', pedido: 10, importeUsd: '500.00' }),
    mkReg({ fila: 3, tipo: 'facturacion', categoria: 'VEHICULOS', documento: 'BV-9', documentoTipo: 'BV', pedido: 9, importeUsd: '2690.00', descripcion: 'CB190R AZUL' }),
    mkReg({ fila: 4, tipo: 'otro', nroPedido: 9, pedido: 9, sku: 'CB190R-AZU_CB', descripcion: 'CB190R AZUL', cantPedido: 1, puPedido: '2690' }),
  ];
  const modelo = calcular({ registros, stock: [], cfg, reglas: [] });
  return {
    dashboard: modelo.dashboard,
    reservas: modelo.reservas,
    facturaciones: modelo.facturaciones,
    stockFilas: modelo.stockFilas,
    cambios: [],
    reglas: [],
    cfg,
    tc: construirTc(cfg, registros),
    generadoISO: '2026-10-30T12:00:00.000Z',
  };
}

describe('reporte Excel', () => {
  it('generarReporte devuelve un workbook con las 9 hojas y escribe un .xlsx válido', async () => {
    const wb = await generarReporte(datosEjemplo());
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Dashboard',
      'Tablas_Dashboard',
      'Clientes',
      'Reservas',
      'Reservas_Estado',
      'Modelo_Color',
      'Facturaciones',
      'Stock',
      'Ajustes',
    ]);
    const buf = await wb.xlsx.writeBuffer();
    const bytes = new Uint8Array(buf as ArrayBuffer);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K' (zip)
  });

  it('descargarReporte arma el blob y dispara la descarga', async () => {
    const crear = vi.fn(() => 'blob:test');
    const revocar = vi.fn();
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: crear, revokeObjectURL: revocar }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      /* jsdom: no navega */
    });
    try {
      await descargarReporte(datosEjemplo());
      expect(crear).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      const [blob] = crear.mock.calls[0] as unknown as [Blob];
      expect(blob.type).toContain('spreadsheetml');
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe.skipIf(!hayVentas || !hayPedidos)('reporte Excel con datos reales', () => {
  it('genera el workbook completo y escribe un .xlsx sin tirar error', async () => {
    const registros = [
      ...registrosDeArchivo(RUTA_VENTAS, 'ventas'),
      ...registrosDeArchivo(RUTA_PEDIDOS, 'pedidos'),
    ];
    const cfg = configPorDefecto();
    const modelo = calcular({ registros, stock: [], cfg, reglas: [] });
    const datos: DatosReporte = {
      dashboard: modelo.dashboard,
      reservas: modelo.reservas,
      facturaciones: modelo.facturaciones,
      stockFilas: modelo.stockFilas,
      cambios: [],
      reglas: [],
      cfg,
      tc: construirTc(cfg, registros),
      generadoISO: '2026-10-30T12:00:00.000Z',
    };
    const wb = await generarReporte(datos);
    expect(wb.worksheets).toHaveLength(9);
    const buf = await wb.xlsx.writeBuffer();
    expect((buf as ArrayBuffer).byteLength).toBeGreaterThan(10000);
  }, 120000);

  it('descargarReporte completa el flujo del botón (blob + click) con datos reales', async () => {
    const registros = [
      ...registrosDeArchivo(RUTA_VENTAS, 'ventas'),
      ...registrosDeArchivo(RUTA_PEDIDOS, 'pedidos'),
    ];
    const cfg = configPorDefecto();
    const modelo = calcular({ registros, stock: [], cfg, reglas: [] });
    const datos: DatosReporte = {
      dashboard: modelo.dashboard,
      reservas: modelo.reservas,
      facturaciones: modelo.facturaciones,
      stockFilas: modelo.stockFilas,
      cambios: [],
      reglas: [],
      cfg,
      tc: construirTc(cfg, registros),
      generadoISO: '2026-10-30T12:00:00.000Z',
    };
    const crear = vi.fn(() => 'blob:test');
    const revocar = vi.fn();
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: crear, revokeObjectURL: revocar }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      await descargarReporte(datos);
      expect(crear).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      const [blob] = crear.mock.calls[0] as unknown as [Blob];
      expect(blob.size).toBeGreaterThan(10000);
      expect(blob.type).toContain('spreadsheetml');
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  }, 120000);
});
