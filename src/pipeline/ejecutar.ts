// Ejecuta el cálculo en un worker cuando es posible; si no (file://, tests,
// navegador viejo), corre inline. La UI nunca nota la diferencia.

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

let enUso = false;

export async function ejecutarCalculo(ctx: ContextoCalculo, opts?: { forzarInline?: boolean }): Promise<{
  resultado: ModeloCalculado;
  viaWorker: boolean;
}> {
  if (!opts?.forzarInline && typeof Worker !== 'undefined') {
    const Ctor = await intentarWorker();
    if (Ctor) {
      try {
        const r = await ejecutarEnWorker(Ctor, ctx);
        return { resultado: r, viaWorker: true };
      } catch {
        // cae al inline
      }
    }
  }
  // microtask para no bloquear el hilo principal en el mismo frame
  await Promise.resolve();
  return { resultado: calcular(ctx), viaWorker: false };
}

function ejecutarEnWorker(Ctor: ConstructorWorker, ctx: ContextoCalculo): Promise<ModeloCalculado> {
  return new Promise((resolve, reject) => {
    if (enUso) {
      reject(new Error('worker ocupado'));
      return;
    }
    enUso = true;
    let w: Worker;
    try {
      w = new Ctor(new URL('../worker/procesar.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      enUso = false;
      reject(e);
      return;
    }
    const limpiar = () => {
      enUso = false;
      try {
        w.terminate();
      } catch {
        /* noop */
      }
    };
    const timer = setTimeout(() => {
      limpiar();
      reject(new Error('timeout del worker'));
    }, 30000);
    w.onmessage = (ev: MessageEvent<{ ok: boolean; resultado?: ModeloCalculado; error?: string }>) => {
      clearTimeout(timer);
      limpiar();
      if (ev.data?.ok && ev.data.resultado) resolve(ev.data.resultado);
      else reject(new Error(ev.data?.error ?? 'worker falló'));
    };
    w.onerror = (e) => {
      clearTimeout(timer);
      limpiar();
      reject(e instanceof ErrorEvent ? new Error(e.message || 'worker error') : new Error('worker error'));
    };
    try {
      w.postMessage(ctx);
    } catch (e) {
      clearTimeout(timer);
      limpiar();
      reject(e);
    }
  });
}
