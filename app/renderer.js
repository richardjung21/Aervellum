const recordButton = document.querySelector("#recordButton");
const recordLabel = document.querySelector("#recordLabel");
const recordingOrbit = document.querySelector("#recordingOrbit");
const timer = document.querySelector("#timer");
const meter = document.querySelector("#meter");
const language = document.querySelector("#language");
const form = document.querySelector("#form");
const noteBody = document.querySelector("#noteBody");
const noteTitle = document.querySelector("#noteTitle");
const noteDate = document.querySelector("#noteDate");
const saveButton = document.querySelector("#saveButton");
const autosaveStatus = document.querySelector("#autosaveStatus");
const statusLight = document.querySelector("#statusLight");
const statusTitle = document.querySelector("#statusTitle");
const statusDetail = document.querySelector("#statusDetail");
const provenance = document.querySelector("#provenance");
const paper = document.querySelector(".paper");
const previousPage = document.querySelector("#previousPage");
const nextPage = document.querySelector("#nextPage");
const newDraftButton = document.querySelector("#newDraftButton");
const editArchiveButton = document.querySelector("#editArchiveButton");
const deletePageButton = document.querySelector("#deletePageButton");
const draftPage = document.querySelector("#draftPage");
const pageKind = document.querySelector("#pageKind");
const pageCount = document.querySelector("#pageCount");
const folio = document.querySelector("#folio");

const aervellum = window.aervellum || window.vellum || {
  async config() {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) throw new Error("The private host is unavailable.");
    return response.json();
  },
  async transcribe(payload) {
    const response = await fetch(`/api/transcribe?language=${encodeURIComponent(payload.language)}`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: payload.wavBytes,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Transcription failed.");
    return result;
  },
  async saveNote(payload) {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Saving the note failed.");
    return result;
  },
  async listNotes() {
    const response = await fetch("/api/notes", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Loading the archive failed.");
    return result.notes || [];
  },
  async getNote(id) {
    const response = await fetch(`/api/notes/${encodeURIComponent(id)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Loading that page failed.");
    return result;
  },
  async getArchiveCount(options = {}) {
    const exclude = options.exclude ? `?exclude=${encodeURIComponent(options.exclude)}` : "";
    const response = await fetch(`/api/archive${exclude}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Loading the archive failed.");
    return result;
  },
  async getArchivePage(index, options = {}) {
    const exclude = options.exclude ? `?exclude=${encodeURIComponent(options.exclude)}` : "";
    const response = await fetch(`/api/archive/${index}${exclude}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Loading that page failed.");
    return result;
  },
  async deleteArchiveEntry(id) {
    const response = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 404 && result.error === "Not found.") {
        throw new Error("Delete is not available on the running host yet. Restart the private host and refresh this page.");
      }
      throw new Error(result.error || "Deleting that page failed.");
    }
    return result;
  },
};

let audioContext;
let mediaStream;
let sourceNode;
let processorNode;
let analyser;
let silenceGain;
let chunks = [];
let recording = false;
let startedAt = 0;
let timerHandle;
let animationHandle;
let archiveCount = 0;
let archiveRecords = [];
let currentPageIndex = 0;
let pageChangeLocked = false;
let wheelLocked = false;
let pointerStart;
let autosaveTimer;
let autosaveFadeTimer;
let saveInFlight = false;
let saveAgainAfterCurrent = false;
let archiveEditSession = null;
const noteCache = new Map();

const draft = {
  title: "Dear diary",
  text: "",
  form: "diary",
  empty: true,
  provenance: "Recorded and transcribed entirely on this device.",
  created: "",
  recording: "",
  noteFile: "",
  dirty: false,
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long", year: "numeric", month: "long", day: "numeric",
});

noteDate.textContent = dateFormatter.format(new Date());

function setStatus(kind, title, detail) {
  statusLight.className = `status-light ${kind}`;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function drawMeter() {
  const ctx = meter.getContext("2d");
  const values = new Uint8Array(analyser ? analyser.frequencyBinCount : 64);
  if (analyser) analyser.getByteTimeDomainData(values);

  ctx.clearRect(0, 0, meter.width, meter.height);
  ctx.strokeStyle = recording ? "#c97058" : "#77746b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = index / (values.length - 1) * meter.width;
    const y = (value / 255) * meter.height;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  animationHandle = requestAnimationFrame(drawMeter);
}

function downsample(input, inputRate, outputRate = 16000) {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const output = new Float32Array(Math.round(input.length / ratio));
  for (let i = 0; i < output.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let total = 0;
    for (let j = start; j < end; j += 1) total += input[j];
    output[i] = total / Math.max(1, end - start);
  }
  return output;
}

function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
  });
  return new Uint8Array(buffer);
}

function mergeChunks(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  parts.forEach((part) => {
    merged.set(part, offset);
    offset += part.length;
  });
  return merged;
}

function shapeAsPoem(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[,;:—.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function applyFormAppearance(allowDefaultTitle = currentPageIndex === 0) {
  const isPoem = form.value === "poem";
  const isDiary = form.value === "diary";
  noteBody.classList.toggle("poem", isPoem);
  noteBody.classList.toggle("diary", isDiary);

  if (noteBody.classList.contains("empty")) {
    noteBody.textContent = isDiary
      ? "Tell the page what today felt like."
      : "Your words will settle here.";
  }

  if (allowDefaultTitle && isDiary && noteTitle.value === "An untitled voice note") {
    noteTitle.value = "Dear diary";
  } else if (allowDefaultTitle && !isDiary && noteTitle.value === "Dear diary") {
    noteTitle.value = "An untitled voice note";
  }
}

function captureDraft() {
  if (currentPageIndex !== 0) return;
  draft.title = noteTitle.value;
  draft.text = noteBody.classList.contains("empty") ? "" : noteBody.textContent;
  draft.form = form.value;
  draft.empty = noteBody.classList.contains("empty");
  draft.provenance = provenance.textContent;
  draft.created = draft.created || "";
  draft.recording = draft.recording || "";
  draft.noteFile = draft.noteFile || "";
}

function resetDraft() {
  draft.title = "Dear diary";
  draft.text = "";
  draft.form = "diary";
  draft.empty = true;
  draft.provenance = "Recorded and transcribed entirely on this device.";
  draft.created = "";
  draft.recording = "";
  draft.noteFile = "";
  draft.dirty = false;
}

function draftHasContent() {
  return Boolean(draft.recording || draft.text.trim() || !draft.empty || draft.title !== "Dear diary");
}

function activeArchiveExclude() {
  return draft.noteFile || "";
}

function activeArchiveId() {
  return draft.noteFile ? `note:${draft.noteFile}` : "";
}

function browsableArchiveRecords() {
  const activeId = activeArchiveId();
  return activeId ? archiveRecords.filter((entry) => entry.id !== activeId) : archiveRecords;
}

function noteFileFromArchiveId(id) {
  return typeof id === "string" && id.startsWith("note:") ? id.slice("note:".length) : "";
}

function markDraftDirty() {
  if (archiveEditSession) {
    archiveEditSession.dirty = true;
  } else if (currentPageIndex === 0) {
    draft.dirty = true;
  } else {
    return;
  }
  updatePageNavigation();
  if (autosaveTimer) window.clearTimeout(autosaveTimer);
  if (!noteBody.textContent.trim() || noteBody.classList.contains("empty")) return;
  autosaveTimer = window.setTimeout(() => saveCurrentDraft({ automatic: true }), 900);
}

function showAutosaveStatus() {
  if (!autosaveStatus) return;
  autosaveStatus.classList.add("visible");
  if (autosaveFadeTimer) window.clearTimeout(autosaveFadeTimer);
  autosaveFadeTimer = window.setTimeout(() => {
    autosaveStatus.classList.remove("visible");
  }, 2000);
}

async function saveCurrentDraft({ automatic = false } = {}) {
  const editingArchive = Boolean(archiveEditSession);
  if (currentPageIndex !== 0 && !editingArchive) return null;
  if (!editingArchive) captureDraft();
  const text = noteBody.classList.contains("empty") ? "" : noteBody.textContent.trim();
  if (!text) return null;

  if (saveInFlight) {
    saveAgainAfterCurrent = true;
    return null;
  }

  saveInFlight = true;
  saveButton.disabled = true;
  try {
    const result = await aervellum.saveNote({
      title: noteTitle.value,
      text: noteBody.textContent,
      form: form.value,
      recording: editingArchive ? archiveEditSession.recording : draft.recording,
      noteFile: editingArchive ? archiveEditSession.noteFile : draft.noteFile,
    });
    if (editingArchive) {
      archiveEditSession.title = noteTitle.value;
      archiveEditSession.text = noteBody.textContent;
      archiveEditSession.form = form.value;
      archiveEditSession.dirty = false;
    } else {
      draft.noteFile = result.noteFile || (result.file ? result.file.split(/[\\/]/).pop() : draft.noteFile);
      draft.dirty = false;
      captureDraft();
    }
    await refreshArchive({ clearCache: true });
    if (editingArchive) noteCache.set(currentPageIndex - 1, { ...archiveEditSession });
    if (automatic) {
      showAutosaveStatus();
    } else {
      showAutosaveStatus();
      if (editingArchive) {
        archiveEditSession = null;
        setArchiveMode(true);
      }
      setStatus(
        "ready",
        editingArchive ? "Saved archive entry" : (result.updated || draft.noteFile ? "Saved" : "Saved to the archive"),
        result.file,
      );
    }
    return result;
  } catch (error) {
    setStatus("error", automatic ? "Autosave failed" : "Could not save the page", error.message);
    return null;
  } finally {
    saveInFlight = false;
    saveButton.disabled = (!archiveEditSession && currentPageIndex !== 0) || !noteBody.textContent.trim();
    if (saveAgainAfterCurrent) {
      saveAgainAfterCurrent = false;
      markDraftDirty();
    } else {
      updatePageNavigation();
    }
  }
}

function setArchiveMode(isArchive) {
  paper.classList.toggle("archive-page", isArchive);
  noteTitle.readOnly = isArchive;
  noteBody.contentEditable = String(!isArchive);
  noteBody.setAttribute("aria-readonly", String(isArchive));
  form.disabled = isArchive;
  saveButton.disabled = isArchive || !noteBody.textContent.trim();
  saveButton.textContent = isArchive ? "Archived page" : "Save";
  editArchiveButton.disabled = !isArchive;
  newDraftButton.disabled = isArchive ? false : !(draft.noteFile && !draft.dirty && !saveInFlight);
  deletePageButton.disabled = isArchive ? false : !(draft.noteFile && !saveInFlight);
}

function updatePageNavigation() {
  const total = archiveCount + 1;
  const editingArchive = Boolean(archiveEditSession);
  previousPage.disabled = editingArchive || currentPageIndex === 0;
  nextPage.disabled = editingArchive || currentPageIndex >= total - 1;
  newDraftButton.disabled = editingArchive || (currentPageIndex === 0
    ? !(draft.noteFile && !draft.dirty && !saveInFlight)
    : false);
  deletePageButton.disabled = editingArchive || (currentPageIndex === 0
    ? !(draft.noteFile && !saveInFlight)
    : false);
  draftPage.disabled = editingArchive;
  editArchiveButton.disabled = editingArchive || currentPageIndex === 0;
  pageKind.textContent = editingArchive
    ? "Editing archive"
    : (currentPageIndex === 0
      ? (draft.noteFile ? "Current entry" : "Current draft")
      : "Archive");
  pageCount.textContent = `${currentPageIndex + 1} / ${Math.max(1, total)}`;
  folio.textContent = String(currentPageIndex + 1).padStart(3, "0");
}

async function createNewDraft() {
  if (draft.dirty && !window.confirm("Discard unsaved changes and start a fresh page?")) return;
  resetDraft();
  noteCache.clear();
  await refreshArchive({ clearCache: true });
  currentPageIndex = -1;
  await showPage(0, -1);
  setStatus("ready", "New draft", "A fresh page is ready.");
  window.setTimeout(() => noteBody.focus(), 120);
}

async function editCurrentArchivePage() {
  if (currentPageIndex === 0 || pageChangeLocked) return;
  const archiveIndex = currentPageIndex - 1;
  let entry = noteCache.get(archiveIndex);

  try {
    if (!entry) {
      const record = browsableArchiveRecords()[archiveIndex];
      if (!record) throw new Error("That archived page is no longer available.");
      entry = await aervellum.getNote(record.id);
    }

    const noteFile = noteFileFromArchiveId(entry.id);
    if (!noteFile) throw new Error("Only Markdown archive pages can be edited.");

    archiveEditSession = {
      ...entry,
      noteFile,
      dirty: false,
    };
    setArchiveMode(false);
    updatePageNavigation();
    setStatus("ready", "Editing archived page", `${entry.title} will remain on page ${currentPageIndex}.`);
    window.setTimeout(() => noteBody.focus(), 120);
  } catch (error) {
    setStatus("error", "Could not edit the page", error.message);
  }
}

function getCurrentDeleteTarget() {
  if (currentPageIndex === 0) {
    if (!draft.noteFile) return null;
    return {
      id: `note:${draft.noteFile}`,
      title: noteTitle.value || "Current entry",
      currentEntry: true,
    };
  }

  const archiveIndex = currentPageIndex - 1;
  const entry = noteCache.get(archiveIndex);
  if (!entry?.id) return null;
  return {
    id: entry.id,
    title: entry.title,
    currentEntry: false,
  };
}

async function deleteCurrentPage() {
  const target = getCurrentDeleteTarget();
  if (!target) {
    setStatus("error", "Could not delete", "This saved page has not finished loading.");
    return;
  }

  const extraWarning = target.currentEntry && draft.dirty
    ? " Any unsaved changes on this page will be discarded."
    : "";
  if (!window.confirm(`Move "${target.title}" to the local trash?${extraWarning}`)) return;

  if (autosaveTimer) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  deletePageButton.disabled = true;
  try {
    setStatus("busy", "Crumpling the page", "Moving the entry into the local trash.");
    await playPaperCrumple();
    const result = await aervellum.deleteArchiveEntry(target.id);
    noteCache.clear();
    await refreshArchive({ clearCache: true });

    if (target.currentEntry) {
      resetDraft();
      currentPageIndex = -1;
      await showPage(0, -1);
    } else {
      const nextPageIndex = Math.min(currentPageIndex, archiveCount);
      currentPageIndex = -1;
      await showPage(nextPageIndex, -1);
    }

    setStatus("ready", "Moved to trash", `${result.moved?.length || 0} file(s) moved to ${result.trash}.`);
  } catch (error) {
    setStatus("error", "Could not delete the page", error.message);
  } finally {
    updatePageNavigation();
  }
}

async function showPage(index, direction = 0) {
  if (archiveEditSession && index !== currentPageIndex) return;
  await refreshArchive({ clearCache: false });
  const bounded = Math.max(0, Math.min(index, archiveCount));
  if (bounded === currentPageIndex && !pageChangeLocked) return;
  if (pageChangeLocked) return;

  if (currentPageIndex === 0 && bounded > 0 && draft.dirty) {
    setStatus("busy", "Saving current page", "Keeping your edits before opening another saved entry.");
    const result = await saveCurrentDraft({ automatic: true });
    if (!result && draftHasContent()) {
      setStatus("error", "Could not change pages", "Save the current page before opening another entry.");
      return;
    }
  }

  pageChangeLocked = true;
  captureDraft();
  paper.classList.add(direction < 0 ? "turning-right" : "turning-left");

  try {
    if (bounded === 0) {
      currentPageIndex = 0;
      noteTitle.value = draft.title;
      form.value = draft.form;
      noteBody.textContent = draft.empty
        ? (draft.form === "diary" ? "Tell the page what today felt like." : "Your words will settle here.")
        : draft.text;
      noteBody.classList.toggle("empty", draft.empty);
      const draftCreated = draft.created ? new Date(draft.created) : new Date();
      noteDate.textContent = Number.isNaN(draftCreated.getTime())
        ? dateFormatter.format(new Date())
        : dateFormatter.format(draftCreated);
      provenance.textContent = draft.provenance;
      setArchiveMode(false);
      applyFormAppearance();
    } else {
      const archiveIndex = bounded - 1;
      const record = browsableArchiveRecords()[archiveIndex];
      setStatus("busy", "Turning the page", "Opening a saved entry from the local archive.");
      const entry = await aervellum.getNote(record.id);
      noteCache.set(archiveIndex, entry);

      currentPageIndex = bounded;
      noteTitle.value = entry.title;
      form.value = entry.form;
      noteBody.textContent = entry.text || "";
      noteBody.classList.toggle("empty", !entry.text?.trim());
      const created = new Date(entry.created);
      noteDate.textContent = Number.isNaN(created.getTime())
        ? "Saved entry"
        : dateFormatter.format(created);
      provenance.textContent = "Saved privately in your local Aervellum archive.";
      setArchiveMode(true);
      applyFormAppearance(false);
      setStatus("ready", "Archived page", `Press Edit to focus on ${entry.title}.`);
    }
    updatePageNavigation();
    noteBody.scrollTop = 0;
  } catch (error) {
    setStatus("error", "Could not turn the page", error.message);
  } finally {
    window.setTimeout(() => {
      paper.classList.remove("turning-left", "turning-right");
      pageChangeLocked = false;
    }, 180);
  }
}

async function refreshArchive({ clearCache = false } = {}) {
  const records = await aervellum.listNotes();
  const previousIds = archiveRecords.map((entry) => entry.id).join("\n");
  const nextIds = records.map((entry) => entry.id).join("\n");
  if (clearCache || nextIds !== previousIds) noteCache.clear();
  archiveRecords = records;
  archiveCount = browsableArchiveRecords().length;
  if (currentPageIndex > archiveCount) currentPageIndex = archiveCount;
  updatePageNavigation();
}

async function prefetchPage(index) {
  if (index < 0 || index >= archiveCount || noteCache.has(index)) return;
  try {
    const page = await aervellum.getArchivePage(index, { exclude: activeArchiveExclude() });
    archiveCount = page.count;
    noteCache.set(index, page.entry);
    updatePageNavigation();
  } catch {
    // Prefetch is opportunistic; the visible page reports errors when needed.
  }
}

function prefetchAdjacent(index) {
  prefetchPage(index - 1);
  prefetchPage(index + 1);
}

function playPaperCrumple() {
  return new Promise((resolve) => {
    paper.classList.remove("crumpling");
    void paper.offsetWidth;
    paper.classList.add("crumpling");
    window.setTimeout(() => {
      paper.classList.remove("crumpling");
      resolve();
    }, 560);
  });
}

async function startRecording() {
  if (currentPageIndex !== 0) await showPage(0, -1);
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processorNode = audioContext.createScriptProcessor(4096, 1, 1);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 128;
  silenceGain = audioContext.createGain();
  silenceGain.gain.value = 0;
  chunks = [];

  processorNode.onaudioprocess = (event) => {
    if (recording) chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  sourceNode.connect(analyser);
  sourceNode.connect(processorNode);
  processorNode.connect(silenceGain);
  silenceGain.connect(audioContext.destination);

  recording = true;
  startedAt = Date.now();
  recordingOrbit.classList.add("recording");
  recordLabel.textContent = "Stop";
  setStatus("busy", "Listening locally", "Tap stop when the thought has found its ending.");
  timerHandle = setInterval(() => { timer.textContent = formatTime(Date.now() - startedAt); }, 250);
}

async function stopRecording() {
  recording = false;
  clearInterval(timerHandle);
  recordingOrbit.classList.remove("recording");
  recordLabel.textContent = "Record";
  recordButton.disabled = true;

  sourceNode.disconnect();
  processorNode.disconnect();
  analyser.disconnect();
  silenceGain.disconnect();
  mediaStream.getTracks().forEach((track) => track.stop());
  const sourceRate = audioContext.sampleRate;
  await audioContext.close();

  const samples = downsample(mergeChunks(chunks), sourceRate);
  if (samples.length < 8000) {
    recordButton.disabled = false;
    setStatus("error", "That was a little too brief", "Record at least half a second so Whisper has something to hear.");
    return;
  }

  setStatus("busy", "Transcribing locally", "The Whisper model is working entirely on this device.");
  try {
    const result = await aervellum.transcribe({
      wavBytes: encodeWav(samples),
      language: language.value,
    });
    const text = form.value === "poem" ? shapeAsPoem(result.text) : result.text;
    noteBody.textContent = text;
    noteBody.classList.remove("empty");
    applyFormAppearance();
    saveButton.disabled = false;
    const accelerator = result.accelerator || result.gpu || "Local processor";
    provenance.textContent = `${accelerator} · audio kept in ${result.audioFile}`;
    draft.recording = result.transcriptFile;
    captureDraft();
    markDraftDirty();
    saveCurrentDraft({ automatic: true });
    await refreshArchive({ clearCache: true });
    setStatus("ready", "The page is ready", `Transcribed with ${accelerator}.`);
  } catch (error) {
    setStatus("error", "Transcription stumbled", error.message);
  } finally {
    recordButton.disabled = false;
  }
}

recordButton.addEventListener("click", async () => {
  try {
    if (recording) await stopRecording();
    else await startRecording();
  } catch (error) {
    recording = false;
    recordButton.disabled = false;
    recordingOrbit.classList.remove("recording");
    recordLabel.textContent = "Record";
    setStatus("error", "Microphone unavailable", error.message);
  }
});

form.addEventListener("change", () => {
  if (currentPageIndex !== 0 && !archiveEditSession) return;
  if (!noteBody.classList.contains("empty")) {
    const current = noteBody.textContent.replace(/\n+/g, " ").trim();
    noteBody.textContent = form.value === "poem" ? shapeAsPoem(current) : current;
  }
  applyFormAppearance();
  captureDraft();
  markDraftDirty();
});

noteBody.addEventListener("focus", () => {
  if (noteBody.classList.contains("empty")) {
    noteBody.textContent = "";
    noteBody.classList.remove("empty");
  }
});

noteBody.addEventListener("input", () => {
  saveButton.disabled = !noteBody.textContent.trim();
  captureDraft();
  markDraftDirty();
});

noteTitle.addEventListener("input", () => {
  captureDraft();
  markDraftDirty();
});

saveButton.addEventListener("click", () => saveCurrentDraft({ automatic: false }));

previousPage.addEventListener("click", () => showPage(currentPageIndex - 1, -1));
nextPage.addEventListener("click", () => showPage(currentPageIndex + 1, 1));
newDraftButton.addEventListener("click", createNewDraft);
editArchiveButton.addEventListener("click", editCurrentArchivePage);
deletePageButton.addEventListener("click", deleteCurrentPage);
draftPage.addEventListener("click", () => {
  if (currentPageIndex !== 0) showPage(0, -1);
});

paper.addEventListener("pointerdown", (event) => {
  if (archiveEditSession) return;
  if (currentPageIndex === 0 && event.target.closest("#noteBody, #noteTitle")) return;
  pointerStart = { x: event.clientX, y: event.clientY };
});

paper.addEventListener("pointerup", (event) => {
  if (!pointerStart) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = undefined;
  if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
  if (dx < 0) showPage(currentPageIndex + 1, 1);
  else showPage(currentPageIndex - 1, -1);
});

paper.addEventListener("wheel", (event) => {
  if (wheelLocked || Math.abs(event.deltaX) < Math.abs(event.deltaY) || Math.abs(event.deltaX) < 18) return;
  event.preventDefault();
  wheelLocked = true;
  showPage(currentPageIndex + (event.deltaX > 0 ? 1 : -1), event.deltaX > 0 ? 1 : -1);
  window.setTimeout(() => { wheelLocked = false; }, 450);
}, { passive: false });

document.addEventListener("keydown", (event) => {
  const editing = document.activeElement === noteTitle || document.activeElement === noteBody;
  if (editing) return;
  if (event.key === "ArrowLeft") showPage(currentPageIndex - 1, -1);
  if (event.key === "ArrowRight") showPage(currentPageIndex + 1, 1);
});

aervellum.config().then(async (config) => {
  if (config.binaryReady && config.modelReady) {
    const backend = config.preferredBackend && config.preferredBackend !== "auto"
      ? `${config.preferredBackend.toUpperCase()} runtime`
      : "portable whisper runtime";
    setStatus("ready", "Local transcription is ready", `${config.modelName} · ${backend}`);
    recordButton.disabled = false;
    await refreshArchive({ clearCache: true });
  } else {
    setStatus("error", "The desk is incomplete", "Run the workspace setup before recording.");
    recordButton.disabled = true;
  }
}).catch((error) => setStatus("error", "Could not inspect the local setup", error.message));

window.setInterval(() => {
  if (!recording) refreshArchive({ clearCache: false }).catch(() => {});
}, 15000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshArchive({ clearCache: true }).catch(() => {});
});

recordButton.disabled = true;
applyFormAppearance();
drawMeter();
