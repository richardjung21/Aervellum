const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

// Run against an isolated archive, never the user's recordings or notes.
async function main() {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "aervellum-archive-"));
  try {
    await fs.mkdir(path.join(sandbox, "app"));
    await fs.copyFile(path.join(__dirname, "../app/local-service.js"), path.join(sandbox, "app/local-service.js"));
    const service = require(path.join(sandbox, "app/local-service.js"));
    await service.ensureDirectories();
    const firstRecording = "2026-11-06T10-00-00-000Z-transcript.txt";
    const secondRecording = "2026-11-06T10-01-00-000Z-transcript.txt";
    await fs.writeFile(path.join(sandbox, "outputs/audio", firstRecording), "The first diary recording.");

    // Archive polling and autosave can arrive together after transcription.
    const [, firstSave] = await Promise.all([
      service.listNotes(),
      service.saveNote({title: "Dear diary", form: "diary", text: "The first diary recording.", recording: firstRecording}),
      service.listNotes(),
    ]);
    assert.equal((await service.listNotes()).length, 1, "Polling and autosave must create only one entry");
    await fs.writeFile(path.join(sandbox, "outputs/audio", secondRecording), "The second diary recording.");
    const [secondSave] = await Promise.all([
      service.saveNote({title: "Dear diary", form: "diary", text: "The second diary recording.", recording: secondRecording}),
      service.listNotes(),
      service.listNotes(),
    ]);
    assert.notEqual(firstSave.noteFile, secondSave.noteFile);
    assert.equal((await service.listNotes()).length, 2, "Each recording must have exactly one archived entry");
    const firstNote = await service.getNote(`note:${firstSave.noteFile}`);
    assert.equal(firstNote.text, "The first diary recording.", "Recording again must preserve the previous entry");
    await service.saveNote({title: "Edited diary", form: "diary", text: "Edited second entry.", recording: secondRecording, noteFile: secondSave.noteFile});
    assert.equal((await service.listNotes()).length, 2, "Editing a transcript must not recreate its raw recording entry");
    console.log("Recording/archive regression checks passed.");
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
