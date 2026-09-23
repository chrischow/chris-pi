import { execSync } from 'node:child_process'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

const VALID_SCRIPTS = [
  'build',
  'lint',
  'lint:fix',
  'check-types',
  'format',
  'test',
  'db:sync -w packages/db',
  'db:seed:run -w packages/db',
  'db:migration:run -w packages/db',
  'db:generate -w packages/db',
] as const
type ScriptName = (typeof VALID_SCRIPTS)[number]

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'run_npm_script',
    label: 'Run NPM Script',
    description: `Use this tool to build, lint, check types, format, test code, and run DB commands in this repo by running one of the following npm scripts in the project root: ${VALID_SCRIPTS.join(', ')}.`,
    parameters: Type.Object({
      script: Type.String({
        description: `The npm script to run. Must be one of: ${VALID_SCRIPTS.join(', ')}`,
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const script = params.script as ScriptName

      if (!VALID_SCRIPTS.includes(script)) {
        return {
          content: [{ type: 'text', text: `Invalid script: "${script}". Must be one of: ${VALID_SCRIPTS.join(', ')}` }],
          details: {},
          isError: true,
        }
      }

      try {
        const output = execSync(`npm run ${script}`, {
          cwd: ctx.cwd,
          encoding: 'utf-8',
          signal,
        })

        return {
          content: [{ type: 'text', text: output }],
          details: {},
        }
      } catch (error) {
        // Extract the raw terminal output from the failed execution
        let errorMessage: string

        if (error && typeof error === 'object') {
          const stdout = (error as { stdout?: string | Buffer }).stdout?.toString().trim()
          const stderr = (error as { stderr?: string | Buffer }).stderr?.toString().trim()

          // Combine stdout and stderr, or fall back to the standard error message
          errorMessage =
            [stdout, stderr].filter(Boolean).join('\n') || (error as { message?: string }).message || String(error)
        } else {
          errorMessage = String(error)
        }
        return {
          content: [{ type: 'text', text: errorMessage }],
          details: {},
          isError: true,
        }
      }
    },
  })
}
