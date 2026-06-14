import { createAgentSession, type ExtensionAPI, SessionManager } from '@earendil-works/pi-coding-agent'
import Type from 'typebox'

import { computeEvalResult, computeSessionStats, generateEvalReport, getStartingTrialNum, saveFile } from './utils'

export default function (pi: ExtensionAPI) {
  // const evalSettings = EvalSettingsSchema.parse({})

  pi.registerTool({
    name: 'run_eval',
    label: 'Run Eval',
    description:
      'Runs an evaluation/eval by executing a task a specified number of times, grading the task, and computing statistics.',
    parameters: Type.Object({
      name: Type.String({
        description: 'Name of the eval to run.',
      }),
      numTrials: Type.Integer({
        description: 'Number of eval trials to run.',
        default: 5,
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Get eval name
      const { name: evalName, numTrials: numTrials } = params
      const gradeResultFolder = `.pi-eval/${evalName}/grading`
      const evalResultFolder = `.pi-eval/${evalName}/results`

      const startingTrialNum = await getStartingTrialNum({ gradeResultFolder })
      for (let iter = startingTrialNum; iter < startingTrialNum + numTrials; iter++) {
        const iterNum = iter.toString().padStart(4, '0')

        // Perform task
        ctx.ui.notify(`[Iteration ${iter + 1}] Performing task...`)
        const { session: taskSession } = await createAgentSession({ sessionManager: SessionManager.inMemory() })
        await taskSession.prompt(
          `Parse the "Task" section from the eval ${evalName}.md from the folder \`./evals\`. Execute the task.`,
        )
        const sessionLogsFilepath = taskSession.exportToJsonl(`.pi-eval/${evalName}/trials/trial-${iterNum}.jsonl`)
        taskSession.dispose()

        // Compute session stats
        const sessionStats = await computeSessionStats({ trialNum: iter, filepath: sessionLogsFilepath })

        await saveFile({
          data: sessionStats,
          folderPath: gradeResultFolder,
          filename: `grade-${iterNum}.json`,
        })

        // Grade task
        ctx.ui.notify(`[Iteration ${iter}] Grading task...`)
        const { session: gradeSession } = await createAgentSession({ sessionManager: SessionManager.inMemory() })
        await gradeSession.prompt(
          `Parse the "Task" and "Eval Checklist" sections from the file @evals/${evalName}.md. Read the Pi session log file located at @${sessionLogsFilepath}.
  
  First, use the log entries to determine if the Task was completed by checking whether all items from the Eval Checklist were completed. Tabulate the percentage of checklist items that were completed.
  
  Finally, add the result to a new property \`completionPercentage\` in  \`.pi-eval/${evalName}/grading/grade-${iterNum}.json\`. The result MUST be a number between 0 and 1.`,
        )

        gradeSession.dispose()
      }

      // Consolidate stats
      ctx.ui.notify(`Consolidating eval results...`)
      const evalResult = await computeEvalResult({ name: evalName, folderPath: gradeResultFolder })
      await saveFile({
        data: evalResult,
        folderPath: evalResultFolder,
        filename: `result.json`,
      })

      // Generate report
      ctx.ui.notify(`Generating eval report...`)
      generateEvalReport({ folderPath: evalResultFolder, evalResult })

      return {
        content: [
          {
            type: 'text',
            text: `Completed eval successfully. Outputs have been saved to ${evalResultFolder}.`,
          },
        ],
        details: evalResult,
      }
    },
  })
}
