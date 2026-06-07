import fs from "fs";
import path from "path";

const boardHtmlPath = path.resolve("public/board.html");
let html = fs.readFileSync(boardHtmlPath, "utf8");

// Replace inline <style> block with external stylesheet
html = html.replace(
  /  <style>[\s\S]*?  <\/style>/,
  '  <link rel="stylesheet" href="/board/board.css" />',
);

const boardScripts = `
  <script src="/js/mobile-orientation.js"></script>
  <script src="/js/avatar-utils.js"></script>
  <script src="/js/message-format.js"></script>
  <script src="/js/mention-autocomplete.js"></script>
  <script src="/js/api.js"></script>
  <script src="/js/message-batch.js"></script>
  <script src="/board/state.js"></script>
  <script src="/board/helpers.js"></script>
  <script src="/board/members.js"></script>
  <script src="/board/team-board.js"></script>
  <script src="/board/kanban.js"></script>
  <script src="/board/add-task.js"></script>
  <script src="/board/tasks.js"></script>
  <script src="/board/chat.js"></script>
  <script src="/board/panels.js"></script>
  <script src="/board/invites.js"></script>
  <script src="/board/presence.js"></script>
  <script src="/board/polling.js"></script>
  <script src="/board/zoom.js"></script>
  <script src="/board/boot.js"></script>`;

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
