import { describe, expect, it } from 'vitest';
import { calcular, evaluarFormula } from '../src/dominio/calcular';
import { configPorDefecto } from '../src/dominio/configuracion';
import { aplicarAnulaciones, claveRegistro } from '../src/dominio/validar';
import { normalizar } from '../src/dominio/normalizar';
import { mkReg } from './helpers/datos';
import type { Registro } from '../src/tipos';

const cfg = configPorDefecto();

function corrida(registros: Registro[], stock: Parameters<typeof calcular>[0]['stock'] = []) {
  return calcular({ registros, stock, cfg, reglas: [] });
}

function pedidoBase(n: number, sku: string, desc: string): Registro {
  return mkReg({
    tipo: 'otro',
    nroPedido: n,
    pedido: n,
    sku,
    descripcion: desc,
    cantPedido: 1,
    puPedido: '2690',
  });
}

function anticipo(n: number, usd: string, fila: number): Registro {
  return mkReg({
    tipo: 'anticipo',
    categoria: 'ANTICIPOS',
    documento: `BV-${n}-${fila}`,
    documentoTipo: 'BV',
    pedido: n,
    importeUsd: usd,
    glosa: null,
  });
}

describe('anulaciones NC/ND', () => {
  it('un NC con la misma referencia e importe ~0 anula el original', () => {
    const orig = mkReg({ tipo: 'facturacion', categoria: 'VEHICULOS', documento: 'BV-1', documentoTipo: 'BV', docReferencia: 'PED-9', importeUsd: '2690.00', pedido: 9, descripcion: 'CB190R AZUL' });
    const nc = mkReg({ fila: 2, tipo: 'facturacion', categoria: 'VEHICULOS', documento: 'NC-1', documentoTipo: 'NC', docReferencia: 'BV-1', importeUsd: '-2690.00' });
    const res = corrida([orig, nc]);
    expect(orig.anulado).toBe(true);
    expect(nc.anulado).toBe(true);
    expect(res.facturaciones).toHaveLength(0);
    expect(res.dashboard.facturadasMotos).toBe(0);
  });

  it('una NC parcial no anula el documento, solo avisa', () => {
    const orig = mkReg({ categoria: 'VEHICULOS', documento: 'BV-2', documentoTipo: 'BV', importeUsd: '2690.00', pedido: 9, descripcion: 'CB190R AZUL' });
    const nc = mkReg({ fila: 2, categoria: 'VEHICULOS', documento: 'NC-2', documentoTipo: 'NC', docReferencia: 'BV-2', importeUsd: '-100.00' });
    corrida([orig, nc]);
    expect(orig.anulado).toBe(false);
    expect(orig.motivos.some((m) => m.includes('NC parcial'))).toBe(true);
  });
});

describe('duplicados', () => {
  it('la segunda aparición de la misma clave queda excluida de los totales', () => {
    const a = anticipo(10, '500.00', 1);
    const b = anticipo(10, '500.00', 2);
    b.documento = a.documento; // misma clave Documento|SKU|Lote|USD
    const p1 = pedidoBase(10, 'CB190R-AZU_CB', 'CB190R AZUL');
    const res = corrida([p1, a, b]);
    expect(b.duplicado).toBe(true);
    expect(res.reservas).toHaveLength(1);
    expect(res.reservas[0].cobrado).toBe('500.00');
    expect(res.duplicados).toHaveLength(1);
  });
});

describe('reservas (agrupación por pedido)', () => {
  it('varios anticipos del mismo pedido forman una reserva', () => {
    const p1 = pedidoBase(10, 'CB190R-AZU_CB', 'CB190R AZUL');
    const a1 = anticipo(10, '300.00', 1);
    const a2 = anticipo(10, '200.00', 2);
    const res = corrida([p1, a1, a2]);
    expect(res.reservas).toHaveLength(1);
    expect(res.reservas[0].cobrado).toBe('500.00');
    expect(res.reservas[0].pagos).toBe(2);
    expect(res.reservas[0].modelo).toBe('CB190R 2.0');
    expect(normalizar(res.reservas[0].color)).toBe('azul');
  });

  it('pedido inexistente en el archivo de pedidos → revisión, no se inventa', () => {
    const a = anticipo(99, '100.00', 1);
    const res = corrida([a]);
    expect(res.reservas).toHaveLength(0);
    expect(res.revision).toHaveLength(1);
    expect(res.revision[0].motivos.some((m) => m.includes('no está en el archivo de pedidos'))).toBe(true);
  });

  it('SEPARACIÓN DE N en la glosa genera N motos', () => {
    const p = pedidoBase(11, 'CB190R-AZU_CB', 'CB190R AZUL');
    const a = anticipo(11, '1000.00', 1);
    a.glosa = 'SEPARACIÓN DE 2 MOTOS';
    const res = corrida([p, a]);
    expect(res.reservas[0].motos).toBe(2);
    expect(res.avisos.some((x) => x.includes('2 unidades'))).toBe(true);
  });

  it('estado: facturada manda sobre saldo', () => {
    const p = pedidoBase(12, 'CB190R-AZU_CB', 'CB190R AZUL');
    const a = anticipo(12, '100.00', 1);
    const f = mkReg({
      fila: 3,
      tipo: 'facturacion',
      categoria: 'VEHICULOS',
      documento: 'FT-1',
      documentoTipo: 'FT',
      pedido: 12,
      importeUsd: '2690.00',
      descripcion: 'CB190R AZUL',
    });
    const res = corrida([p, a, f]);
    expect(res.reservas[0].estado).toBe('Facturada');
    expect(res.facturaciones).toHaveLength(1);
  });

  it('exceso: cobro mayor al valor neto se acota y se explica', () => {
    const p = pedidoBase(13, 'CB190R-AZU_CB', 'CB190R AZUL');
    const a = anticipo(13, '3000.00', 1); // precio lista 2690 → exceso 310
    const res = corrida([p, a]);
    expect(Number(res.reservas[0].exceso)).toBeGreaterThan(0);
    expect(res.reservas[0].saldo).toBe('0.00');
    expect(res.dashboard.conciliacion.find((c) => c.id === 'neto')?.ok).toBe(true);
  });

  it('descuento de glosa se resta del valor neto', () => {
    const p = pedidoBase(14, 'CB190R-AZU_CB', 'CB190R AZUL');
    const a = anticipo(14, '100.00', 1);
    a.glosa = 'DESCUENTO $500.00 POR PROMOCIÓN';
    const res = corrida([p, a]);
    expect(res.reservas[0].descuento).toBe('500.00');
    const precio = Number(res.reservas[0].precioLista);
    expect(res.reservas[0].valorNeto).toBe((precio - 500).toFixed(2));
  });
});

describe('stock', () => {
  it('el saldo proyectado sigue la fórmula editable', () => {
    const p = pedidoBase(15, 'CB190R-AZU_CB', 'CB190R AZUL');
    const a = anticipo(15, '100.00', 1);
    const stock = [
      { modelo: 'CB190R 2.0', color: 'Azul', inicial: '10', fechaISO: '2026-10-01', origen: 'manual' as const },
    ];
    const res = corrida([p, a], stock);
    const fila = res.stockFilas.find((f) => f.modelo === 'CB190R 2.0' && normalizar(f.color) === 'azul');
    expect(fila).toBeDefined();
    expect(fila!.inicial).toBe(10);
    expect(fila!.reservas).toBe(1);
    expect(fila!.saldo).toBe(9);
    expect(res.dashboard.conciliacion.find((c) => c.id === 'stock')?.ok).toBe(true);
  });

  it('la fórmula es evaluable y configurable', () => {
    expect(evaluarFormula('inicial - facturadas', { inicial: 5, facturadas: 2, reservas: 1 })).toBe(3);
  });
});

describe('claveRegistro', () => {
  it('concatena documento|sku|lote|importe', () => {
    const r = mkReg({ documento: 'BV-1', sku: 'X', lote: 'L', importeUsd: '10.00' });
    expect(claveRegistro(r)).toBe('BV-1|X|L|10.00');
  });
});

describe('aplicarAnulaciones exportada', () => {
  it('cuenta los documentos anulados y marca ambas filas', () => {
    const orig = mkReg({ categoria: 'VEHICULOS', documento: 'BV-5', documentoTipo: 'BV', importeUsd: '100.00' });
    const nc = mkReg({ fila: 2, categoria: 'VEHICULOS', documento: 'NC-5', documentoTipo: 'NC', docReferencia: 'BV-5', importeUsd: '-100.00' });
    const r = aplicarAnulaciones([orig, nc]);
    expect(r.anulados).toBe(1);
    expect(orig.anulado).toBe(true);
    expect(nc.anulado).toBe(true);
  });
});
