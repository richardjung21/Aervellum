import SwiftUI

enum AervellumTheme {
    static let desk = Color(red: 0.12, green: 0.115, blue: 0.095)
    static let paper = Color(red: 0.94, green: 0.91, blue: 0.84)
    static let ink = Color(red: 0.16, green: 0.15, blue: 0.125)
    static let rust = Color(red: 0.62, green: 0.29, blue: 0.21)
    static let moss = Color(red: 0.49, green: 0.55, blue: 0.43)
    static let muted = Color(red: 0.63, green: 0.61, blue: 0.56)
}

struct PaperBackground: View {
    var lined = true

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(AervellumTheme.paper)

            if lined {
                Canvas { context, size in
                    var path = Path()
                    stride(from: 70.0, through: size.height - 36, by: 32).forEach { y in
                        path.move(to: CGPoint(x: 22, y: y))
                        path.addLine(to: CGPoint(x: size.width - 22, y: y))
                    }
                    context.stroke(
                        path,
                        with: .color(AervellumTheme.ink.opacity(0.09)),
                        lineWidth: 0.7
                    )
                }
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
        }
        .shadow(color: .black.opacity(0.3), radius: 22, y: 14)
    }
}
