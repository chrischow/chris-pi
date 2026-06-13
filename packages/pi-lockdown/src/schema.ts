import z from 'zod'

export const lockdownLevelOptions = ['allow', 'warn', 'block']
export const LockdownLevelSchema = z.enum(lockdownLevelOptions)
export type LockdownLevel = z.infer<typeof LockdownLevelSchema>

const defaultTools = ['read', 'edit', 'write', 'grep', 'find', 'ls'] as const
export const DefaultToolsSchema = z.array(z.enum(defaultTools))

export const LockdownSettingsSchema = z.object({
  defaultTools: DefaultToolsSchema.default([...defaultTools]),
  protectedPatterns: z.array(z.string()).default(['**/.env*', '**/.git/**', '**/node_modules/**']),
  customTools: z.record(z.string(), LockdownLevelSchema).default({}),
  fileAccess: z.object({
    external: z.object({
      protected: z.object({
        read: LockdownLevelSchema.default('block'),
        write: LockdownLevelSchema.default('block'),
        edit: LockdownLevelSchema.default('block'),
        other: LockdownLevelSchema.default('block'),
      }),
      unprotected: z.object({
        read: LockdownLevelSchema.default('allow'),
        write: LockdownLevelSchema.default('block'),
        edit: LockdownLevelSchema.default('block'),
        other: LockdownLevelSchema.default('block'),
      }),
    }),
    internal: z.object({
      protected: z.object({
        read: LockdownLevelSchema.default('warn'),
        write: LockdownLevelSchema.default('warn'),
        edit: LockdownLevelSchema.default('warn'),
        other: LockdownLevelSchema.default('warn'),
      }),
      unprotected: z.object({
        read: LockdownLevelSchema.default('allow'),
        write: LockdownLevelSchema.default('warn'),
        edit: LockdownLevelSchema.default('warn'),
        other: LockdownLevelSchema.default('warn'),
      }),
    }),
  }),
})
export type LockdownSettings = z.infer<typeof LockdownSettingsSchema>
