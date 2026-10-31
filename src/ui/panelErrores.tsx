// Panel de "Errores y avisos" — vive SOLO dentro de la pestaña Por revisar.
// Agrupa los problemas del cálculo y ofrece correcciones PROVISIONALES
// (sugerencia de modelo/color) que el usuario confirma con un click.
// Las sugerencias se calculan bajo demanda (botón): nunca al cargar la vista.

import { useCallback, useEffect, useState } from 'react';
import { useApp } from './uso';
import type { Registro } from '../tipos';
import type { TextoFuente } from '../dominio/clasificar';
import { clasificarColor, clasificarModelo } from '../dominio/clasificar';
import * as alertas from './alertas';

function textosDe(r: Registro): TextoFuente[] {
  return [
    { columna: 'Código (SKU)', texto: r.sku },
    { columna: 'Descripción', texto: r.descripcion },
    { columna: 'Modelo', texto: r.modeloColumna },
    { columna: 'glosa cabecera', texto: r.glosa },
  ];
}

interface Sugerencia {
  registro: Registro;
  tipo: 'modelo' | 'color';
  valor: string;
  conf: number;
}

const UMBRAL_PROVISIONAL = 0.5;
const UMBRAL_SEGURA = 0.75;
const COTA_SUGERENCIAS = 300;

function resumenFila(r: Registro): string {
  return [r.documento ?? (r.pedido ? `Pedido ${r.pedido}` : ''), r.sku ?? '', r.descripcion ?? '']
    .filter(Boolean)
    .join(' · ')
    .slice(0, 90);
}

export function PanelErrores() {
  const { modelo, cfg, reglas, aplicarCorreccion, aplicarCorrecciones } = useApp();
  const [sugerencias, setSugerencias] = useState<Sugerencia[] | null>(null);
  const [calculandoSug, setCalculandoSug] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  // cuando cambian los datos, las sugerencias quedan viejas
  useEffect(() => {
    setSugerencias(null);
  }, [modelo]);

  const calcularSugerencias = useCallback(() => {
    if (!modelo) return;
    setCalculandoSug(true);
    // cedemos el frame para que pinte el estado "Calculando…"
    setTimeout(() => {
      try {
        const cfgProv = { ...cfg, umbralConfianza: UMBRAL_PROVISIONAL };
        const out: Sugerencia[] = [];
        for (const r of modelo.revision) {
          if (!r.clasifModelo) {
            const res = clasificarModelo(textosDe(r), cfgProv, reglas);
            if (res.clasif?.valor && res.clasif.confianza >= UMBRAL_PROVISIONAL) {
              out.push({ registro: r, tipo: 'modelo', valor: res.clasif.valor, conf: res.clasif.confianza });
            }
          }
          if (!r.clasifColor) {
            const res = clasificarColor(textosDe(r), cfgProv, reglas);
            if (res.clasif?.valor && res.clasif.confianza >= UMBRAL_PROVISIONAL) {
              out.push({ registro: r, tipo: 'color', valor: res.clasif.valor, conf: res.clasif.confianza });
            }
          }
          if (out.length >= COTA_SUGERENCIAS) break;
        }
        setSugerencias(out);
      } finally {
        setCalculandoSug(false);
      }
    }, 30);
  }, [modelo, cfg, reglas]);

  if (!modelo) return null;

  const seguras = (sugerencias ?? []).filter((s) => s.conf >= UMBRAL_SEGURA);
  const errores = modelo.errores;
  const revision = modelo.revision;
  const duplicados = modelo.duplicados;
  const conciliacionMal = modelo.dashboard.conciliacion.filter((c) => !c.ok);
  const avisos = modelo.avisos ?? [];

  const erroresPorMotivo = new Map<string, Registro[]>();
  for (const r of errores) {
    const k = r.motivos[0] ?? 'sin detalle';
    const arr = erroresPorMotivo.get(k) ?? [];
    arr.push(r);
    erroresPorMotivo.set(k, arr);
  }

  const aplicarUna = async (s: Sugerencia) => {
    await aplicarCorreccion({ registro: s.registro, tipo: s.tipo, valor: s.valor, soloEstaFila: false });
  };

  const aplicarTodas = async () => {
    if (!seguras.length) return;
    const ok = await alertas.confirmar({
      titulo: `¿Aplicar ${seguras.length} sugerencia(s) segura(s)?`,
      texto: 'Se crean reglas de aprendizaje por cada sugerencia (confianza ≥ 75%) y todo se recalcula. Podés desactivarlas luego desde Catálogos → Reglas.',
      confirmarTexto: 'Sí, aplicar',
    });
    if (!ok) return;
    setAplicando(true);
    alertas.cargando('Aplicando sugerencias…', 'Creando reglas y recalculando.');
    try {
      const n = await aplicarCorrecciones(
        seguras.map((s) => ({ registro: s.registro, tipo: s.tipo, valor: s.valor, soloEstaFila: false })),
      );
      alertas.exito('Sugerencias aplicadas', `${n} regla(s) creada(s). Todo recalculado.`);
    } catch (e) {
      alertas.fallo('No se pudieron aplicar todas', alertas.mensajeError(e));
    } finally {
      alertas.cerrarCargando();
      setAplicando(false);
    }
  };

  const hayAlgo = errores.length || revision.length || duplicados.length || conciliacionMal.length || avisos.length;
  if (!hayAlgo) {
    return (
      <div className="banner ok">
        <strong>Sin problemas.</strong> Todas las filas están clasificadas y la conciliación está en OK — el reporte
        es “válido”.
      </div>
    );
  }

  return (
    <div className="panel-errores">
      <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>
          Errores y avisos{' '}
          {errores.length + revision.length > 0 && (
            <span className="badge err">{errores.length + revision.length}</span>
          )}
        </h3>
        <div className="fila" style={{ gap: 8 }}>
          {revision.length > 0 && sugerencias === null && (
            <button className="chico" disabled={calculandoSug} onClick={calcularSugerencias}>
              {calculandoSug ? 'Calculando…' : 'Calcular sugerencias'}
            </button>
          )}
          {seguras.length > 0 && (
            <button className="primario chico" disabled={aplicando} onClick={() => void aplicarTodas()}>
              Corregir {seguras.length} sugerencia(s) segura(s)
            </button>
          )}
        </div>
      </div>

      {errores.length > 0 && (
        <div className="problema err">
          <strong>{errores.length} fila(s) con error — el sistema NO puede corregirlas solas.</strong>
          <ul>
            {[...erroresPorMotivo.entries()].map(([motivo, rs]) => (
              <li key={motivo}>
                <em>{motivo}</em> ({rs.length} fila(s)).{' '}
                <span className="difuso">
                  Qué hacer: abrí el Excel fuente en la fila indicada (arriba, en la tabla), corregí el dato y volvé a
                  importar el archivo.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {revision.length > 0 && (
        <div className="problema warn">
          <strong>{revision.length} fila(s) sin clasificar — quedan FUERA de los totales hasta resolverlas.</strong>
          <p className="difuso" style={{ margin: '4px 0' }}>
            Qué hacer: si querés un atajo, calculá las sugerencias provisionales y aplicá las que coincidan; o corregí
            fila por fila en la tabla de abajo. Al confirmar, la corrección se aprende y aplica en próximas cargas.
          </p>
          {sugerencias !== null && sugerencias.length === 0 && (
            <p className="difuso" style={{ margin: 0 }}>
              No se encontraron sugerencias con confianza mínima: corregí manualmente.
            </p>
          )}
          {sugerencias !== null && sugerencias.length > 0 && (
            <div className="sugerencias-lista">
              {sugerencias.slice(0, 12).map((s, i) => (
                <div className="sugerencia" key={`${s.registro.loteId}-${s.registro.fila}-${s.tipo}-${i}`}>
                  <span className="badge info">{s.tipo}</span>
                  <span className="texto-fila">{resumenFila(s.registro)}</span>
                  <span className="sugiere">
                    → <strong>{s.valor}</strong> <span className="mini">{Math.round(s.conf * 100)}%</span>
                  </span>
                  <button className="chico" disabled={aplicando} onClick={() => void aplicarUna(s)}>
                    Aplicar
                  </button>
                </div>
              ))}
              {sugerencias.length > 12 && (
                <p className="difuso" style={{ margin: 0 }}>
                  …y {sugerencias.length - 12} sugerencia(s) más.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {duplicados.length > 0 && (
        <div className="problema info">
          <strong>{duplicados.length} fila(s) duplicada(s) excluidas de los totales.</strong>{' '}
          <span className="difuso">
            Qué hacer: si son legítimas (mismo documento reimportado), no hace falta nada; si son un error del Excel
            fuente, corregilo ahí y volvé a importar.
          </span>
        </div>
      )}

      {conciliacionMal.length > 0 && (
        <div className="problema err">
          <strong>Conciliación con diferencias:</strong>{' '}
          {conciliacionMal.map((c) => (
            <span key={c.nombre} className="badge err">
              {c.nombre}
            </span>
          ))}
          <p className="difuso" style={{ margin: '4px 0' }}>
            Qué hacer: una diferencia suele venir de una fila en revisión/errónea o de un exceso mal clasificado.
            Resolvé primero los puntos de arriba; si la diferencia persiste, revisá los documentos del control
            afectado.
          </p>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="problema info">
          <strong>{avisos.length} aviso(s) del cálculo:</strong>
          <ul>
            {avisos.slice(0, 8).map((a, i) => (
              <li key={i} className="difuso">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
