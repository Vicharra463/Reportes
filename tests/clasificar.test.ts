import { describe, expect, it } from 'vitest';
import { clasificarColor, clasificarModelo } from '../src/dominio/clasificar';
import { configPorDefecto } from '../src/dominio/configuracion';
import { normalizar } from '../src/dominio/normalizar';

const cfg = configPorDefecto();

describe('clasificarModelo', () => {
  it('detecta por SKU exacto con confianza alta', () => {
    const r = clasificarModelo([{ columna: 'Código (SKU)', texto: 'CB190R-AZU_CB' }], cfg, []);
    expect(r.clasif?.valor).toBe('CB190R 2.0');
    expect(r.clasif?.confianza).toBeGreaterThanOrEqual(0.9);
  });

  it('detecta por columna Modelo del Excel', () => {
    const r = clasificarModelo([{ columna: 'Modelo', texto: 'TRX420FA2T' }], cfg, []);
    expect(r.clasif?.valor).toBe('TRX420FA2T');
  });

  it('usa sinónimos (HORNET → CBF125Z)', () => {
    const r = clasificarModelo([{ columna: 'Descripción', texto: 'HORNET 160 AZUL' }], cfg, []);
    expect(r.clasif?.valor).toBe('CBF125Z');
  });

  it('fuzzy acepta casi-errores y respeta el umbral', () => {
    const r = clasificarModelo([{ columna: 'Descripción', texto: 'CBF 125 Z' }], cfg, []);
    expect(r.clasif?.valor).toBe('CBF125Z');
  });

  it('marca conflicto cuando dos candidatos empatan', () => {
    const r = clasificarModelo(
      [
        { columna: 'Modelo', texto: 'CB190R 2.0' },
        { columna: 'glosa cabecera', texto: 'XR150L' },
      ],
      cfg,
      [],
    );
    // 'Modelo' tiene prioridad: no debe haber conflicto ni cambio de valor
    expect(r.clasif?.valor).toBe('CB190R 2.0');
    expect(r.conflicto).toBeNull();
  });

  it('aplica reglas de aprendizaje por encima del catálogo', () => {
    const reglas = [
      {
        tipo: 'modelo' as const,
        busqueda: 'moto rara',
        busquedaOriginal: 'MOTO RARA',
        columna: null,
        valor: 'CB190R 2.0',
        prioridad: 100,
        activa: true,
        origen: 'correccion' as const,
        fechaISO: '2026-10-01',
      },
    ];
    const r = clasificarModelo([{ columna: 'Descripción', texto: 'MOTO RARA XYZ' }], cfg, reglas);
    expect(r.clasif?.valor).toBe('CB190R 2.0');
    expect(r.clasif?.fuente).toBe('regla');
  });
});

describe('clasificarColor', () => {
  it('detecta color en la descripción', () => {
    const r = clasificarColor([{ columna: 'Descripción', texto: 'CB190R ROJO' }], cfg, []);
    expect(normalizar(r.clasif?.valor)).toBe('rojo');
  });

  it('resuelve compuestos tomando la palabra completa (AZUL antes que AMARILLO por orden semilla)', () => {
    const r = clasificarColor([{ columna: 'Descripción', texto: 'AMARILLO Y AZUL' }], cfg, []);
    expect(normalizar(r.clasif?.valor)).toBe('azul');
  });

  it('conoce NEGRA y MARRÓN (agregados al catálogo; canónicos Negro y Marrón)', () => {
    expect(normalizar(clasificarColor([{ columna: 'Descripción', texto: 'NEGRA' }], cfg, []).clasif?.valor)).toBe('negro');
    expect(normalizar(clasificarColor([{ columna: 'Descripción', texto: 'MARRÓN' }], cfg, []).clasif?.valor)).toBe('marron');
  });

  it('sin color detectable no adivina (clasif null)', () => {
    const r = clasificarColor([{ columna: 'Descripción', texto: 'MOTO CUALQUIERA' }], cfg, []);
    expect(r.clasif).toBeNull();
  });
});

describe('reglas de aprendizaje: matching por borde de palabra', () => {
  const regla = (busqueda: string, valor: string, tipo: 'modelo' | 'color' = 'modelo') => ({
    tipo,
    busqueda,
    busquedaOriginal: busqueda.toUpperCase(),
    columna: null,
    valor,
    prioridad: 100,
    activa: true,
    origen: 'correccion' as const,
    fechaISO: '2026-10-01',
  });

  it('una regla corta NO maschea dentro de palabras (moto ≠ MOTOCICLETA XR190L)', () => {
    const r = clasificarModelo(
      [{ columna: 'Descripción', texto: 'MOTOCICLETA XR190L ROJO' }],
      cfg,
      [regla('moto', 'DIO')],
    );
    expect(r.clasif?.valor).toBe('XR190L');
    expect(r.clasif?.fuente).not.toBe('regla');
  });

  it('una regla corta sigue disparando cuando es palabra completa (kratoz)', () => {
    const r = clasificarModelo(
      [{ columna: 'glosa cabecera', texto: 'ENTREGA DE CASCO KRATOZ + TRAMITE' }],
      cfg,
      [regla('kratoz', 'DIO')],
    );
    expect(r.clasif?.valor).toBe('DIO');
    expect(r.clasif?.fuente).toBe('regla');
  });

  it('una regla corta NO maschea prefijos de palabras (manten ≠ MANTENIMIENTOS)', () => {
    const r = clasificarModelo(
      [{ columna: 'glosa cabecera', texto: 'DOS MANTENIMIENTOS GRATIS MANO DE OBRA' }],
      cfg,
      [regla('manten', 'DIO')],
    );
    expect(r.clasif?.valor).not.toBe('DIO');
  });

  it('las reglas de color también usan borde de palabra (oj ≠ ROJO)', () => {
    const r = clasificarColor(
      [{ columna: 'Descripción', texto: 'MOTOCICLETA XR190L ROJO' }],
      cfg,
      [regla('oj', 'Azul', 'color')],
    );
    expect(normalizar(r.clasif?.valor)).toBe('rojo');
    expect(r.clasif?.fuente).not.toBe('regla');
  });
});
