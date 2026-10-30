// Backup completo en JSON: lotes, registros, reglas, historial de cambios,
// stock y configuración. Permite exportar y restaurar todo el estado local.

import type { CambioConfig, Lote, ReglaAprendizaje, Registro, StockFila } from '../tipos';
import type { Configuracion } from '../dominio/configuracion';

export interface Backup {
  formato: 'topmotors-backup';
  version: 1;
  generadoISO: string;
  lotes: Lote[];
  registros: Registro[];
  reglas: ReglaAprendizaje[];
  cambiosConfig: CambioConfig[];
  stock: StockFila[];
  config: Configuracion;
}

export function armarBackup(params: {
  lotes: Lote[];
  registros: Registro[];
  reglas: ReglaAprendizaje[];
  cambiosConfig: CambioConfig[];
  stock: StockFila[];
  config: Configuracion;
  ahoraISO: string;
}): Backup {
  return {
    formato: 'topmotors-backup',
    version: 1,
    generadoISO: params.ahoraISO,
    lotes: params.lotes,
    registros: params.registros,
    reglas: params.reglas,
    cambiosConfig: params.cambiosConfig,
    stock: params.stock,
    config: params.config,
  };
}

export function backupAJson(b: Backup): string {
  return JSON.stringify(b);
}

export function parsearBackup(json: string): Backup {
  const obj = JSON.parse(json) as Backup;
  if (obj?.formato !== 'topmotors-backup') throw new Error('El archivo no es un backup de Top Motors.');
  if (!Array.isArray(obj.lotes) || !Array.isArray(obj.registros)) throw new Error('Backup inválido: faltan lotes o registros.');
  return obj;
}

export function descargarJson(nombre: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function nombreBackupFecha(iso: string): string {
  return `topmotors-backup-${iso.slice(0, 10)}.json`;
}
