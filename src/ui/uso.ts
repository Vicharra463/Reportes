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
import { crearReglaCorreccion } from '../dominio/reglas';
import { canonicoColor, canonicoModelo } from '../dominio/clasificar';
import { ejecutarCalculo } from '../pipeline/ejecutar';
import { confirmarImportacion, simularImportacion, type SimulacionConArchivos } from '../pipeline/importar';
import { prepararArchivo } from '../io/leerExcel';
import { descargarReporte, type DatosReporte } from '../io/reporte';
import { armarBackup, backupAJson, descargarJson, nombreBackupFecha, parsearBackup } from '../io/backup';
import * as db from '../db/almacen';

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
  // cola de carga
  agregarArchivos: (files: File[]) => Promise<void>;
  cola: ArchivoEnCola[];
  quitarDeCola: (id: string) => void;
  actualizarEnCola: (id: string, parche: Partial<ArchivoEnCola>) => void;
  simularCola: () => Promise<SimulacionConArchivos | null>;
  confirmarCola: (sim: SimulacionConArchivos) => Promise<number>;
  // operaciones
  aplicarCorreccion: (c: CorreccionInput) => Promise<void>;
  guardarStockManual: (modelo: string, color: string, inicial: string) => Promise<void>;
  editarCfg: (seccion: string, mutar: (cfg: Configuracion) => void) => Promise<void>;
  revertirCambio: (cambio: CambioConfig) => Promise<void>;
  toggleRegla: (rg: ReglaAprendizaje, activa: boolean) => Promise<void>;
  eliminarRegla: (id: number) => Promise<void>;
  revertirLote: (loteId: number) => Promise<void>;
  generarReporteExcel: () => Promise<void>;
  exportarBackup: () => void;
  importarBackup: (file: File) => Promise<number>;
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

  const recalcular = useCallback(async () => {
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
      setCalculando(false);
    }
  }, []);

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
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
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
        return res.registrosGuardados;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return 0;
      } finally {
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
          ? c.registro.sku ?? c.registro.descripcion ?? String(c.registro.fila)
          : c.registro.descripcion ?? c.registro.sku ?? String(c.registro.fila);
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
    },
    [recargarTodo],
  );

  const guardarStockManual = useCallback(
    async (modeloN: string, colorN: string, inicial: string) => {
      await db.upsertStock({
        modelo: canonicoModelo(cfgRef.current, modeloN),
        color: canonicoColor(cfgRef.current, colorN || 'Sin color'),
        inicial,
        fechaISO: new Date().toISOString(),
        origen: 'manual',
      });
      const sts = await db.cargarStock();
      setStock(sts);
      stockRef.current = sts;
      await recalcular();
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
    },
    [recalcular],
  );

  const revertirCambio = useCallback(
    async (cambio: CambioConfig) => {
      try {
        const obj = JSON.parse(cambio.antes) as Configuracion;
        setCfg(obj);
        guardarConfig(obj);
        await db.actualizarCambio({ ...cambio, revertido: true });
        const cms = await db.cargarCambios();
        setCambios([...cms].sort((a, b) => (b.fechaISO > a.fechaISO ? 1 : -1)));
        await recalcular();
      } catch {
        setError('No se pudo revertir el cambio.');
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
    },
    [recalcular],
  );

  const eliminarRegla = useCallback(
    async (id: number) => {
      await db.eliminarRegla(id);
      const rgs = await db.cargarReglas();
      setReglas(rgs);
      reglasRef.current = rgs;
      await recalcular();
    },
    [recalcular],
  );

  const revertirLote = useCallback(
    async (loteId: number) => {
      const l = lotes.find((x) => x.id === loteId);
      if (!l) return;
      await db.actualizarLote({ ...l, estado: 'revertido' });
      await db.revertirLote(loteId);
      await recargarTodo();
    },
    [lotes, recargarTodo],
  );

  const generarReporteExcel = useCallback(async () => {
    if (!modelo) return;
    const datos: DatosReporte = {
      dashboard: modelo.dashboard,
      reservas: modelo.reservas,
      facturaciones: modelo.facturaciones,
      stockFilas: modelo.stockFilas,
      cambios,
      reglas,
      cfg: cfgRef.current,
      generadoISO: new Date().toISOString(),
    };
    await descargarReporte(datos);
  }, [modelo, cambios, reglas]);

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
  }, [lotes, reglas, cambios, stock]);

  const importarBackup = useCallback(
    async (file: File): Promise<number> => {
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
        return b.registros.length;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return 0;
      }
    },
    [recargarTodo],
  );

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
      cola,
      agregarArchivos,
      quitarDeCola,
      actualizarEnCola,
      simularCola,
      confirmarCola,
      aplicarCorreccion,
      guardarStockManual,
      editarCfg,
      revertirCambio,
      toggleRegla,
      eliminarRegla,
      revertirLote,
      generarReporteExcel,
      exportarBackup,
      importarBackup,
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
      cola,
      agregarArchivos,
      quitarDeCola,
      actualizarEnCola,
      simularCola,
      confirmarCola,
      aplicarCorreccion,
      guardarStockManual,
      editarCfg,
      revertirCambio,
      toggleRegla,
      eliminarRegla,
      revertirLote,
      generarReporteExcel,
      exportarBackup,
      importarBackup,
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
