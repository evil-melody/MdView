import type { AiConfig, ModelProfile } from './types'

export type AiRole = 'chat' | 'embedding' | 'vlm'

/**
 * 解析某能力当前生效的模型配置：
 * 优先按角色绑定的 profile id，未绑定/已删除时回退到对话配置，再回退到第一个。
 */
export function resolveProfile(ai: AiConfig, role: AiRole): ModelProfile | undefined {
  const profiles = ai.profiles ?? []
  const want =
    role === 'chat' ? ai.chat_profile : role === 'embedding' ? ai.embedding_profile : ai.vlm_profile
  return (
    profiles.find((p) => p.id === want) ??
    profiles.find((p) => p.id === ai.chat_profile) ??
    profiles[0]
  )
}
