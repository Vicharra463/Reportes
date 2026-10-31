// Ejecuta el cálculo en un worker persistente (se crea UNA vez y se reutiliza;
// un worker inline nuevo por cálculo costaba cientos de ms de compilación).
// Si el worker muere o no está disponible (file://, tests), corre inline.
// Las peticiones llevan id: se pueden hacer concurrentes sin confundir respuestas.

import { calcular, type ContextoCalculo, type ModeloCalculado } from '../dominio/calcular';

type ConstructorWorker = new (url: URL | string, opts?: WorkerOptions) => Worker;

let workerMod: { default: ConstructorWorker } | null = null;
let workerCargado = false;

async function intentarWorker(): Promise<ConstructorWorker | null> {
  if (workerCargado) return workerMod?.default ?? null;
  workerCargado = true;
  try {
    const mod = await import('../worker/procesar.worker?worker&inline');
    workerMod = mod as unknown as { default: ConstructorWorker };
    return workerMod.default;
  } catch {
    workerMod = null;
    return null;
  }
}

interface Pendiente {
  resolve: (r: ModeloCalculado) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let workerVivo: Worker | null = null;
let seq = 0;
const pendientes = new Map<number, Pendiente>();

function descartarWorker(w: Worker, motivo: string): void {
  if (workerVivo === w) workerVivo = null;
  try {
    w.terminate();
  } catch {
    /* noop */
  }
  for (const [, p] of pendientes) {
    clearTimeout(p.timer);
    p.reject(new Error(motivo));
  }
  pendientes.clear();
}

function obtenerWorker(Ctor: ConstructorWorker): Worker {
  if (workerVivo) return workerVivo;
  const w = new Ctor(new URL('../worker/procesar.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; resultado?: ModeloCalculado; error?: string }>) => {
    const p = pendientes.get(ev.data?.id);
    if (!p) return;
    pendientes.delete(ev.data.id);
    clearTimeout(p.timer);
    if (ev.data.ok && ev.data.resultado) p.resolve(ev.data.resultado);
    else p.reject(new Error(ev.data.error ?? 'worker falló'));
  };
  w.onerror = () => descartarWorker(w, 'worker error');
  w.onmessageerror = () => descartarWorker(w, 'worker: mensaje ilegible');
  workerVivo = w;
  return w;
}

export async function ejecutarCalculo(
  ctx: ContextoCalculo,
  opts?: { forzarInline?: boolean },
): Promise<{ resultado: ModeloCalculado; viaWorker: boolean }> {
  if (!opts?.forzarInline && typeof Worker !== 'undefined') {
    const Ctor = await intentarWorker();
    if (Ctor) {
      try {
        return { resultado: await ejecutarEnWorker(Ctor, ctx), viaWorker: true };
      } catch {
        // worker roto o timeout: cae al inline una vez
      }
    }
  }
  // microtask para no bloquear el hilo principal en el mismo frame
  await Promise.resolve();
  return { resultado: calcular(ctx), viaWorker: false };
}

function ejecutarEnWorker(Ctor: ConstructorWorker, ctx: ContextoCalculo): Promise<ModeloCalculado> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = obtenerWorker(Ctor);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const id = ++seq;
    const timer = setTimeout(() => {
      pendientes.delete(id);
      // si se colgó, lo descartamos y el siguiente vuelve a intentar
      descartarWorker(w, 'timeout del worker');
      reject(new Error('timeout del worker'));
    }, 30000);
    pendientes.set(id, { resolve, reject, timer });
    try {
      w.postMessage({ ...ctx, id });
    } catch (e) {
      pendientes.delete(id);
      clearTimeout(timer);
      descartarWorker(w, 'worker no aceptó el mensaje');
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
