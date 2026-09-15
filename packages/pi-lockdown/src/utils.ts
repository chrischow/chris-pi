import path from 'node:path'

import { type ExtensionContext, SettingsManager } from '@earendil-works/pi-coding-agent'
import type { SettingItem } from '@earendil-works/pi-tui'

import {
  LOCATION,
  PERM_ACTION,
  PROTECTION,
  SETTING_ID_SEPARATOR,
  SETTINGS_KEY,
  SUBAGENT_SETTINGS_KEY,
} from './constants'
import { lockdownLevelOptions, type LockdownSettings, LockdownSettingsSchema } from './schema'

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

/**
 * Parse a single settings key from a settings object.
 *
 * Returns:
 * - `{ found: false }` when the key is absent (caller should fall through to the next source/key),
 * - `{ found: true, value }` when the key is present and valid,
 * - `null` when the key is present but invalid (caller must notify + shutdown).
 */
function parseLockdownKey(
  raw: Record<string, unknown>,
  key: string,
  ctx: ExtensionContext,
): { found: boolean; value?: LockdownSettings } | null {
  // Explicit presence check: a missing key falls through to the next source,
  // while a present-but-invalid key is a hard error.
  if (!(key in raw)) {
    return { found: false }
  }

  const parsed = LockdownSettingsSchema.safeParse(raw[key])
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.ui.notify(`[LOCKDOWN] ${issue.path[0] as string} - ${issue.message}`, 'error')
    }
    return null
  }

  return { found: true, value: parsed.data }
}

export function loadSettings(ctx: ExtensionContext, isSubagent = false): LockdownSettings | null {
  const sm = SettingsManager.create(ctx.cwd)
  const projectSettings = sm.getProjectSettings() as Record<string, unknown>
  const globalSettings = sm.getGlobalSettings() as Record<string, unknown>

  // Key-ordered lookup: subagent profile first (project → global), then fall
  // back to the generic `lockdown` key (project → global), then defaults.
  const keys = isSubagent ? [SUBAGENT_SETTINGS_KEY, SETTINGS_KEY] : [SETTINGS_KEY]
  const sources = [projectSettings, globalSettings]

  for (const key of keys) {
    for (const source of sources) {
      const result = parseLockdownKey(source, key, ctx)
      if (result === null) {
        ctx.shutdown()
        return null
      }
      if (result.found) {
        return result.value ?? null
      }
    }
  }

  // Use defaults. Note: fileAccess is a required key, so its default objects
  // must be nested under `fileAccess` (passing them at the top level throws).
  return LockdownSettingsSchema.parse({
    fileAccess: {
      external: { protected: {}, unprotected: {} },
      internal: { protected: {}, unprotected: {} },
    },
  })
}

export function constructSettingsList(lockdownSettings: LockdownSettings): SettingItem[] {
  const items: SettingItem[] = []

  // File access
  for (const location of LOCATION) {
    for (const protection of PROTECTION) {
      for (const permAction of PERM_ACTION) {
        const id = ['fileAccess', location, protection, permAction].join(SETTING_ID_SEPARATOR)
        const fullLabel = permAction
        const titleCaseLabel = fullLabel[0]?.toUpperCase() + fullLabel.slice(1)
        const label = `${titleCaseLabel.padEnd(12, ' ')}>  ${location}  ${protection.padEnd(11, ' ')}`
        const currentValue = lockdownSettings.fileAccess[location][protection][permAction]

        items.push({
          id,
          label,
          currentValue,
          values: lockdownLevelOptions,
        })
      }
    }
  }

  // Custom tools
  Object.keys(lockdownSettings.customTools).forEach((customTool) => {
    const id = ['customTool', customTool].join(SETTING_ID_SEPARATOR)
    const label = customTool.padEnd(36, ' ')
    const currentValue = lockdownSettings.customTools[customTool] ?? 'warn'

    items.push({
      id,
      label,
      currentValue,
      values: lockdownLevelOptions,
    })
  })

  return items
}
