// Reglas de aprendizaje: una corrección del usuario se guarda como regla y se
// aplica automáticamente en cargas futuras.

import type { ReglaAprendizaje } from '../tipos';
import { normalizar } from './normalizar';

export function crearReglaCorreccion(params: {
  tipo: 'modelo' | 'color';
  valor: string;
  textoFuente: string;
  columna: string | null;
  prioridad?: number;
  notas?: string;
}): ReglaAprendizaje {
  return {
    tipo: params.tipo,
    busqueda: normalizar(params.textoFuente),
    busquedaOriginal: params.textoFuente.trim(),
    columna: params.columna,
    valor: params.valor,
    prioridad: params.prioridad ?? 100,
    activa: true,
    origen: 'correccion',
    fechaISO: new Date().toISOString(),
    notas: params.notas,
  };
}

/** La regla solo dispara si la búsqueda tiene contenido mínimo (evita reglas vacías). */
export function reglaValida(r: ReglaAprendizaje): boolean {
  return r.busqueda.length >= 3 && !!r.valor;
}

export function reglasActivas(reglas: ReglaAprendizaje[]): ReglaAprendizaje[] {
  return reglas.filter((r) => r.activa && reglaValida(r));
}
