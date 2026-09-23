/**
 * Git Changes Extension
 *
 * Registers a custom tool `git_changes` that the LLM can call to read the
 * line-by-line staged, unstaged, and untracked git changes in the repository
 * (a superset of `git_staged_changes`, which is left untouched).
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

// Per-section size guard: if a section's raw output exceeds this many lines,
// emit affected filenames plus a "too many lines" remark instead of the diff.
const MAX_SECTION_LINES = 2000

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'git_changes',
    label: 'Git Changes',
    description:
      'Read the line-by-line staged, unstaged, and untracked git changes. Returns a single text blob with ' +
      '=== STAGED ===, === UNSTAGED ===, and === UNTRACKED === sections: staged and unstaged show unified diffs ' +
      '(git diff --staged / git diff), untracked lists file paths only. Empty sections say so. Sections larger ' +
      'than 2000 lines are replaced with the affected filenames plus a remark to run the underlying git command ' +
      'for the full diff.',
    promptSnippet: 'Read staged, unstaged, and untracked git changes',
    promptGuidelines: [
      'Use git_changes to review everything in the working tree that differs from HEAD in one call: ' +
        'staged diffs, unstaged diffs, and untracked file paths.',
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const run = (args: string[]) => pi.exec('git', args, { signal: ctx.signal })

      // Probe git availability (handles subdir launches & missing git).
      const { code: gitCode } = await run(['rev-parse', '--git-dir'])
      if (gitCode !== 0) {
        return {
          content: [{ type: 'text', text: 'Not a git repository (or git is not installed).' }],
          details: {},
        }
      }

      // Render one === TITLE === section from a git diff result. Oversized diffs
      // (> MAX_SECTION_LINES) are replaced with affected filenames plus a remark.
      const diffSection = async (
        title: string,
        res: { code: number; stdout: string; stderr: string },
        fullCommand: string,
        nameOnlyArgs: string[],
      ): Promise<string> => {
        const header = `=== ${title} ===`
        if (res.code !== 0) {
          return `${header}\n${res.stderr.trim() || `${fullCommand} failed (exit ${res.code}).`}`
        }
        const diff = res.stdout.trim()
        if (!diff) {
          return `${header}\nNo ${title.toLowerCase()} changes.`
        }
        const lineCount = diff.split('\n').length
        if (lineCount > MAX_SECTION_LINES) {
          const names = await run(nameOnlyArgs)
          const nameList =
            names.code === 0
              ? names.stdout
                  .split('\n')
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0)
                  .join('\n')
              : `(could not list filenames: ${names.stderr.trim()})`
          return [
            header,
            `[Section omitted: ${lineCount} lines exceeds the 2000-line limit; filenames only — run ${fullCommand} for the full diff]`,
            nameList,
          ].join('\n')
        }
        return `${header}\n${diff}`
      }

      const parts: string[] = []

      // STAGED: diff of the index vs HEAD.
      const staged = await run(['diff', '--staged', '--color=never'])
      parts.push(
        await diffSection('STAGED', staged, 'git diff --staged --color=never', [
          'diff',
          '--staged',
          '--name-only',
          '--color=never',
        ]),
      )

      // UNSTAGED: diff of the working tree vs the index.
      const unstaged = await run(['diff', '--color=never'])
      parts.push(
        await diffSection('UNSTAGED', unstaged, 'git diff --color=never', ['diff', '--name-only', '--color=never']),
      )

      // UNTRACKED: paths only, never contents.
      const untracked = await run(['ls-files', '--others', '--exclude-standard'])
      if (untracked.code !== 0) {
        parts.push(
          `=== UNTRACKED ===\n${untracked.stderr.trim() || `git ls-files --others --exclude-standard failed (exit ${untracked.code}).`}`,
        )
      } else {
        const paths = untracked.stdout.trim()
        if (!paths) {
          parts.push('=== UNTRACKED ===\nNo untracked files.')
        } else {
          const pathLineCount = paths.split('\n').length
          if (pathLineCount > MAX_SECTION_LINES) {
            parts.push(
              [
                '=== UNTRACKED ===',
                `[Section omitted: ${pathLineCount} lines exceeds the 2000-line limit — run git ls-files --others --exclude-standard for the full list]`,
                paths,
              ].join('\n'),
            )
          } else {
            parts.push(`=== UNTRACKED ===\n${paths}`)
          }
        }
      }

      return {
        content: [{ type: 'text', text: parts.join('\n\n') }],
        details: {},
      }
    },
  })
}
