import SwiftUI

struct ModelSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var transcriber: LocalTranscriber
    @State private var chosenModel: String

    init(transcriber: LocalTranscriber) {
        self.transcriber = transcriber
        _chosenModel = State(initialValue: transcriber.selectedModel)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("On-device speech model") {
                    Picker("Model", selection: $chosenModel) {
                        Text("Tiny · fastest").tag("tiny")
                        Text("Base · recommended").tag("base")
                        Text("Small · more accurate").tag("small")
                    }

                    Text(modelAdvice)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Privacy") {
                    Label("Audio is processed on this iPhone", systemImage: "iphone")
                    Label("Entries use private app storage", systemImage: "lock.fill")
                    Text("The selected model downloads once from Hugging Face. After setup, recording and transcription work without a network connection.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    HStack {
                        Text("Status")
                        Spacer()
                        Text(transcriber.state.label)
                            .foregroundStyle(.secondary)
                    }

                    if case .loading = transcriber.state {
                        ProgressView(value: transcriber.progress)
                    }
                }
            }
            .navigationTitle("Local model")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Apply") {
                        Task {
                            await transcriber.changeModel(to: chosenModel)
                            dismiss()
                        }
                    }
                    .disabled(chosenModel == transcriber.selectedModel)
                }
            }
        }
    }

    private var modelAdvice: String {
        switch chosenModel {
        case "tiny":
            "Best battery life, but more transcription mistakes."
        case "small":
            "Better accuracy, with longer waits and more heat on an iPhone 14 Pro."
        default:
            "The best starting balance for personal diary dictation."
        }
    }
}

