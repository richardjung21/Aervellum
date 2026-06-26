const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const ignoredDirectories = new Set([
  ".git",
  "models",
  "node_modules",
  "outputs",
  "runtime",
  "tools",
  "vendor",
  "work",
]);

const checkedExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".ps1",
  ".sh",
  ".swift",
  ".yml",
  ".yaml",
]);

const checkedNames = new Set([
  ".gitattributes",
  ".gitignore",
]);

const suspiciousText = [
  {
    value: "\uFFFD",
    message: "contains the Unicode replacement character, which usually means an encoding problem",
  },
  {
    value: String.fromCodePoint(0xCA0C),
    message: "contains a mojibake-looking middle-dot sequence seen on some Windows consoles",
  },
];

const personalPathPatterns = [
  {
    pattern: /[A-Za-z]:\\Users\\[^\\\s]+/u,
    message: "contains a Windows user-profile path",
  },
  {
    pattern: /\/Users\/[^/\s]+/u,
    message: "contains a macOS user-profile path",
  },
  {
    pattern: /\/home\/[^/\s]+/u,
    message: "contains a Linux user-profile path",
  },
];

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function isCheckedFile(file) {
  const name = path.basename(file);
  return checkedNames.has(name) || checkedExtensions.has(path.extname(name).toLowerCase());
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

const failures = [];

for (const file of walk(root).filter(isCheckedFile)) {
  const bytes = fs.readFileSync(file);
  const text = bytes.toString("utf8");
  const label = relative(file);

  if (text.includes("\r\n")) {
    failures.push(`${label}: uses CRLF line endings; keep committed text files as LF for macOS/Linux scripts.`);
  }

  for (const check of suspiciousText) {
    if (text.includes(check.value)) {
      failures.push(`${label}: ${check.message}.`);
    }
  }

  for (const check of personalPathPatterns) {
    if (check.pattern.test(text)) {
      failures.push(`${label}: ${check.message}. Use repo-relative paths or documented placeholders instead.`);
    }
  }
}

if (failures.length) {
  console.error("Portability check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Portability check passed.");
