import { useMemo, useRef, useState } from 'react';
import { useApp } from '../uso';
import { obtenerLibro, primerasFilas, mapeoSugerido } from '../../io/leerExcel';
import type { ArchivoEnCola, MapeoColumnas, Simulacion, TipoArchivo } from '../../tipos';
import type { SimulacionConArchivos } from '../../pipeline/importar';
import { numPlain, pct, usd } from '../formato';

const ROLES: { rol: keyof MapeoColumnas; etiqueta: string }[] = [
  { rol: 'fecha', etiqueta: 'Fecha' },
  { rol: 'documento', etiqueta: 'Documento' },
  { rol: 'docReferencia', etiqueta: 'Doc. referencia' },
  { rol: 'pedido', etiqueta: 'N° Pedido' },
  { rol: 'nroPedido', etiqueta: 'Nro Pedido (pedidos)' },
  { rol: 'cliente', etiqueta: 'Cliente' },
  { rol: 'categoria', etiqueta: 'Categoría' },
  { rol: 'sku', etiqueta: 'SKU' },
  { rol: 'codigo', etiqueta: 'Código (pedidos)' },
  { rol: 'descripcion', etiqueta: 'Descripción' },
  { rol: 'glosa', etiqueta: 'Glosa' },
  { rol: 'vendedor', etiqueta: 'Vendedor' },
  { rol: 'unidades', etiqueta: 'Unidades' },
  { rol: 'modelo', etiqueta: 'Modelo' },
  { rol: 'importeSoles', etiqueta: 'Importe S/.' },
  { rol: 'importeUsd', etiqueta: 'Importe $' },
  { rol: 'lote', etiqueta: 'Lote/VIN' },
  { rol: 'cantPedido', etiqueta: 'Cant. pedido' },
  { rol: 'puPedido', etiqueta: 'P.U. pedido' },
  { rol: 'stockModelo', etiqueta: 'Stock: modelo' },
  { rol: 'stockColor', etiqueta: 'Stock: color' },
  { rol: 'stockInicial', etiqueta: 'Stock: inicial' },
];

function resumenSim(s: Simulacion) {
  return (
    <div className="sugerencia">
      <strong>{s.archivo}</strong>
      <span className="difuso">hoja {s.hoja}</span>
      {s.hashRepetido ? (
        <span className="badge warn">ya importado antes — se omite</span>
      ) : (
        <>
          <span className="badge info">{numPlain(s.filasLeidas)} filas</span>
          <span className="badge ok">{numPlain(s.clasificados)} clasificadas</span>
          {s.revision > 0 && <span className="badge warn">{s.revision} en revisión</span>}
          {s.errores.length > 0 && <span className="badge err">{s.errores.length} errores</span>}
          {s.duplicados.length > 0 && <span className="badge warn">{s.duplicados.length} duplicadas (excluidas)</span>}
        </>
      )}
    </div>
  );
}

export default function CargaDatos({ arrancarEnPaso, onCargado }: { arrancarEnPaso: boolean; onCargado: () => void }) {
  const app = useApp();
  const [paso, setPaso] = useState(arrancarEnPaso ? 1 : 1);
  const [sim, setSim] = useState<SimulacionConArchivos | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [encima, setEncima] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pasoActual = Math.max(1, paso);

  const archivosPreview = useMemo(() => {
    return app.cola.map((a) => {
      const libro = obtenerLibro(a.file);
      const filas = libro ? primerasFilas(libro, a.hojaActiva, a.filaEncabezado, 6) : [];
      return { a, filas };
    });
  }, [app.cola, app.cola.length]);

  const elegir = (files: FileList | null) => {
    if (!files?.length) return;
    void app.agregarArchivos([...files]);
    setPaso(2);
  };

  const simular = async () => {
    setSimulando(true);
    const r = await app.simularCola();
    setSim(r);
    setSimulando(false);
    if (r) setPaso(4);
  };

  const confirmar = async () => {
    if (!sim) return;
    setConfirmando(true);
    const n = await app.confirmarCola(sim);
    setConfirmando(false);
    setSim(null);
    if (n > 0) onCargado();
  };

  return (
    <div>
      <h2>Cargar Excel</h2>
      <ol className="fila" style={{ listStyle: 'none', padding: 0, gap: 18, marginBottom: 16 }}>
        {['Elegir archivos', 'Revisar detección', 'Previsualizar', 'Confirmar'].map((t, i) => (
          <li key={t}>
            <button className={pasoActual === i + 1 ? 'activo' : ''} onClick={() => setPaso(i + 1)}>
              {i + 1}. {t}
            </button>
          </li>
        ))}
      </ol>

      {pasoActual === 1 && (
        <div
          className={`zona-soltar ${encima ? 'encima' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            elegir(e.dataTransfer.files);
          }}
        >
          <h3>Soltá acá los Excel de ventas, pedidos y stock</h3>
          <p>.xlsx / .xls / .csv · los archivos no se suben a ningún lado, se leen en tu navegador</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => elegir(e.target.files)}
          />
          <button className="primario">Elegir archivos…</button>
        </div>
      )}

      {pasoActual === 2 && (
        <div>
          {app.cola.length === 0 && <div className="banner warn">No hay archivos en la cola. Volvé al paso 1.</div>}
          {app.cola.map((a) => (
            <ArchivoEditor key={a.id} a={a} preview={archivosPreview.find((p) => p.a.id === a.id)?.filas ?? []} />
          ))}
          {app.cola.length > 0 && (
            <button className="primario" onClick={() => setPaso(3)}>
              Ir a previsualización →
            </button>
          )}
        </div>
      )}

      {pasoActual === 3 && (
        <div>
          {app.cola.length === 0 && <div className="banner warn">La cola está vacía.</div>}
          <div className="banner">
            La previsualización calcula TODO (reservas, facturaciones, stock, conciliación) sin guardar nada. Si algo
            no cuadra, volvé atrás, ajustá el mapeo o las reglas, y simulá de nuevo.
          </div>
          <button className="primario" onClick={() => void simular()} disabled={simulando || !app.cola.length}>
            {simulando ? 'Calculando…' : 'Previsualizar importación'}
          </button>
        </div>
      )}

      {pasoActual === 4 && sim && (
        <div>
          <h3>Resultado de la previsualización (nada guardado todavía)</h3>
          {sim.simulaciones.map((s, i) => (
            <div key={i}>{resumenSim(s)}</div>
          ))}
          {sim.avisos.slice(0, 20).map((av, i) => (
            <div key={i} className="banner warn">
              {av}
            </div>
          ))}
          {sim.avisos.length > 20 && <div className="difuso">…y {sim.avisos.length - 20} avisos más.</div>}

          <div className="kpis" style={{ margin: '14px 0' }}>
            <div className="kpi">
              <div className="etiqueta">Valor neto</div>
              <div className="valor">{usd(sim.modelo.dashboard.valorNeto, app.cfg)}</div>
            </div>
            <div className="kpi verde">
              <div className="etiqueta">Cobrado</div>
              <div className="valor">{usd(sim.modelo.dashboard.cobrado, app.cfg)}</div>
            </div>
            <div className="kpi ambar">
              <div className="etiqueta">Saldo</div>
              <div className="valor">{usd(sim.modelo.dashboard.saldo, app.cfg)}</div>
            </div>
            <div className="kpi">
              <div className="etiqueta">Avance</div>
              <div className="valor">{pct(sim.modelo.dashboard.avance)}</div>
            </div>
            <div className="kpi">
              <div className="etiqueta">Conciliación</div>
              <div className="valor">
                {sim.modelo.dashboard.valido ? <span className="badge ok">OK</span> : <span className="badge err">REVISAR</span>}
              </div>
            </div>
          </div>

          {sim.modelo.revision.length > 0 && (
            <div className="banner warn">
              {sim.modelo.revision.length} fila(s) quedan en revisión (sin adivinar). Se cargan igual, pero exluídas
              de los totales hasta resolverlas en “Por revisar”.
            </div>
          )}

          <div className="fila">
            <button className="primario" onClick={() => void confirmar()} disabled={confirmando}>
              {confirmando ? 'Guardando…' : 'Confirmar importación'}
            </button>
            <button onClick={() => setPaso(3)}>
              ← Volver a simular
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ArchivoEditor({ a, preview }: { a: ArchivoEnCola; preview: ReturnType<typeof primerasFilas> }) {
  const { actualizarEnCola, quitarDeCola } = useApp();
  const libro = obtenerLibro(a.file);
  const cols = a.columnas;

  const setMapeo = (rol: keyof MapeoColumnas, valor: string) => {
    const nuevo: MapeoColumnas = { ...a.mapeo };
    if (valor === '') delete nuevo[rol];
    else nuevo[rol] = valor;
    actualizarEnCola(a.id, { mapeo: nuevo });
  };

  return (
    <div className="panel">
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{a.nombre}</strong>{' '}
          <span className="badge info">{a.tipo}</span> {a.hashCalculado && <span className="mini">hash ok</span>}
        </div>
        <button className="peligro chico" onClick={() => quitarDeCola(a.id)}>
          Quitar
        </button>
      </div>
      <div className="fila" style={{ marginTop: 10 }}>
        <label>
          Tipo{' '}
          <select
            value={a.tipo}
            onChange={(e) => {
              const tipo = e.target.value as TipoArchivo;
              actualizarEnCola(a.id, { tipo, mapeo: mapeoSugerido(a.columnas, tipo) });
            }}
          >
            <option value="ventas">ventas</option>
            <option value="pedidos">pedidos</option>
            <option value="stock">stock</option>
            <option value="desconocido">desconocido</option>
          </select>
        </label>
        <label>
          Hoja{' '}
          <select
            value={a.hojaActiva}
            onChange={(e) => {
              const hoja = e.target.value;
              const ws = libro?.Sheets[hoja];
              void ws;
              actualizarEnCola(a.id, { hojaActiva: hoja });
              // re-detectar encabezados de la nueva hoja
              void import('../../io/leerExcel').then(({ refrescarHoja }) => {
                if (libro) actualizarEnCola(a.id, { ...refrescarHoja({ ...a, hojaActiva: hoja }, libro) });
              });
            }}
          >
            {a.hojas.map((h) => (
              <option key={h.nombre} value={h.nombre}>
                {h.nombre} ({h.filas} filas)
              </option>
            ))}
          </select>
        </label>
        <label>
          Fila de encabezados{' '}
          <select value={a.filaEncabezado} onChange={(e) => actualizarEnCola(a.id, { filaEncabezado: Number(e.target.value) })}>
            {Array.from({ length: 10 }, (_, i) => i).map((i) => (
              <option key={i} value={i}>
                fila {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary>Mapeo de columnas ({Object.keys(a.mapeo).length} asignadas)</summary>
        <div className="fila" style={{ marginTop: 10 }}>
          {ROLES.map(({ rol, etiqueta }) => (
            <label key={rol} style={{ minWidth: 190 }}>
              {etiqueta}{' '}
              <select value={a.mapeo[rol] ?? ''} onChange={(e) => setMapeo(rol, e.target.value)}>
                <option value="">(ninguna)</option>
                {cols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>

      {preview.length > 0 && (
        <div className="scroll-x" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                {cols.slice(0, 10).map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((f, i) => (
                <tr key={i}>
                  {cols.slice(0, 10).map((c) => (
                    <td key={c} className="mini">
                      {String(f.celdas[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
