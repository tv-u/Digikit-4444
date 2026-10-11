"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;
const out = path.join(root, "dist");
const limit = 25 * 1024 * 1024;

const excludedDirs = new Set([
  ".git",
  ".github",
  ".wrangler",
  "node_modules",
  "dist",
  "src",
  "tests",
  "coverage"
]);

const excludedFiles = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "yarn.lock",
  "wrangler.json",
  "wrangler.jsonc",
  "wrangler.toml",
  "build-static.cjs",
  ".gitignore",
  ".assetsignore",
  ".dev.vars",
  ".env",
  "README.md",
  "LICENSE"
]);

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (source === root && excludedDirs.has(entry.name)) continue;
    if (source === root && excludedFiles.has(entry.name)) continue;

    if (entry.name.startsWith(".env.")) continue;
    if (entry.name === ".DS_Store") continue;

    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);

    if (entry.isSymbolicLink()) {
      console.log("Skipping symbolic link:", path.relative(root, from));
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectory(from, to);
      continue;
    }

    if (!entry.isFile()) continue;

    const stat = fs.statSync(from);

    if (stat.size > limit) {
      throw new Error(
        "Asset exceeds Cloudflare's 25 MiB limit: " +
        path.relative(root, from) +
        " (" + stat.size + " bytes)"
      );
    }

    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function xmlEscape(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function writeSEOFiles() {
  const configured = (process.env.SITE_URL || "").trim();
  const base = (configured ||
    "https://tv-u.github.io/Digikit-4444/").replace(/\/+$/, "") + "/";

  const pages = [
    "",
    "about.html",
    "terms.html",
    "security.html",
    "privacy.html",
    "disclaimer.html"
  ];

  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.map(page =>
      "  <url><loc>" + xmlEscape(base + page) + "</loc></url>"
    ).join("\n") +
    "\n</urlset>\n";

  fs.writeFileSync(path.join(out, "sitemap.xml"), sitemap);

  fs.writeFileSync(
    path.join(out, "robots.txt"),
    "User-agent: *\n" +
    "Allow: /\n" +
    "Sitemap: " + base + "sitemap.xml\n"
  );
}

function validateOutput() {
  const index = path.join(out, "index.html");

  if (!fs.existsSync(index)) {
    throw new Error("dist/index.html is missing");
  }

  let count = 0;
  let totalBytes = 0;

  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (excludedDirs.has(entry.name)) {
          throw new Error("Forbidden build directory: " + file);
        }
        scan(file);
      } else if (entry.isFile()) {
        const size = fs.statSync(file).size;

        if (size > limit) {
          throw new Error("Oversized output asset: " + file);
        }

        if (file.toLowerCase().includes("workerd")) {
          throw new Error("Unexpected workerd file in output: " + file);
        }

        count++;
        totalBytes += size;
      }
    }
  }

  scan(out);

  const indexContent = fs.readFileSync(index, "utf8");

  if (!/<html[\s>]/i.test(indexContent)) {
    throw new Error("index.html does not look like an HTML document");
  }

  console.log("PASS: dist/index.html exists");
  console.log("PASS: No output file exceeds 25 MiB");
  console.log("PASS: No workerd executable in output");
  console.log("Output file count:", count);
  console.log("Output size:", (totalBytes / 1024 / 1024).toFixed(3), "MiB");
}

function main() {
  fs.rmSync(out, { recursive: true, force: true });

  copyDirectory(root, out);
  writeSEOFiles();
  validateOutput();

  console.log("BUILD_STATUS=PASS");
  console.log("Output directory: dist/");
}

main();
