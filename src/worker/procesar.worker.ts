// Worker de cálculo: recibe { ...ContextoCalculo, id } y devuelve el
// ModeloCalculado con el mismo id. El worker es persistente (se reutiliza);
// el fallback inline está en pipeline/ejecutar.ts.

import { calcular } from '../dominio/calcular';
import type { ContextoCalculo } from '../dominio/calcular';

self.onmessage = (ev: MessageEvent<ContextoCalculo & { id: number }>) => {
  const { id, ...ctx } = ev.data;
  try {
    const resultado = calcular(ctx);
    (self as unknown as Worker).postMessage({ id, ok: true, resultado });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
