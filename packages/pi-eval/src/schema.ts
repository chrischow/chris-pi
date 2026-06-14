import z from 'zod'

export const EvalSettingsSchema = z.object({
  evalsFolder: z.string().default('./evals'),
})

export const SessionStatsSchema = z.object({
  numToolCalls: z.number(),
  numTurns: z.number(),
  numInputTokens: z.number(),
  numOutputTokens: z.number(),
})
export type SessionStats = z.infer<typeof SessionStatsSchema>

export const GradeResultSchema = SessionStatsSchema.extend({
  completionPercentage: z.float32(),
})
export type GradeResult = z.infer<typeof GradeResultSchema>

export const EvalResultSchema = z.object({
  name: z.string(),
  totalTrials: z.number(),
  totalCorrectTrials: z.number(),
  passRate: z.number(),
  averageCompletionPercentage: z.float32(),
  numInputTokens: z.array(z.number()),
  numOutputTokens: z.array(z.number()),
  numTurns: z.array(z.number()),
  numToolCalls: z.array(z.number()),
  passAtK: z.array(z.number()),
  passPowerK: z.array(z.number()),
})
export type EvalResult = z.infer<typeof EvalResultSchema>
