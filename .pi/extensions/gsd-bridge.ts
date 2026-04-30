import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function shellQuote(value: string) {
  return JSON.stringify(value);
}

async function runGsd(args: string[], cwd: string, timeoutMs = 120000, signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("gsd", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500);
    }, timeoutMs);

    const onAbort = () => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500);
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));

    child.on("error", (err) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (timedOut) {
        reject(new Error(`gsd timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

function asText(result: RunResult) {
  return [
    `exitCode: ${result.code}`,
    result.stdout ? `stdout:\n${result.stdout}` : "stdout: <empty>",
    result.stderr ? `stderr:\n${result.stderr}` : "stderr: <empty>",
  ].join("\n\n");
}

export default function gsdBridge(pi: ExtensionAPI) {
  pi.registerTool({
    name: "gsd_start_task",
    label: "GSD Start Task",
    description: "Create a new GSD milestone from task text and optionally auto-run it in headless mode.",
    parameters: Type.Object({
      task: Type.String({ description: "Task brief for GSD milestone context" }),
      auto: Type.Optional(Type.Boolean({ description: "Run with --auto (default: true)" })),
      projectPath: Type.Optional(Type.String({ description: "Project directory (defaults to current cwd)" })),
      timeoutMs: Type.Optional(Type.Number({ description: "Command timeout in ms (default: 120000)" })),
    }),
    async execute(_toolCallId, params, signal) {
      const cwd = params.projectPath || process.cwd();
      const auto = params.auto ?? true;
      const timeoutMs = params.timeoutMs ?? 120000;

      const args = ["headless", "new-milestone", "--context-text", params.task];
      if (auto) args.push("--auto");

      const result = await runGsd(args, cwd, timeoutMs, signal);

      return {
        content: [{ type: "text", text: asText(result) }],
        details: {
          ok: result.code === 0,
          args,
          cwd,
          exitCode: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    },
  });

  pi.registerTool({
    name: "gsd_status",
    label: "GSD Status",
    description: "Return machine-readable GSD state via `gsd headless query`.",
    parameters: Type.Object({
      projectPath: Type.Optional(Type.String({ description: "Project directory (defaults to current cwd)" })),
      timeoutMs: Type.Optional(Type.Number({ description: "Command timeout in ms (default: 30000)" })),
    }),
    async execute(_toolCallId, params, signal) {
      const cwd = params.projectPath || process.cwd();
      const timeoutMs = params.timeoutMs ?? 30000;
      const result = await runGsd(["headless", "query"], cwd, timeoutMs, signal);

      let parsed: unknown = null;
      if (result.stdout) {
        try {
          parsed = JSON.parse(result.stdout);
        } catch {
          parsed = null;
        }
      }

      return {
        content: [{ type: "text", text: asText(result) }],
        details: {
          ok: result.code === 0,
          cwd,
          exitCode: result.code,
          parsed,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    },
  });

  pi.registerTool({
    name: "gsd_control",
    label: "GSD Control",
    description: "Control running GSD workflow in headless mode (auto, next, pause, stop, dispatch).",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("auto"),
        Type.Literal("next"),
        Type.Literal("pause"),
        Type.Literal("stop"),
        Type.Literal("status"),
        Type.Literal("dispatch"),
      ]),
      dispatchPhase: Type.Optional(Type.String({ description: "Phase for action=dispatch (research|plan|execute|complete|reassess|uat|replan)" })),
      projectPath: Type.Optional(Type.String({ description: "Project directory (defaults to current cwd)" })),
      timeoutMs: Type.Optional(Type.Number({ description: "Command timeout in ms (default: 120000)" })),
    }),
    async execute(_toolCallId, params, signal) {
      const cwd = params.projectPath || process.cwd();
      const timeoutMs = params.timeoutMs ?? 120000;

      let args: string[];
      switch (params.action) {
        case "auto":
          args = ["headless", "auto"];
          break;
        case "next":
          args = ["headless", "next"];
          break;
        case "pause":
          args = ["headless", "pause"];
          break;
        case "stop":
          args = ["headless", "stop"];
          break;
        case "status":
          args = ["headless", "status"];
          break;
        case "dispatch":
          if (!params.dispatchPhase) {
            throw new Error("dispatchPhase required when action=dispatch");
          }
          args = ["headless", "dispatch", params.dispatchPhase];
          break;
        default:
          throw new Error(`Unsupported action: ${params.action}`);
      }

      const result = await runGsd(args, cwd, timeoutMs, signal);

      return {
        content: [{ type: "text", text: asText(result) }],
        details: {
          ok: result.code === 0,
          args,
          cwd,
          exitCode: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    },
  });

  pi.registerTool({
    name: "gsd_wait_until_done",
    label: "GSD Wait Until Done",
    description:
      "Poll `gsd headless query` until workflow reaches terminal/blocking state with low-token change-only updates.",
    parameters: Type.Object({
      projectPath: Type.Optional(Type.String({ description: "Project directory (defaults to current cwd)" })),
      timeoutMs: Type.Optional(Type.Number({ description: "Overall wait timeout in ms (default: 1800000)" })),
      pollMs: Type.Optional(Type.Number({ description: "Polling interval in ms (default: 5000)" })),
      emitMode: Type.Optional(Type.Union([Type.Literal("changes-only"), Type.Literal("heartbeat")])),
      heartbeatEvery: Type.Optional(Type.Number({ description: "Heartbeat frequency in polls (default: 12)" })),
      maxUpdates: Type.Optional(Type.Number({ description: "Cap streaming updates emitted to LLM (default: 50)" })),
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      const cwd = params.projectPath || process.cwd();
      const timeoutMs = Math.max(1000, params.timeoutMs ?? 30 * 60 * 1000);
      const pollMs = Math.max(500, params.pollMs ?? 5000);
      const emitMode = params.emitMode ?? "changes-only";
      const heartbeatEvery = Math.max(1, Math.floor(params.heartbeatEvery ?? 12));
      const maxUpdates = Math.max(1, Math.floor(params.maxUpdates ?? 50));

      const startedAt = Date.now();
      let polls = 0;
      let updates = 0;
      let changedCount = 0;
      let lastSignature = "";
      let lastParsed: any = null;
      let lastRaw = "";
      let terminalReason = "timeout";

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      while (Date.now() - startedAt < timeoutMs) {
        if (signal?.aborted) {
          throw new Error("Aborted");
        }

        polls += 1;
        const result = await runGsd(["headless", "query"], cwd, Math.min(30000, pollMs * 2), signal);
        lastRaw = result.stdout;

        let parsed: any = null;
        try {
          parsed = result.stdout ? JSON.parse(result.stdout) : null;
        } catch {
          parsed = null;
        }
        lastParsed = parsed;

        const signature = JSON.stringify({
          phase: parsed?.state?.phase,
          status: parsed?.state?.status,
          next: parsed?.next,
          blocked: parsed?.blocked,
          active: parsed?.active,
          currentUnit: parsed?.state?.currentUnit ?? parsed?.unit,
          completion: parsed?.completion,
        });

        const changed = signature !== lastSignature;
        if (changed) {
          changedCount += 1;
          lastSignature = signature;
        }

        const isBlocked = !!parsed?.blocked || result.code === 2;
        const status = String(parsed?.state?.status ?? "").toUpperCase();
        const phase = String(parsed?.state?.phase ?? "").toLowerCase();
        const doneByStatus = ["DONE", "COMPLETED", "COMPLETE", "FINISHED", "IDLE"].includes(status);
        const doneByPhase = ["complete", "completed", "done"].includes(phase);
        const doneByActive = parsed?.active === false && !parsed?.next;
        const isDone = doneByStatus || doneByPhase || doneByActive;

        const shouldEmitHeartbeat = emitMode === "heartbeat" && polls % heartbeatEvery === 0;
        const shouldEmit = updates < maxUpdates && (changed || shouldEmitHeartbeat);

        if (shouldEmit) {
          updates += 1;
          const line = changed
            ? `[gsd] change #${changedCount} poll=${polls} status=${status || "?"} phase=${phase || "?"}`
            : `[gsd] heartbeat poll=${polls} status=${status || "?"} phase=${phase || "?"}`;
          onUpdate?.({ content: [{ type: "text", text: line }] });
        }

        if (isBlocked) {
          terminalReason = "blocked";
          return {
            content: [
              {
                type: "text",
                text: [
                  `terminal: blocked`,
                  `polls: ${polls}`,
                  `changes: ${changedCount}`,
                  `updatesEmitted: ${updates}`,
                  `elapsedMs: ${Date.now() - startedAt}`,
                ].join("\n"),
              },
            ],
            details: {
              ok: false,
              terminal: "blocked",
              cwd,
              polls,
              changes: changedCount,
              updatesEmitted: updates,
              elapsedMs: Date.now() - startedAt,
              parsed: lastParsed,
              raw: lastRaw,
            },
          };
        }

        if (isDone) {
          terminalReason = "done";
          return {
            content: [
              {
                type: "text",
                text: [
                  `terminal: done`,
                  `polls: ${polls}`,
                  `changes: ${changedCount}`,
                  `updatesEmitted: ${updates}`,
                  `elapsedMs: ${Date.now() - startedAt}`,
                ].join("\n"),
              },
            ],
            details: {
              ok: true,
              terminal: "done",
              cwd,
              polls,
              changes: changedCount,
              updatesEmitted: updates,
              elapsedMs: Date.now() - startedAt,
              parsed: lastParsed,
              raw: lastRaw,
            },
          };
        }

        await sleep(pollMs);
      }

      return {
        content: [
          {
            type: "text",
            text: [
              `terminal: ${terminalReason}`,
              `polls: ${polls}`,
              `changes: ${changedCount}`,
              `updatesEmitted: ${updates}`,
              `elapsedMs: ${Date.now() - startedAt}`,
            ].join("\n"),
          },
        ],
        details: {
          ok: false,
          terminal: "timeout",
          cwd,
          polls,
          changes: changedCount,
          updatesEmitted: updates,
          elapsedMs: Date.now() - startedAt,
          parsed: lastParsed,
          raw: lastRaw,
        },
      };
    },
  });

  pi.registerCommand("gsd-task", {
    description: "Create and run a GSD milestone from freeform text: /gsd-task <task>",
    handler: async (args, ctx) => {
      const task = (args || "").trim();
      if (!task) {
        ctx.ui.notify("Usage: /gsd-task <task>", "error");
        return;
      }
      const cwd = process.cwd();
      ctx.ui.notify(`Starting GSD task in ${cwd}`, "info");
      const result = await runGsd(["headless", "new-milestone", "--context-text", task, "--auto"], cwd, 120000);
      ctx.ui.notify(`gsd exit=${result.code}`, result.code === 0 ? "success" : "warning");
      await ctx.sendMessage(`Ran: gsd headless new-milestone --context-text ${shellQuote(task)} --auto\n\n${asText(result)}`);
    },
  });

  pi.registerCommand("gsd-watch", {
    description: "Query GSD state once: /gsd-watch",
    handler: async (_args, ctx) => {
      const result = await runGsd(["headless", "query"], process.cwd(), 30000);
      await ctx.sendMessage(`Ran: gsd headless query\n\n${asText(result)}`);
    },
  });
}
