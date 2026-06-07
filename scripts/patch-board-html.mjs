import fs from "fs";
import path from "path";

const boardHtmlPath = path.resolve("public/taskflow.html");
let html = fs.readFileSync(boardHtmlPath, "utf8");

// Replace inline <style> block with external stylesheet
html = html.replace(
  /  <style>[\s\S]*?  <\/style>/,
  '  <link rel="stylesheet" href="/taskflow/taskflow.css" />',
);

const boardScripts = `
  <script src="/js/mobile-orientation.js"></script>
  <script src="/js/avatar-utils.js"></script>
  <script src="/js/message-format.js"></script>
  <script src="/js/mention-autocomplete.js"></script>
  <script src="/js/api.js"></script>
  <script src="/js/message-batch.js"></script>
  <script src="/taskflow/state.js"></script>
  <script src="/taskflow/helpers.js"></script>
  <script src="/taskflow/members.js"></script>
  <script src="/taskflow/team-taskflow.js"></script>
  <script src="/taskflow/kanban.js"></script>
  <script src="/taskflow/add-task.js"></script>
  <script src="/taskflow/tasks.js"></script>
  <script src="/taskflow/chat.js"></script>
  <script src="/taskflow/panels.js"></script>
  <script src="/taskflow/invites.js"></script>
  <script src="/taskflow/presence.js"></script>
  <script src="/taskflow/polling.js"></script>
  <script src="/taskflow/zoom.js"></script>
  <script src="/taskflow/boot.js"></script>`;

// Replace shared + inline board scripts at end of body
html = html.replace(
  /  <script src="\/(?:js\/)?mobile-orientation\.js"><\/script>[\s\S]*?<\/body>/,
  `${boardScripts}\n</body>`,
);

// Update shared asset paths
html = html.replace(/href="\/portrait-orientation\.css"/g, 'href="/css/portrait-orientation.css"');
html = html.replace(/src="\/viewport-breakpoints\.js"/g, 'src="/js/viewport-breakpoints.js"');

fs.writeFileSync(boardHtmlPath, html);
console.log("Patched board.html");
