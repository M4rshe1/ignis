const esbuild = require("esbuild");
const path = require("path");

module.exports = esbuild.build({
  entryPoints: [path.join(__dirname, "src", "main.js")],
  bundle: true,
  outfile: path.join(__dirname, "main.js"),
  format: "cjs",
  platform: "browser",
  target: ["chrome90"],
  external: ["obsidian", "fs"],
  logLevel: "info",
});
