import SwiftData
import SwiftUI

struct DiaryLibraryView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \DiaryEntry.createdAt, order: .reverse) private var entries: [DiaryEntry]
    @State private var composing = false
    @State private var showingSettings = false
    @StateObject private var transcriber = LocalTranscriber()

    var body: some View {
        NavigationStack {
            ZStack {
                AervellumTheme.desk.ignoresSafeArea()

                if entries.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        LazyVStack(spacing: 14) {
                            ForEach(entries) { entry in
                                NavigationLink {
                                    DiaryEntryView(entry: entry)
                                } label: {
                                    DiaryEntryCard(entry: entry)
                                }
                                .buttonStyle(.plain)
                                .swipeActions {
                                    Button(role: .destructive) {
                                        delete(entry)
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                        }
                        .padding(18)
                    }
                }
            }
            .navigationTitle("Aervellum")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        composing = true
                    } label: {
                        Label("New diary entry", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $composing) {
                DiaryComposerView(transcriber: transcriber)
            }
            .sheet(isPresented: $showingSettings) {
                ModelSettingsView(transcriber: transcriber)
            }
            .task {
                await transcriber.prepare()
            }
        }
        .tint(AervellumTheme.rust)
    }

    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("A private listening diary")
                .font(.caption.weight(.semibold))
                .tracking(2)
                .foregroundStyle(AervellumTheme.muted)
                .textCase(.uppercase)

            Text("Speak while the day\nis still alive.")
                .font(.system(size: 39, weight: .regular, design: .serif))
                .multilineTextAlignment(.center)

            Text("Your recordings and words stay on this iPhone.")
                .font(.system(.body, design: .serif))
                .foregroundStyle(AervellumTheme.muted)
                .multilineTextAlignment(.center)

            Button {
                composing = true
            } label: {
                Label("Begin an entry", systemImage: "waveform")
                    .fontWeight(.semibold)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 14)
                    .background(AervellumTheme.rust, in: Capsule())
            }

            Text(transcriber.state.label)
                .font(.caption)
                .foregroundStyle(AervellumTheme.muted)
            Spacer()
        }
        .padding(32)
    }

    private func delete(_ entry: DiaryEntry) {
        modelContext.delete(entry)
        try? modelContext.save()
    }
}

private struct DiaryEntryCard: View {
    let entry: DiaryEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(entry.createdAt.formatted(date: .complete, time: .omitted))
                .font(.caption.weight(.semibold))
                .tracking(1.3)
                .foregroundStyle(AervellumTheme.ink.opacity(0.55))
                .textCase(.uppercase)

            Text(entry.title)
                .font(.system(.title3, design: .serif, weight: .semibold))
                .foregroundStyle(AervellumTheme.ink)

            Text(entry.body)
                .font(.system(.body, design: .serif))
                .foregroundStyle(AervellumTheme.ink.opacity(0.72))
                .lineLimit(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(PaperBackground(lined: false))
    }
}
