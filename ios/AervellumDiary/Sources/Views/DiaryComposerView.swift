import SwiftData
import SwiftUI

struct DiaryComposerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @ObservedObject var transcriber: LocalTranscriber
    @StateObject private var recorder = AudioRecorder()

    @State private var title = "Dear diary"
    @State private var body = ""
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                AervellumTheme.desk.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 24) {
                        recorderSection
                        paper
                    }
                    .padding(18)
                }
            }
            .navigationTitle("New entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        recorder.discard()
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        .disabled(body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .alert("Aervellum", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
        .interactiveDismissDisabled(recorder.isRecording || isWorking)
    }

    private var recorderSection: some View {
        VStack(spacing: 14) {
            Button(action: toggleRecording) {
                ZStack {
                    Circle()
                        .stroke(AervellumTheme.rust.opacity(0.25), lineWidth: 1)
                        .frame(width: 148, height: 148)

                    Circle()
                        .fill(AervellumTheme.rust)
                        .frame(width: 108, height: 108)
                        .shadow(color: .black.opacity(0.25), radius: 14, y: 8)

                    VStack(spacing: 8) {
                        Image(systemName: recorder.isRecording ? "stop.fill" : "mic.fill")
                        Text(recorder.isRecording ? "Stop" : "Record")
                            .font(.caption.weight(.bold))
                            .tracking(1.4)
                            .textCase(.uppercase)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(isWorking)
            .scaleEffect(recorder.isRecording ? 1 + CGFloat(recorder.level * 0.04) : 1)
            .animation(.easeOut(duration: 0.1), value: recorder.level)

            Text(format(recorder.elapsed))
                .font(.caption.monospacedDigit())
                .foregroundStyle(AervellumTheme.muted)

            HStack(spacing: 8) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 7, height: 7)
                Text(isWorking ? "Transcribing locally…" : transcriber.state.label)
                    .font(.caption)
                    .foregroundStyle(AervellumTheme.muted)
            }
        }
    }

    private var paper: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(Date.now.formatted(date: .complete, time: .omitted))
                .font(.caption.weight(.semibold))
                .tracking(1.2)
                .foregroundStyle(AervellumTheme.ink.opacity(0.5))
                .textCase(.uppercase)

            TextField("Entry title", text: $title)
                .font(.system(.title2, design: .serif, weight: .semibold))

            Divider()

            TextEditor(text: $body)
                .scrollContentBackground(.hidden)
                .font(.system(size: 19, design: .serif))
                .lineSpacing(7)
                .frame(minHeight: 390)
                .overlay(alignment: .topLeading) {
                    if body.isEmpty {
                        Text("Tell the page what today felt like.")
                            .font(.system(size: 19, design: .serif))
                            .italic()
                            .foregroundStyle(AervellumTheme.ink.opacity(0.34))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 8)
                            .allowsHitTesting(false)
                    }
                }
        }
        .foregroundStyle(AervellumTheme.ink)
        .padding(24)
        .background(PaperBackground())
    }

    private var statusColor: Color {
        switch transcriber.state {
        case .failed: .red
        case .loading, .transcribing: .orange
        case .ready: AervellumTheme.moss
        case .notInstalled: AervellumTheme.muted
        }
    }

    private func toggleRecording() {
        Task {
            do {
                if recorder.isRecording {
                    let audioURL = try recorder.stop()
                    isWorking = true
                    let transcript = try await transcriber.transcribe(audioURL: audioURL)
                    body = body.isEmpty ? transcript : "\(body)\n\n\(transcript)"
                    isWorking = false
                } else {
                    try await recorder.start()
                }
            } catch {
                isWorking = false
                errorMessage = error.localizedDescription
            }
        }
    }

    private func save() {
        let entry = DiaryEntry(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Dear diary" : title,
            body: body.trimmingCharacters(in: .whitespacesAndNewlines),
            modelName: transcriber.selectedModel
        )
        modelContext.insert(entry)
        try? modelContext.save()
        dismiss()
    }

    private func format(_ interval: TimeInterval) -> String {
        let seconds = Int(interval)
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}

