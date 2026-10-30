import { useRef, useState } from 'react';
import { useApp } from '../uso';
import { fechaCorta } from '../formato';

export default function Historial() {
  const { cambios, lotes, revertirCambio, revertirLote, exportarBackup, importarBackup } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div>
      <h2>Historial</h2>
      <p className="difuso">
        Toda configuración, catálogo o precio que cambies queda registrado con fecha y valores antes/después. Los
        lotes de importación se pueden revertir (borran solo las filas de ese archivo).
      </p>

      <div className="panel">
        <h3>Cambios de configuración ({cambios.length})</h3>
        {cambios.length === 0 ? (
          <div className="banner">Sin cambios todavía.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Sección</th>
                  <th>Antes → Después</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cambios.slice(0, 100).map((c) => (
                  <tr key={c.id}>
                    <td className="mini">{fechaCorta(c.fechaISO)}</td>
                    <td>{c.seccion}</td>
                    <td className="mini">
                      {c.antes.slice(0, 90)}
                      {c.antes.length > 90 ? '…' : ''}
                      {' → '}
                      {c.despues.slice(0, 90)}
                      {c.despues.length > 90 ? '…' : ''}
                    </td>
                    <td>{c.revertido ? <span className="badge warn">revertido</span> : <span className="badge ok">vigente</span>}</td>
                    <td>
                      {!c.revertido && (
                        <button className="chico" onClick={() => void revertirCambio(c)}>
                          Deshacer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Lotes importados ({lotes.length})</h3>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Archivo</th>
                <th>Tipo</th>
                <th className="num">Filas</th>
                <th className="num">Revisión</th>
                <th className="num">Errores</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.id}>
                  <td className="mini">{fechaCorta(l.fechaISO)}</td>
                  <td>{l.archivo}</td>
                  <td>
                    <span className="badge info">{l.tipo}</span>
                  </td>
                  <td className="num">{l.filasImportadas}</td>
                  <td className="num">{l.filasRevision}</td>
                  <td className="num">{l.filasError}</td>
                  <td>
                    {l.estado === 'confirmado' ? (
                      <span className="badge ok">confirmado</span>
                    ) : (
                      <span className="badge warn">revertido</span>
                    )}
                  </td>
                  <td>
                    {l.estado === 'confirmado' && l.id !== undefined && (
                      <button
                        className="peligro chico"
                        onClick={() => {
                          if (confirm(`¿Revertir el lote "${l.archivo}"? Se borran sus ${l.filasImportadas} filas.`)) {
                            void revertirLote(l.id!);
                          }
                        }}
                      >
                        Revertir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>Backup</h3>
        <div className="fila">
          <button onClick={exportarBackup}>Exportar backup (JSON)</button>
          <button onClick={() => inputRef.current?.click()}>Importar backup…</button>
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void importarBackup(f).then((n) => setMsg(n > 0 ? `Backup importado: ${n} registros.` : null));
              e.target.value = '';
            }}
          />
        </div>
        {msg && <div className="banner ok">{msg}</div>}
        <p className="mini">
          El backup incluye lotes, registros, reglas, historial, stock y configuración. El archivo Excel original no se
          guarda nunca: si lo perdés, volvé a cargarlo desde el backup (los datos parseados siguen siendo válidos).
        </p>
      </div>
    </div>
  );
}
