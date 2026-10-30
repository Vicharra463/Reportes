// Worker de cálculo: recibe el contexto y devuelve el ModeloCalculado.
// El bundle lo inyecta Vite; el fallback inline está en pipeline/ejecutar.ts.

import { calcular } from '../dominio/calcular';
import type { ContextoCalculo } from '../dominio/calcular';

self.onmessage = (ev: MessageEvent<ContextoCalculo>) => {
  try {
    const resultado = calcular(ev.data);
    (self as unknown as Worker).postMessage({ ok: true, resultado });
  } catch (e) {
    (self as unknown as Worker).postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
