import { useApp } from '../uso';
import type { Configuracion } from '../../dominio/configuracion';
import type { MapeoColumnas } from '../../tipos';

const ROLES: { rol: keyof MapeoColumnas; etiqueta: string }[] = [
  { rol: 'fecha', etiqueta: 'Fecha' },
  { rol: 'documento', etiqueta: 'Documento' },
  { rol: 'docReferencia', etiqueta: 'Doc. referencia' },
  { rol: 'pedido', etiqueta: 'N° Pedido' },
  { rol: 'nroPedido', etiqueta: 'Nro Pedido' },
  { rol: 'cliente', etiqueta: 'Cliente' },
  { rol: 'categoria', etiqueta: 'Categoría' },
  { rol: 'sku', etiqueta: 'SKU' },
  { rol: 'codigo', etiqueta: 'Código' },
  { rol: 'descripcion', etiqueta: 'Descripción' },
  { rol: 'glosa', etiqueta: 'Glosa' },
  { rol: 'vendedor', etiqueta: 'Vendedor' },
  { rol: 'unidades', etiqueta: 'Unidades' },
  { rol: 'modelo', etiqueta: 'Modelo' },
  { rol: 'importeSoles', etiqueta: 'Importe S/.' },
  { rol: 'importeUsd', etiqueta: 'Importe $' },
  { rol: 'lote', etiqueta: 'Lote/VIN' },
  { rol: 'stockModelo', etiqueta: 'Stock: modelo' },
  { rol: 'stockColor', etiqueta: 'Stock: color' },
  { rol: 'stockInicial', etiqueta: 'Stock: inicial' },
];

export default function ConfiguracionVista() {
  const { cfg, editarCfg } = useApp();
  const mutar = (seccion: string, f: (c: Configuracion) => void) => void editarCfg(seccion, f);

  const texto = (valor: string, set: (v: string) => void, ancho = 340) => (
    <input value={valor} style={{ width: ancho }} onChange={(e) => set(e.target.value)} />
  );

  return (
    <div>
      <h2>Configuración</h2>
      <p className="difuso">
        Nada está hardcodeado: umbrales, fórmulas, regex, redondeo y mapeos de columna se editan acá y quedan en el
        historial.
      </p>

      <div className="panel">
        <h3>Cálculo y dinero</h3>
        <div className="fila" style={{ gap: 20 }}>
          <label>
            Moneda <input value={cfg.moneda} style={{ width: 80 }} onChange={(e) => mutar('moneda', (c) => { c.moneda = e.target.value; })} />
          </label>
          <label>
            Símbolo <input value={cfg.simboloMoneda} style={{ width: 60 }} onChange={(e) => mutar('moneda', (c) => { c.simboloMoneda = e.target.value; })} />
          </label>
          <label>
            IGV %{' '}
            <input
              value={cfg.igvPorcentaje}
              style={{ width: 80 }}
              onChange={(e) => mutar('igv', (c) => { c.igvPorcentaje = e.target.value; })}
            />
          </label>
          <label>
            Decimales{' '}
            <select
              value={cfg.redondeo.decimales}
              onChange={(e) => mutar('redondeo', (c) => { c.redondeo.decimales = Number(e.target.value); })}
            >
              <option value={0}>0</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label>
            Redondeo{' '}
            <select
              value={cfg.redondeo.metodo}
              onChange={(e) => mutar('redondeo', (c) => { c.redondeo.metodo = e.target.value as Configuracion['redondeo']['metodo']; })}
            >
              <option value="half-up">half-up (común)</option>
              <option value="half-even">half-even (bancario)</option>
            </select>
          </label>
        </div>
      </div>

      <div className="panel">
        <h3>Clasificación y seguridad</h3>
        <div className="fila" style={{ gap: 20 }}>
          <label>
            Umbral de confianza (0–1){' '}
            <input
              value={cfg.umbralConfianza}
              style={{ width: 80 }}
              onChange={(e) => mutar('umbral', (c) => { c.umbralConfianza = Number(e.target.value) || 0; })}
            />
          </label>
          <label>
            Margen de conflicto{' '}
            <input
              value={cfg.margenConflicto}
              style={{ width: 80 }}
              onChange={(e) => mutar('umbral', (c) => { c.margenConflicto = Number(e.target.value) || 0; })}
            />
          </label>
          <label>
            Duplicados{' '}
            <select
              value={cfg.duplicadosModo}
              onChange={(e) => mutar('duplicados', (c) => { c.duplicadosModo = e.target.value as 'avisar' | 'bloquear'; })}
            >
              <option value="avisar">avisar y excluir</option>
              <option value="bloquear">bloquear (error)</option>
            </select>
          </label>
          <label>
            Aviso de cuota (MB){' '}
            <input
              value={cfg.avisoCuotaMB}
              style={{ width: 80 }}
              onChange={(e) => mutar('avisoCuota', (c) => { c.avisoCuotaMB = Number(e.target.value) || 0; })}
            />
          </label>
        </div>
      </div>

      <div className="panel">
        <h3>Reglas de negocio</h3>
        <div className="fila" style={{ gap: 20, alignItems: 'flex-start' }}>
          <label style={{ display: 'block' }}>
            Descuento en glosa (regex) — grupo 1 o 2 = monto
            <br />
            {texto(cfg.regexDscto, (v) => mutar('regexDscto', (c) => { c.regexDscto = v; }), 520)}
          </label>
          <label style={{ display: 'block' }}>
            “SEPARACIÓN DE N” (regex) — grupo 1 = cantidad
            <br />
            {texto(cfg.regexSeparacion, (v) => mutar('regexSeparacion', (c) => { c.regexSeparacion = v; }), 300)}
          </label>
        </div>
        <div className="fila" style={{ gap: 20, marginTop: 10 }}>
          <label style={{ display: 'block' }}>
            Fórmula de stock (inicial, facturadas, reservas)
            <br />
            {texto(cfg.formulaStock, (v) => mutar('formulaStock', (c) => { c.formulaStock = v; }), 340)}
          </label>
          <label style={{ display: 'block' }}>
            Prioridad de fuentes (una por línea)
            <br />
            <textarea
              value={cfg.prioridadFuentes.join('\n')}
              rows={4}
              style={{ width: 260 }}
              onChange={(e) => mutar('prioridad', (c) => { c.prioridadFuentes = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); })}
            />
          </label>
          <label style={{ display: 'block' }}>
            Prioridad de columnas (una por línea)
            <br />
            <textarea
              value={cfg.prioridadColumnas.join('\n')}
              rows={4}
              style={{ width: 260 }}
              onChange={(e) => mutar('prioridad', (c) => { c.prioridadColumnas = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); })}
            />
          </label>
        </div>
      </div>

      <div className="panel">
        <h3>Mapeo de columnas por tipo de archivo</h3>
        {(['ventas', 'pedidos', 'stock'] as const).map((tipo) => (
          <details key={tipo} style={{ marginBottom: 8 }}>
            <summary>
              <strong>{tipo}</strong>
            </summary>
            <div className="fila" style={{ marginTop: 10 }}>
              {ROLES.map(({ rol, etiqueta }) => {
                const actual = cfg.mapeosPorTipo[tipo]?.[rol] ?? '';
                const columnas = Object.values(cfg.mapeosPorTipo)
                  .flatMap((m) => Object.values(m))
                  .filter((x): x is string => !!x);
                const unicas = [...new Set(columnas)];
                return (
                  <label key={rol} style={{ minWidth: 190 }}>
                    {etiqueta}{' '}
                    <select
                      value={actual}
                      onChange={(e) =>
                        mutar(`mapeos.${tipo}`, (c) => {
                          const m = { ...(c.mapeosPorTipo[tipo] ?? {}) } as MapeoColumnas;
                          if (e.target.value === '') delete m[rol];
                          else m[rol] = e.target.value;
                          c.mapeosPorTipo[tipo] = m;
                        })
                      }
                    >
                      <option value="">(ninguna)</option>
                      {unicas.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
