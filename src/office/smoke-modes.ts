/**
 * 冒烟探针注册表（第四批起）：每个域代理各写独立的 `src/office/__smoke-<domain>.ts`，
 * 顶层调用 registerSmokeMode 注册自己的 view factory；`__smoke.ts` 用 import.meta.glob
 * 自动加载。并发改同一探针文件的冲突（第三批出现过、曾弄丢别域的收尾花括号）由此消除。
 *
 * factory 的签名与 __smoke.ts 里既有的 `*View` 一致：setup 函数，返回 render function。
 */
export type SmokeViewFactory = () => () => unknown

const modes = new Map<string, SmokeViewFactory>()

export function registerSmokeMode(name: string, factory: SmokeViewFactory): void {
  // 重名会静默换掉先注册的探针（症状：某个 mode 突然测到别域页面，极难定位）。
  // 这里 warn 而非 throw：throw 会在模块求值期中断 __smoke.ts 的全部 mode 路由注册。
  if (modes.has(name)) {
    console.warn(`[smoke] mode already registered, keeping the first one: ${name}`)
    return
  }
  modes.set(name, factory)
}

export function getSmokeMode(name: string): SmokeViewFactory | undefined {
  return modes.get(name)
}
