import { createAgentSession, type ExtensionAPI, SessionManager } from '@earendil-works/pi-coding-agent'
import { createReadStream, readFileSync } from 'fs'
import { createInterface } from 'readline'
import Type from 'typebox'

import { type EvalResult, EvalSettingsSchema } from './schema'

export default function (pi: ExtensionAPI) {
  const evalSettings = EvalSettingsSchema.parse({})

  pi.registerTool({
    name: 'run_eval',
    label: 'Run Eval',
    description: 'Runs an evaluation/eval.',
    parameters: Type.Object({
      name: Type.String({
        description: 'Name of the eval to run.',
      }),
      numIterations: Type.Integer({
        description: 'Number of evaluations to run.',
        default: 5,
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Get eval name
      const { name: evalName, numIterations } = params

      for (let iter = 0; iter < numIterations; iter++) {
        const iterNum = (iter + 1).toString().padStart(4, '0')

        // Perform task
        ctx.ui.notify(`[Iteration ${iter + 1}] Performing task...`)
        const { session: taskSession } = await createAgentSession({ sessionManager: SessionManager.inMemory() })
        await taskSession.prompt(
          `Parse the "Task" section from the eval ${evalName}.md from the folder \`./evals\`. Execute the task.`,
        )
        const sessionLogsFilepath = taskSession.exportToJsonl(`.pi-eval/${evalName}/trials/trial-${iterNum}.jsonl`)
        taskSession.dispose()

        // Grade task
        ctx.ui.notify(`[Iteration ${iter + 1}] Grading task...`)
        const { session: gradeSession } = await createAgentSession({ sessionManager: SessionManager.inMemory() })
        await gradeSession.prompt(
          `Parse the "Task" and "Eval Checklist" sections from the file @evals/${evalName}.md. Read the Pi session log file located at @${sessionLogsFilepath}.
  
  First, use the log entries to determine if the Task was completed by checking whether all items from the Eval Checklist were completed.
  
  Second, use the \`compute_eval_result\` tool to compute eval metrics. This tool requires the log filepath (${sessionLogsFilepath}). 
  
  Finally, save the results to \`.pi-eval/${evalName}/grading/grade-${iterNum}.json\` STRICTLY in the following format:
  
  {
    success: boolean
    numToolCalls: number  // DO NOT COMPUTE. Take result from \`compute_eval_result\`.
    numTurns: number  // DO NOT COMPUTE. Take result from \`compute_eval_result\`.
    numInputTokens: number  // DO NOT COMPUTE. Take result from \`compute_eval_result\`.
    numOutputTokens: number  // DO NOT COMPUTE. Take result from \`compute_eval_result\`.
  }`,
        )

        gradeSession.dispose()
      }

      return {
        content: [
          {
            type: 'text',
            text: 'Completed eval successfully.',
          },
        ],
        details: {},
      }
    },
  })

  pi.registerTool({
    name: 'compute_eval_result',
    label: 'Compute Eval Result',
    description: 'Returns eval metrics. Use this to compute eval metrics from Pi session logs.',
    parameters: Type.Object({
      logFilepath: Type.String({
        description: 'File path for log file to compute eval metrics for.',
      }),
    }),

    async execute(_toolCallId, params) {
      const { logFilepath } = params
      if (!logFilepath) {
        return {
          content: [{ type: 'text', text: 'No file path supplied. Could not compute eval metrics.' }],
          details: {},
        }
      }

      let numInputTokens = 0
      let numOutputTokens = 0
      let numTurns = 0
      let numToolCalls = 0

      // Create a readable stream for the file
      const fileStream = createReadStream(logFilepath)

      // Interface to read the stream line by line
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity, // Recognizes all instances of CR LF (\r\n) as a single line break
      })

      // Loop through each line asynchronously
      for await (const line of rl) {
        // Skip empty lines to prevent JSON parsing errors
        if (!line.trim()) continue

        try {
          const item = JSON.parse(line)
          const { message } = item
          if (!message) {
            continue
          }

          const { role, usage } = message

          if (role && role === 'toolResult') {
            numToolCalls += 1
            continue
          }

          if (!role || role !== 'assistant') {
            continue
          }

          // All assistant messages are turns
          numTurns += 1

          if (usage) {
            const { input, output } = usage
            numInputTokens += input
            numOutputTokens += output
          }
        } catch (error) {
          console.error('Error parsing line')
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              numInputTokens,
              numOutputTokens,
              numTurns,
              numToolCalls,
            }),
          },
        ],
        details: {},
      }
    },
  })
}
