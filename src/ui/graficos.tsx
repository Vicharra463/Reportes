// Gráficos compartidos (Chart.js + react-chartjs-2) con tema oscuro a medida.

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Title);

// Defaults del tema oscuro
ChartJS.defaults.color = '#a8a3c9';
ChartJS.defaults.borderColor = '#2c2850';
ChartJS.defaults.font.family = "'Poppins', 'Segoe UI', sans-serif";

const PALETA = ['#7c5cff', '#22c55e', '#e0a800', '#ff8a80', '#4dc9f6', '#f67019', '#b9a5ff', '#2c2850'];

export interface SerieBarras {
  nombre: string;
  datos: number[];
  color: string;
}

export function GraficoBarras(props: {
  titulo: string;
  explicacion?: string;
  etiquetas: string[];
  series: SerieBarras[];
  apilado?: boolean;
  moneda?: boolean;
  alto?: number;
}) {
  return (
    <div className="panel grafico-panel">
      <h3>{props.titulo}</h3>
      {props.explicacion && <p className="explicacion">{props.explicacion}</p>}
      <div style={{ height: props.alto ?? 280 }}>
        <Bar
          data={{
            labels: props.etiquetas,
            datasets: props.series.map((s) => ({
              label: s.nombre,
              data: s.datos,
              backgroundColor: s.color,
              borderRadius: 4,
            })),
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
              x: { stacked: props.apilado ?? false, grid: { display: false } },
              y: {
                stacked: props.apilado ?? false,
                beginAtZero: true,
                ticks: props.moneda
                  ? { callback: (v) => `${'$'}${Number(v).toLocaleString('es-PE')}` }
                  : undefined,
              },
            },
            plugins: {
              legend: { position: 'bottom' as const },
              tooltip: {
                callbacks: props.moneda
                  ? { label: (ctx) => `${ctx.dataset.label}: $${Number(ctx.parsed.y).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` }
                  : undefined,
              },
            },
          }}
        />
      </div>
    </div>
  );
}

export function GraficoAnillo(props: {
  titulo: string;
  explicacion?: string;
  etiquetas: string[];
  datos: number[];
  moneda?: boolean;
  alto?: number;
}) {
  const colores = PALETA.slice(0, Math.max(props.datos.length, 1));
  const total = props.datos.reduce((a, b) => a + b, 0);
  return (
    <div className="panel grafico-panel">
      <h3>{props.titulo}</h3>
      {props.explicacion && <p className="explicacion">{props.explicacion}</p>}
      <div style={{ height: props.alto ?? 280, position: 'relative' }}>
        <Doughnut
          data={{
            labels: props.etiquetas,
            datasets: [
              {
                data: props.datos,
                backgroundColor: colores,
                borderColor: '#16132b',
                borderWidth: 2,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            cutout: '58%',
            plugins: {
              legend: { position: 'bottom' as const },
              tooltip: {
                callbacks: props.moneda
                  ? { label: (ctx) => `${ctx.label}: $${Number(ctx.parsed).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` }
                  : undefined,
              },
            },
          }}
        />
        {total > 0 && (
          <div className="anillo-centro" aria-hidden>
            <span className="anillo-total">
              {props.moneda ? `$${Math.round(total).toLocaleString('es-PE')}` : total.toLocaleString('es-PE')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
