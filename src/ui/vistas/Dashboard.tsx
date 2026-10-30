import { useApp } from '../uso';
import { pct, usd, numPlain, fechaCorta } from '../formato';
import { Cargando, Kpi, Seccion } from '../componentes';
import { GraficoAnillo, GraficoBarras } from '../graficos';

const aNum = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function Dashboard({ onIrACarga }: { onIrACarga: () => void }) {
  const { modelo, cfg, lotes, generarReporteExcel, calculando } = useApp();

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

  // Datos para gráficos
  const modelosChart = d.resumenModelos.slice(0, 10);
  const estados = new Map<string, { motos: number; usd: number }>();
  for (const r of modelo.reservas) {
    const k = r.estado || 'Sin estado';
    const e = estados.get(k) ?? { motos: 0, usd: 0 };
    e.motos += r.motos;
    e.usd += aNum(r.valorNeto);
    estados.set(k, e);
  }
  const estadosOrden = [...estados.entries()].sort((a, b) => b[1].usd - a[1].usd);

  return (
    <div>
      <div className="fila" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2>Cobranza y reservas</h2>
        <div className="fila">
          <button className="primario" onClick={() => void generarReporteExcel()} disabled={calculando}>
            Descargar reporte Excel
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------ Tarjetas KPI */}
      <div className="kpis tarjetas">
        <Kpi etiqueta="Valor neto reservas" valor={usd(d.valorNeto, cfg)} ayuda="Precio de lista − descuentos, por reserva" />
        <Kpi etiqueta="Cobrado" valor={usd(d.cobrado, cfg)} tono="verde" ayuda="Suma de anticipos vigentes" />
        <Kpi etiqueta="Saldo por cobrar" valor={usd(d.saldo, cfg)} tono="ambar" />
        <Kpi etiqueta="Avance de cobro" valor={pct(d.avance)} tono={d.avance < 0.5 ? 'rojo' : 'verde'} />
        <Kpi etiqueta="Reservas (pedidos)" valor={numPlain(d.reservas)} />
        <Kpi etiqueta="Motos reservadas" valor={numPlain(d.motosReservadas)} />
        <Kpi etiqueta="Cobradas 100%" valor={numPlain(d.cobradas100)} tono="verde" />
        <Kpi etiqueta="Motos facturadas" valor={numPlain(d.facturadasMotos)} />
        <Kpi etiqueta="Facturado" valor={usd(d.facturadoUsd, cfg)} />
        <Kpi etiqueta="Exceso cobrado" valor={usd(d.exceso, cfg)} ayuda="Cobros por encima del valor neto (acotados aparte)" />
      </div>

      {/* --------------------------------------------------------- Gráficos */}
      <div className="grid-graficos">
        <GraficoAnillo
          titulo="Cobrado vs saldo"
          etiquetas={['Cobrado', 'Saldo por cobrar']}
          datos={[aNum(d.cobrado), aNum(d.saldo)]}
          moneda
        />
        <GraficoBarras
          titulo="Cobrado y saldo por modelo (top 10)"
          etiquetas={modelosChart.map((m) => m.modelo)}
          series={[
            { nombre: 'Cobrado', datos: modelosChart.map((m) => aNum(m.cobrado)), color: '#22c55e' },
            { nombre: 'Saldo', datos: modelosChart.map((m) => aNum(m.saldo)), color: '#e0a800' },
          ]}
          apilado
          moneda
        />
        <GraficoBarras
          titulo="Clientes y motos en reserva por modelo"
          etiquetas={modelosChart.map((m) => m.modelo)}
          series={[
            { nombre: 'Clientes', datos: modelosChart.map((m) => m.clientes), color: '#7c5cff' },
            { nombre: 'Motos', datos: modelosChart.map((m) => m.motos), color: '#4dc9f6' },
          ]}
        />
        <GraficoAnillo
          titulo="Reservas por estado (USD neto)"
          etiquetas={estadosOrden.map(([k]) => k)}
          datos={estadosOrden.map(([, v]) => v.usd)}
          moneda
        />
      </div>

      {/* --------------------------------------------------------- Reservas */}
      <Seccion titulo="Clientes en reserva por modelo" descripcion="Clientes distintos con pedido en reserva">
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

      {/* ------------------------------------------------------- Conciliación */}
      <Seccion
        titulo={`Conciliación ${d.valido ? '· TODO OK' : '· DIFERENCIAS'}`}
        abierta={!d.valido}
        descripcion="Control de coherencia de los números"
      >
        <p className="difuso" style={{ marginTop: 0 }}>
          ¿Qué es? Una batería de controles automáticos que verifican que los números cierren entre sí: que el
          cobrado + el saldo den el valor neto, que el detalle por modelo sume los mismos totales que el resumen, que
          el stock cumpla la fórmula. Si algún control marca <strong>REVISAR</strong>, hay una diferencia que se
          resuelve revisando las filas en “Por revisar” o los datos de entrada — no es un error del sistema.
        </p>
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
                  <td>{c.ok ? <span className="badge ok">OK</span> : <span className="badge err">REVISAR</span>}</td>
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
                    <summary>
                      {a.slice(0, 160)}… <span className="difuso">(ver completo)</span>
                    </summary>
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
