import path from 'node:path'

import { type ExtensionContext, SettingsManager } from '@earendil-works/pi-coding-agent'

import { type LockdownSettings, LockdownSettingsSchema } from './schema'

export function isInside(root: string, value: string): boolean {
  // Resolve `value` relative to `root`, NOT the process CWD.
  // This prevents a bug where a relative `value` resolves differently
  // depending on the process's current directory.
  const resolvedValue = path.resolve(root, value)

  // Normalize trailing separators so "root" and "root/" are treated identically.
  const normalizedRoot = root.replace(/[/\\]+$/, '') + path.sep
  const normalizedValue = resolvedValue.replace(/[/\\]+$/, '')

  // Allow value == root itself (no trailing separator needed).
  return normalizedValue === root || normalizedValue.startsWith(normalizedRoot)
}

export function loadSettings(ctx: ExtensionContext): LockdownSettings {
  const sm = SettingsManager.create(ctx.cwd)
  const projectSettings = sm.getProjectSettings()
  const globalSettings = sm.getGlobalSettings()

  // Read project settings first
  const { success, data: projectLockdownSettings } = LockdownSettingsSchema.safeParse(
    (projectSettings as Record<string, unknown>).lockdown,
  )

  if (success && projectLockdownSettings) {
    return projectLockdownSettings
  }

  // Global settings fallback
  const { success: globalSuccess, data: globalLockdownSettings } = LockdownSettingsSchema.safeParse(
    (globalSettings as Record<string, unknown>).lockdown,
  )

  if (globalSuccess && globalLockdownSettings) {
    return globalLockdownSettings
  }

  // Use defaults
  return LockdownSettingsSchema.parse({
    external: { protected: {}, unprotected: {} },
    internal: { protected: {}, unprotected: {} },
  })
}
