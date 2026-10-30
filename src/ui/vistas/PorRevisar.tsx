import { useMemo, useState } from 'react';
import { useApp } from '../uso';
import type { Registro } from '../../tipos';

function celdaClave(r: Registro): string {
  const doc = r.documento ?? '';
  const sku = r.sku ?? '';
  const desc = (r.descripcion ?? '').slice(0, 40);
  const glosa = (r.glosa ?? '').slice(0, 30);
  return [doc, sku, desc, glosa].filter(Boolean).join(' · ');
}

function Correccion({ r }: { r: Registro }) {
  const { aplicarCorreccion, cfg } = useApp();
  const [tipo, setTipo] = useState<'modelo' | 'color'>('modelo');
  const [valor, setValor] = useState('');
  const [soloEstaFila, setSoloEstaFila] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const sugerencias = useMemo(() => {
    if (tipo === 'modelo') return cfg.catalogos.modelos.filter((m) => m.activo).map((m) => m.nombre);
    return cfg.catalogos.colores.filter((c) => c.activo).map((c) => c.nombre);
  }, [tipo, cfg]);

  const aplicar = async () => {
    if (!valor.trim()) return;
    setGuardando(true);
    await aplicarCorreccion({ registro: r, tipo, valor: valor.trim(), soloEstaFila });
    setGuardando(false);
    setValor('');
  };

  return (
    <div className="sugerencia">
      <select value={tipo} onChange={(e) => setTipo(e.target.value as 'modelo' | 'color')}>
        <option value="modelo">Modelo</option>
        <option value="color">Color</option>
      </select>
      <input
        className="creces"
        list={`dl-${tipo}`}
        value={valor}
        placeholder={tipo === 'modelo' ? 'p. ej. CB190R 2.0' : 'p. ej. AZUL'}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void aplicar();
        }}
      />
      <datalist id={`dl-modelo`}>
        {sugerencias.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <label className="mini">
        <input type="checkbox" checked={soloEstaFila} onChange={(e) => setSoloEstaFila(e.target.checked)} /> solo esta
        columna
      </label>
      <button className="primario chico" onClick={() => void aplicar()} disabled={guardando || !valor.trim()}>
        {guardando ? 'Aplicando…' : 'Corregir y aprender'}
      </button>
      <span className="mini">
        La corrección se guarda como regla y se aplica en cargas futuras (se recalculará todo).
      </span>
    </div>
  );
}

export default function PorRevisar() {
  const { modelo, cfg } = useApp();
  const [busqueda, setBusqueda] = useState('');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  if (!modelo) return <div className="panel">Calculando…</div>;

  const filtrar = (rs: Registro[]) => {
    if (!busqueda.trim()) return rs;
    const q = busqueda.toLowerCase();
    return rs.filter(
      (r) =>
        (r.documento ?? '').toLowerCase().includes(q) ||
        (r.sku ?? '').toLowerCase().includes(q) ||
        (r.descripcion ?? '').toLowerCase().includes(q) ||
        (r.glosa ?? '').toLowerCase().includes(q) ||
        (r.cliente ?? '').toLowerCase().includes(q) ||
        String(r.pedido ?? '').includes(q),
    );
  };

  const revision = filtrar(modelo.revision);
  const errores = filtrar(modelo.errores);
  const pendientes = modelo.reservas.filter((x) => x.pendienteRevision);

  const toggle = (k: string) => {
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const fila = (r: Registro, tipoBadge: 'warn' | 'err') => {
    const key = `${r.archivo}|${r.hoja}|${r.fila}`;
    const abierto = abiertos.has(key);
    return (
      <tr key={key}>
        <td className="mini">
          {r.archivo}
          <br />
          {r.hoja} · fila {r.fila}
        </td>
        <td>
          <strong>{celdaClave(r) || '(fila vacía)'}</strong>
          <div className="mini">{r.motivos.join(' · ')}</div>
          {abierto && <Correccion r={r} />}
        </td>
        <td>
          <span className={`badge ${tipoBadge}`}>{tipoBadge === 'err' ? 'ERROR' : 'REVISAR'}</span>
        </td>
        <td>
          <button className="chico" onClick={() => toggle(key)}>
            {abierto ? 'Cerrar' : 'Corregir'}
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div>
      <h2>Por revisar</h2>
      <p className="difuso">
        Regla de oro: si la confianza está por debajo del umbral ({cfg.umbralConfianza}), el sistema NO adivina. Asigná
        el modelo o el color y la corrección queda aprendida.
      </p>
      <div className="panel">
        <input
          placeholder="Buscar por documento, SKU, modelo, cliente, pedido…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ width: '100%', maxWidth: 480 }}
        />
      </div>

      {errores.length > 0 && (
        <div className="panel">
          <h3>Errores ({errores.length})</h3>
          <div className="scroll-x">
            <table>
              <tbody>{errores.map((r) => fila(r, 'err'))}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>Filas en revisión ({revision.length})</h3>
        {revision.length === 0 ? (
          <div className="banner ok">Nada pendiente: todas las filas tienen modelo y color con confianza suficiente.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <tbody>{revision.map((r) => fila(r, 'warn'))}</tbody>
            </table>
          </div>
        )}
      </div>

      {pendientes.length > 0 && (
        <div className="panel">
          <h3>Reservas con precio por confirmar ({pendientes.length})</h3>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Modelo</th>
                  <th>Color</th>
                  <th className="num">Valor neto</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p) => (
                  <tr key={p.pedido}>
                    <td>{p.pedido}</td>
                    <td>{p.modelo}</td>
                    <td>{p.color}</td>
                    <td className="num">{p.valorNeto}</td>
                    <td className="mini">{p.motivos.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modelo.duplicados.length > 0 && (
        <div className="panel">
          <h3>Duplicados excluidos de los totales ({modelo.duplicados.length})</h3>
          <p className="difuso">
            Se conserva la primera aparición de cada clave Documento|SKU|Lote|USD. Los repetidos quedan marcados y no
            suman.
          </p>
        </div>
      )}
    </div>
  );
}
