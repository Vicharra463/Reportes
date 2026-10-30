// Componentes compartidos de la UI.

import { useState } from 'react';

export function Cargando({ texto }: { texto?: string }) {
  return (
    <div className="cargando" role="status" aria-live="polite">
      <div className="cargando-aro" />
      <span>{texto ?? 'Calculando…'}</span>
    </div>
  );
}

export function Kpi(props: { etiqueta: string; valor: string; tono?: 'verde' | 'ambar' | 'rojo'; ayuda?: string }) {
  return (
    <div className={`kpi ${props.tono ?? ''}`} title={props.ayuda}>
      <div className="etiqueta">{props.etiqueta}</div>
      <div className="valor">{props.valor}</div>
    </div>
  );
}

export function Seccion(props: { titulo: string; descripcion?: string; abierta?: boolean; children: React.ReactNode }) {
  const [abierta, setAbierta] = useState(props.abierta ?? true);
  return (
    <div className="panel">
      <div
        className="fila"
        style={{ justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setAbierta(!abierta)}
      >
        <h3 style={{ margin: 0 }}>
          {props.titulo} <span className="mini">{abierta ? '▾' : '▸'}</span>
        </h3>
        {props.descripcion && <span className="difuso">{props.descripcion}</span>}
      </div>
      {abierta && <div style={{ marginTop: 12 }}>{props.children}</div>}
    </div>
  );
}
