import { describe, expect, it } from 'vitest';
import { compactar, normalizar, parseFecha, parseNumero } from '../src/dominio/normalizar';
import { evaluarFormula, money, dec } from '../src/dominio/calcular';
import { configPorDefecto } from '../src/dominio/configuracion';

describe('parseNumero (política decimal)', () => {
  it('interpreta el último separador como decimal', () => {
    expect(parseNumero('1,500.00')).toBe(1500);
    expect(parseNumero('1.500,00')).toBe(1500);
    expect(parseNumero('1500')).toBe(1500);
    expect(parseNumero('12')).toBe(12);
    expect(parseNumero(1500)).toBe(1500);
    expect(parseNumero('')).toBeNull();
    expect(parseNumero(null)).toBeNull();
    expect(parseNumero('abc')).toBeNull();
  });
});

describe('parseFecha', () => {
  it('acepta Date de Excel, seriales y texto dd/mm/aaaa', () => {
    expect(parseFecha(new Date(2026, 9, 26)).iso).toBe('2026-10-26');
    expect(parseFecha('26/10/2026').iso).toBe('2026-10-26');
    expect(parseFecha('2026-10-26').iso).toBe('2026-10-26');
    expect(parseFecha('26/10/2026').valida).toBe(true);
  });
});

describe('normalizar / compactar', () => {
  it('quita tildes y pasa a minúsculas', () => {
    expect(normalizar('MARRÓN')).toBe('marron');
    expect(compactar(' CB190R 2.0 ')).toBe('cb190r20');
  });
});

describe('evaluarFormula', () => {
  it('resuelve la fórmula de stock con variables conocidas', () => {
    expect(evaluarFormula('inicial - facturadas - reservas', { inicial: 10, facturadas: 3, reservas: 2 })).toBe(5);
    expect(evaluarFormula('inicial+reservas-facturadas', { inicial: 1, facturadas: 2, reservas: 3 })).toBe(2);
  });
  it('rechaza fórmulas inválidas o con identificadores desconocidos', () => {
    expect(evaluarFormula('inicial - foo', { inicial: 1, facturadas: 0, reservas: 0 })).toBeNull();
    expect(evaluarFormula('inicial ; drop', { inicial: 1, facturadas: 0, reservas: 0 })).toBeNull();
    expect(evaluarFormula('', { inicial: 1, facturadas: 0, reservas: 0 })).toBeNull();
  });
});

describe('dinero (decimal.js, nunca float)', () => {
  const cfg = configPorDefecto();
  it('redondea half-up a 2 decimales', () => {
    expect(money('0.005', cfg)).toBe('0.01');
    expect(money(dec('2.675'), cfg)).toBe('2.68');
    expect(money('1000.5', cfg)).toBe('1000.50');
  });
  it('no arrastra errores de punto flotante', () => {
    expect(money(dec('0.1').plus('0.2'), cfg)).toBe('0.30');
  });
});
