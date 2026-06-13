import z from 'zod'

export const EvalSettingsSchema = z.object({
  evalsFolder: z.string().default('./evals'),
})

export const EvalResultSchema = z.object({
  success: z.boolean(),
  numToolCalls: z.number(),
  numTurns: z.number(),
  numInputTokens: z.number(),
  numOutputTokens: z.number(),
})
export type EvalResult = z.infer<typeof EvalResultSchema>
