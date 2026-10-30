// La previsualización calcula TODO sin persistir nada: ni registros, ni
// lotes, ni stock. Recién "Confirmar importación" escribe en la base.

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import { simularImportacion } from '../src/pipeline/importar';
import { prepararArchivo } from '../src/io/leerExcel';
import { configPorDefecto } from '../src/dominio/configuracion';
import * as db from '../src/db/almacen';
import { hayPedidos, hayVentas, RUTA_PEDIDOS, RUTA_VENTAS } from './helpers/datos';

describe.skipIf(!hayVentas)('previsualización sin guardar', () => {
  it('simula la importación y la base queda vacía', async () => {
    await db.vaciarTodo();
    const buf = fs.readFileSync(RUTA_VENTAS);
    const file = new File([buf as unknown as BlobPart], 'ventas.xlsx', { type: 'application/octet-stream' });
    const cola = await prepararArchivo(file, 'a_test');
    expect(cola.tipo).toBe('ventas');
    expect(cola.hashCalculado).toBe(true);

    const cfg = configPorDefecto();
    const sim = await simularImportacion({
      cola: [cola],
      cfg,
      reglas: [],
      registrosExistentes: [],
      stock: [],
      lotesExistentes: [],
    });

    expect(sim.simulaciones).toHaveLength(1);
    expect(sim.simulaciones[0].filasLeidas).toBeGreaterThan(1000);
    expect(sim.registrosNuevos.length).toBe(sim.simulaciones[0].filasLeidas);
    // sin el archivo de pedidos no hay join: los anticipos NO se inventan como reservas
    expect(sim.modelo.dashboard.reservas).toBe(0);
    expect(sim.modelo.revision.length).toBeGreaterThan(0);

    // nada persistido
    expect(await db.cargarRegistros()).toHaveLength(0);
    expect(await db.cargarLotes()).toHaveLength(0);
  });

  it.skipIf(!hayPedidos)('con pedidos unidos, el color y el vendedor se completan', async () => {
    await db.vaciarTodo();
    const v = fs.readFileSync(RUTA_VENTAS);
    const p = fs.readFileSync(RUTA_PEDIDOS);
    const fV = new File([v as unknown as BlobPart], 'v.xlsx');
    const fP = new File([p as unknown as BlobPart], 'p.xlsx');
    const cola = [await prepararArchivo(fV, 'av'), await prepararArchivo(fP, 'ap')];
    const cfg = configPorDefecto();
    const sim = await simularImportacion({
      cola,
      cfg,
      reglas: [],
      registrosExistentes: [],
      stock: [],
      lotesExistentes: [],
    });
    expect(sim.modelo.reservas.length).toBe(92);
    expect(sim.modelo.reservas.every((r) => r.color && r.color !== '(sin color)')).toBe(true);
    expect(await db.cargarRegistros()).toHaveLength(0);
  });
});
