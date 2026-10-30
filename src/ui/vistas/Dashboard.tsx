import { useApp } from '../uso';
import { pct, usd, numPlain, fechaCorta } from '../formato';

function Kpi(props: { etiqueta: string; valor: string; tono?: 'verde' | 'ambar' | 'rojo'; ayuda?: string }) {
  return (
    <div className={`kpi ${props.tono ?? ''}`} title={props.ayuda}>
      <div className="etiqueta">{props.etiqueta}</div>
      <div className="valor">{props.valor}</div>
    </div>
  );
}

export default function Dashboard({ onIrACarga }: { onIrACarga: () => void }) {
  const { modelo, cfg, lotes, generarReporteExcel, calculando } = useApp();

  if (!modelo) return <div className="panel">Calculando…</div>;
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

      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi etiqueta="Valor neto reservas" valor={usd(d.valorNeto, cfg)} ayuda="Precio de lista − descuentos, por reserva" />
        <Kpi etiqueta="Cobrado" valor={usd(d.cobrado, cfg)} tono="verde" ayuda="Suma de anticipos vigentes" />
        <Kpi etiqueta="Saldo por cobrar" valor={usd(d.saldo, cfg)} tono="ambar" />
        <Kpi etiqueta="Avance de cobro" valor={pct(d.avance)} tono={d.avance < 0.5 ? 'rojo' : 'verde'} />
        <Kpi etiqueta="Exceso cobrado" valor={usd(d.exceso, cfg)} ayuda="Cobros por encima del valor neto (acotados aparte)" />
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi etiqueta="Reservas (pedidos)" valor={numPlain(d.reservas)} />
        <Kpi etiqueta="Motos reservadas" valor={numPlain(d.motosReservadas)} />
        <Kpi etiqueta="Cobradas 100%" valor={numPlain(d.cobradas100)} tono="verde" />
        <Kpi etiqueta="Motos facturadas" valor={numPlain(d.facturadasMotos)} />
        <Kpi etiqueta="Facturado" valor={usd(d.facturadoUsd, cfg)} />
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi etiqueta="Stock inicial" valor={numPlain(d.stockInicial)} ayuda="Σ de las filas de stock cargadas" />
        <Kpi etiqueta="Facturadas (stock)" valor={numPlain(d.stockFacturadas)} />
        <Kpi etiqueta="Reservas (stock)" valor={numPlain(d.stockReservas)} />
        <Kpi etiqueta="Stock proyectado" valor={numPlain(d.stockSaldo)} tono={d.stockSaldo > 0 ? 'verde' : 'rojo'} ayuda={`Fórmula: ${cfg.formulaStock}`} />
        <Kpi etiqueta="Estimado neto en stock" valor={usd(d.estimadoStockNeto, cfg)} />
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        <Kpi etiqueta="ESTIMADO NETO TOTAL" valor={usd(d.estimadoNetoTotal, cfg)} tono="verde" ayuda="Valor neto de reservas + stock proyectado a precio de lista" />
        <Kpi etiqueta="Parcial ya cobrado" valor={usd(d.estimadoParcialCobrado, cfg)} tono="verde" />
        <Kpi etiqueta="Saldo por cobrar" valor={usd(d.estimadoSaldoPorCobrar, cfg)} tono="ambar" />
      </div>

      <div className="panel">
        <h3>Controles de conciliación {d.valido ? <span className="badge ok">TODO OK</span> : <span className="badge err">DIFERENCIAS</span>}</h3>
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
      </div>

      {modelo.avisos.length > 0 && (
        <div className="panel">
          <h3>Avisos del cálculo</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {modelo.avisos.slice(0, 30).map((a, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {a}
              </li>
            ))}
          </ul>
          {modelo.avisos.length > 30 && <div className="difuso">…y {modelo.avisos.length - 30} avisos más.</div>}
        </div>
      )}

      <div className="panel">
        <h3>Detalle por modelo y color</h3>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Color</th>
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
      </div>

      {modelo.facturaciones.length > 0 && (
        <div className="panel">
          <h3>Últimas facturaciones ({modelo.facturaciones.length})</h3>
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
        </div>
      )}
    </div>
  );
}
