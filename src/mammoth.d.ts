declare module 'mammoth' {
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer; path?: string },
    options?: Record<string, unknown>
  ): Promise<{ value: string; messages: unknown[] }>
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer
    path?: string
  }): Promise<{ value: string; messages: unknown[] }>
  const _default: { convertToHtml: typeof convertToHtml; extractRawText: typeof extractRawText }
  export default _default
}
