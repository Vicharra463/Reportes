import { describe, expect, it } from 'vitest';
import { calcular } from '../src/dominio/calcular';
import { configPorDefecto } from '../src/dominio/configuracion';
import { crearReglaCorreccion } from '../src/dominio/reglas';
import { mkReg } from './helpers/datos';
import type { ReglaAprendizaje } from '../src/tipos';

const cfg = configPorDefecto();

function corrida(registros: Parameters<typeof calcular>[0]['registros'], reglas: ReglaAprendizaje[]) {
  return calcular({ registros, stock: [], cfg, reglas });
}

describe('aprendizaje por correcciones', () => {
  it('una fila con modelo desconocido queda en revisión (no se adivina)', () => {
    const a = mkReg({
      tipo: 'anticipo',
      categoria: 'ANTICIPOS',
      documento: 'BV-1',
      documentoTipo: 'BV',
      pedido: 50,
      importeUsd: '100.00',
      descripcion: 'MOTO INEXISTENTE XYZ AZUL',
      fechaISO: '2026-10-01',
    });
    const p = mkReg({ nroPedido: 50, pedido: 50, sku: 'INEXISTENTE-001', descripcion: 'MOTO INEXISTENTE XYZ AZUL' });
    const res = corrida([p, a], []);
    expect(res.reservas).toHaveLength(0);
    expect(res.revision.some((r) => r.motivos.some((m) => m.includes('modelo no detectado')))).toBe(true);
  });

  it('la regla aprendida resuelve la misma fila en la siguiente corrida', () => {
    const a = mkReg({
      tipo: 'anticipo',
      categoria: 'ANTICIPOS',
      documento: 'BV-1',
      documentoTipo: 'BV',
      pedido: 50,
      importeUsd: '100.00',
      descripcion: 'MOTO INEXISTENTE XYZ AZUL',
      fechaISO: '2026-10-01',
    });
    const p = mkReg({ nroPedido: 50, pedido: 50, sku: 'INEXISTENTE-001', descripcion: 'MOTO INEXISTENTE XYZ AZUL' });
    const regla = crearReglaCorreccion({
      tipo: 'modelo',
      textoFuente: 'INEXISTENTE-001',
      columna: null,
      valor: 'CB190R 2.0',
      notas: 'corrección de prueba',
    });
    const res = corrida([p, a], [regla]);
    expect(res.reservas).toHaveLength(1);
    expect(res.reservas[0].modelo).toBe('CB190R 2.0');
    expect(res.revision).toHaveLength(0);
  });

  it('una corrección de color aprendida se aplica igual', () => {
    const a = mkReg({
      tipo: 'anticipo',
      categoria: 'ANTICIPOS',
      documento: 'BV-2',
      documentoTipo: 'BV',
      pedido: 51,
      importeUsd: '100.00',
      descripcion: 'XR150L COLORRARE',
      fechaISO: '2026-10-01',
    });
    const p = mkReg({ nroPedido: 51, pedido: 51, sku: 'XR150L-XXX', descripcion: 'XR150L COLORRARE' });
    const sinRegla = corrida([p, a], []);
    expect(sinRegla.reservas).toHaveLength(0);
    expect(sinRegla.revision.some((r) => r.motivos.some((m) => m.includes('color no detectado')))).toBe(true);
    const regla = crearReglaCorreccion({ tipo: 'color', textoFuente: 'COLORRARE', columna: null, valor: 'Azul' });
    const conRegla = corrida([p, a], [regla]);
    expect(conRegla.reservas[0].color).toBe('Azul');
  });

  it('una regla demasiado amplia no colapsa los modelos (matching por borde de palabra)', () => {
    const a = mkReg({
      tipo: 'anticipo',
      categoria: 'ANTICIPOS',
      documento: 'BV-9',
      documentoTipo: 'BV',
      pedido: 70,
      importeUsd: '100.00',
      descripcion: 'MOTOCICLETA XR190L ROJO',
      fechaISO: '2026-10-01',
    });
    const p = mkReg({ nroPedido: 70, pedido: 70, sku: 'XR190L-ROJ', descripcion: 'MOTOCICLETA XR190L ROJO' });
    const reglaMala = crearReglaCorreccion({ tipo: 'modelo', textoFuente: 'moto', columna: null, valor: 'DIO' });
    const res = corrida([p, a], [reglaMala]);
    expect(res.reservas).toHaveLength(1);
    expect(res.reservas[0].modelo).toBe('XR190L');
  });
});
