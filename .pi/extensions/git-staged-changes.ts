/**
 * Git Staged Changes Extension
 *
 * Registers a custom tool `git_staged_changes` that the LLM can call to
 * read the currently staged (cached) changes in the git repository.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "git_staged_changes",
    label: "Git Staged Changes",
    description:
      "Read currently staged (cached) git changes. Returns a summary of staged files and their diffs.",
    promptSnippet: "Read staged git changes (git diff --staged)",
    promptGuidelines: [
      "Use git_staged_changes to see what files have been staged with git add but not yet committed.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      // Check if we're in a git repo
      const { code: gitCode } = await pi.exec("git", ["rev-parse", "--git-dir"], {
        signal: ctx.signal,
      });

      if (gitCode !== 0) {
        return {
          content: [{ type: "text", text: "Not a git repository (or git is not installed)." }],
          details: {},
        };
      }

      const { code: statusCode, stdout: statusOutput, stderr: statusError } = await pi.exec(
        "git",
        ["diff", "--cached", "--stat"],
        { signal: ctx.signal }
      );

      if (statusCode === 0 && statusOutput.trim()) {
        return {
          content: [{ type: "text", text: statusOutput.trim() }],
          details: {},
        };
      }

      return {
        content: [{ type: "text", text: statusCode === 0 ? "No staged changes." : statusError.trim() }],
        details: {},
      };
    },
  });
}
