// Componentes compartidos de la UI.

export function Cargando({ texto }: { texto?: string }) {
  return (
    <div className="cargando" role="status" aria-live="polite">
      <div className="cargando-aro" />
      <span>{texto ?? 'Calculando…'}</span>
    </div>
  );
}
