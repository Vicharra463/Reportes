// SHA-256 con Web Crypto; fallback no criptográfico (FNV-1a) solo para
// entornos sin crypto.subtle (file:// inseguro). El hash se usa para detectar
// archivos repetidos, nunca para seguridad.

export async function hashArchivo(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return fallbackHash(file);
  }
}

function fallbackHash(file: File): string {
  // FNV-1a 64-bit simulado en dos 32-bit + tamaño, suficiente para detectar repetidos
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  const paso = Math.max(1, Math.floor(file.size / 2048));
  let leido = 0;
  // lectura sincrónica no disponible: usamos tamaño + nombre + fecha
  void paso;
  void leido;
  for (let i = 0; i < file.name.length; i++) {
    h1 ^= file.name.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= file.name.charCodeAt(i);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  h1 ^= file.size;
  h2 ^= file.lastModified >>> 0;
  return `fnv-${h1.toString(16)}-${h2.toString(16)}-${file.size.toString(16)}`;
}

/** Hash async de un ArrayBuffer (para el worker en memoria). */
export async function hashBuffer(buf: ArrayBuffer, clave = ''): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 0x811c9dc5;
    const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i++) {
      h ^= u[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `fnv-${h.toString(16)}-${buf.byteLength.toString(16)}${clave ? '-' + clave : ''}`;
  }
}
