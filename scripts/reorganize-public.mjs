import fs from "fs";
import path from "path";

const publicDir = path.resolve("public");
const jsDir = path.join(publicDir, "js");
const cssDir = path.join(publicDir, "css");

fs.mkdirSync(jsDir, { recursive: true });
fs.mkdirSync(cssDir, { recursive: true });

const jsFiles = [
  "api.js",
  "auth-oauth.js",
  "avatar-utils.js",
  "direct-chat.js",
  "invite-flow.js",
  "mention-autocomplete.js",
  "message-batch.js",
  "message-format.js",
  "mobile-orientation.js",
  "pwa-install.js",
  "rich-text-editor.js",
  "viewport-breakpoints.js",
];

const cssFiles = ["portrait-orientation.css"];

for (const f of jsFiles) {
  const src = path.join(publicDir, f);
  const dest = path.join(jsDir, f);
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log("Moved", f, "-> js/");
  }
}

for (const f of cssFiles) {
  const src = path.join(publicDir, f);
  const dest = path.join(cssDir, f);
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log("Moved", f, "-> css/");
  }
}

const htmlFiles = [
  "dashboard.html",
  "login.html",
  "register.html",
  "auth-callback.html",
];

const replacements = [
  [/href="\/portrait-orientation\.css"/g, 'href="/css/portrait-orientation.css"'],
  [/src="\/viewport-breakpoints\.js"/g, 'src="/js/viewport-breakpoints.js"'],
  [/src="\/mobile-orientation\.js"/g, 'src="/js/mobile-orientation.js"'],
  [/src="\/pwa-install\.js"/g, 'src="/js/pwa-install.js"'],
  [/src="\/avatar-utils\.js"/g, 'src="/js/avatar-utils.js"'],
  [/src="\/message-format\.js"/g, 'src="/js/message-format.js"'],
  [/src="\/rich-text-editor\.js"/g, 'src="/js/rich-text-editor.js"'],
  [/src="\/api\.js"/g, 'src="/js/api.js"'],
  [/src="\/message-batch\.js"/g, 'src="/js/message-batch.js"'],
  [/src="\/direct-chat\.js/g, 'src="/js/direct-chat.js'],
  [/src="\/invite-flow\.js"/g, 'src="/js/invite-flow.js"'],
  [/src="\/auth-oauth\.js"/g, 'src="/js/auth-oauth.js"'],
  [/src="\/mention-autocomplete\.js"/g, 'src="/js/mention-autocomplete.js"'],
];

for (const file of htmlFiles) {
  const filePath = path.join(publicDir, file);
  let content = fs.readFileSync(filePath, "utf8");
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  fs.writeFileSync(filePath, content);
  console.log("Updated", file);
}

// Update service worker precache paths
const swPath = path.join(publicDir, "sw.js");
let sw = fs.readFileSync(swPath, "utf8");
sw = sw.replace("'/api.js'", "'/js/api.js'");
sw = sw.replace("'/auth-oauth.js'", "'/js/auth-oauth.js'");
sw = sw.replace("'/avatar-utils.js'", "'/js/avatar-utils.js'");
sw = sw.replace("'/pwa-install.js'", "'/js/pwa-install.js'");
sw = sw.replace("'/viewport-breakpoints.js'", "'/js/viewport-breakpoints.js'");
sw = sw.replace("'/portrait-orientation.css'", "'/css/portrait-orientation.css'");
sw = sw.replace("'/mobile-orientation.js'", "'/js/mobile-orientation.js'");
fs.writeFileSync(swPath, sw);
console.log("Updated sw.js");
