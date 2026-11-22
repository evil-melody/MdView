/// <reference lib="webworker" />
import { Engine } from './engine'
import type { Evt, Req, Res } from './protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope

const engine = new Engine((event, data) => {
  ctx.postMessage({ event, data } satisfies Evt)
})

ctx.onmessage = async (e: MessageEvent<Req>) => {
  const { id, method, args } = e.data
  try {
    const result = await engine.call(method, args)
    ctx.postMessage({ id, ok: true, result } satisfies Res)
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: (err as Error)?.message ?? String(err) } satisfies Res)
  }
}
