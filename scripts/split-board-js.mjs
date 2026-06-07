import fs from "fs";
import path from "path";

const boardDir = path.resolve("public/taskflow");
const js = fs.readFileSync(path.join(boardDir, "_extracted.js"), "utf8");
const lines = js.split("\n");

function slice(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

const helpersTail = slice(4722, 4735);

const modules = [
  {
    file: "state.js",
    header:
      "/**\n * taskflow/state.js\n * Shared mutable state and constants for the Kanban board page.\n * Load first.\n */\n\n",
    start: 1,
    end: 83,
  },
  {
    file: "helpers.js",
    header:
      "/**\n * taskflow/helpers.js\n * Overlay management, modals, attachments, and shared utilities.\n * Depends on: state.js\n */\n\n",
    start: 85,
    end: 317,
    append: "\n\n" + helpersTail,
  },
  {
    file: "members.js",
    header:
      "/**\n * taskflow/members.js\n * Team members, roles, mentions, and message formatting.\n * Depends on: state.js, helpers.js\n */\n\n",
    start: 319,
    end: 1221,
  },
  {
    file: "team-taskflow.js",
    header:
      "/**\n * taskflow/team-taskflow.js\n * Team loading, member rendering, board rendering, and init().\n * Depends on: state.js, helpers.js, members.js\n */\n\n",
    start: 1223,
    end: 1781,
  },
  {
    file: "kanban.js",
    header:
      "/**\n * taskflow/kanban.js\n * Drag-and-drop, column layout, and task card ordering.\n * Depends on: state.js, helpers.js, team-taskflow.js\n */\n\n",
    start: 1782,
    end: 1962,
  },
  {
    file: "add-task.js",
    header:
      "/**\n * taskflow/add-task.js\n * Add-task modal and task creation.\n * Depends on: state.js, helpers.js, kanban.js\n */\n\n",
    start: 1963,
    end: 2169,
  },
  {
    file: "tasks.js",
    header:
      "/**\n * taskflow/tasks.js\n * Task detail modal, comments, and attachments.\n * Depends on: state.js, helpers.js, members.js\n */\n\n",
    start: 2170,
    end: 3182,
  },
  {
    file: "chat.js",
    header:
      "/**\n * taskflow/chat.js\n * Team chat panel, messages, and reactions.\n * Depends on: state.js, helpers.js, members.js\n */\n\n",
    start: 3183,
    end: 3849,
  },
  {
    file: "panels.js",
    header:
      "/**\n * taskflow/panels.js\n * Activity, team, and settings side panels; team management.\n * Depends on: state.js, helpers.js, members.js, team-taskflow.js\n */\n\n",
    start: 3850,
    end: 4460,
  },
  {
    file: "invites.js",
    header:
      "/**\n * taskflow/invites.js\n * Team invite links and email invites.\n * Depends on: state.js, helpers.js, team-taskflow.js\n */\n\n",
    start: 4461,
    end: 4541,
  },
  {
    file: "presence.js",
    header:
      "/**\n * taskflow/presence.js\n * Online presence, toasts, and navigation away.\n * Depends on: state.js, helpers.js, team-taskflow.js\n */\n\n",
    start: 4542,
    end: 4670,
  },
  {
    file: "polling.js",
    header:
      "/**\n * taskflow/polling.js\n * Real-time task polling loop.\n * Depends on: state.js, helpers.js, team-taskflow.js, kanban.js, tasks.js\n */\n\n",
    start: 4671,
    end: 4720,
  },
  {
    file: "zoom.js",
    header:
      "/**\n * taskflow/zoom.js\n * Board zoom and pan controls.\n * Depends on: state.js, helpers.js, kanban.js\n */\n\n",
    start: 4988,
    end: 5263,
  },
  {
    file: "boot.js",
    header:
      "/**\n * taskflow/boot.js\n * DOM event wiring and page bootstrap. Load last.\n * Depends on: all other taskflow/* modules.\n */\n\n",
    start: 4737,
    end: 4986,
    append: "\n\n" + slice(5265, 5295),
  },
];

for (const m of modules) {
  let content = m.header + slice(m.start, m.end);
  if (m.append) content += m.append;
  fs.writeFileSync(path.join(boardDir, m.file), content);
  console.log("Wrote", m.file);
}

const covered = new Set();
for (const m of modules) {
  for (let i = m.start; i <= m.end; i++) covered.add(i);
}
for (let i = 4722; i <= 4735; i++) covered.add(i);

const missing = [];
for (let i = 1; i <= lines.length; i++) {
  if (!covered.has(i) && lines[i - 1].trim() !== "" && !lines[i - 1].trim().startsWith("//")) {
    missing.push(`${i}: ${lines[i - 1].trim().slice(0, 60)}`);
  }
}

if (missing.length) {
  console.log("Uncovered lines:", missing);
  process.exit(1);
}

console.log("All lines covered");
