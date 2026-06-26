import SwiftData
import SwiftUI

struct DiaryEntryView: View {
    @Environment(\.modelContext) private var modelContext
    @Bindable var entry: DiaryEntry

    var body: some View {
        ZStack {
            AervellumTheme.desk.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(entry.createdAt.formatted(date: .complete, time: .omitted))
                        .font(.caption.weight(.semibold))
                        .tracking(1.2)
                        .foregroundStyle(AervellumTheme.ink.opacity(0.5))
                        .textCase(.uppercase)

                    TextField("Entry title", text: $entry.title)
                        .font(.system(.title2, design: .serif, weight: .semibold))

                    Divider()

                    TextEditor(text: $entry.body)
                        .scrollContentBackground(.hidden)
                        .font(.system(size: 19, design: .serif))
                        .lineSpacing(7)
                        .frame(minHeight: 520)

                    Text("Transcribed locally with Whisper \(entry.modelName)")
                        .font(.caption)
                        .italic()
                        .foregroundStyle(AervellumTheme.ink.opacity(0.46))
                }
                .foregroundStyle(AervellumTheme.ink)
                .padding(24)
                .background(PaperBackground())
                .padding(18)
            }
        }
        .navigationTitle(entry.title)
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear {
            entry.updatedAt = .now
            try? modelContext.save()
        }
    }
}
