// Estado global de la aplicación (React context + hook). Centraliza carga,
// cálculo, importación con previsualización, correcciones aprendidas, stock,
// configuración con historial, reporte y backup. Todo pasa por aquí: los
// componentes no tocan la base ni el motor directamente.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ArchivoEnCola,
  CambioConfig,
  Lote,
  ReglaAprendizaje,
  Registro,
  ResumenDashboard,
  Simulacion,
  StockFila,
} from '../tipos';
import { configPorDefecto, cargarConfig, guardarConfig, type Configuracion } from '../dominio/configuracion';
import { calcular, type ModeloCalculado } from '../dominio/calcular';
import { construirTc, tasaPara, tasaVigente as vigente, type TcEstado } from '../dominio/tc';
import { crearReglaCorreccion } from '../dominio/reglas';
import { canonicoColor, canonicoModelo } from '../dominio/clasificar';
import { ejecutarCalculo } from '../pipeline/ejecutar';
import { confirmarImportacion, simularImportacion, type SimulacionConArchivos } from '../pipeline/importar';
import { prepararArchivo } from '../io/leerExcel';
import { descargarReporte, type DatosReporte } from '../io/reporte';
import { armarBackup, backupAJson, descargarJson, nombreBackupFecha, parsearBackup } from '../io/backup';
import * as db from '../db/almacen';
import * as alertas from './alertas';

export interface CorreccionInput {
  registro: Registro;
  tipo: 'modelo' | 'color';
  valor: string;
  soloEstaFila: boolean;
}

export interface AppApi {
  listo: boolean;
  memoria: boolean;
  cfg: Configuracion;
  lotes: Lote[];
  reglas: ReglaAprendizaje[];
  stock: StockFila[];
  cambios: CambioConfig[];
  modelo: ModeloCalculado | null;
  calculando: boolean;
  error: string | null;
  /** Estado del tipo de cambio USD→soles (manual + derivado de los datos). */
  tc: TcEstado;
  /** Tasa para una fecha concreta; null = sin tasa (no se inventa). */
  tasaDe: (fechaISO: string | null | undefined) => number | null;
  /** Tasa vigente (último día conocido o defecto) para agregados sin fecha. */
  tasaActual: () => number | null;
  // cola de carga
  agregarArchivos: (files: File[]) => Promise<void>;
  cola: ArchivoEnCola[];
  quitarDeCola: (id: string) => void;
  actualizarEnCola: (id: string, parche: Partial<ArchivoEnCola>) => void;
  simularCola: () => Promise<SimulacionConArchivos | null>;
  confirmarCola: (sim: SimulacionConArchivos) => Promise<number>;
  // operaciones
  aplicarCorreccion: (c: CorreccionInput) => Promise<void>;
  /** Aplica varias correcciones en bloque (una sola recarga final). Devuelve cuántas reglas se crearon. */
  aplicarCorrecciones: (cs: CorreccionInput[]) => Promise<number>;
  /** Guarda stock inicial y, opcionalmente, un override manual de facturadas (null = volver al cálculo del Excel). */
  guardarStockManual: (modelo: string, color: string, inicial: string, facturadasManual?: string | null) => Promise<void>;
  editarCfg: (seccion: string, mutar: (cfg: Configuracion) => void) => Promise<void>;
  revertirCambio: (cambio: CambioConfig) => Promise<void>;
  toggleRegla: (rg: ReglaAprendizaje, activa: boolean) => Promise<void>;
  eliminarRegla: (id: number) => Promise<void>;
  revertirLote: (loteId: number) => Promise<void>;
  generarReporteExcel: () => Promise<void>;
  exportarBackup: () => void;
  importarBackup: (file: File) => Promise<number>;
  /** Zona de peligro: borra base local + reglas + stock y restaura la config de fábrica. */
  restablecerTodo: () => Promise<void>;
  recalcular: () => Promise<void>;
}

const Ctx = createContext<AppApi | null>(null);

export function useProveedor(): AppApi {
  const [listo, setListo] = useState(false);
  const [cfg, setCfg] = useState<Configuracion>(configPorDefecto);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [reglas, setReglas] = useState<ReglaAprendizaje[]>([]);
  const [stock, setStock] = useState<StockFila[]>([]);
  const [cambios, setCambios] = useState<CambioConfig[]>([]);
  const [modelo, setModelo] = useState<ModeloCalculado | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cola, setCola] = useState<ArchivoEnCola[]>([]);

  // registros viven en ref (grandes, mutados por el motor en cada corrida)
  const registrosRef = useRef<Registro[]>([]);
  const cfgRef = useRef(cfg);
  const stockRef = useRef(stock);
  const reglasRef = useRef(reglas);
  cfgRef.current = cfg;
  stockRef.current = stock;
  reglasRef.current = reglas;

  // Evita corridas concurrentes: si llega un recálculo mientras otro corre,
  // se anota y se ejecuta UNO al terminar (coalescing) en vez de pisarse.
  const recalculandoRef = useRef(false);
  const recalculoPendienteRef = useRef(false);

  const recalcular = useCallback(async () => {
    if (recalculandoRef.current) {
      recalculoPendienteRef.current = true;
      return;
    }
    recalculandoRef.current = true;
    setCalculando(true);
    setError(null);
    try {
      const { resultado, viaWorker } = await ejecutarCalculo({
        registros: registrosRef.current,
        stock: stockRef.current,
        cfg: cfgRef.current,
        reglas: reglasRef.current,
      });
      void viaWorker;
      setModelo(resultado);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      recalculandoRef.current = false;
      setCalculando(false);
      if (recalculoPendienteRef.current) {
        recalculoPendienteRef.current = false;
        void recalcular();
      }
    }
  }, []);

  // Tipo de cambio: se reconstruye cuando cambia la config o los registros
  // (los registros cambian siempre junto con un recálculo).
  const tc = useMemo(() => construirTc(cfg, registrosRef.current), [cfg, modelo]);
  const tasaDe = useCallback((fechaISO: string | null | undefined) => tasaPara(tc, fechaISO), [tc]);
  const tasaActual = useCallback(() => vigente(tc), [tc]);

  // ------------------------------------------------------------------ init
  useEffect(() => {
    (async () => {
      await db.asegurarAlmacen();
      const c = cargarConfig();
      const [ls, rs, rgs, sts, cms] = await Promise.all([
        db.cargarLotes(),
        db.cargarRegistros(),
        db.cargarReglas(),
        db.cargarStock(),
        db.cargarCambios(),
      ]);
      setCfg(c);
      setLotes(ls);
      setReglas(rgs);
      setStock(sts);
      setCambios(cms.sort((a, b) => (b.fechaISO > a.fechaISO ? 1 : -1)));
      registrosRef.current = rs;
      setListo(true);
    })();
  }, []);

  useEffect(() => {
    if (listo) void recalcular();
  }, [listo, recalcular]);

  // ------------------------------------------------------------------ cola
  const agregarArchivos = useCallback(async (files: File[]) => {
    const nuevas: ArchivoEnCola[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const a = await prepararArchivo(f, `a_${Date.now()}_${i}`);
        nuevas.push(a);
      } catch (e) {
        setError(`No se pudo leer ${f.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    setCola((prev) => [...prev, ...nuevas]);
  }, []);

  const quitarDeCola = useCallback((id: string) => {
    setCola((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const actualizarEnCola = useCallback((id: string, parche: Partial<ArchivoEnCola>) => {
    setCola((prev) => prev.map((a) => (a.id === id ? { ...a, ...parche } : a)));
  }, []);

  const simularCola = useCallback(async (): Promise<SimulacionConArchivos | null> => {
    if (!cola.length) return null;
    setCalculando(true);
    setError(null);
    alertas.cargando('Previsualizando la importación…', 'Se calcula todo sin guardar nada.');
    try {
      const sim = await simularImportacion({
        cola,
        cfg: cfgRef.current,
        reglas: reglasRef.current,
        registrosExistentes: registrosRef.current,
        stock: stockRef.current,
        lotesExistentes: lotes,
      });
      return sim;
    } catch (e) {
      const msg = alertas.mensajeError(e);
      setError(msg);
      alertas.fallo('No se pudo previsualizar', msg);
      return null;
    } finally {
      alertas.cerrarCargando();
      setCalculando(false);
    }
  }, [cola, lotes]);

  const recargarTodo = useCallback(async () => {
    const [ls, rs, rgs, sts, cms] = await Promise.all([
      db.cargarLotes(),
      db.cargarRegistros(),
      db.cargarReglas(),
      db.cargarStock(),
      db.cargarCambios(),
    ]);
    setLotes(ls);
    setReglas(rgs);
    setStock(sts);
    setCambios([...cms].sort((a, b) => (b.fechaISO > a.fechaISO ? 1 : -1)));
    registrosRef.current = rs;
    await recalcular();
  }, [recalcular]);

  const confirmarCola = useCallback(
    async (sim: SimulacionConArchivos): Promise<number> => {
      setCalculando(true);
      setError(null);
      alertas.cargando('Importando los archivos…', 'Escribiendo en la base local.');
      try {
        const ahoraISO = new Date().toISOString();
        const res = await confirmarImportacion({
          cola: cola.filter((a) => !sim.simulaciones.find((s) => s.archivo === a.nombre)?.hashRepetido),
          registros: sim.registrosNuevos,
          lotesExistentes: lotes,
          ahoraISO,
          cfg: cfgRef.current,
          guardarLote: (l) => db.guardarLote(l),
          guardarRegistros: (loteId, rs) => db.reemplazarRegistrosDeLote(loteId, rs),
          upsertStock: (f) => db.upsertStock(f),
        });
        setCola([]);
        await recargarTodo();
        alertas.exito('Importación confirmada', `${res.registrosGuardados} registros guardados. Todo recalculado.`);
        return res.registrosGuardados;
      } catch (e) {
        const msg = alertas.mensajeError(e);
        setError(msg);
        alertas.fallo('La importación falló', msg);
        return 0;
      } finally {
        alertas.cerrarCargando();
        setCalculando(false);
      }
    },
    [cola, lotes, recargarTodo],
  );

  // ------------------------------------------------------------ operaciones
  const aplicarCorreccion = useCallback(
    async (c: CorreccionInput) => {
      const textoBase =
        c.tipo === 'modelo'
          ? c.registro.sku || c.registro.descripcion
          : c.registro.descripcion || c.registro.sku;
      if (!textoBase) {
        alertas.fallo('No se puede aprender de esta fila', 'La fila no tiene SKU ni descripción: la corrección necesita un texto de búsqueda.');
        return;
      }
      const columnaOrigen =
        c.tipo === 'modelo' ? (c.registro.clasifModelo?.columna ?? null) : (c.registro.clasifColor?.columna ?? null);
      const rg = crearReglaCorreccion({
        tipo: c.tipo,
        textoFuente: textoBase,
        columna: c.soloEstaFila ? columnaOrigen : null,
        valor: c.valor,
        notas: c.soloEstaFila ? 'corrección limitada a la columna de origen' : 'corrección global del usuario',
      });
      await db.agregarRegla(rg);
      await recargarTodo();
      alertas.toast(`Corrección aprendida: ${c.tipo} → ${c.valor}`);
    },
    [recargarTodo],
  );

  const aplicarCorrecciones = useCallback(
    async (cs: CorreccionInput[]): Promise<number> => {
      if (!cs.length) return 0;
      let creadas = 0;
      for (const c of cs) {
        const textoBase =
          c.tipo === 'modelo'
            ? c.registro.sku || c.registro.descripcion
            : c.registro.descripcion || c.registro.sku;
        if (!textoBase) continue; // sin texto no hay regla que aplicar
        const rg = crearReglaCorreccion({
          tipo: c.tipo,
          textoFuente: textoBase,
          columna: null,
          valor: c.valor,
          notas: 'sugerencia segura del panel de errores',
        });
        await db.agregarRegla(rg);
        creadas++;
      }
      await recargarTodo();
      return creadas;
    },
    [recargarTodo],
  );

  const guardarStockManual = useCallback(
    async (modeloN: string, colorN: string, inicial: string, facturadasManual?: string | null) => {
      const fila: import('../tipos').StockFila = {
        modelo: canonicoModelo(cfgRef.current, modeloN),
        color: canonicoColor(cfgRef.current, colorN || 'Sin color'),
        inicial,
        fechaISO: new Date().toISOString(),
        origen: 'manual',
      };
      // undefined = no cambiar el override vigente; null = volver al cálculo del Excel
      if (facturadasManual !== undefined) fila.facturadasManual = facturadasManual;
      await db.upsertStock(fila);
      const sts = await db.cargarStock();
      setStock(sts);
      stockRef.current = sts;
      await recalcular();
      alertas.toast('Stock guardado y recalculado');
    },
    [recalcular],
  );

  const editarCfg = useCallback(
    async (seccion: string, mutar: (c: Configuracion) => void) => {
      const antes = JSON.stringify(cfgRef.current);
      const nueva = JSON.parse(antes) as Configuracion;
      mutar(nueva);
      setCfg(nueva);
      guardarConfig(nueva);
      const despues = JSON.stringify(nueva);
      const cambio: CambioConfig = {
        seccion,
        clave: 'config',
        antes,
        despues,
        fechaISO: new Date().toISOString(),
        revertido: false,
      };
      await db.guardarCambio(cambio);
      const cms = await db.cargarCambios();
      setCambios([...cms].sort((a, b) => (b.fechaISO > a.fechaISO ? 1 : -1)));
      stockRef.current = stockRef.current;
      await recalcular();
      alertas.toast('Configuración guardada y recalculado');
    },
    [recalcular],
  );

  const revertirCambio = useCallback(
    async (cambio: CambioConfig) => {
      const ok = await alertas.confirmar({
        titulo: '¿Deshacer este cambio?',
        texto: `Se restaura el valor anterior de "${cambio.clave}" (${cambio.seccion}).`,
        confirmarTexto: 'Sí, deshacer',
      });
      if (!ok) return;
      try {
        const obj = JSON.parse(cambio.antes) as Configuracion;
        setCfg(obj);
        guardarConfig(obj);
        await db.actualizarCambio({ ...cambio, revertido: true });
        const cms = await db.cargarCambios();
        setCambios([...cms].sort((a, b) => (b.fechaISO > a.fechaISO ? 1 : -1)));
        await recalcular();
        alertas.toast('Cambio deshecho');
      } catch {
        setError('No se pudo revertir el cambio.');
        alertas.fallo('No se pudo revertir', 'El cambio guardado no es válido para restaurar.');
      }
    },
    [recalcular],
  );

  const toggleRegla = useCallback(
    async (rg: ReglaAprendizaje, activa: boolean) => {
      await db.actualizarRegla({ ...rg, activa });
      const rgs = await db.cargarReglas();
      setReglas(rgs);
      reglasRef.current = rgs;
      await recalcular();
      alertas.toast(activa ? 'Regla activada' : 'Regla desactivada', 'info');
    },
    [recalcular],
  );

  const eliminarRegla = useCallback(
    async (id: number) => {
      const ok = await alertas.confirmar({
        titulo: '¿Eliminar la regla?',
        texto: 'La clasificación aprendida se borra y puede volver a fallar en cargas futuras.',
        confirmarTexto: 'Sí, eliminar',
        peligro: true,
      });
      if (!ok) return;
      await db.eliminarRegla(id);
      const rgs = await db.cargarReglas();
      setReglas(rgs);
      reglasRef.current = rgs;
      await recalcular();
      alertas.toast('Regla eliminada');
    },
    [recalcular],
  );

  const revertirLote = useCallback(
    async (loteId: number) => {
      const l = lotes.find((x) => x.id === loteId);
      if (!l) return;
      const ok = await alertas.confirmar({
        titulo: `¿Revertir el lote "${l.archivo}"?`,
        texto: `Se borran sus ${l.filasImportadas} filas de la base y todo se recalcula. Esta acción queda registrada en el historial.`,
        confirmarTexto: 'Sí, revertir',
        peligro: true,
      });
      if (!ok) return;
      alertas.cargando('Revirtiendo el lote…');
      try {
        await db.actualizarLote({ ...l, estado: 'revertido' });
        await db.revertirLote(loteId);
        await recargarTodo();
        alertas.exito('Lote revertido', `${l.filasImportadas} filas eliminadas.`);
      } catch (e) {
        alertas.fallo('No se pudo revertir', alertas.mensajeError(e));
      } finally {
        alertas.cerrarCargando();
      }
    },
    [lotes, recargarTodo],
  );

  const generarReporteExcel = useCallback(async () => {
    if (!modelo) return;
    alertas.cargando('Generando el reporte Excel…', 'Armando hojas, fórmulas y gráfico.');
    try {
      const datos: DatosReporte = {
        dashboard: modelo.dashboard,
        reservas: modelo.reservas,
        facturaciones: modelo.facturaciones,
        stockFilas: modelo.stockFilas,
        cambios,
        reglas,
        cfg: cfgRef.current,
        tc,
        generadoISO: new Date().toISOString(),
      };
      await descargarReporte(datos);
      alertas.toast('Reporte Excel descargado');
    } catch (e) {
      alertas.fallo('No se pudo generar el reporte', alertas.mensajeError(e));
    } finally {
      alertas.cerrarCargando();
    }
  }, [modelo, cambios, reglas, tc]);

  const exportarBackup = useCallback(() => {
    const b = armarBackup({
      lotes,
      registros: registrosRef.current,
      reglas,
      cambiosConfig: cambios,
      stock,
      config: cfgRef.current,
      ahoraISO: new Date().toISOString(),
    });
    descargarJson(nombreBackupFecha(b.generadoISO), backupAJson(b));
    alertas.toast('Backup JSON descargado');
  }, [lotes, reglas, cambios, stock]);

  const importarBackup = useCallback(
    async (file: File): Promise<number> => {
      alertas.cargando('Importando el backup…', file.name);
      try {
        const txt = await file.text();
        const b = parsearBackup(txt);
        for (const l of b.lotes) await db.guardarLote(l);
        for (const r of b.registros) await db.guardarRegistros([r]);
        await db.guardarReglas(b.reglas);
        await db.guardarStock(b.stock);
        for (const c of b.cambiosConfig) await db.guardarCambio(c);
        setCfg(b.config);
        guardarConfig(b.config);
        await recargarTodo();
        alertas.exito('Backup importado', `${b.registros.length} registros restaurados.`);
        return b.registros.length;
      } catch (e) {
        const msg = alertas.mensajeError(e);
        setError(msg);
        alertas.fallo('El backup no es válido', msg);
        return 0;
      } finally {
        alertas.cerrarCargando();
      }
    },
    [recargarTodo],
  );

  /** Zona de peligro: borra TODA la base local (lotes, registros, reglas,
   * stock, historial) y restaura la configuración de fábrica. Sirve para
   * salir de un estado corrompido (una regla demasiado amplia, una config
   * vieja) y empezar de cero con una importación limpia. */
  const restablecerTodo = useCallback(async () => {
    alertas.cargando('Restableciendo…', 'Borrando base local y configuración.');
    try {
      await db.vaciarTodo();
      const def = configPorDefecto();
      guardarConfig(def);
      setCfg(def);
      setLotes([]);
      setReglas([]);
      setStock([]);
      setCambios([]);
      setCola([]);
      registrosRef.current = [];
      setModelo(null);
      await recalcular();
      alertas.exito('Todo restablecido', 'Base y configuración en valores de fábrica. Volvé a importar tus Excel.');
    } catch (e) {
      alertas.fallo('No se pudo restablecer', alertas.mensajeError(e));
    } finally {
      alertas.cerrarCargando();
    }
  }, [recalcular]);

  return useMemo<AppApi>(
    () => ({
      listo,
      memoria: db.esMemoria(),
      cfg,
      lotes,
      reglas,
      stock,
      cambios,
      modelo,
      calculando,
      error,
      tc,
      tasaDe,
      tasaActual,
      cola,
      agregarArchivos,
      quitarDeCola,
      actualizarEnCola,
      simularCola,
      confirmarCola,
      aplicarCorreccion,
      aplicarCorrecciones,
      guardarStockManual,
      editarCfg,
      revertirCambio,
      toggleRegla,
      eliminarRegla,
      revertirLote,
      generarReporteExcel,
      exportarBackup,
      importarBackup,
      restablecerTodo,
      recalcular,
    }),
    [
      listo,
      cfg,
      lotes,
      reglas,
      stock,
      cambios,
      modelo,
      calculando,
      error,
      tc,
      tasaDe,
      tasaActual,
      cola,
      agregarArchivos,
      quitarDeCola,
      actualizarEnCola,
      simularCola,
      confirmarCola,
      aplicarCorreccion,
      aplicarCorrecciones,
      guardarStockManual,
      editarCfg,
      revertirCambio,
      toggleRegla,
      eliminarRegla,
      revertirLote,
      generarReporteExcel,
      exportarBackup,
      importarBackup,
      restablecerTodo,
      recalcular,
    ],
  );
}

export function useApp(): AppApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp fuera del proveedor');
  return ctx;
}

export { Ctx as AppCtx };

export type { ResumenDashboard, Simulacion };
