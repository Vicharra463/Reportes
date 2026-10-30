import { useState } from 'react';
import { useApp } from '../uso';
import { pct, usd, numPlain, fechaCorta } from '../formato';
import { Cargando } from '../componentes';
import type { FilaStock } from '../../dominio/calcular';

function Kpi(props: { etiqueta: string; valor: string; tono?: 'verde' | 'ambar' | 'rojo'; ayuda?: string }) {
  return (
    <div className={`kpi ${props.tono ?? ''}`} title={props.ayuda}>
      <div className="etiqueta">{props.etiqueta}</div>
      <div className="valor">{props.valor}</div>
    </div>
  );
}

function Seccion(props: { titulo: string; descripcion?: string; abierta?: boolean; children: React.ReactNode }) {
  const [abierta, setAbierta] = useState(props.abierta ?? true);
  return (
    <div className="panel">
      <div className="fila" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setAbierta(!abierta)}>
        <h3 style={{ margin: 0 }}>
          {props.titulo} <span className="mini">{abierta ? '▾' : '▸'}</span>
        </h3>
        {props.descripcion && <span className="difuso">{props.descripcion}</span>}
      </div>
      {abierta && <div style={{ marginTop: 12 }}>{props.children}</div>}
    </div>
  );
}

const claveFila = (f: { modelo: string; color: string }) => `${f.modelo}||${f.color}`;

type Borrador = { inicial: string; facturadas: string };

export default function Dashboard({ onIrACarga }: { onIrACarga: () => void }) {
  const { modelo, cfg, lotes, generarReporteExcel, calculando, guardarStockManual } = useApp();
  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [guardandoFila, setGuardandoFila] = useState<string | null>(null);

  if (!modelo) return <Cargando texto="Calculando el modelo…" />;
  const d = modelo.dashboard;

  if (!lotes.length) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
        <h2>Todavía no cargaste ningún Excel</h2>
        <p className="difuso">
          Empezá por cargar el archivo de ventas (y el de pedidos, para colores y vendedores). Vas a ver una
          previsualización completa antes de confirmar nada.
        </p>
        <button className="primario" onClick={onIrACarga}>
          Cargar Excel
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

  const total = (fn: (f: FilaStock) => number) => modelo.stockFilas.reduce((a, f) => a + fn(f), 0);

  return (
    <div>
      <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2>Resumen de cobranza y estimado</h2>
        <div className="fila">
          <button className="primario" onClick={() => void generarReporteExcel()} disabled={calculando}>
            Descargar reporte Excel
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------- Cobranza */}
      <Seccion titulo="Cobranza" descripcion="Valor neto, cobrado y saldo de las reservas">
        <div className="kpis">
          <Kpi etiqueta="Valor neto reservas" valor={usd(d.valorNeto, cfg)} ayuda="Precio de lista − descuentos, por reserva" />
          <Kpi etiqueta="Cobrado" valor={usd(d.cobrado, cfg)} tono="verde" ayuda="Suma de anticipos vigentes" />
          <Kpi etiqueta="Saldo por cobrar" valor={usd(d.saldo, cfg)} tono="ambar" />
          <Kpi etiqueta="Avance de cobro" valor={pct(d.avance)} tono={d.avance < 0.5 ? 'rojo' : 'verde'} />
          <Kpi etiqueta="Exceso cobrado" valor={usd(d.exceso, cfg)} ayuda="Cobros por encima del valor neto (acotados aparte)" />
        </div>
      </Seccion>

      {/* --------------------------------------------------------- Reservas */}
      <Seccion titulo="Reservas" descripcion="Pedidos con anticipo y facturaciones">
        <div className="kpis" style={{ marginBottom: 12 }}>
          <Kpi etiqueta="Reservas (pedidos)" valor={numPlain(d.reservas)} />
          <Kpi etiqueta="Motos reservadas" valor={numPlain(d.motosReservadas)} />
          <Kpi etiqueta="Cobradas 100%" valor={numPlain(d.cobradas100)} tono="verde" />
          <Kpi etiqueta="Motos facturadas" valor={numPlain(d.facturadasMotos)} />
          <Kpi etiqueta="Facturado" valor={usd(d.facturadoUsd, cfg)} />
        </div>

        <h3>Clientes en reserva por modelo</h3>
        <p className="difuso" style={{ marginTop: 0 }}>
          Clientes distintos (según el Excel de ventas) con al menos un pedido en reserva, agrupados por modelo.
        </p>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Modelo</th>
                <th className="num">Clientes</th>
                <th className="num">Reservas</th>
                <th className="num">Motos</th>
                <th className="num">Valor neto</th>
                <th className="num">Cobrado</th>
                <th className="num">Saldo</th>
                <th>Avance</th>
                <th className="num">Facturadas</th>
              </tr>
            </thead>
            <tbody>
              {d.resumenModelos.map((m) => (
                <tr key={m.modelo}>
                  <td>{m.modelo}</td>
                  <td className="num">
                    <strong>{m.clientes}</strong>
                  </td>
                  <td className="num">{m.reservas}</td>
                  <td className="num">{m.motos}</td>
                  <td className="num">{usd(m.valorNeto, cfg)}</td>
                  <td className="num">{usd(m.cobrado, cfg)}</td>
                  <td className="num">{usd(m.saldo, cfg)}</td>
                  <td>
                    <div className={`avance ${m.avance < 0.5 ? 'rojo' : ''}`} title={pct(m.avance)}>
                      <div style={{ width: `${Math.min(100, Math.max(0, m.avance * 100))}%` }} />
                    </div>
                    <span className="mini">{pct(m.avance)}</span>
                  </td>
                  <td className="num">{m.facturadas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      {/* ------------------------------------------------------ Stock editable */}
      <Seccion
        titulo="Stock y proyectado"
        descripcion={`Editable · fórmula: ${cfg.formulaStock}`}
      >
        <p className="difuso" style={{ marginTop: 0 }}>
          Editá el <strong>stock inicial</strong> y las <strong>facturadas</strong> de cada modelo+color: el saldo
          proyectado y el estimado neto se recalculan al guardar. Las facturadas en “auto” siguen el Excel; “Manual”
          fija el número que vos cargues.
        </p>
        {modelo.stockFilas.length === 0 ? (
          <div className="banner warn">
            No hay filas de stock todavía. Cargá el Excel de stock o agregá filas desde la pestaña Stock.
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th>Color</th>
                  <th className="num">Inicial</th>
                  <th className="num">Facturadas</th>
                  <th className="num">Reservas</th>
                  <th className="num">Saldo proy.</th>
                  <th className="num">Precio lista</th>
                  <th className="num">Estimado neto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {modelo.stockFilas.map((f) => {
                  const k = claveFila(f);
                  const b = borradorDe(f);
                  const manual = f.facturadasManual !== null;
                  const ocupado = guardandoFila === k;
                  return (
                    <tr key={k}>
                      <td>{f.modelo}</td>
                      <td>{f.color}</td>
                      <td className="num">
                        <input
                          className="celda-num"
                          value={b.inicial}
                          disabled={ocupado}
                          onChange={(e) => cambiarBorrador(f, { inicial: e.target.value })}
                        />
                      </td>
                      <td className="num">
                        <input
                          className="celda-num"
                          value={b.facturadas}
                          disabled={ocupado}
                          onChange={(e) => cambiarBorrador(f, { facturadas: e.target.value })}
                        />
                        {manual ? (
                          <span className="badge warn" title={`El Excel calcula ${f.facturadasCalculadas}`}>
                            manual
                          </span>
                        ) : (
                          <span className="badge info" title="Conteo calculado desde el Excel de ventas">
                            auto
                          </span>
                        )}
                      </td>
                      <td className="num">{f.reservas}</td>
                      <td className="num">
                        {f.saldo === null ? (
                          <span className="badge err">fórmula inválida</span>
                        ) : (
                          <strong style={{ color: f.saldo > 0 ? 'var(--ok-suave)' : undefined }}>{f.saldo}</strong>
                        )}
                      </td>
                      <td className="num">
                        {f.precio === null ? <span className="badge warn">sin precio</span> : usd(f.precio, cfg)}
                      </td>
                      <td className="num">{usd(f.estimadoNeto, cfg)}</td>
                      <td>
                        <div className="fila" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <button className="chico primario" disabled={ocupado} onClick={() => void guardarFila(f)}>
                            {ocupado ? '…' : 'Guardar'}
                          </button>
                          {manual && (
                            <button className="chico" disabled={ocupado} onClick={() => void volverACalculo(f)} title="Volver al conteo calculado por el Excel">
                              Auto
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>
                    <strong>TOTAL</strong>
                  </td>
                  <td className="num">
                    <strong>{total((f) => f.inicial)}</strong>
                  </td>
                  <td className="num">
                    <strong>{total((f) => f.facturadas)}</strong>
                  </td>
                  <td className="num">
                    <strong>{total((f) => f.reservas)}</strong>
                  </td>
                  <td className="num">
                    <strong>{total((f) => f.saldo ?? 0)}</strong>
                  </td>
                  <td></td>
                  <td className="num">
                    <strong>{usd(d.estimadoStockNeto, cfg)}</strong>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="kpis" style={{ marginTop: 12 }}>
          <Kpi etiqueta="Stock inicial" valor={numPlain(d.stockInicial)} ayuda="Σ de las filas de stock cargadas" />
          <Kpi etiqueta="Facturadas (stock)" valor={numPlain(d.stockFacturadas)} />
          <Kpi etiqueta="Reservas (stock)" valor={numPlain(d.stockReservas)} />
          <Kpi etiqueta="Stock proyectado" valor={numPlain(d.stockSaldo)} tono={d.stockSaldo > 0 ? 'verde' : 'rojo'} ayuda={`Fórmula: ${cfg.formulaStock}`} />
          <Kpi etiqueta="Estimado neto en stock" valor={usd(d.estimadoStockNeto, cfg)} />
        </div>
      </Seccion>

      {/* ------------------------------------------------------ Estimado total */}
      <Seccion titulo="Estimado neto total" descripcion="Reservas + stock proyectado a precio de lista">
        <div className="kpis">
          <Kpi etiqueta="ESTIMADO NETO TOTAL" valor={usd(d.estimadoNetoTotal, cfg)} tono="verde" ayuda="Valor neto de reservas + stock proyectado a precio de lista" />
          <Kpi etiqueta="Parcial ya cobrado" valor={usd(d.estimadoParcialCobrado, cfg)} tono="verde" />
          <Kpi etiqueta="Saldo por cobrar" valor={usd(d.estimadoSaldoPorCobrar, cfg)} tono="ambar" />
        </div>
      </Seccion>

      {/* ------------------------------------------------------- Conciliación */}
      <Seccion
        titulo={`Controles de conciliación ${d.valido ? '· TODO OK' : '· DIFERENCIAS'}`}
        abierta={!d.valido}
        descripcion="El reporte no está “válido” si algún control tiene diferencia"
      >
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Control</th>
                <th className="num">Esperado</th>
                <th className="num">Obtenido</th>
                <th className="num">Diferencia</th>
                <th>Estado</th>
                <th>Qué verifica</th>
              </tr>
            </thead>
            <tbody>
              {d.conciliacion.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td className="num">{c.esperado}</td>
                  <td className="num">{c.obtenido}</td>
                  <td className="num">{c.diferencia}</td>
                  <td>
                    {c.ok ? <span className="badge ok">OK</span> : <span className="badge err">REVISAR</span>}
                  </td>
                  <td className="difuso">{c.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      {/* ------------------------------------------------------------- Avisos */}
      {modelo.avisos.length > 0 && (
        <Seccion titulo={`Avisos (${modelo.avisos.length})`} abierta={false}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {modelo.avisos.slice(0, 30).map((a, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {a.length > 200 ? (
                  <details>
                    <summary>{a.slice(0, 160)}… <span className="difuso">(ver completo)</span></summary>
                    <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 6 }}>{a}</div>
                  </details>
                ) : (
                  a
                )}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {/* ------------------------------------------- Detalle por modelo y color */}
      <Seccion titulo="Detalle por modelo y color" abierta={false} descripcion="Desglose por color dentro de cada modelo">
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Color</th>
                <th className="num">Clientes</th>
                <th className="num">Reservas</th>
                <th className="num">Motos</th>
                <th className="num">Valor neto</th>
                <th className="num">Cobrado</th>
                <th className="num">Saldo</th>
                <th className="num">Exceso</th>
                <th>Avance</th>
                <th className="num">Facturadas</th>
              </tr>
            </thead>
            <tbody>
              {d.porModelo.map((g) => (
                <tr key={`${g.modelo}||${g.color}`}>
                  <td>{g.modelo}</td>
                  <td>{g.color}</td>
                  <td className="num">{g.clientes}</td>
                  <td className="num">{g.reservas}</td>
                  <td className="num">{g.motos}</td>
                  <td className="num">{usd(g.valorNeto, cfg)}</td>
                  <td className="num">{usd(g.cobrado, cfg)}</td>
                  <td className="num">{usd(g.saldo, cfg)}</td>
                  <td className="num">{usd(g.exceso, cfg)}</td>
                  <td>
                    <div className={`avance ${g.avance < 0.5 ? 'rojo' : ''}`} title={pct(g.avance)}>
                      <div style={{ width: `${Math.min(100, Math.max(0, g.avance * 100))}%` }} />
                    </div>
                    <span className="mini">{pct(g.avance)}</span>
                  </td>
                  <td className="num">{g.facturadas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      {/* --------------------------------------------------- Facturaciones */}
      {modelo.facturaciones.length > 0 && (
        <Seccion titulo={`Últimas facturaciones (${modelo.facturaciones.length})`} abierta={false}>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Documento</th>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Modelo</th>
                  <th>Color</th>
                  <th className="num">USD</th>
                </tr>
              </thead>
              <tbody>
                {modelo.facturaciones
                  .slice(-12)
                  .reverse()
                  .map((f, i) => (
                    <tr key={i}>
                      <td>{fechaCorta(f.fechaISO)}</td>
                      <td>{f.documento}</td>
                      <td>{f.pedido ?? '—'}</td>
                      <td>{f.cliente ?? '—'}</td>
                      <td>{f.modelo ?? '—'}</td>
                      <td>{f.color ?? '—'}</td>
                      <td className="num">{usd(f.usd, cfg)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}
    </div>
  );
}
