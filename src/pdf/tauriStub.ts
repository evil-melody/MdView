/** 冒烟专用：把 Tauri 原始字节通道换成内存变量，不启桌面运行时 */
declare global {
  interface Window {
    __PDF_BYTES__?: Uint8Array
    __PDF_WRITTEN__?: Uint8Array
  }
}

export async function invoke(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  if (cmd === 'read_file_as_bytes') return new Uint8Array(window.__PDF_BYTES__ ?? []).buffer
  if (cmd === 'write_file_bytes') {
    window.__PDF_WRITTEN__ = new Uint8Array(args.contents as Uint8Array)
    return true
  }
  return null
}

export function convertFileSrc(path: string): string {
  return `asset://localhost/${encodeURIComponent(path)}`
}
