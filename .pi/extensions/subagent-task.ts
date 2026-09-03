/**
 * /subagent-task — spawn a single subagent
 *
 * Usage:
 *   /subagent-task <task description>
 *   /subagent-task model:<provider/id> <task description>
 *
 * The subagent runs as a child `pi` process in JSON mode from the same cwd
 * and OS user, so it inherits the parent's extensions, permissions, and
 * settings. The result is injected back into the parent session so the
 * parent agent can continue from it.
 *
 * Recursion prevention: the child is spawned with PI_TASK_SUBAGENT=1; this
 * factory returns early (registers nothing) when that env var is set.
 *
 * Model resolution precedence:
 *   1. Inline override: /subagent-task model:<provider/id> <task>
 *   2. Project config: .pi/settings.json  { "subagent-task": { "model": "provider/id" } }
 *   3. Parent's active model
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import {
	CONFIG_DIR_NAME,
	getMarkdownTheme,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const SUBAGENT_ENV = "PI_TASK_SUBAGENT";
const SETTINGS_FILE = "settings.json";
const SUBAGENT_TASK_KEY = "subagent-task";

interface TaskUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
}

interface TaskResult {
	task: string;
	model?: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: TaskUsage;
	stopReason?: string;
	errorMessage?: string;
}

/** Structural subset of ExtensionContext/ExtensionCommandContext used by the shared runner. */
interface SubagentCtx {
	cwd: string;
	hasUI: boolean;
	ui: {
		setStatus(key: string, value: string | undefined): void;
		setWidget(key: string, value: string[] | undefined): void;
	};
	isProjectTrusted(): boolean;
	thinkingLevel?: string;
	model?: { provider: string; id: string };
}

function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant") {
			for (const part of msg.content) {
				if (part.type === "text") return part.text;
			}
		}
	}
	return "";
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}

	return { command: "pi", args };
}

function parseInlineModel(args: string): { model?: string; task: string } {
	const trimmed = args.trim();
	const match = trimmed.match(/^model:(\S+)(?:\s+([\s\S]*))?$/);
	if (match) {
		return { model: match[1], task: (match[2] ?? "").trim() };
	}
	return { task: trimmed };
}

function readConfigModel(cwd: string): string | undefined {
	try {
		const configPath = path.join(cwd, CONFIG_DIR_NAME, SETTINGS_FILE);
		const raw = fs.readFileSync(configPath, "utf8");
		const config = JSON.parse(raw) as Record<string, unknown>;
		const subagentTask = config[SUBAGENT_TASK_KEY] as { model?: string } | undefined;
		return typeof subagentTask?.model === "string" && subagentTask.model.trim()
			? subagentTask.model.trim()
			: undefined;
	} catch {
		return undefined;
	}
}

function isFailedResult(result: TaskResult): boolean {
	return (
		result.exitCode !== 0 ||
		result.stopReason === "error" ||
		result.stopReason === "aborted"
	);
}

async function runSubagentTask(
	pi: ExtensionAPI,
	ctx: SubagentCtx,
	task: string,
	modelOverride: string | undefined,
	signal?: AbortSignal,
): Promise<TaskResult> {
	const configModel = readConfigModel(ctx.cwd);
	const parentModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
	const model = modelOverride ?? configModel ?? parentModel;
	const inheritsParentConfig = !modelOverride && !configModel;

	const childArgs: string[] = ["--mode", "json", "-p", "--no-session"];
	if (model) childArgs.push("--model", model);
	if (inheritsParentConfig && ctx.thinkingLevel) {
		childArgs.push("--thinking", ctx.thinkingLevel);
	}
	const activeTools = pi.getActiveTools();
	if (activeTools.length > 0) childArgs.push("--tools", activeTools.join(","));
	childArgs.push(ctx.isProjectTrusted() ? "--approve" : "--no-approve");
	childArgs.push(`Task: ${task}`);

	const result: TaskResult = {
		task,
		model,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
	};

	if (ctx.hasUI) {
		ctx.ui.setStatus("task", `Subagent (${model ?? "parent model"}): ${task.slice(0, 60)}`);
		ctx.ui.setWidget("task", ["Running subagent...", `Task: ${task}`]);
	}

	try {
		const invocation = getPiInvocation(childArgs);
		const exitCode = await new Promise<number>((resolve) => {
			const proc = spawn(invocation.command, invocation.args, {
				cwd: ctx.cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, [SUBAGENT_ENV]: "1" },
			});
			let buffer = "";

			const processLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					return;
				}
				if (event.type === "message_end" && event.message) {
					const msg = event.message as Message;
					result.messages.push(msg);
					if (msg.role === "assistant") {
						result.usage.turns++;
						const usage = msg.usage;
						if (usage) {
							result.usage.input += usage.input || 0;
							result.usage.output += usage.output || 0;
							result.usage.cacheRead += usage.cacheRead || 0;
							result.usage.cacheWrite += usage.cacheWrite || 0;
							result.usage.cost += usage.cost?.total || 0;
						}
						if (!result.model && msg.model) result.model = msg.model;
						if (msg.stopReason) result.stopReason = msg.stopReason;
						if (msg.errorMessage) result.errorMessage = msg.errorMessage;
					}
					if (ctx.hasUI) {
						const output = getFinalOutput(result.messages);
						const preview = output.split("\n").slice(0, 3).join("\n");
						ctx.ui.setWidget(
							"task",
							preview
								? ["Running subagent...", `Task: ${task}`, preview]
								: ["Running subagent...", `Task: ${task}`],
						);
					}
				}
			};

			proc.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			proc.stderr.on("data", (data) => {
				result.stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			proc.on("error", (err) => {
				result.stderr = err.message;
				resolve(1);
			});

			if (signal) {
				const killProc = () => {
					proc.kill("SIGTERM");
					setTimeout(() => {
						if (!proc.killed) proc.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) killProc();
				else signal.addEventListener("abort", killProc, { once: true });
			}
		});

		result.exitCode = exitCode;
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus("task", undefined);
			ctx.ui.setWidget("task", undefined);
		}
	}

	return result;
}

export default function (pi: ExtensionAPI) {
	// Recursion guard: subagents spawned by this extension must not load it.
	if (process.env[SUBAGENT_ENV] === "1") return;

	pi.registerMessageRenderer("task-result", (message, { expanded, outputPad }, theme) => {
		const details = message.details as TaskResult | undefined;
		const isError = details ? isFailedResult(details) : false;
		const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");

		const container = new Container();
		container.addChild(new Text(`${icon} ${theme.fg("toolTitle", theme.bold("Subagent"))}`, outputPad, 0));

		if (!details) {
			container.addChild(new Text(theme.fg("muted", message.content), outputPad, 0));
			return container;
		}

		container.addChild(new Text(theme.fg("dim", `Task: ${details.task}`), outputPad, 0));
		if (isError && details.errorMessage) {
			container.addChild(
				new Text(theme.fg("error", `Error: ${details.errorMessage}`), outputPad, 0),
			);
		}

		const output = getFinalOutput(details.messages) || details.stderr || "(no output)";
		container.addChild(new Spacer(1));
		if (expanded) {
			container.addChild(new Markdown(output.trim(), outputPad, 0, getMarkdownTheme()));
		} else {
			const lines = output.split("\n");
			container.addChild(
				new Text(theme.fg("toolOutput", lines.slice(0, 10).join("\n")), outputPad, 0),
			);
			if (lines.length > 10) {
				container.addChild(new Text(theme.fg("muted", "(Ctrl+O to expand)"), outputPad, 0));
			}
		}
		return container;
	});

	pi.registerCommand("subagent-task", {
		description:
			"Spawn a subagent to complete a task (inherits extensions, permissions, and settings)",
		handler: async (args, ctx) => {
			const { model: inlineModel, task } = parseInlineModel(args);
			if (!task) {
				ctx.ui.notify("Usage: /subagent-task [model:<provider/id>] <task description>", "warning");
				return;
			}

			const result = await runSubagentTask(pi, ctx, task, inlineModel);
			const isError = isFailedResult(result);
			const output = getFinalOutput(result.messages);
			const errorText = result.errorMessage || result.stderr || output || "(no output)";

			const content = isError
				? `Subagent failed task "${task}".\n\n${errorText}`
				: `Subagent completed task "${task}".\n\n${output || "(no output)"}`;

			pi.sendMessage(
				{
					customType: "task-result",
					content,
					display: true,
					details: result,
				},
				{ triggerTurn: true, deliverAs: "steer" },
			);
		},
	});

	pi.registerTool({
		name: "subagent_task",
		label: "Subagent Task",
		description: [
			"Spawn a subagent to complete a task in an isolated context.",
			"The subagent inherits the current extensions, permissions, and settings.",
			"Returns the subagent's final output.",
		].join(" "),
		parameters: Type.Object({
			task: Type.String({ description: "Task description for the subagent" }),
			model: Type.Optional(
				Type.String({ description: "Model override as provider/id, e.g. anthropic/claude-sonnet-4-5" }),
			),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const result = await runSubagentTask(pi, ctx, params.task, params.model, signal);
			const isError = isFailedResult(result);
			const output = getFinalOutput(result.messages);
			const errorText = result.errorMessage || result.stderr || output || "(no output)";

			return {
				content: [{ type: "text", text: isError ? errorText : output || "(no output)" }],
				details: result,
				isError,
			};
		},
	});
}
