import { useMemo, useState } from 'react';
import { useApp } from '../uso';
import { pct, usd, numPlain } from '../formato';
import { Cargando, Kpi, Seccion } from '../componentes';
import { GraficoBarras } from '../graficos';
import { PanelErrores } from '../panelErrores';
import { canonicoColor } from '../../dominio/clasificar';
import type { FilaStock } from '../../dominio/calcular';

const aNum = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const claveFila = (f: { modelo: string; color: string }) => `${f.modelo}||${f.color}`;

const tituloColor = (c: string): string => (c ? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() : 'Sin color');

type Borrador = { inicial: string; facturadas: string };

export default function Proyectados({ onIrARevision }: { onIrARevision: () => void }) {
  const { modelo, cfg, lotes, guardarStockManual, calculando } = useApp();
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [guardandoFila, setGuardandoFila] = useState<string | null>(null);

  // ---------------------------------------------- stock agrupado por modelo
  const tarjetasModelo = useMemo(() => {
    if (!modelo) return [];
    const porMod = new Map<
      string,
      {
        filas: { f: FilaStock; colorDisplay: string }[];
        inicial: number;
        facturadas: number;
        reservas: number;
        saldo: number;
        estimado: number;
      }
    >();
    for (const f of modelo.stockFilas) {
      const colorCanon = canonicoColor(cfg, f.color);
      const e = porMod.get(f.modelo) ?? { filas: [], inicial: 0, facturadas: 0, reservas: 0, saldo: 0, estimado: 0 };
      e.filas.push({ f, colorDisplay: colorCanon });
      e.inicial += f.inicial;
      e.facturadas += f.facturadas;
      e.reservas += f.reservas;
      e.saldo += f.saldo ?? 0;
      e.estimado += aNum(f.estimadoNeto);
      porMod.set(f.modelo, e);
    }
    return [...porMod.entries()]
      .map(([modelo_, v]) => ({ modelo: modelo_, ...v }))
      .sort((a, b) => b.saldo - a.saldo || b.estimado - a.estimado);
  }, [modelo, cfg]);

  if (!modelo) return <Cargando texto="Calculando el modelo…" />;
  const d = modelo.dashboard;

  if (!lotes.length) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
        <h2>Todavía no cargaste stock</h2>
        <p className="difuso">Cargá los Excel de ventas y stock para ver la proyección.</p>
        <button className="primario" onClick={onIrARevision}>
          Ir a Cargar Excel
        </button>
      </div>
    );
  }

  const borradorDe = (f: FilaStock): Borrador =>
    borradores[claveFila(f)] ?? { inicial: String(f.inicial), facturadas: String(f.facturadas) };

  const cambiarBorrador = (f: FilaStock, parche: Partial<Borrador>) => {
    const k = claveFila(f);
    setBorradores((prev) => ({ ...prev, [k]: { ...borradorDe(f), ...parche } }));
  };

  const guardarFila = async (f: FilaStock) => {
    const k = claveFila(f);
    const b = borradorDe(f);
    const inicial = b.inicial.trim();
    if (!inicial || !Number.isFinite(Number(inicial))) return;
    setGuardandoFila(k);
    try {
      // Solo se envía el override si el borrador difiere del valor efectivo;
      // así editar el inicial no congela las facturadas calculadas del Excel.
      const facturadas = b.facturadas.trim();
      const override =
        !facturadas || !Number.isFinite(Number(facturadas)) || facturadas === String(f.facturadas)
          ? undefined
          : facturadas;
      await guardarStockManual(f.modelo, f.color, inicial, override);
      setBorradores((prev) => {
        const copia = { ...prev };
        delete copia[k];
        return copia;
      });
    } finally {
      setGuardandoFila(null);
    }
  };

  const volverACalculo = async (f: FilaStock) => {
    const k = claveFila(f);
    setGuardandoFila(k);
    try {
      await guardarStockManual(f.modelo, f.color, String(f.inicial), null);
      setBorradores((prev) => {
        const copia = { ...prev };
        delete copia[k];
        return copia;
      });
    } finally {
      setGuardandoFila(null);
    }
  };

  const modelosChart = tarjetasModelo;

  return (
    <div>
      <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2>Proyectados</h2>
        <span className="mini">{calculando ? 'Recalculando…' : `Fórmula: ${cfg.formulaStock}`}</span>
      </div>

      {/* --------------------------------------------- Errores y avisos */}
      <PanelErrores onIrARevision={onIrARevision} />

      {/* ------------------------------------------------------ Tarjetas KPI */}
      <div className="kpis tarjetas">
        <Kpi etiqueta="Stock inicial" valor={numPlain(d.stockInicial)} ayuda="Σ de las filas de stock cargadas" />
        <Kpi etiqueta="Facturadas" valor={numPlain(d.stockFacturadas)} ayuda="Motos ya facturadas (de las reservas)" />
        <Kpi etiqueta="Reservadas" valor={numPlain(d.stockReservas)} ayuda="Motos con reserva activa" />
        <Kpi
          etiqueta="Stock proyectado"
          valor={numPlain(d.stockSaldo)}
          tono={d.stockSaldo > 0 ? 'verde' : 'rojo'}
          ayuda={`Fórmula: ${cfg.formulaStock}`}
        />
        <Kpi etiqueta="Estimado neto en stock" valor={usd(d.estimadoStockNeto, cfg)} />
        <Kpi etiqueta="ESTIMADO NETO TOTAL" valor={usd(d.estimadoNetoTotal, cfg)} tono="verde" ayuda="Reservas + stock proyectado a precio de lista" />
        <Kpi etiqueta="Parcial ya cobrado" valor={usd(d.estimadoParcialCobrado, cfg)} tono="verde" />
        <Kpi etiqueta="Saldo por cobrar" valor={usd(d.estimadoSaldoPorCobrar, cfg)} tono="ambar" />
      </div>

      {/* ------------------------------------------------------- Pago parcial */}
      <Seccion titulo="Pago parcial" descripcion="Avance del cobro sobre el estimado total">
        <div className="fila" style={{ gap: 16, alignItems: 'center' }}>
          <div className="avance" style={{ flex: 1, height: 18 }} title={pct(d.avance)}>
            <div style={{ width: `${Math.min(100, Math.max(0, d.avance * 100))}%` }} />
          </div>
          <strong style={{ fontSize: '1.2rem' }}>{pct(d.avance)}</strong>
        </div>
        <p className="difuso" style={{ marginBottom: 0 }}>
          {usd(d.estimadoParcialCobrado, cfg)} cobrados de {usd(d.estimadoNetoTotal, cfg)} estimados · faltan{' '}
          {usd(d.estimadoSaldoPorCobrar, cfg)}.
        </p>
      </Seccion>

      {/* --------------------------------------------------------- Gráficos */}
      <h4 className="grupo-titulo">Cómo se compone el stock</h4>
      <div className="grid-graficos">
        <GraficoBarras
          titulo="Motos por modelo"
          explicacion="Apilado por modelo: ya facturadas (verde) + con reserva activa (ámbar) + stock libre proyectado (celeste). La altura total es el stock inicial."
          etiquetas={modelosChart.map((m) => m.modelo)}
          series={[
            { nombre: 'Facturadas', datos: modelosChart.map((m) => m.facturadas), color: '#22c55e' },
            { nombre: 'Reservadas', datos: modelosChart.map((m) => m.reservas), color: '#e0a800' },
            { nombre: 'Stock libre', datos: modelosChart.map((m) => m.saldo), color: '#4dc9f6' },
          ]}
          apilado
          alto={300}
        />
        <GraficoBarras
          titulo="Estimado neto por modelo (USD)"
          explicacion="Cuánto representaría vender a precio de lista todo el stock libre de cada modelo (sin descontar costos)."
          etiquetas={modelosChart.map((m) => m.modelo)}
          series={[{ nombre: 'Estimado neto', datos: modelosChart.map((m) => m.estimado), color: '#22c55e' }]}
          moneda
          alto={300}
        />
      </div>

      {/* ------------------------------------------- Stock editable en tarjetas */}
      <Seccion
        titulo="Stock editable por modelo y color"
        descripcion="Una tarjeta por modelo · 3 columnas de colores"
      >
        <p className="difuso" style={{ marginTop: 0 }}>
          Editá el <strong>stock inicial</strong> y las <strong>facturadas</strong> de cada modelo+color: el saldo
          proyectado y el estimado neto se recalculan al guardar. Las facturadas en “auto” siguen el Excel; “Manual”
          fija el número que vos cargues.
        </p>
        {tarjetasModelo.length === 0 ? (
          <div className="banner warn">
            No hay filas de stock todavía. Cargá el Excel de stock o agregá filas desde la pestaña Stock.
          </div>
        ) : (
          <div className="stock-modelos">
            {tarjetasModelo.map((m) => (
              <div className="tarjeta-modelo" key={m.modelo}>
                <div className="tarjeta-modelo-head">
                  <strong>{m.modelo}</strong>
                  <span className="mini">
                    inicial {m.inicial} · reservadas {m.reservas} · libre {m.saldo} · {usd(m.estimado, cfg)}
                  </span>
                </div>
                <div className="colores-grid">
                  {m.filas.map(({ f, colorDisplay }) => {
                    const k = claveFila(f);
                    const b = borradorDe(f);
                    const manual = f.facturadasManual !== null;
                    const ocupado = guardandoFila === k;
                    return (
                      <div className="tarjeta-color" key={k}>
                        <div className="tarjeta-color-titulo">{tituloColor(colorDisplay)}</div>
                        <div className="tarjeta-color-campos">
                          <label>
                            Inicial
                            <input
                              className="celda-num"
                              value={b.inicial}
                              disabled={ocupado}
                              onChange={(e) => cambiarBorrador(f, { inicial: e.target.value })}
                            />
                          </label>
                          <label>
                            Facturadas{' '}
                            {manual ? (
                              <span className="badge warn" title={`El Excel calcula ${f.facturadasCalculadas}`}>
                                manual
                              </span>
                            ) : (
                              <span className="badge info" title="Conteo calculado desde el Excel de ventas">
                                auto
                              </span>
                            )}
                            <input
                              className="celda-num"
                              value={b.facturadas}
                              disabled={ocupado}
                              onChange={(e) => cambiarBorrador(f, { facturadas: e.target.value })}
                            />
                          </label>
                        </div>
                        <div className="tarjeta-color-stats">
                          <span title="Motos con reserva activa">Reservadas: {f.reservas}</span>
                          <span title="Saldo proyectado según la fórmula">
                            Libre:{' '}
                            {f.saldo === null ? (
                              <span className="badge err">fórmula inválida</span>
                            ) : (
                              <strong style={{ color: f.saldo > 0 ? 'var(--ok-suave)' : undefined }}>{f.saldo}</strong>
                            )}
                          </span>
                          <span title="Precio de lista">
                            Precio:{' '}
                            {f.precio === null ? <span className="badge warn">sin precio</span> : usd(f.precio, cfg)}
                          </span>
                          <span>Estimado: {usd(f.estimadoNeto, cfg)}</span>
                        </div>
                        <div className="fila" style={{ gap: 6 }}>
                          <button className="chico primario" disabled={ocupado} onClick={() => void guardarFila(f)}>
                            {ocupado ? '…' : 'Guardar'}
                          </button>
                          {manual && (
                            <button
                              className="chico"
                              disabled={ocupado}
                              onClick={() => void volverACalculo(f)}
                              title="Volver al conteo calculado por el Excel"
                            >
                              Auto
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Seccion>
    </div>
  );
}
