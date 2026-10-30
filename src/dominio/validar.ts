// Validaciones por registro + anulaciones NC/ND + duplicados.
// Nunca se ignora un error en silencio: todo queda reportado.

import type { Registro } from '../tipos';
import type { Configuracion } from './configuracion';

export interface ErrorValidacion {
  archivo: string;
  hoja: string;
  fila: number;
  motivo: string;
  severidad: 'error' | 'advertencia';
}

export function validarFila(r: Registro, cfg: Configuracion): { errores: string[]; advertencias: string[] } {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const esFilaPedidos = r.nroPedido !== null || r.codigoPedido !== null;
  const esFilaStock = r.stockModelo !== null;

  if (!esFilaPedidos && !esFilaStock) {
    if (r.fechaISO !== null && !r.fechaValida) errores.push('fecha inválida');
    if (r.fechaISO === null && r.documento) advertencias.push('sin fecha');
  }

  const esDocVenta = r.documentoTipo === 'BV' || r.documentoTipo === 'FT';
  const esNota = r.documentoTipo === 'NC' || r.documentoTipo === 'ND';

  if (r.categoria && (esDocVenta || esNota)) {
    if (r.importeUsd === null) errores.push('importe US$ vacío o no numérico');
    else {
      const v = Number(r.importeUsd);
      if (esDocVenta && v <= 0) errores.push(`importe no positivo (${r.importeUsd}) en ${r.documento ?? 'comprobante'}`);
      if (esNota && v > 0) advertencias.push(`nota de crédito/débito con importe positivo (${r.importeUsd})`);
    }
  }

  if (r.categoria === 'ANTICIPOS' && esDocVenta && r.pedido === null) {
    advertencias.push('anticipo sin N° de pedido (no se puede reservar)');
  }

  if (r.unidades !== null && Number.isNaN(r.unidades)) errores.push('unidades: texto en columna numérica');
  if (r.puPedido !== null && Number.isNaN(Number(r.puPedido))) errores.push('P.U. Pedido: texto en columna numérica');

  if (r.categoria === 'ACCESORIO') advertencias.push('categoría ACCESORIO: fuera del alcance de reservas/facturación');

  void cfg;
  return { errores, advertencias };
}

/**
 * Anulación (regla Finanzas): si una NC/ND referencia un documento BV/FT que
 * aparece en el archivo y la suma da ~0, el documento original queda anulado
 * (se excluyen ambos). Las NC que referencian documentos fuera del archivo no
 * se consideran; las de monto distinto quedan como "NC parcial" para revisión.
 */
export function aplicarAnulaciones(registros: Registro[]): { anulados: number; ncParciales: number; avisos: string[] } {
  const totales = new Map<string, number>();
  for (const r of registros) {
    if (!r.documento) continue;
    if (r.documentoTipo !== 'BV' && r.documentoTipo !== 'FT') continue;
    if (r.anulado) continue;
    const actual = totales.get(r.documento) ?? 0;
    totales.set(r.documento, actual + Number(r.importeUsd ?? 0));
  }

  const anular = new Set<string>();
  let ncParciales = 0;
  const avisos: string[] = [];

  for (const r of registros) {
    if (r.documentoTipo !== 'NC' && r.documentoTipo !== 'ND') continue;
    const ref = r.docReferencia;
    if (!ref || !totales.has(ref)) continue; // fuera del archivo → no se considera
    const suma = (totales.get(ref) ?? 0) + Number(r.importeUsd ?? 0);
    if (Math.abs(suma) < 0.05) {
      anular.add(ref);
      r.anulado = true;
    } else {
      r.ncParcial = true;
      ncParciales += 1;
      avisos.push(`NC parcial ${r.documento} sobre ${ref} (US$ ${r.importeUsd}): el documento no se anuló; revisar`);
    }
  }

  if (anular.size) {
    for (const r of registros) {
      if (r.documento && anular.has(r.documento)) r.anulado = true;
    }
  }

  return { anulados: anular.size, ncParciales, avisos };
}

/** Clave de negocio para detectar duplicados (registro repetido). */
export function claveRegistro(r: Registro): string {
  if (r.nroPedido !== null || r.codigoPedido) {
    return `PED|${r.nroPedido ?? ''}|${r.codigoPedido ?? ''}|${r.descripcion ?? ''}`;
  }
  if (r.stockModelo !== null) {
    return `STK|${r.stockModelo}|${r.stockColor ?? ''}|${r.fechaISO ?? ''}|${r.stockInicial ?? ''}`;
  }
  return `${r.documento ?? ''}|${r.sku ?? ''}|${r.lote ?? ''}|${r.importeUsd ?? ''}`;
}

/**
 * Marca duplicados dentro del lote y contra registros ya confirmados.
 * modo 'avisar' → se importan marcados; modo 'bloquear' → quedan en error.
 */
export function aplicarDuplicados(
  nuevos: Registro[],
  existentes: Set<string>,
  modo: 'avisar' | 'bloquear',
): { dentroLote: number; contraBase: number; detalle: { fila: number; clave: string }[] } {
  const vistos = new Set<string>();
  let dentroLote = 0;
  let contraBase = 0;
  const detalle: { fila: number; clave: string }[] = [];

  for (const r of nuevos) {
    const clave = claveRegistro(r);
    if (vistos.has(clave)) {
      r.duplicado = true;
      dentroLote += 1;
      detalle.push({ fila: r.fila, clave });
      if (modo === 'bloquear') {
        r.estado = 'error';
        r.motivos.push(`duplicado bloqueado: ${clave}`);
      } else {
        r.motivos.push(`duplicado detectado: ${clave}`);
      }
    } else if (existentes.has(clave)) {
      r.duplicado = true;
      contraBase += 1;
      detalle.push({ fila: r.fila, clave });
      if (modo === 'bloquear') {
        r.estado = 'error';
        r.motivos.push(`duplicado de una carga anterior: ${clave}`);
      } else {
        r.motivos.push(`duplicado de una carga anterior: ${clave}`);
      }
    }
    vistos.add(clave);
  }

  return { dentroLote, contraBase, detalle };
}
