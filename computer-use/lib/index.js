import { execFile, spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

export const name = "dsh-computer-use";
export const inject = ["tools"];

const scriptPath = fileURLToPath(new URL("../scripts/windows-cua.ps1", import.meta.url));
const overlayPath = fileURLToPath(new URL("../scripts/control-overlay.ps1", import.meta.url));
const INTERACTIVE_TYPES = new Set([
  "Button",
  "CheckBox",
  "ComboBox",
  "Edit",
  "Hyperlink",
  "ListItem",
  "MenuItem",
  "RadioButton",
  "TabItem",
]);

function powershellPath(config) {
  if (typeof config?.powershellPath === "string" && existsSync(config.powershellPath)) {
    return config.powershellPath;
  }
  const root = process.env.SystemRoot ?? "C:\\Windows";
  const executable = join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return existsSync(executable) ? executable : "powershell.exe";
}

function runPowerShell(config, action, payload = {}, signal) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return new Promise((resolve, reject) => {
    execFile(
      powershellPath(config),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-Action",
        action,
        "-Payload",
        encoded,
      ],
      {
        windowsHide: true,
        timeout: config.timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        encoding: "utf8",
        signal,
      },
      (error, stdout, stderr) => {
        const text = String(stdout ?? "").trim();
        if (text) {
          try {
            const value = JSON.parse(text);
            if (value?.ok === false) {
              reject(new Error(value.error ?? "Computer action failed."));
              return;
            }
            resolve(value);
            return;
          } catch {
            // A non-JSON response is a helper failure.
          }
        }
        reject(new Error(String(stderr ?? "").trim() || text || error?.message || "Computer action failed."));
      },
    );
  });
}

function createControlHud(config) {
  const directory = join(config.screenshotDir, "control-session");
  mkdirSync(directory, { recursive: true });
  const statePath = join(directory, `hud-${process.pid}.json`);
  const stopPath = `${statePath}.stop`;
  const goalPath = `${statePath}.goal`;
  let child = null;
  let lastTitle = "";

  function running() {
    return child !== null && child.exitCode === null && child.signalCode === null;
  }

  function writeState(handle, title) {
    writeFileSync(statePath, JSON.stringify({
      handle,
      title: title || lastTitle || "",
      updatedAt: Date.now(),
    }), "utf8");
  }

  function writeGoal(goal) {
    try {
      writeFileSync(goalPath, String(goal ?? "").replace(/[\r\n\t]+/g, " ").slice(0, 120), "utf8");
    } catch {}
  }

  function begin(handle, title, action, goal) {
    if (existsSync(stopPath)) {
      const reason = String(readFileSync(stopPath, "utf8")).trim();
      unlinkSync(stopPath);
      if (reason === "esc" && action !== "inspect") {
        throw new Error("The control session was ended with Esc. Call action=\"inspect\" with a window to start a new session.");
      }
    }
    if (title) lastTitle = title;
    writeState(handle, lastTitle);
    writeGoal(goal);
    if (!running()) {
      child = spawn(
        powershellPath(config),
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-WindowStyle",
          "Hidden",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          overlayPath,
          "-StatePath",
          statePath,
          "-StopPath",
          stopPath,
          "-GoalPath",
          goalPath,
          "-IdleSeconds",
          String(config.hudIdleSeconds),
          "-BackgroundOpacity",
          String(config.hudBackgroundOpacity),
        ],
        // 不要 detached：Windows 上 detached 会让 powershell 拿不到控制台，
        // 进程瞬间以 exit 0 退出且完全不执行脚本（HUD 永远不出现）。
        { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
      );
      const spawnLog = join(config.screenshotDir, "hud-spawn.log");
      const logSpawn = (line) => {
        try {
          appendFileSync(spawnLog, new Date().toISOString() + " " + line + "\n");
        } catch {}
      };
      child.stderr?.on("data", (chunk) => logSpawn(String(chunk).trim()));
      child.once("error", (error) => {
        logSpawn("spawn-error " + (error?.message ?? error));
        child = null;
      });
      child.once("exit", (code) => {
        logSpawn("exit " + code);
        child = null;
      });
      child.unref();
    }
  }

  function end(markEsc = false) {
    try {
      if (markEsc || !existsSync(stopPath)) {
        writeFileSync(stopPath, markEsc ? "esc" : "turn-end", "utf8");
      }
    } catch {}
  }

  function assertNotEsc(action) {
    if (action === "inspect" || !existsSync(stopPath)) return;
    let reason = "";
    try {
      reason = String(readFileSync(stopPath, "utf8")).trim();
    } catch {
      return;
    }
    if (reason !== "esc") return;
    try {
      unlinkSync(stopPath);
    } catch {}
    throw new Error("The control session was ended with Esc. Call action=\"inspect\" with a window to start a new session.");
  }

  return { begin, end, assertNotEsc, statePath, stopPath, title: () => lastTitle };
}

function clean(value, limit = 100) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").slice(0, limit);
}

function windowLine(window, full) {
  const fields = [
    window.handle,
    `pid=${window.processId}`,
    clean(window.processName, 32) || "?",
    clean(window.className, 60) || "?",
    clean(window.title, 100) || "?",
    `fg=${window.foreground ? 1 : 0}`,
    `min=${window.minimized ? 1 : 0}`,
  ];
  if (full) {
    const box = window.bounds;
    fields.push(box ? `box=${box.left},${box.top},${box.width},${box.height}` : "box=null");
    fields.push(`path=${clean(window.processPath, 160) || "-"}`);
  }
  return fields.join("\t");
}

function formatWindows(windows, full) {
  if (windows.length === 0) return "WINDOWS 0";
  return [
    `WINDOWS ${windows.length}`,
    full ? "handle\tpid\tprocess\tclass\ttitle\tflags\tbounds\tpath" : "handle\tpid\tprocess\tclass\ttitle\tflags",
    ...windows.map((window) => windowLine(window, full)),
  ].join("\n");
}

function compactPath(path) {
  return Array.isArray(path) ? path.join(".") : String(path ?? "");
}

function compactPatterns(patterns) {
  const names = Array.isArray(patterns) ? patterns : [];
  return names.length ? names.join(",") : "-";
}

function compactNodes(snapshot, query, interactive, limit, full) {
  const needle = clean(query, 200).toLocaleLowerCase();
  const rows = [];
  for (const node of snapshot.nodes ?? []) {
    const type = String(node.controlType ?? "");
    const patterns = Array.isArray(node.patterns) ? node.patterns : [];
    const isInteractive = patterns.length > 0 || INTERACTIVE_TYPES.has(type);
    if (interactive && !isInteractive) continue;
    if (needle) {
      const haystack = `${node.name ?? ""}\t${node.automationId ?? ""}\t${type}`.toLocaleLowerCase();
      if (!haystack.includes(needle)) continue;
    }
    const box = node.bounds;
    const fields = [
      compactPath(node.path) || ".",
      type,
      clean(node.name, full ? 160 : 100) || "-",
      clean(node.automationId, full ? 100 : 50) || "-",
      compactPatterns(patterns),
      box ? `${box.x},${box.y},${box.width},${box.height}` : "null",
    ];
    if (full) {
      fields.push(clean(node.className, 80) || "-");
      fields.push(`en=${node.enabled === false ? 0 : 1}`);
      fields.push(`off=${node.offscreen ? 1 : 0}`);
      fields.push(`key=${node.keyboardFocusable ? 1 : 0}`);
    }
    rows.push(fields.join("\t"));
    if (rows.length >= limit) break;
  }
  const window = snapshot;
  return [
    `WINDOW\t${window.handle}\t${clean(window.title, 120)}`,
    full
      ? "path\ttype\tname\tid\tpatterns\tx,y,w,h\tclass\tenabled\toffscreen\tfocusable"
      : "path\ttype\tname\tid\tpatterns\tx,y,w,h",
    ...(rows.length ? rows : ["NO_MATCHING_NODES"]),
    `nodes=${rows.length}${snapshot.truncated ? " truncated=1" : ""}`,
  ].join("\n");
}

// Turn one tool call into the single line the HUD shows the user.
// Kept deliberately concrete: position, text, key or URL, not the action name.
function describeGoal(action, args, title) {
  const where = title ? ` · ${clean(title, 40)}` : "";
  const point = Number.isFinite(args?.x) && Number.isFinite(args?.y)
    ? `(${args.x}, ${args.y})`
    : "";
  const path = compactPath(args?.path);
  switch (action) {
    case "inspect":
      return `正在查看窗口${where}`;
    case "screenshot":
      return `正在截取屏幕${where}`;
    case "focus":
      return `正在聚焦控件 ${path || "?"}${where}`;
    case "set_value":
      return `正在填写：${clean(args?.text, 48) || "（空）"}${where}`;
    case "click": {
      const target = path ? `控件 ${path}` : point || "窗口坐标";
      const verb = (args?.clickCount ?? 1) > 1 ? "双击" : "点击";
      return `正在${verb} ${target}${where}`;
    }
    case "type":
      return `正在输入：${clean(args?.text, 48) || "（空）"}${where}`;
    case "key":
      return `正在按键 ${clean(args?.key, 24) || "?"}${where}`;
    case "open_url":
      return `正在打开 ${clean(args?.url, 64) || "?"}${where}`;
    case "scroll":
      return `正在滚动 ${point}${where}`;
    case "drag":
      return `正在拖动 ${point} → (${args?.toX}, ${args?.toY})${where}`;
    case "move":
      return `正在移动鼠标 ${point}${where}`;
    default:
      return `正在执行 ${action}${where}`;
  }
}

async function listWindows(config, query, limit, signal) {
  const normalizedQuery = String(query ?? "").trim() === "任务栏" ? "taskbar" : query;
  const value = await runPowerShell(config, "list_windows", { query: normalizedQuery, limit }, signal);
  return Array.isArray(value.windows) ? value.windows : [];
}

function selectorString(value) {
  return typeof value === "number" ? String(value) : String(value ?? "").trim();
}

async function resolveWindow(config, selector, signal) {
  const text = selectorString(selector);
  if (!text) throw new Error("window is required. Use inspect without window to list windows.");
  if (/^\d+$/.test(text)) return Number(text);

  const matches = await listWindows(config, text, 20, signal);
  if (matches.length === 0) throw new Error(`No window matched "${text}".`);
  const needle = text.toLocaleLowerCase();
  const processMatches = matches.filter((item) =>
    String(item.processName).toLocaleLowerCase().includes(needle));
  const candidates = processMatches.length > 0 ? processMatches : matches;
  const exact = candidates.filter((item) =>
    String(item.title).toLocaleLowerCase() === needle
    || String(item.processName).toLocaleLowerCase() === needle);
  if (exact.length === 1) return exact[0].handle;
  if (candidates.length === 1) return candidates[0].handle;
  const foreground = candidates.filter((item) => item.foreground);
  if (foreground.length === 1) return foreground[0].handle;
  throw new Error(`Window selector is ambiguous. Use one handle:\n${formatWindows(candidates.slice(0, 10), config.full)}`);
}

async function inspect(config, args, signal, hud) {
  if (args.window === undefined || args.window === null || selectorString(args.window) === "") {
    const limit = args.limit ?? config.listLimit;
    const windows = await listWindows(config, args.query, limit, signal);
    return formatWindows(windows.slice(0, limit), config.full);
  }

  const handle = await resolveWindow(config, args.window, signal);
  const interactive = args.interactive ?? !config.full;
  const screenshot = args.screenshot ?? config.autoScreenshot;
  const maxNodes = args.maxNodes ?? config.maxNodes;
  const activated = await runPowerShell(config, "activate", { handle }, signal);
  hud.begin(handle, activated.window.title, "inspect",
    describeGoal("inspect", args, activated.window.title));
  const snapshot = await runPowerShell(config, "snapshot", {
    handle,
    maxDepth: args.maxDepth ?? config.maxDepth,
    maxNodes,
    includeOffscreen: false,
    interactiveOnly: interactive,
    query: args.query ?? "",
  }, signal);
  let text = compactNodes(snapshot, args.query, interactive, maxNodes, config.full);
  if (screenshot) {
    const shot = await runPowerShell(config, "screenshot", {
      handle,
      activate: true,
      screenshotDir: config.screenshotDir,
    }, signal);
    text += `\nSHOT\t${shot.path}\t${shot.width}x${shot.height}`;
  }
  return `ACTIVE\t${activated.window.title}\n${text}`;
}

function parsePath(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value;
  return String(value).split(".").filter(Boolean).map((part) => Number(part));
}

function formatActionResult(action, value) {
  const fields = [`OK\t${action}`];
  for (const key of ["handle", "mode", "characters", "codeUnitsSent", "key", "submitted", "x", "y", "delta"]) {
    if (value?.[key] !== undefined) fields.push(`${key}=${value[key]}`);
  }
  return fields.join("\t");
}

async function perform(config, args, signal, hud) {
  hud.assertNotEsc(args.action);
  const handle = await resolveWindow(config, args.window, signal);
  const visualPointer = args.visualPointer ?? config.visualPointer;
  hud.begin(handle, null, args.action, describeGoal(args.action, args, hud.title()));
  if (args.action === "screenshot") {
    const shot = await runPowerShell(config, "screenshot", {
      handle,
      activate: true,
      screenshotDir: config.screenshotDir,
    }, signal);
    return `OK\tscreenshot\t${shot.path}\t${shot.width}x${shot.height}`;
  }
  if (args.action === "focus") {
    return formatActionResult(args.action, await runPowerShell(config, "focus", {
      handle,
      elementPath: parsePath(args.path),
      visualPointer,
    }, signal));
  }
  if (args.action === "set_value" || args.action === "setValue") {
    if (typeof args.text !== "string") throw new Error("text is required for set_value.");
    return formatActionResult("set_value", await runPowerShell(config, "set_value", {
      handle,
      text: args.text,
      elementPath: parsePath(args.path),
      visualPointer,
    }, signal));
  }
  if (args.action === "click") {
    const payload = {
      handle,
      elementPath: parsePath(args.path),
      x: args.x,
      y: args.y,
      button: args.button ?? "left",
      clickCount: args.clickCount ?? 1,
      visualPointer,
    };
    return formatActionResult(args.action, await runPowerShell(config, "click", payload, signal));
  }
  if (args.action === "type") {
    if (typeof args.text !== "string") throw new Error("text is required for type.");
    return formatActionResult(args.action, await runPowerShell(config, "type", {
      handle,
      text: args.text,
      elementPath: parsePath(args.path),
      replace: args.replace === true,
      submit: args.submit === true,
      visualPointer,
    }, signal));
  }
  if (args.action === "key") {
    if (!args.key) throw new Error("key is required for key.");
    return formatActionResult(args.action, await runPowerShell(config, "key", {
      handle,
      key: args.key,
      elementPath: parsePath(args.path),
      visualPointer,
    }, signal));
  }
  if (args.action === "open_url") {
    if (typeof args.url !== "string" || args.url.trim() === "") {
      throw new Error("url is required for open_url.");
    }
    return formatActionResult(args.action, await runPowerShell(config, "open_url", {
      handle,
      url: args.url,
      visualPointer,
    }, signal));
  }
  if (args.action === "scroll") {
    if (!Number.isFinite(args.x) || !Number.isFinite(args.y) || !Number.isFinite(args.delta)) {
      throw new Error("x, y, and delta are required for scroll.");
    }
    return formatActionResult(args.action, await runPowerShell(config, "scroll", {
      handle,
      x: args.x,
      y: args.y,
      delta: args.delta,
      visualPointer,
    }, signal));
  }
  if (args.action === "drag") {
    if (!Number.isFinite(args.x) || !Number.isFinite(args.y)
      || !Number.isFinite(args.toX) || !Number.isFinite(args.toY)) {
      throw new Error("x, y, toX, and toY are required for drag.");
    }
    return formatActionResult(args.action, await runPowerShell(config, "drag", {
      handle,
      x: args.x,
      y: args.y,
      toX: args.toX,
      toY: args.toY,
      visualPointer,
    }, signal));
  }
  if (args.action === "move") {
    if (!Number.isFinite(args.x) || !Number.isFinite(args.y)) {
      throw new Error("x and y are required for move.");
    }
    return formatActionResult(args.action, await runPowerShell(config, "move", {
      handle,
      x: args.x,
      y: args.y,
      visualPointer,
    }, signal));
  }
  throw new Error(`Unsupported action: ${args.action}`);
}

const computerTool = (config, hud) => ({
  name: "computer",
  description:
    "Inspect or control a Windows app. inspect lists windows or returns a UI tree. Actions: click, type, key, open_url, scroll, drag, move, screenshot, focus, set_value. In full mode the system pointer visibly moves to the target. Paths come from the latest inspect and expire after UI changes.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["inspect", "screenshot", "focus", "set_value", "click", "type", "key", "open_url", "scroll", "drag", "move"],
      },
      window: { type: "string", description: "Window handle or unique title/process substring." },
      query: { type: "string", description: "Filter windows or UI nodes." },
      path: { type: "string", description: "Dot path from inspect, e.g. 0.2.1." },
      x: { type: "integer" },
      y: { type: "integer" },
      toX: { type: "integer" },
      toY: { type: "integer" },
      text: { type: "string" },
      key: { type: "string", description: "Example: Enter, Escape, Ctrl+L." },
      url: { type: "string", description: "URL or search text for open_url." },
      button: { type: "string", enum: ["left", "right", "middle"] },
      clickCount: { type: "integer", minimum: 1, maximum: 2 },
      replace: { type: "boolean" },
      submit: { type: "boolean" },
      delta: { type: "integer" },
      interactive: { type: "boolean", description: "Only actionable nodes. compact=true, full=false." },
      screenshot: { type: "boolean", description: "Capture PNG during inspect. Default false." },
      visualPointer: { type: "boolean", description: "Move the real system pointer visibly. Default true in full mode." },
      limit: { type: "integer", minimum: 1, maximum: 30 },
      maxDepth: { type: "integer", minimum: 1, maximum: 10 },
      maxNodes: { type: "integer", minimum: 10, maximum: 200 },
    },
    required: ["action"],
    additionalProperties: false,
  },
  output: {
    schema: { type: "string" },
    render: (_args, value) => [{ type: "text", text: String(value) }],
  },
  async execute(args, exec) {
    const action = String(args?.action ?? "");
    return action === "inspect"
      ? inspect(config, args ?? {}, exec?.signal, hud)
      : perform(config, { ...args, action }, exec?.signal, hud);
  },
});

export function apply(ctx, config = {}) {
  if (config.enabled === false) return;
  const full = config.mode === "full";
  const effectiveConfig = {
    timeoutMs: 30_000,
    full,
    listLimit: full ? 30 : 12,
    maxDepth: full ? 8 : 5,
    maxNodes: full ? 200 : 60,
    autoScreenshot: false,
    visualPointer: full,
    hudIdleSeconds: 30,
    hudBackgroundOpacity: 0.42,
    screenshotDir: join(tmpdir(), "dsh-computer-use"),
    ...config,
  };
  const hud = createControlHud(effectiveConfig);
  ctx.on?.("session/event", (_session, event) => {
    if (event?.type === "turn/end") hud.end(false);
  }, { global: true });
  ctx.effect(() => () => hud.end(false));
  ctx.effect(() => ctx.tools.register(computerTool(effectiveConfig, hud)));
}
