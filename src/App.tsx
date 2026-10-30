import { useState } from 'react';
import { AppCtx, useProveedor } from './ui/uso';
import CargaDatos from './ui/vistas/CargaDatos';
import Dashboard from './ui/vistas/Dashboard';
import Stock from './ui/vistas/Stock';
import PorRevisar from './ui/vistas/PorRevisar';
import Catalogos from './ui/vistas/Catalogos';
import Historial from './ui/vistas/Historial';
import ConfiguracionVista from './ui/vistas/ConfiguracionVista';

type Vista = 'dashboard' | 'carga' | 'stock' | 'revision' | 'catalogos' | 'historial' | 'config';

function Contenido() {
  const app = useProveedor();
  const [vista, setVista] = useState<Vista>('dashboard');
  const [irACarga, setIrACarga] = useState(false);

  if (!app.listo) {
    return (
      <div className="panel" style={{ margin: 40 }}>
        Cargando datos locales…
      </div>
    );
  }

  const tabs: { id: Vista; etiqueta: string }[] = [
    { id: 'dashboard', etiqueta: 'Dashboard' },
    { id: 'carga', etiqueta: 'Cargar Excel' },
    { id: 'stock', etiqueta: 'Stock' },
    { id: 'revision', etiqueta: `Por revisar${app.modelo?.revision.length ? ` (${app.modelo.revision.length})` : ''}` },
    { id: 'catalogos', etiqueta: 'Catálogos' },
    { id: 'historial', etiqueta: 'Historial' },
    { id: 'config', etiqueta: 'Configuración' },
  ];

  const revisiones = app.modelo?.revision.length ?? 0;
  const errores = app.modelo?.errores.length ?? 0;
  const valido = app.modelo?.dashboard.valido ?? true;

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: '18px 16px' }}>
      <header className="fila" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1>Top Motors · Reportes</h1>
          <div className="difuso">
            Cobranza, stock y estimado de ganancia — todo en el navegador, sin subir archivos a ningún servidor.
          </div>
        </div>
        <div className="fila">
          {app.memoria && <span className="badge warn">Sin IndexedDB · datos en memoria</span>}
          {!valido && <span className="badge err">Conciliación con diferencias</span>}
          {valido && <span className="badge ok">Conciliación OK</span>}
          {app.calculando && <span className="badge info">Calculando…</span>}
        </div>
      </header>

      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={vista === t.id ? 'activo' : ''} onClick={() => setVista(t.id)}>
            {t.etiqueta}
          </button>
        ))}
      </nav>

      {app.error && <div className="banner err">{app.error}</div>}
      {(revisiones > 0 || errores > 0) && vista === 'dashboard' && (
        <div className="banner warn">
          Hay {revisiones} fila(s) en revisión y {errores} en error. El reporte no está “válido” hasta conciliar.{' '}
          <button className="chico" onClick={() => setVista('revision')}>
            Revisar ahora
          </button>
        </div>
      )}
      {!valido && vista === 'dashboard' && app.modelo && (
        <div className="banner err">
          Conciliación: {app.modelo.dashboard.conciliacion.filter((c) => !c.ok).map((c) => c.nombre).join(' · ')}
        </div>
      )}

      {vista === 'dashboard' && <Dashboard onIrACarga={() => { setVista('carga'); setIrACarga(true); }} />}
      {vista === 'carga' && <CargaDatos arrancarEnPaso={irACarga} onCargado={() => { setVista('dashboard'); setIrACarga(false); }} />}
      {vista === 'stock' && <Stock />}
      {vista === 'revision' && <PorRevisar />}
      {vista === 'catalogos' && <Catalogos />}
      {vista === 'historial' && <Historial />}
      {vista === 'config' && <ConfiguracionVista />}
    </div>
  );
}

export default function App() {
  const app = useProveedor();
  return (
    <AppCtx.Provider value={app}>
      <Contenido />
      <footer>
        Top Motors Reportes · SPA local (Vite + React) · los datos nunca salen de este dispositivo
      </footer>
    </AppCtx.Provider>
  );
}
