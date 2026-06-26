const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const binaryName = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
const configuredModelPath = process.env.AERVELLUM_WHISPER_MODEL || process.env.VELLUM_WHISPER_MODEL;
const configuredBinaryPath = process.env.AERVELLUM_WHISPER_BINARY || process.env.VELLUM_WHISPER_BINARY;
const modelPath = configuredModelPath
  ? path.resolve(configuredModelPath)
  : path.join(root, "models", "ggml-large-v3-turbo-q5_0.bin");
const audioDir = path.join(root, "outputs", "audio");
const notesDir = path.join(root, "outputs", "notes");

let transcriptionQueue = Promise.resolve();
let noteSaveQueue = Promise.resolve();

function safeStem(value, fallback = "voice-note") {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64);
  return cleaned || fallback;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(command) {
  const pathEntries = String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const extensions = process.platform === "win32"
    ? String(process.env.PATHEXT || ".EXE;.CMD;.BAT")
      .split(";")
      .filter(Boolean)
    : [""];
  const names = process.platform === "win32" && !path.extname(command)
    ? extensions.map((extension) => `${command}${extension.toLowerCase()}`)
    : [command];

  for (const directory of pathEntries) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (await exists(candidate)) return candidate;
    }
  }
  return "";
}

async function resolveWhisperRuntime() {
  const candidates = [
    configuredBinaryPath && {
      path: path.resolve(configuredBinaryPath),
      backend: "custom",
      source: process.env.AERVELLUM_WHISPER_BINARY ? "AERVELLUM_WHISPER_BINARY" : "VELLUM_WHISPER_BINARY",
    },
    {
      path: path.join(root, "runtime", "whisper", process.platform, "cuda", binaryName),
      backend: "cuda",
      source: "workspace CUDA runtime",
    },
    {
      path: path.join(root, "runtime", "whisper", process.platform, "vulkan", binaryName),
      backend: "vulkan",
      source: "workspace Vulkan runtime",
    },
    {
      path: path.join(root, "runtime", "whisper", process.platform, "metal", binaryName),
      backend: "metal",
      source: "workspace Metal runtime",
    },
    {
      path: path.join(root, "runtime", "whisper", process.platform, "cpu", binaryName),
      backend: "cpu",
      source: "workspace CPU runtime",
    },
    {
      path: path.join(root, "runtime", "whisper", binaryName),
      backend: "auto",
      source: "legacy workspace runtime",
    },
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await exists(candidate.path)) return candidate;
  }

  const pathBinary = await findExecutable("whisper-cli");
  if (pathBinary) {
    return {
      path: pathBinary,
      backend: "path",
      source: "PATH",
    };
  }

  return null;
}

function backendEnvironment(runtime) {
  const env = { ...process.env };
  if (runtime?.backend === "vulkan" || runtime?.backend === "auto") {
    env.GGML_VK_VISIBLE_DEVICES ||= "0";
  }
  return env;
}

function detectBackend(stderr, runtime) {
  const lines = String(stderr || "");
  const vulkanDevice = lines.match(/ggml_vulkan:\s*0\s*=\s*([^\r\n|]+)/i);
  const cudaDevice = lines.match(/CUDA\d*\s*=\s*([^\r\n|]+)/i)
    || lines.match(/device\s+\d+:\s*([^\r\n]+?)\s*\(compute/i);
  const metalDevice = lines.match(/ggml_metal_init:\s*found device:\s*([^\r\n]+)/i)
    || lines.match(/using Metal backend/i);

  if (/using CUDA\d* backend/i.test(lines) || /ggml_cuda/i.test(lines)) {
    return {
      accelerator: cudaDevice?.[1]?.trim() || "CUDA GPU",
      backend: "CUDA",
      usedGpu: true,
    };
  }
  if (/using Vulkan\d* backend/i.test(lines) || /ggml_vulkan/i.test(lines)) {
    return {
      accelerator: vulkanDevice?.[1]?.trim() || "Vulkan GPU",
      backend: "Vulkan",
      usedGpu: true,
    };
  }
  if (/using Metal backend/i.test(lines) || /ggml_metal/i.test(lines)) {
    return {
      accelerator: metalDevice?.[1]?.trim() || "Apple Metal GPU",
      backend: "Metal",
      usedGpu: true,
    };
  }
  return {
    accelerator: "Local CPU",
    backend: runtime?.backend === "cpu" ? "CPU" : "CPU/local",
    usedGpu: false,
  };
}

async function ensureDirectories() {
  await Promise.all([
    fs.mkdir(audioDir, { recursive: true }),
    fs.mkdir(notesDir, { recursive: true }),
  ]);
}

async function getConfig() {
  const runtime = await resolveWhisperRuntime();
  return {
    binaryReady: Boolean(runtime),
    modelReady: await exists(modelPath),
    binaryPath: runtime ? path.relative(root, runtime.path) || runtime.path : "",
    runtimeSource: runtime?.source || "",
    preferredBackend: runtime?.backend || "",
    modelName: path.basename(modelPath),
    privateMode: true,
    hostMode: true,
  };
}

async function runTranscription(wavBytes, languageValue) {
  const runtime = await resolveWhisperRuntime();
  if (!runtime) {
    throw new Error("Local whisper binary is missing. Build whisper.cpp or set AERVELLUM_WHISPER_BINARY.");
  }
  if (!(await exists(modelPath))) throw new Error("Whisper model is missing.");

  const bytes = Buffer.from(wavBytes);
  if (bytes.length < 44 || bytes.length > 1024 * 1024 * 500) {
    throw new Error("The recorded WAV data is invalid or too large.");
  }

  await ensureDirectories();
  const id = stamp();
  const audioPath = path.join(audioDir, `${id}.wav`);
  const outputBase = path.join(audioDir, `${id}-transcript`);
  await fs.writeFile(audioPath, bytes);

  const language = /^[a-z]{2,3}$/.test(languageValue) ? languageValue : "auto";
  const args = [
    "-m", modelPath,
    "-f", audioPath,
    "-l", language,
    "-otxt",
    "-nt",
    "-of", outputBase,
  ];

  const result = await new Promise((resolve, reject) => {
    const child = spawn(runtime.path, args, {
      cwd: root,
      windowsHide: true,
      env: backendEnvironment(runtime),
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `whisper.cpp exited with code ${code}`));
    });
  });

  const transcriptPath = `${outputBase}.txt`;
  const text = (await fs.readFile(transcriptPath, "utf8")).trim();
  const backend = detectBackend(result.stderr, runtime);

  return {
    text,
    audioFile: path.relative(root, audioPath),
    transcriptFile: path.relative(root, transcriptPath),
    gpu: backend.accelerator,
    accelerator: backend.accelerator,
    backend: backend.backend,
    usedGpu: backend.usedGpu,
  };
}

function transcribe(payload) {
  const task = () => runTranscription(payload.wavBytes, payload.language);
  const pending = transcriptionQueue.then(task, task);
  transcriptionQueue = pending.catch(() => {});
  return pending;
}

function normalizedNoteContent(title, form, text) {
  const normalizedText = String(text)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  return `${form}\n${String(title).trim()}\n${normalizedText}`;
}

function noteFingerprint(title, form, text) {
  return crypto
    .createHash("sha256")
    .update(normalizedNoteContent(title, form, text), "utf8")
    .digest("hex");
}

function textFingerprint(text) {
  return crypto
    .createHash("sha256")
    .update(String(text).replace(/\s+/g, " ").trim(), "utf8")
    .digest("hex");
}

function recordingFilename(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const filename = path.basename(value.replaceAll("\\", "/"));
  return /^\d{4}-\d{2}-\d{2}T[\d-]+Z-transcript\.txt$/.test(filename) ? filename : "";
}

async function findDuplicateNote(title, form, text, recording) {
  const wanted = noteFingerprint(title, form, text);
  const entries = await fs.readdir(notesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const content = await fs.readFile(path.join(notesDir, entry.name), "utf8");
    const { metadata, body } = parseFrontMatter(content);
    if (recording && metadata.recording === recording) {
      return { filename: entry.name, metadata, linkedRecording: true };
    }
    const savedTitle = metadata.title || entry.name.replace(/\.md$/i, "");
    const savedForm = ["note", "poem", "diary"].includes(metadata.form) ? metadata.form : "note";
    const savedText = noteTextWithoutHeading(body, savedTitle);
    if (noteFingerprint(savedTitle, savedForm, savedText) === wanted) {
      return { filename: entry.name, metadata, linkedRecording: false };
    }
  }

  return null;
}

async function runSaveNote(payload) {
  const text = String(payload.text || "").trim();
  if (!text) throw new Error("There is no note to save.");

  await ensureDirectories();
  const title = String(payload.title || "Untitled voice note").trim().slice(0, 120);
  const allowedForms = new Set(["note", "poem", "diary"]);
  const form = allowedForms.has(payload.form) ? payload.form : "note";
  const recording = recordingFilename(payload.recording);
  const duplicate = await findDuplicateNote(title, form, text, recording);
  if (duplicate && !duplicate.linkedRecording) {
    return {
      file: path.relative(root, path.join(notesDir, duplicate.filename)),
      duplicate: true,
    };
  }

  const filename = duplicate?.filename || `${stamp()}-${safeStem(title)}.md`;
  const target = path.join(notesDir, filename);
  const created = duplicate?.metadata?.created || new Date().toISOString();
  const body = [
    "---",
    `title: "${title.replaceAll('"', '\\"')}"`,
    `form: ${form}`,
    `created: ${created}`,
    ...(recording ? [`recording: "${recording}"`] : []),
    "local: true",
    "---",
    "",
    `# ${title}`,
    "",
    text,
    "",
  ].join("\n");

  await fs.writeFile(target, body, "utf8");
  return {
    file: path.relative(root, target),
    duplicate: false,
    updated: Boolean(duplicate?.linkedRecording),
    recording,
  };
}

function saveNote(payload) {
  const task = () => runSaveNote(payload);
  const pending = noteSaveQueue.then(task, task);
  noteSaveQueue = pending.catch(() => {});
  return pending;
}

function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { metadata: {}, body: content.trim() };

  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    metadata[key] = value;
  }

  return { metadata, body: match[2].trim() };
}

function noteTextWithoutHeading(body, title) {
  const lines = body.split(/\r?\n/);
  if (lines[0]?.trim() === `# ${title}`) {
    lines.shift();
    while (lines[0]?.trim() === "") lines.shift();
  }
  return lines.join("\n").trim();
}

function validNoteId(id) {
  return typeof id === "string" && id.length <= 260;
}

function transcriptId(filename) {
  return `transcript:${filename}`;
}

function markdownId(filename) {
  return `note:${filename}`;
}

function parseArchiveId(id) {
  if (!validNoteId(id)) return null;
  const separator = id.indexOf(":");
  if (separator < 1) return null;
  const type = id.slice(0, separator);
  const filename = id.slice(separator + 1);
  if (path.basename(filename) !== filename) return null;
  if (type === "transcript" && /^\d{4}-\d{2}-\d{2}T[\d-]+Z-transcript\.txt$/.test(filename)) {
    return { type, filename };
  }
  if (type === "note" && /^[\p{L}\p{N}._-]+\.md$/u.test(filename)) {
    return { type, filename };
  }
  return null;
}

function transcriptCreated(filename) {
  const raw = filename.replace(/-transcript\.txt$/, "");
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!match) return "";
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
}

function generatedTranscriptTitle(created, text) {
  const date = new Date(created);
  const label = Number.isNaN(date.getTime())
    ? "Voice record"
    : `Voice record · ${date.toLocaleDateString("en", { month: "short", day: "numeric" })}`;
  const firstWords = text.replace(/\s+/g, " ").trim().split(" ").slice(0, 7).join(" ");
  return firstWords ? `${label} — ${firstWords}${text.split(/\s+/).length > 7 ? "…" : ""}` : label;
}

async function readMarkdownEntries() {
  const entries = await fs.readdir(notesDir, { withFileTypes: true });
  return Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map(async (entry) => {
      const target = path.join(notesDir, entry.name);
      const [content, stats] = await Promise.all([
        fs.readFile(target, "utf8"),
        fs.stat(target),
      ]);
      const { metadata, body } = parseFrontMatter(content);
      const title = metadata.title || entry.name.replace(/\.md$/i, "");
      const form = ["note", "poem", "diary"].includes(metadata.form) ? metadata.form : "note";
      const text = noteTextWithoutHeading(body, title);
      return {
        filename: entry.name,
        title,
        form,
        text,
        created: metadata.created || stats.birthtime.toISOString(),
        recording: recordingFilename(metadata.recording),
        fingerprint: noteFingerprint(title, form, text),
        textFingerprint: textFingerprint(text),
      };
    }));
}

async function listNotes() {
  await ensureDirectories();
  const [audioEntries, markdownEntries] = await Promise.all([
    fs.readdir(audioDir, { withFileTypes: true }),
    readMarkdownEntries(),
  ]);

  const markdownByText = new Map();
  const markdownByRecording = new Map();
  for (const note of markdownEntries.sort((a, b) => Date.parse(b.created) - Date.parse(a.created))) {
    if (note.recording && !markdownByRecording.has(note.recording)) {
      markdownByRecording.set(note.recording, note);
    }
    if (!markdownByText.has(note.textFingerprint)) markdownByText.set(note.textFingerprint, note);
  }

  const matchedMarkdown = new Set();
  const records = [];
  for (const entry of audioEntries) {
    if (!entry.isFile() || !entry.name.endsWith("-transcript.txt")) continue;
    const text = (await fs.readFile(path.join(audioDir, entry.name), "utf8")).trim();
    if (!text) continue;
    const transcriptFingerprint = textFingerprint(text);
    const matched = markdownByRecording.get(entry.name) || markdownByText.get(transcriptFingerprint);
    if (matched) matchedMarkdown.add(matched.textFingerprint);
    const created = transcriptCreated(entry.name);
    records.push({
      id: transcriptId(entry.name),
      title: matched?.title || generatedTranscriptTitle(created, text),
      form: matched?.form || "note",
      created,
      source: "recording",
    });
  }

  const standaloneByFingerprint = new Map();
  for (const note of markdownEntries) {
    if (matchedMarkdown.has(note.textFingerprint) || standaloneByFingerprint.has(note.fingerprint)) continue;
    standaloneByFingerprint.set(note.fingerprint, note);
    records.push({
      id: markdownId(note.filename),
      title: note.title,
      form: note.form,
      created: note.created,
      source: "note",
    });
  }

  records.sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
  return records;
}

async function getNote(id) {
  const archiveId = parseArchiveId(id);
  if (!archiveId) {
    const error = new Error("The requested archive page is invalid.");
    error.statusCode = 400;
    throw error;
  }

  if (archiveId.type === "transcript") {
    const target = path.join(audioDir, archiveId.filename);
    let text;
    try {
      text = (await fs.readFile(target, "utf8")).trim();
    } catch (error) {
      if (error.code === "ENOENT") {
        error.statusCode = 404;
        error.message = "That recording transcript no longer exists.";
      }
      throw error;
    }
    const created = transcriptCreated(archiveId.filename);
    const transcriptFingerprint = textFingerprint(text);
    const markdownEntries = (await readMarkdownEntries())
      .sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
    const matched = markdownEntries.find((note) => note.recording === archiveId.filename)
      || markdownEntries.find((note) => note.textFingerprint === transcriptFingerprint);
    return {
      id,
      title: matched?.title || generatedTranscriptTitle(created, text),
      form: matched?.form || "note",
      created,
      text,
      source: "recording",
      audioFile: archiveId.filename.replace(/-transcript\.txt$/, ".wav"),
    };
  }

  const target = path.join(notesDir, archiveId.filename);
  let content;
  try {
    content = await fs.readFile(target, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      error.statusCode = 404;
      error.message = "That archive page no longer exists.";
    }
    throw error;
  }

  const { metadata, body } = parseFrontMatter(content);
  const title = metadata.title || id.replace(/\.md$/i, "");
  return {
    id,
    title,
    form: ["note", "poem", "diary"].includes(metadata.form) ? metadata.form : "note",
    created: metadata.created || "",
    text: noteTextWithoutHeading(body, title),
    source: "note",
  };
}

async function getArchiveCount() {
  return { count: (await listNotes()).length };
}

async function getArchivePage(indexValue) {
  const index = Number.parseInt(indexValue, 10);
  const records = await listNotes();
  if (!Number.isInteger(index) || index < 0 || index >= records.length) {
    const error = new Error("That archive page is outside the current collection.");
    error.statusCode = 404;
    throw error;
  }
  return {
    index,
    count: records.length,
    entry: await getNote(records[index].id),
  };
}

module.exports = {
  ensureDirectories,
  getArchiveCount,
  getArchivePage,
  getNote,
  getConfig,
  listNotes,
  root,
  saveNote,
  transcribe,
};
