/**
 * Token Counter Extension
 *
 * Tracks total token usage across all sessions on this device using an
 * additive counter persisted in ~/.pi/token-stats.json.
 * Displays the count in Pi's bottom bar via ctx.ui.setStatus().
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";

interface TokenStats {
  totalInput: number;
  totalOutput: number;
}

const STATS_FILE = path.join(process.env.HOME || "", ".pi", "token-stats.json");

function readStats(): TokenStats {
  try {
    const raw = fs.readFileSync(STATS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (_e) {
    return { totalInput: 0, totalOutput: 0 };
  }
}

function writeStats(stats: TokenStats): void {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
  } catch (_e) {
    // Silently ignore — stats are best-effort
  }
}

const fmt = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event: SessionStartEvent, ctx) => {
    const stats = readStats();
    ctx.ui.setStatus(
      "token-counter",
      ctx.ui.theme.fg(
        "dim",
        `Global: ↑${fmt(stats.totalInput)} ↓${fmt(stats.totalOutput)}`,
      ),
    );
  });

  pi.on("agent_end", (event, ctx) => {
    const stats = readStats();

    let input = 0;
    let output = 0;
    for (const msg of event.messages) {
      if (msg.role === "assistant") {
        const m = msg as AssistantMessage;
        input += m.usage.input || 0;
        output += m.usage.output || 0;
      }
    }

    stats.totalInput += input;
    stats.totalOutput += output;

    writeStats(stats);

    ctx.ui.setStatus(
      "token-counter",
      ctx.ui.theme.fg(
        "dim",
        `Global: ↑${fmt(stats.totalInput)} ↓${fmt(stats.totalOutput)}`,
      ),
    );
  });
}