import Combine
import Foundation
import WhisperKit

@MainActor
final class LocalTranscriber: ObservableObject {
    enum State: Equatable {
        case notInstalled
        case loading
        case ready
        case transcribing
        case failed(String)

        var label: String {
            switch self {
            case .notInstalled: "Model not loaded"
            case .loading: "Preparing the local model…"
            case .ready: "Ready offline"
            case .transcribing: "Listening back on this iPhone…"
            case .failed(let message): message
            }
        }
    }

    static let supportedModels = ["tiny", "base", "small"]

    @Published private(set) var state: State = .notInstalled
    @Published private(set) var progress: Double = 0
    @Published var selectedModel: String {
        didSet {
            UserDefaults.standard.set(selectedModel, forKey: "selectedWhisperModel")
        }
    }

    private var whisperKit: WhisperKit?

    init() {
        selectedModel = UserDefaults.standard.string(forKey: "selectedWhisperModel") ?? "base"
    }

    func prepare() async {
        guard whisperKit == nil, state != .loading else { return }
        state = .loading
        progress = 0.08

        do {
            let config = WhisperKitConfig(
                model: selectedModel,
                verbose: false,
                prewarm: true,
                load: true
            )
            progress = 0.2
            whisperKit = try await WhisperKit(config)
            progress = 1
            state = .ready
        } catch {
            whisperKit = nil
            state = .failed("Model setup failed: \(error.localizedDescription)")
        }
    }

    func changeModel(to model: String) async {
        guard Self.supportedModels.contains(model) else { return }
        selectedModel = model
        whisperKit = nil
        state = .notInstalled
        progress = 0
        await prepare()
    }

    func transcribe(audioURL: URL) async throws -> String {
        if whisperKit == nil {
            await prepare()
        }
        guard let whisperKit else {
            throw TranscriptionError.modelUnavailable
        }

        state = .transcribing
        defer {
            try? FileManager.default.removeItem(at: audioURL)
        }

        do {
            let results = try await whisperKit.transcribe(audioPath: audioURL.path)
            let text = results
                .map(\.text)
                .joined(separator: " ")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            state = .ready
            guard !text.isEmpty else {
                throw TranscriptionError.emptyResult
            }
            return text
        } catch {
            state = .failed("Transcription failed: \(error.localizedDescription)")
            throw error
        }
    }
}

enum TranscriptionError: LocalizedError {
    case modelUnavailable
    case emptyResult

    var errorDescription: String? {
        switch self {
        case .modelUnavailable:
            "The local speech model is not available."
        case .emptyResult:
            "No speech was found in that recording."
        }
    }
}
