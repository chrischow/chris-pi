import path from 'node:path'

import { type ExtensionAPI, getSettingsListTheme, isToolCallEventType } from '@earendil-works/pi-coding-agent'
import { Box, Container, SettingsList, Text } from '@earendil-works/pi-tui'

import { type LockdownLevel, LockdownLevelSchema, LockdownSettingsSchema } from './schema'
import { constructSettingsList, isInside, loadSettings } from './utils'

// Settings
let lockdownSettings = LockdownSettingsSchema.parse({
  fileAccess: {
    external: { protected: {}, unprotected: {} },
    internal: { protected: {}, unprotected: {} },
  },
})

/**
 * Lockdown: A Pi extension to add security constraints to agents' tool usage.
 */
export default function (pi: ExtensionAPI) {
  // Set allowed tools
  pi.on('session_start', (_, ctx) => {
    // Load settings
    const loadedSettings = loadSettings(ctx)
    if (!loadedSettings) {
      ctx.ui.notify('Could not load settings.', 'error')
      ctx.shutdown()
      return
    }

    lockdownSettings = loadedSettings

    // Set tools
    const tools = (lockdownSettings.defaultTools as string[]).concat(Object.keys(lockdownSettings.customTools))
    pi.setActiveTools(Array.from(new Set(tools)))
  })

  pi.on('tool_call', async (event, ctx) => {
    // Block bash
    if (isToolCallEventType('bash', event)) {
      return { block: true, reason: '[LOCKDOWN] Bash usage blocked.' }
    }

    const isRead = isToolCallEventType('read', event)
    const isEdit = isToolCallEventType('edit', event)
    const isWrite = isToolCallEventType('write', event)
    const isGrep = isToolCallEventType('grep', event)
    const isFind = isToolCallEventType('find', event)
    const isLs = isToolCallEventType('ls', event)

    // Special case: Prevent deletion workaround
    if (isWrite && event.input.content.trim().length === 0) {
      return {
        block: true,
        reason: '[LOCKDOWN] Not allowed to soft-remove file by writing empty content to file.',
      }
    }

    // Compute permissions
    const hasPath = isRead || isEdit || isWrite
    let inputPath = '.'
    if (hasPath) {
      inputPath = event.input.path
    } else if (isGrep || isFind || isLs) {
      inputPath = event.input.path ?? '.'
    } else {
      inputPath = event.input ? JSON.stringify(event.input) : '.'
    }

    const location: 'internal' | 'external' = isInside(ctx.cwd, inputPath) ? 'internal' : 'external'
    const isProtected = lockdownSettings.protectedPatterns.some((pattern) => path.matchesGlob(inputPath, pattern))
    const protection: 'protected' | 'unprotected' = isProtected ? 'protected' : 'unprotected'

    let permAction: 'read' | 'edit' | 'write' | undefined = undefined

    if (isRead) {
      permAction = 'read'
    } else if (isGrep) {
      permAction = 'read'
    } else if (isFind || isLs) {
      permAction = 'read'
    } else if (isEdit) {
      permAction = 'edit'
    } else if (isWrite) {
      permAction = 'write'
    }

    let permission: LockdownLevel
    if (permAction && ['read', 'edit', 'write'].includes(permAction)) {
      permission = lockdownSettings.fileAccess[location][protection][permAction]
    } else {
      // Custom tools: Default to warn
      permission = lockdownSettings.customTools[event.toolName] ?? 'warn'
    }

    switch (permission) {
      case 'block':
        return {
          block: true,
          reason: `[LOCKDOWN] Not allowed to perform action:\n\n${event.toolName}: ${inputPath}.`,
        }
      case 'warn': {
        const choice = await ctx.ui.select(
          `[LOCKDOWN]\n⚠️ Allow agent to perform action?\n\n${event.toolName}: ${inputPath}`,
          ['Yes', 'No'],
        )

        if (choice !== 'Yes') {
          return {
            block: true,
            reason: '[LOCKDOWN] Action blocked by user.',
          }
        }
        return
      }
      case 'allow':
        return
    }
  })

  // Reset permissions
  pi.registerCommand('lockdown:reset', {
    description: 'Reset permissions to those specified in settings.json and/or defaults.',
    handler: async (_, ctx) => {
      const loadedSettings = loadSettings(ctx)
      if (!loadedSettings) {
        ctx.ui.notify('Could not update permissions.', 'error')
        ctx.shutdown()
        return
      }
      lockdownSettings = loadedSettings
      ctx.ui.notify('Permissions have been reset.', 'info')
    },
  })

  // Temporarily update permissions
  pi.registerCommand('lockdown:session-permissions', {
    description: 'Configure file access permissions for session.',
    handler: async (_args, ctx) => {
      const items = constructSettingsList(lockdownSettings)

      await ctx.ui.custom((_tui, theme, _kb, done) => {
        const container = new Container()

        const titleBox = new Box(0, 1)
        titleBox.addChild(new Text(theme.fg('accent', theme.bold('Session Permissions')), 0, 0))
        titleBox.addChild(
          new Text(
            theme.fg('dim', 'Toggle file access permissions for the session. Changes are immediately applied.'),
            0,
            0,
          ),
        )

        container.addChild(titleBox)

        const settingsList = new SettingsList(
          items,
          Math.min(items.length + 2, 15),
          getSettingsListTheme(),
          (id, newValue) => {
            // Handle value change
            const [permType, locationOrCustomTool, protection, perm] = id.split('__')
            if (permType === 'fileAccess') {
              lockdownSettings.fileAccess[locationOrCustomTool as 'external' | 'internal'][
                protection as 'protected' | 'unprotected'
              ][perm as 'read' | 'write' | 'edit'] = LockdownLevelSchema.parse(newValue)
            } else {
              lockdownSettings.customTools[locationOrCustomTool as string] = LockdownLevelSchema.parse(newValue)
            }
          },
          () => done(undefined), // On close
          { enableSearch: true }, // Optional: enable fuzzy search by label
        )
        container.addChild(settingsList)

        return {
          render: (w) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data) => settingsList.handleInput?.(data),
        }
      })
    },
  })
}
