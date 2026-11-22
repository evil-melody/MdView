/** 数据验证：非法输入提示（视图/自绘下拉共用）。规则来自 xlsx.features 读回的 sidecar。 */
import type { ValidationRule } from '../../core/xlsx/types'

export const numOf = (t: string): number | null => {
  const s = String(t ?? '').replace(/[,¥$\s%]/g, '')
  return s !== '' && Number.isFinite(Number(s)) ? Number(s) : null
}

/** 覆盖 (r,c) 的第一条 list 规则（供自绘下拉） */
export function listRuleAt(rules: ValidationRule[], r: number, c: number): ValidationRule | undefined {
  return rules.find((v) => v.type === 'list' && r >= v.sqref.r0 && r <= v.sqref.r1 && c >= v.sqref.c0 && c <= v.sqref.c1)
}

/** 校验一次输入：返回 { ok, message }，message 为出错警告文本 */
export function checkValidation(rules: ValidationRule[], r: number, c: number, text: string): { ok: boolean; message?: string; rule?: ValidationRule } {
  const rule = rules.find((v) => r >= v.sqref.r0 && r <= v.sqref.r1 && c >= v.sqref.c0 && c <= v.sqref.c1)
  if (!rule) return { ok: true }
  if (text === '' && rule.allowBlank !== false) return { ok: true }
  const bad = (m?: string) => ({ ok: false, message: m ?? rule.error ?? '输入不符合数据验证规则', rule })
  if (rule.type === 'list') {
    const items = rule.items ?? (rule.formula1 || '').split(',').map((s) => s.trim()).filter(Boolean)
    return items.includes(text) ? { ok: true } : bad()
  }
  const n = numOf(text)
  if (n === null) return bad(rule.type === 'date' ? '请输入有效日期' : '请输入数字')
  const a = numOf(rule.formula1 ?? '') ?? 0
  const b = numOf(rule.formula2 ?? '') ?? 0
  const op = rule.operator ?? 'between'
  let ok = true
  switch (op) {
    case 'between': ok = n >= Math.min(a, b) && n <= Math.max(a, b); break
    case 'notBetween': ok = n < Math.min(a, b) || n > Math.max(a, b); break
    case 'equal': ok = n === a; break
    case 'notEqual': ok = n !== a; break
    case 'greaterThan': ok = n > a; break
    case 'lessThan': ok = n < a; break
    case 'greaterThanOrEqual': ok = n >= a; break
    case 'lessThanOrEqual': ok = n <= a; break
  }
  if (rule.type === 'whole' && !Number.isInteger(n)) ok = false
  if (rule.type === 'textLength') {
    const len = text.length
    const la = Number(rule.formula1 ?? 0), lb = Number(rule.formula2 ?? la)
    ok = op === 'between' ? len >= Math.min(la, lb) && len <= Math.max(la, lb) : len <= la
  }
  return ok ? { ok: true } : bad()
}
