import AVFoundation
import Combine
import Foundation

@MainActor
final class AudioRecorder: NSObject, ObservableObject, AVAudioRecorderDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var elapsed: TimeInterval = 0
    @Published private(set) var level: Float = 0

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var startedAt: Date?

    func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    func start() async throws {
        guard await requestPermission() else {
            throw RecordingError.permissionDenied
        }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true)

        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("aervellum-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]

        let recorder = try AVAudioRecorder(url: destination, settings: settings)
        recorder.delegate = self
        recorder.isMeteringEnabled = true
        recorder.prepareToRecord()
        guard recorder.record() else {
            throw RecordingError.couldNotStart
        }

        self.recorder = recorder
        startedAt = .now
        elapsed = 0
        isRecording = true
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let recorder = self.recorder else { return }
                recorder.updateMeters()
                self.level = max(0, min(1, pow(10, recorder.averagePower(forChannel: 0) / 20)))
                self.elapsed = Date.now.timeIntervalSince(self.startedAt ?? .now)
            }
        }
    }

    func stop() throws -> URL {
        guard let recorder else {
            throw RecordingError.noRecording
        }

        recorder.stop()
        timer?.invalidate()
        timer = nil
        self.recorder = nil
        isRecording = false
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false)
        return recorder.url
    }

    func discard() {
        if let url = recorder?.url {
            recorder?.stop()
            try? FileManager.default.removeItem(at: url)
        }
        timer?.invalidate()
        timer = nil
        recorder = nil
        isRecording = false
        elapsed = 0
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false)
    }
}

enum RecordingError: LocalizedError {
    case permissionDenied
    case couldNotStart
    case noRecording

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            "Microphone permission is required to write a spoken diary."
        case .couldNotStart:
            "The microphone could not begin recording."
        case .noRecording:
            "There is no recording to transcribe."
        }
    }
}
