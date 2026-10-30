# Top Motors · Reportes (SPA 100% navegador)

Reemplazo del dashboard Python: carga de Excel con previsualización obligatoria,
clasificación inteligente de modelo/color con aprendizaje por correcciones,
stock dinámico, dashboard de cobranza y estimado de ganancia, reporte Excel y
conciliación. **Los archivos nunca salen de tu dispositivo.**

## Arrancar

```bash
npm install
npm run dev        # → http://localhost:5173
```

También funciona abriendo `dist/index.html` directamente (build autocontenido,
sin servidor). Para regenerarlo:

```bash
npm run build      # genera dist/index.html
```

## Comandos

| Comando             | Qué hace                              |
| ------------------- | ------------------------------------- |
| `npm run dev`       | servidor de desarrollo con hot reload |
| `npm test`          | suite Vitest (38 tests, incluye los archivos reales de `../datos/`) |
| `npm run typecheck` | TypeScript estricto sin emitir       |
| `npm run build`     | bundle único autocontenido            |

## Flujo de uso

1. **Cargar Excel** → soltás ventas (y pedidos, para colores/vendedores; y stock,
   si tenés). Revisás la detección de hoja/encabezados y el mapeo de columnas.
2. **Previsualizar** → se calcula TODO (reservas, facturaciones, stock,
   conciliación) **sin guardar nada**. Si no cuadra, no confirmás.
3. **Confirmar** → recién ahí se persiste en IndexedDB.
4. **Dashboard** → KPIs, controles de conciliación y detalle por modelo/color.
   Botón “Descargar reporte Excel” (6 hojas con fórmulas vivas y gráfico).
5. **Por revisar** → filas sin confianza suficiente: asignás modelo/color y la
   corrección queda aprendida como regla (aplica en cargas futuras).
6. **Stock** → inicial editable a mano o por Excel; saldo proyectado con fórmula
   configurable (por defecto `inicial - facturadas - reservas`).
7. **Catálogos / Historial / Configuración** → todo editable, con historial de
   cambios y opción de deshacer; lotes importados se pueden revertir.

## Reglas de negocio clave

- **Nunca se adivina**: si la confianza < umbral (0.75), la fila va a “Por revisar”.
- **Conciliación obligatoria**: `valor neto + exceso = cobrado + saldo`, grupos =
  totales, cobrado/facturación = datos fuente, stock = fórmula. El reporte no se
  considera “válido” si algún control tiene diferencia.
- **Anulaciones**: NC/ND que referencia un BV/FT del archivo por importe ~0 anula
  ambos; montos distintos quedan como “NC parcial” para revisar.
- **Duplicados**: primera aparición de `Documento|SKU|Lote|USD` gana; el resto se
  excluye de los totales (avisado).
- **Dinero**: decimal.js con redondeo configurable — nunca aritmética de float.

## Stack

Vite · React 18 · TypeScript · SheetJS (lectura) · ExcelJS (reporte) ·
decimal.js · Fuse.js · Chart.js · Dexie/IndexedDB · Vitest · Web Worker con
fallback inline.
