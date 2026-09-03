import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";

const VALID_SCRIPTS = ["build", "lint", "lint:fix", "check-types", "format", "test"] as const;
type ScriptName = (typeof VALID_SCRIPTS)[number];

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "run_npm_script",
    label: "Run NPM Script",
    description: `Use this tool to build, lint, check types, format or test code in this repo by running one of the following npm scripts in the project root: ${VALID_SCRIPTS.join(", ")}.`,
    parameters: Type.Object({
      script: Type.String({
        description: `The npm script to run. Must be one of: ${VALID_SCRIPTS.join(", ")}`,
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const script = params.script as ScriptName;

      if (!VALID_SCRIPTS.includes(script)) {
        return {
          content: [{ type: "text", text: `Invalid script: "${script}". Must be one of: ${VALID_SCRIPTS.join(", ")}` }],
          details: {},
          isError: true,
        };
      }

      try {
        const output = execSync(`npm run ${script}`, {
          cwd: ctx.cwd,
          encoding: "utf-8",
          signal,
        });

        return {
          content: [{ type: "text", text: output }],
          details: {},
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: message }],
          details: {},
          isError: true,
        };
      }
    },
  });
}
