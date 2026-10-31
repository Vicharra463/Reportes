import { useState } from 'react';
import { AppCtx, useProveedor } from './ui/uso';
import CargaDatos from './ui/vistas/CargaDatos';
import Dashboard from './ui/vistas/Dashboard';
import Proyectados from './ui/vistas/Proyectados';
import Stock from './ui/vistas/Stock';
import PorRevisar from './ui/vistas/PorRevisar';
import Catalogos from './ui/vistas/Catalogos';
import Historial from './ui/vistas/Historial';
import ConfiguracionVista from './ui/vistas/ConfiguracionVista';
import { Cargando } from './ui/componentes';

type Vista = 'dashboard' | 'proyectados' | 'carga' | 'stock' | 'revision' | 'catalogos' | 'historial' | 'config';

function Icono({ nombre }: { nombre: 'dashboard' | 'proyectados' | 'carga' | 'stock' | 'revision' | 'catalogos' | 'historial' | 'config' }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (nombre) {
    case 'dashboard':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...p}>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="5" rx="1.5" />
          <rect x="13" y="10" width="8" height="11" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
        </svg>
      );
    case 'proyectados':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...p}>
          <path d="M3 17.5 9 11l4 4 8-8.5" />
          <path d="M15 6h6v6" />
        </svg>
      );
    case 'carga':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...p}>
          <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      );
    case 'stock':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...p}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="M12 12 4 7.5M12 12l8-4.5M12 12v9" />
        </svg>
      );
    case 'revision':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...p}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5M8.5 11l1.8 1.8 3.2-3.6" />
        </svg>
      );
    case 'catalogos':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...p}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
          <path d="M9 7h7M9 11h5" />
        </svg>
      );
    case 'historial':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case 'config':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.27.62.89 1.02 1.57 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
        </svg>
      );
  }
}

const TITULOS: Record<Vista, string> = {
  dashboard: 'Dashboard',
  proyectados: 'Proyectados',
  carga: 'Cargar Excel',
  stock: 'Stock',
  revision: 'Por revisar',
  catalogos: 'Catálogos',
  historial: 'Historial',
  config: 'Configuración',
};

function Contenido() {
  const app = useProveedor();
  const [vista, setVista] = useState<Vista>('dashboard');
  const [irACarga, setIrACarga] = useState(false);

  if (!app.listo) {
    return (
      <div className="app-carga">
        <Cargando texto="Cargando datos locales…" />
      </div>
    );
  }

  const revisiones = app.modelo?.revision.length ?? 0;
  const errores = app.modelo?.errores.length ?? 0;
  const valido = app.modelo?.dashboard.valido ?? true;

  const tabs: { id: Vista; etiqueta: string; icono: Parameters<typeof Icono>[0]['nombre']; contador?: number }[] = [
    { id: 'dashboard', etiqueta: 'Dashboard', icono: 'dashboard' },
    { id: 'proyectados', etiqueta: 'Proyectados', icono: 'proyectados' },
    { id: 'carga', etiqueta: 'Cargar Excel', icono: 'carga' },
    { id: 'stock', etiqueta: 'Stock', icono: 'stock' },
    { id: 'revision', etiqueta: 'Por revisar', icono: 'revision', contador: revisiones + errores || undefined },
    { id: 'catalogos', etiqueta: 'Catálogos', icono: 'catalogos' },
    { id: 'historial', etiqueta: 'Historial', icono: 'historial' },
    { id: 'config', etiqueta: 'Configuración', icono: 'config' },
  ];

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <div className="marca-logo">TM</div>
          <div className="marca-texto">
            <strong>Top Motors</strong>
            <span>Reportes</span>
          </div>
        </div>

        <nav className="nav" aria-label="Secciones">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`nav-item ${vista === t.id ? 'activo' : ''}`}
              onClick={() => setVista(t.id)}
            >
              <Icono nombre={t.icono} />
              <span>{t.etiqueta}</span>
              {t.contador !== undefined && <span className="nav-contador">{t.contador}</span>}
            </button>
          ))}
        </nav>

        <div className="lateral-pie">
          {app.memoria && <span className="badge warn">Sin IndexedDB · datos en memoria</span>}
          {valido ? <span className="badge ok">Conciliación OK</span> : <span className="badge err">Conciliación con diferencias</span>}
        </div>
      </aside>

      <div className="principal">
        <header className="barra">
          <div>
            <h2 className="barra-titulo">{TITULOS[vista]}</h2>
            <div className="difuso barra-sub">
              Cobranza, stock y estimado — en el navegador, sin subir archivos a ningún servidor.
            </div>
          </div>
          <div className="fila">
            {app.calculando && <span className="badge info">Calculando…</span>}
            <button className="chico" onClick={() => void app.recalcular()} disabled={app.calculando} title="Volver a calcular todo con los datos vigentes">
              Recalcular
            </button>
          </div>
        </header>

        {app.error && <div className="banner err">{app.error}</div>}

        <main>
          {vista === 'dashboard' && (
            <Dashboard onIrACarga={() => { setVista('carga'); setIrACarga(true); }} />
          )}
          {vista === 'proyectados' && (
            <Proyectados onIrARevision={() => { setVista('carga'); setIrACarga(true); }} />
          )}
          {vista === 'carga' && (
            <CargaDatos arrancarEnPaso={irACarga} onCargado={() => { setVista('dashboard'); setIrACarga(false); }} />
          )}
          {vista === 'stock' && <Stock />}
          {vista === 'revision' && <PorRevisar />}
          {vista === 'catalogos' && <Catalogos />}
          {vista === 'historial' && <Historial />}
          {vista === 'config' && <ConfiguracionVista />}
        </main>

        <footer>Top Motors Reportes · SPA local (Vite + React) · los datos nunca salen de este dispositivo</footer>
      </div>
    </div>
  );
}

export default function App() {
  const app = useProveedor();
  return (
    <AppCtx.Provider value={app}>
      <Contenido />
    </AppCtx.Provider>
  );
}
