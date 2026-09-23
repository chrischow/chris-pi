/**
 * Stages all changes (git add .) and creates a single commit with the exact
 * message provided. Message must be Conventional Commits (repo commit-msg hook).
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'commit_changes',
    label: 'Commit Changes',
    description:
      'Stages all changes (git add .) and creates a single commit with the exact message provided. ' +
      "Returns git's output and exit codes; failures (e.g. empty message, nothing staged, repo hook " +
      'rejections like commitlint or lint-staged) are reported in the result content, not thrown.',
    promptSnippet: 'Stage all changes and create a git commit with the provided message',
    promptGuidelines: [
      "Use commit_changes to run 'git add . && git commit -m <msg>' in one step when the user asks to commit everything. " +
        'Repo hooks run on commit (pre-commit lint-staged, commit-msg commitlint); if a hook rejects the message, ' +
        'report the rejection from the tool result and try again.',
    ],
    parameters: Type.Object({
      message: Type.String({
        description:
          "Commit message in Conventional Commits format, e.g. 'feat: add login form'. No other git flags are passed.",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      // Probe git availability + find repo root (handles subdir launches & missing git).
      let repoRoot: string
      try {
        const { code, stdout } = await pi.exec('git', ['rev-parse', '--show-toplevel'], { signal: ctx.signal })
        if (code !== 0) {
          return {
            content: [{ type: 'text', text: 'Not a git repository (or git is not installed).' }],
            details: { committed: false, commitHash: undefined, addCode: undefined, code },
          }
        }
        repoRoot = stdout.trim()
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Could not run git: ${err}` }],
          details: { committed: false, commitHash: undefined, addCode: undefined, code: undefined },
        }
      }

      const opts = { signal: ctx.signal, cwd: repoRoot }

      const add = await pi.exec('git', ['add', '.'], opts)
      if (add.code !== 0) {
        return {
          content: [{ type: 'text', text: `git add . failed (exit ${add.code}):\n${add.stderr}` }],
          details: { committed: false, commitHash: undefined, addCode: add.code, code: undefined },
        }
      }

      const commit = await pi.exec('git', ['commit', '-m', params.message], opts)
      const hashMatch = commit.stdout.match(/\[[^\]]*?([0-9a-f]{7,40})\]/)
      const commitHash = hashMatch ? hashMatch[1] : undefined
      const committed = commit.code === 0
      const text = committed
        ? `Committed${commitHash ? ` ${commitHash}` : ''}:\n${params.message}\n\n${commit.stdout.trim()}`
        : `git commit failed (exit ${commit.code}):\n${(commit.stderr || commit.stdout).trim()}`

      return {
        content: [{ type: 'text', text }],
        details: { committed, commitHash, addCode: add.code, code: commit.code },
      }
    },
  })
}
