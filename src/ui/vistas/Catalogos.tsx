import { useState } from 'react';
import { useApp } from '../uso';
import type { Configuracion } from '../../dominio/configuracion';

type Sub = 'modelos' | 'colores' | 'sinonimos' | 'precios' | 'excepciones' | 'reglas';

export default function Catalogos() {
  const { cfg, reglas, editarCfg, toggleRegla, eliminarRegla } = useApp();
  const [sub, setSub] = useState<Sub>('modelos');

  const mutar = (seccion: string, f: (c: Configuracion) => void) => void editarCfg(seccion, f);

  return (
    <div>
      <h2>Catálogos</h2>
      <p className="difuso">Todo lo que ves acá es configurable y queda registrado en el historial (con opción de deshacer).</p>
      <div className="tabs">
        {(
          [
            ['modelos', 'Modelos'],
            ['colores', 'Colores'],
            ['sinonimos', 'Sinónimos'],
            ['precios', 'Precios'],
            ['excepciones', 'Excepciones'],
            ['reglas', 'Reglas aprendidas'],
          ] as [Sub, string][]
        ).map(([id, et]) => (
          <button key={id} className={sub === id ? 'activo' : ''} onClick={() => setSub(id)}>
            {et}
          </button>
        ))}
      </div>

      {sub === 'modelos' && (
        <div className="panel">
          <NuevaLista
            placeholder="Nuevo modelo (ej. CB190R 2.0)"
            onAgregar={(nombre) =>
              mutar('catalogos.modelos', (c) => {
                if (!c.catalogos.modelos.some((m) => m.nombre.toLowerCase() === nombre.toLowerCase())) {
                  c.catalogos.modelos.push({ nombre, marca: '', activo: true });
                }
              })
            }
          />
          <table>
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Marca</th>
                <th>Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cfg.catalogos.modelos.map((m, idx) => (
                <tr key={m.nombre}>
                  <td>{m.nombre}</td>
                  <td>{m.marca}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={m.activo}
                      onChange={(e) =>
                        mutar('catalogos.modelos', (c) => {
                          c.catalogos.modelos[idx].activo = e.target.checked;
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="peligro chico"
                      onClick={() =>
                        mutar('catalogos.modelos', (c) => {
                          c.catalogos.modelos.splice(idx, 1);
                        })
                      }
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sub === 'colores' && (
        <div className="panel">
          <NuevaLista
            placeholder="Nuevo color (ej. VERDE)"
            onAgregar={(nombre) =>
              mutar('catalogos.colores', (c) => {
                if (!c.catalogos.colores.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase())) {
                  c.catalogos.colores.push({ nombre, activo: true });
                }
              })
            }
          />
          <table>
            <thead>
              <tr>
                <th>Color</th>
                <th>Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cfg.catalogos.colores.map((x, idx) => (
                <tr key={x.nombre}>
                  <td>{x.nombre}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={x.activo}
                      onChange={(e) =>
                        mutar('catalogos.colores', (c) => {
                          c.catalogos.colores[idx].activo = e.target.checked;
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="peligro chico"
                      onClick={() =>
                        mutar('catalogos.colores', (c) => {
                          c.catalogos.colores.splice(idx, 1);
                        })
                      }
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sub === 'sinonimos' && (
        <div className="panel">
          <p className="mini">Sinónimos de modelo: si el Excel dice “HORNET”, se clasifica como el valor indicado.</p>
          <table>
            <thead>
              <tr>
                <th>Búsqueda</th>
                <th>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cfg.catalogos.sinonimos.map((s, idx) => (
                <tr key={`${s.busqueda}||${idx}`}>
                  <td>{s.busqueda}</td>
                  <td>{s.valor}</td>
                  <td>
                    <button
                      className="peligro chico"
                      onClick={() =>
                        mutar('catalogos.sinonimos', (c) => {
                          c.catalogos.sinonimos.splice(idx, 1);
                        })
                      }
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sub === 'precios' && (
        <div className="panel">
          <p className="mini">
            Precio por prefijo de SKU (el más específico gana). Se usa para valor neto de reservas y para estimar el
            stock proyectado.
          </p>
          <table>
            <thead>
              <tr>
                <th>Prefijo SKU</th>
                <th className="num">Precio USD</th>
                <th>Fuente</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cfg.catalogos.precios.map((p, idx) => (
                <tr key={p.prefijo}>
                  <td>{p.prefijo}</td>
                  <td className="num">
                    <input
                      value={p.precio}
                      style={{ width: 110 }}
                      onChange={(e) =>
                        mutar('catalogos.precios', (c) => {
                          c.catalogos.precios[idx].precio = e.target.value;
                        })
                      }
                    />
                  </td>
                  <td className="mini">{p.fuente}</td>
                  <td>
                    <button
                      className="peligro chico"
                      onClick={() =>
                        mutar('catalogos.precios', (c) => {
                          c.catalogos.precios.splice(idx, 1);
                        })
                      }
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sub === 'excepciones' && (
        <div className="panel">
          <p className="mini">Excepciones por pedido (precio especial, descuento fijo, igual a saldo…).</p>
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th className="num">Precio</th>
                <th className="num">Dscto/moto</th>
                <th>Dscto = saldo</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {cfg.catalogos.excepciones.map((e, idx) => (
                <tr key={e.pedido}>
                  <td>{e.pedido}</td>
                  <td className="num">
                    <input
                      value={e.precio ?? ''}
                      style={{ width: 100 }}
                      onChange={(ev) =>
                        mutar('catalogos.excepciones', (c) => {
                          c.catalogos.excepciones[idx].precio = ev.target.value === '' ? undefined : Number(ev.target.value);
                        })
                      }
                    />
                  </td>
                  <td className="num">
                    <input
                      value={e.dsctoPorMoto ?? ''}
                      style={{ width: 100 }}
                      onChange={(ev) =>
                        mutar('catalogos.excepciones', (c) => {
                          c.catalogos.excepciones[idx].dsctoPorMoto =
                            ev.target.value === '' ? undefined : Number(ev.target.value);
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!e.dsctoIgualASaldo}
                      onChange={(ev) =>
                        mutar('catalogos.excepciones', (c) => {
                          c.catalogos.excepciones[idx].dsctoIgualASaldo = ev.target.checked || undefined;
                        })
                      }
                    />
                  </td>
                  <td className="mini">{e.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sub === 'reglas' && (
        <div className="panel">
          <p className="mini">
            Cada corrección aplicada en “Por revisar” se convierte en una regla: si el Excel vuelve a traer ese texto,
            se clasifica solo. Podés desactivarlas o borrarlas.
          </p>
          {reglas.length === 0 ? (
            <div className="banner">Todavía no hay reglas aprendidas.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Búsqueda</th>
                  <th>Columna</th>
                  <th>Valor</th>
                  <th>Origen</th>
                  <th>Activa</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reglas.map((rg) => (
                  <tr key={rg.id}>
                    <td>{rg.tipo}</td>
                    <td>{rg.busquedaOriginal || rg.busqueda}</td>
                    <td className="mini">{rg.columna ?? 'cualquiera'}</td>
                    <td>
                      <strong>{rg.valor}</strong>
                    </td>
                    <td className="mini">{rg.origen}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={rg.activa}
                        onChange={(e) => void toggleRegla(rg, e.target.checked)}
                      />
                    </td>
                    <td>
                      {rg.id !== undefined && (
                        <button className="peligro chico" onClick={() => void eliminarRegla(rg.id!)}>
                          Borrar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function NuevaLista({ placeholder, onAgregar }: { placeholder: string; onAgregar: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="fila" style={{ marginBottom: 12 }}>
      <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} style={{ maxWidth: 320 }} />
      <button
        className="primario"
        disabled={!v.trim()}
        onClick={() => {
          onAgregar(v.trim());
          setV('');
        }}
      >
        Agregar
      </button>
    </div>
  );
}
