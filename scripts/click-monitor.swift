import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

NSEvent.addGlobalMonitorForEvents(matching: .leftMouseDown) { _ in
  let loc = NSEvent.mouseLocation
  let screenH = NSScreen.screens.first?.frame.height ?? 0
  let x = loc.x
  let y = screenH - loc.y
  print("\(x),\(y)")
  fflush(stdout)
}

app.run()
