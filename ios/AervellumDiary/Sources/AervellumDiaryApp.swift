import SwiftData
import SwiftUI

@main
struct AervellumDiaryApp: App {
    private let container: ModelContainer

    init() {
        do {
            container = try ModelContainer(for: DiaryEntry.self)
        } catch {
            fatalError("Unable to open the private diary store: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            DiaryLibraryView()
                .preferredColorScheme(.dark)
        }
        .modelContainer(container)
    }
}

