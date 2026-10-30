// Alertas de la aplicación con SweetAlert2 ("Swal"): loading, éxito, error,
// avisos y confirmaciones. Tema oscuro a medida + español. Toda operación de
// usuario pasa por acá: nada queda "a la suerte" sin feedback.

import Swal from 'sweetalert2';

const TEMA = {
  buttonsStyling: true,
  customClass: {
    popup: 'swal-tema',
    title: 'swal-titulo',
    htmlContainer: 'swal-texto',
    confirmButton: 'swal-confirmar',
    cancelButton: 'swal-cancelar',
    icon: 'swal-icono',
  },
};

// SweetAlert2 usa UNA sola instancia: si un finally llama a cerrarCargando()
// mientras se abre el modal de error, se cierra el error y "no pasa nada".
// Con este flag solo se cierra el modal de carga, nunca otro.
let cargandoAbierto = false;

/** Loading modal bloqueante para operaciones largas. Siempre cerrar con cerrarCargando(). */
export function cargando(titulo: string, texto?: string): void {
  cargandoAbierto = true;
  void Swal.fire({
    ...TEMA,
    title: titulo,
    text: texto,
    allowEscapeKey: false,
    allowOutsideClick: false,
    showConfirmButton: false,
    customClass: {
      ...TEMA.customClass,
      popup: 'swal-tema swal-cargando',
    },
    didOpen: () => {
      cargandoAbierto = true;
      Swal.showLoading();
    },
  });
}

export function cerrarCargando(): void {
  if (!cargandoAbierto) return;
  cargandoAbierto = false;
  if (Swal.isVisible()) Swal.close();
}

function cerrarCargandoSilencioso(): void {
  cargandoAbierto = false;
  if (Swal.isVisible()) Swal.close();
}

export function exito(titulo: string, texto?: string): void {
  cerrarCargandoSilencioso();
  void Swal.fire({ ...TEMA, icon: 'success', title: titulo, text: texto, confirmButtonText: 'Entendido' });
}

export function fallo(titulo: string, texto?: string): void {
  console.error('[TopMotors]', titulo, texto);
  cerrarCargandoSilencioso();
  void Swal.fire({ ...TEMA, icon: 'error', title: titulo, text: texto, confirmButtonText: 'Cerrar' });
}

export function aviso(titulo: string, texto?: string): void {
  cerrarCargandoSilencioso();
  void Swal.fire({ ...TEMA, icon: 'warning', title: titulo, text: texto, confirmButtonText: 'Entendido' });
}

/** Toast no bloqueante (esquinas) para confirmaciones rápidas. */
export function toast(mensaje: string, tono: 'ok' | 'err' | 'info' | 'aviso' = 'ok'): void {
  const iconos = { ok: 'success', err: 'error', info: 'info', aviso: 'warning' } as const;
  void Swal.fire({
    ...TEMA,
    toast: true,
    position: 'top-end',
    icon: iconos[tono],
    title: mensaje,
    showConfirmButton: false,
    timer: 3200,
    timerProgressBar: true,
  });
}

/** Confirmación modal (reemplaza window.confirm). Devuelve true si el usuario confirma. */
export async function confirmar(opciones: {
  titulo: string;
  texto?: string;
  confirmarTexto?: string;
  cancelarTexto?: string;
  peligro?: boolean;
}): Promise<boolean> {
  const r = await Swal.fire({
    ...TEMA,
    icon: 'question',
    title: opciones.titulo,
    text: opciones.texto,
    showCancelButton: true,
    confirmButtonText: opciones.confirmarTexto ?? 'Sí, continuar',
    cancelButtonText: opciones.cancelarTexto ?? 'Cancelar',
    reverseButtons: true,
    customClass: {
      ...TEMA.customClass,
      confirmButton: opciones.peligro ? 'swal-confirmar swal-peligro' : 'swal-confirmar',
    },
  });
  return r.isConfirmed;
}

/** Extrae un mensaje legible de cualquier error. */
export function mensajeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
