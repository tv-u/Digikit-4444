const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const out = path.join(root, "dist");
const LIMIT = 25 * 1024 * 1024;

const excludedDirs = new Set([
  ".git",
  "node_modules",
  ".wrangler",
  "dist",
  ".github"
]);

const excludedFiles = new Set([
  "package.json",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "yarn.lock",
  "wrangler.json",
  "wrangler.jsonc",
  "wrangler.toml",
  ".gitignore",
  ".assetsignore",
  ".dev.vars",
  "build-static.cjs"
]);

let fileCount = 0;
let totalBytes = 0;

function shouldExcludeFile(name, relativePath) {
  if (excludedFiles.has(name)) return true;

  if (/^\.env(?:\.|$)/i.test(name)) return true;

  if (/^README(?:\..*)?$/i.test(name)) return true;

  if (relativePath.split(path.sep).includes("node_modules")) {
    return true;
  }

  return false;
}

function copyDirectory(source, destination, relative = "") {
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, {
    withFileTypes: true
  })) {
    const name = entry.name;
    const rel = relative
      ? path.join(relative, name)
      : name;

    if (relative === "" && excludedDirs.has(name)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (excludedDirs.has(name)) continue;

      copyDirectory(
        path.join(source, name),
        path.join(destination, name),
        rel
      );

      continue;
    }

    if (!entry.isFile()) continue;
    if (shouldExcludeFile(name, rel)) continue;

    const sourceFile = path.join(source, name);
    const destinationFile = path.join(destination, name);
    const size = fs.statSync(sourceFile).size;

    if (size > LIMIT) {
      throw new Error(
        `Asset exceeds Cloudflare's 25 MiB limit: ${rel} ` +
        `(${(size / 1048576).toFixed(2)} MiB). ` +
        "File was not copied to dist."
      );
    }

    fs.mkdirSync(path.dirname(destinationFile), {
      recursive: true
    });

    fs.copyFileSync(sourceFile, destinationFile);

    fileCount++;
    totalBytes += size;
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

copyDirectory(root, out);

if (!fs.existsSync(path.join(out, "index.html"))) {
  throw new Error(
    "Build failed: index.html is missing from the generated dist directory."
  );
}

function verifyOutput(directory) {
  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true
  })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules") {
        throw new Error("Forbidden node_modules directory in dist.");
      }

      verifyOutput(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;

    const size = fs.statSync(fullPath).size;

    if (size > LIMIT) {
      throw new Error(
        `Oversized output file: ${path.relative(out, fullPath)}`
      );
    }

    if (path.relative(out, fullPath).includes("workerd")) {
      throw new Error("Unexpected workerd file found in dist.");
    }
  }
}

verifyOutput(out);

console.log("STATIC BUILD: PASS");
console.log("Output directory: dist/");
console.log("Files copied:", fileCount);
console.log("Total output size:", (totalBytes / 1048576).toFixed(2), "MiB");
console.log("index.html: verified");
console.log("Individual asset size limit: verified");
console.log("node_modules/workerd excluded from output.");
