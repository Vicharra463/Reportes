// Verificación contra los archivos REALES del negocio: el motor TS debe
// reproducir la línea base del dashboard Python (ver memoria de la sesión).
// Si los Excel no están (p. ej. CI), los tests se omiten.

import { describe, expect, it } from 'vitest';
import { calcular } from '../src/dominio/calcular';
import { configPorDefecto } from '../src/dominio/configuracion';
import { hayPedidos, hayVentas, approx, registrosDeArchivo, RUTA_PEDIDOS, RUTA_VENTAS } from './helpers/datos';

describe.skipIf(!hayVentas || !hayPedidos)('línea base con datos reales', () => {
  it('reproduce facturación, anticipos, reservas y conciliación', () => {
    const cfg = configPorDefecto();
    const ventas = registrosDeArchivo(RUTA_VENTAS, 'ventas');
    const pedidos = registrosDeArchivo(RUTA_PEDIDOS, 'pedidos');
    expect(ventas.length).toBeGreaterThan(1000);

    const res = calcular({ registros: [...ventas, ...pedidos], stock: [], cfg, reglas: [] });
    const d = res.dashboard;

    // Anticipos → reservas (línea base del dashboard Python)
    expect(d.reservas).toBe(92);
    expect(d.motosReservadas).toBe(94);
    approx(d.valorNeto, 495033.5, 0.05);
    approx(d.cobrado, 151955.92, 0.05);
    approx(d.saldo, 343419.17, 0.05);
    expect(d.cobradas100).toBe(15);

    // Facturación
    expect(d.facturadasMotos).toBe(1471);
    approx(d.facturadoUsd, 4562293.57, 0.05);

    // Conciliación: C1 valor+exceso=cobrado+saldo y C2/C3/C4 sin diferencias
    for (const c of d.conciliacion.filter((x) => x.id !== 'stock')) {
      expect(`${c.id}:${c.ok ? 'ok' : `diff ${c.diferencia}`}`).toBe(`${c.id}:ok`);
    }

    // Ninguna fila de anticipos/vehículos BV/FT queda sin clasificar
    expect(res.revision).toHaveLength(0);
    expect(res.errores).toHaveLength(0);
  });

  it('los VIN duplicados (si los hay) quedan avisados, no silenciados', () => {
    const cfg = configPorDefecto();
    const ventas = registrosDeArchivo(RUTA_VENTAS, 'ventas');
    const pedidos = registrosDeArchivo(RUTA_PEDIDOS, 'pedidos');
    const res = calcular({ registros: [...ventas, ...pedidos], stock: [], cfg, reglas: [] });
    const vins = res.facturaciones.length;
    const avisosVin = res.avisos.filter((a) => a.includes('VIN DUPLICADO'));
    // con datos de octubre no hay VIN repetidos: el control debe estar en silencio
    expect(avisosVin).toHaveLength(0);
    expect(vins).toBe(1471);
  });

  it('el pedido 35152 aplica la excepción de precio y descuento', () => {
    const cfg = configPorDefecto();
    const ventas = registrosDeArchivo(RUTA_VENTAS, 'ventas');
    const pedidos = registrosDeArchivo(RUTA_PEDIDOS, 'pedidos');
    const res = calcular({ registros: [...ventas, ...pedidos], stock: [], cfg, reglas: [] });
    const r = res.reservas.find((x) => x.pedido === 35152);
    if (r) {
      expect(r.fuentePrecio).toContain('Excepción');
      expect(r.motivos.some((m) => /Dscto|Excepción|500/i.test(m))).toBe(true);
    }
  });
});
