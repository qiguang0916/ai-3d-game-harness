// Native hardware-path input automation for authorized macOS game testing.
// This emits actual CGEvents; it is NOT KnifeControlFrame replay. It refuses
// to act unless Accessibility is authorized and the exact target app is front.
import Foundation
import AppKit
import ApplicationServices

func result(_ pass: Bool, _ status: String, _ detail: String, _ extras: [String: Any] = [:]) {
    var payload: [String: Any] = ["passed": pass, "status": status, "detail": detail,
                                "source": "native-macos-input"]
    for (key, value) in extras { payload[key] = value }
    if let json = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
       let line = String(data: json, encoding: .utf8) { print(line) }
}

func fail(_ detail: String, code: Int32 = 2) -> Never {
    result(false, "BLOCKED", detail)
    exit(code)
}

let args = Array(CommandLine.arguments.dropFirst())
func argument(_ key: String) -> String? {
    guard let index = args.firstIndex(of: key), index + 1 < args.count else { return nil }
    return args[index + 1]
}
let mode = args.contains("--probe") ? "probe" :
           args.contains("--key") ? "key" :
           args.contains("--drag") ? "drag" : "unknown"
if mode == "unknown" { fail("only --probe, --key or --drag are allowed") }
guard AXIsProcessTrusted() else {
    fail("Accessibility access is not authorized for this executable. Enable it under macOS Privacy & Security > Accessibility.")
}
if mode == "probe" {
    result(true, "READY", "Accessibility authorized; input actions can be tested")
    exit(0)
}
guard let pidText = argument("--pid"), let pid = Int32(pidText), pid > 0 else {
    fail("missing exact target PID")
}
guard let expected = argument("--expected-app"), !expected.isEmpty else {
    fail("missing target macOS .app path")
}
let app = URL(fileURLWithPath: expected).standardizedFileURL
guard app.pathExtension == "app",
      FileManager.default.fileExists(atPath: app.path),
      let running = NSRunningApplication(processIdentifier: pid) else {
    fail("app missing or target process is not running")
}
guard let runningExecutable = running.executableURL?.standardizedFileURL.path,
      runningExecutable.hasPrefix(app.path + "/Contents/MacOS/") else {
    fail("PID does not belong to the expected .app executable")
}
let frontPid = NSWorkspace.shared.frontmostApplication?.processIdentifier
guard frontPid == pid else {
    fail("wrong window focus: native input would target another application")
}
// Never emit mouse events at desktop/menu bar/other apps. CGWindow bounds
// are screen-space and obtained from the OS, not trusted user coordinates.
let windowList = CGWindowListCopyWindowInfo(
    [.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID
) as? [[String: Any]] ?? []
let targetWindows = windowList.compactMap { info -> CGRect? in
    let owner = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value
    let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? -1
    guard owner == pid, layer == 0 else { return nil }
    let bounds = info[kCGWindowBounds as String] as? [String: Any]
    guard let bounds = bounds,
          let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary),
          rect.width > 100, rect.height > 100 else { return nil }
    return rect
}
guard !targetWindows.isEmpty else {
    fail("no visible frontmost game window bounds available")
}
func isSafe(_ point: CGPoint) -> Bool {
    return targetWindows.contains(where: { $0.insetBy(dx: 6, dy: 6).contains(point) })
}

func mouse(_ type: CGEventType, _ point: CGPoint) {
    let button: CGMouseButton = .left
    guard let event = CGEvent(mouseEventSource: nil, mouseType: type,
                            mouseCursorPosition: point, mouseButton: button) else {
        fail("unable to create macOS mouse event")
    }
    event.post(tap: .cghidEventTap)
}

switch mode {
case "key":
    guard let rawCode = argument("--key"),
          let code = UInt16(rawCode), code <= 127 else {
        fail("invalid keyboard scan code")
    }
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true),
          let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false) else {
        fail("could not create keyboard events")
    }
    down.post(tap: .cghidEventTap)
    usleep(90_000)
    up.post(tap: .cghidEventTap)
    result(true, "SENT", "native keyboard events posted",
           ["pid": pid, "keyCode": code])
case "drag":
    guard let startX = argument("--x0").flatMap(Double.init),
          let startY = argument("--y0").flatMap(Double.init),
          let endX = argument("--x1").flatMap(Double.init),
          let endY = argument("--y1").flatMap(Double.init) else {
        fail("drag requires x0/y0/x1/y1 points")
    }
    let start = CGPoint(x: startX, y: startY)
    let end = CGPoint(x: endX, y: endY)
    guard isSafe(start) && isSafe(end) else {
        fail("drag endpoints must both be strictly inside the frontmost game window")
    }
    mouse(.mouseMoved, start)
    usleep(100_000)
    mouse(.leftMouseDown, start)
    for index in 1...30 {
        let t = Double(index) / 30.0
        let p = CGPoint(x: start.x + (end.x-start.x)*t,
                        y: start.y + (end.y-start.y)*t)
        mouse(.leftMouseDragged, p)
        usleep(12_000)
    }
    mouse(.leftMouseUp, end)
    result(true, "SENT", "native mouse drag events posted",
           ["pid": pid, "start": [startX, startY], "end": [endX, endY],
            "intermediateSteps": 30])
default: fail("unknown OS mode")
}
