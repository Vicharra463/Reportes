import { useState } from 'react';
import { useApp } from '../uso';
import { numPlain, usd } from '../formato';
import { Cargando } from '../componentes';

export default function Stock() {
  const { modelo, stock, guardarStockManual, cfg } = useApp();
  const [m, setM] = useState('');
  const [c, setC] = useState('');
  const [i, setI] = useState('');
  const [guardando, setGuardando] = useState(false);

  if (!modelo) return <Cargando texto="Calculando el modelo…" />;
  const filas = modelo.stockFilas;

  const guardar = async () => {
    if (!m.trim() || !i.trim()) return;
    setGuardando(true);
    await guardarStockManual(m.trim(), c.trim() || 'Sin color', i.trim());
    setGuardando(false);
    setM('');
    setC('');
    setI('');
  };

  const modelosCfg = cfg.catalogos.modelos.filter((x) => x.activo).map((x) => x.nombre);
  const coloresCfg = cfg.catalogos.colores.filter((x) => x.activo).map((x) => x.nombre);

  return (
    <div>
      <h2>Stock</h2>
      <p className="difuso">
        El stock es dinámico: se arma cruzando las filas de stock que cargues (o edits a mano) con lo que se
        descuenta por facturaciones y reservas. Fórmula vigente: <code>{cfg.formulaStock}</code> (editable en
        Configuración).
      </p>

      <div className="panel">
        <h3>Agregar / actualizar stock inicial</h3>
        <div className="fila">
          <label>
            Modelo{' '}
            <input list="dl-modelos-stock" value={m} onChange={(e) => setM(e.target.value)} placeholder="CB190R 2.0" />
            <datalist id="dl-modelos-stock">
              {modelosCfg.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
          <label>
            Color{' '}
            <input list="dl-colores-stock" value={c} onChange={(e) => setC(e.target.value)} placeholder="AZUL" />
            <datalist id="dl-colores-stock">
              {coloresCfg.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
          <label>
            Stock inicial <input value={i} onChange={(e) => setI(e.target.value)} style={{ width: 90 }} />
          </label>
          <button className="primario" onClick={() => void guardar()} disabled={guardando || !m.trim() || !i.trim()}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        <p className="mini">
          También podés importar un Excel de stock en “Cargar Excel” (columnas Modelo, Color, Stock inicial): las filas
          reemplazan el inicial de esa combinación.
        </p>
      </div>

      <div className="panel">
        <h3>Stock proyectado por modelo y color</h3>
        {filas.length === 0 ? (
          <div className="banner warn">
            No hay filas de stock todavía. Cargá el Excel de stock o agregá filas a mano para ver el estimado neto.
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
                  <th>Fuente precio</th>
                  <th className="num">Estimado neto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.modelo}||${f.color}`}>
                    <td>{f.modelo}</td>
                    <td>{f.color}</td>
                    <td className="num">{f.inicial}</td>
                    <td className="num">
                      {f.facturadas}
                      {f.facturadasManual !== null ? (
                        <span className="badge warn" title={`Manual (el Excel calcula ${f.facturadasCalculadas}). Se edita desde el Dashboard.`}>
                          manual
                        </span>
                      ) : (
                        <span className="badge info" title="Calculado desde el Excel de ventas">auto</span>
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
                    <td className="num">{f.precio === null ? <span className="badge warn">sin precio</span> : usd(f.precio, cfg)}</td>
                    <td className="mini">{f.precioFuente ?? '—'}</td>
                    <td className="num">{usd(f.estimadoNeto, cfg)}</td>
                    <td>
                      <button
                        className="chico"
                        onClick={() => {
                          setM(f.modelo);
                          setC(f.color === 'Sin color' ? '' : f.color);
                          setI(String(f.inicial));
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>
                    <strong>TOTAL</strong>
                  </td>
                  <td className="num">
                    <strong>{filas.reduce((a, f) => a + f.inicial, 0)}</strong>
                  </td>
                  <td className="num">
                    <strong>{filas.reduce((a, f) => a + f.facturadas, 0)}</strong>
                  </td>
                  <td className="num">
                    <strong>{filas.reduce((a, f) => a + f.reservas, 0)}</strong>
                  </td>
                  <td className="num">
                    <strong>{filas.reduce((a, f) => a + (f.saldo ?? 0), 0)}</strong>
                  </td>
                  <td colSpan={2}></td>
                  <td className="num">
                    <strong>{usd(filas.reduce((a, f) => a + Number(f.estimadoNeto), 0), cfg)}</strong>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mini">
          {numPlain(modelo.dashboard.stockSaldo)} motos proyectadas · estimado neto en stock{' '}
          {usd(modelo.dashboard.estimadoStockNeto, cfg)}. Las filas “sin precio” no suman al estimado (se avisa en el
          dashboard).
        </p>
      </div>

      <div className="panel">
        <h3>Filas manuales guardadas ({stock.filter((s) => s.origen === 'manual').length})</h3>
        <p className="mini">El stock con origen “excel” viene del archivo importado; el manual lo cargaste acá.</p>
      </div>
    </div>
  );
}
