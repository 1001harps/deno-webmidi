import CoreMIDI
import Foundation

// Listen on the IAC Driver for MIDI messages and print them as hex to stdout.
// Usage: swift midi_listener.swift [port_name]
// Exits after 5 seconds of inactivity or on SIGTERM.

let portName = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "IAC Driver Bus 1"

var client = MIDIClientRef()
var port = MIDIPortRef()

MIDIClientCreate("TestListener" as CFString, nil, nil, &client)

MIDIInputPortCreate(client, "Input" as CFString, { pktList, _, _ in
    let packets = pktList.pointee
    var packet = packets.packet
    for _ in 0..<packets.numPackets {
        let bytes = Mirror(reflecting: packet.data).children.prefix(Int(packet.length))
        let hex = bytes.map { String(format: "%02x", $0.value as! UInt8) }.joined(separator: " ")
        print(hex)
        fflush(stdout)
        packet = MIDIPacketNext(&packet).pointee
    }
}, nil, &port)

// Connect to all sources matching the port name
let sourceCount = MIDIGetNumberOfSources()
var connected = false
for i in 0..<sourceCount {
    let src = MIDIGetSource(i)
    var name: Unmanaged<CFString>?
    MIDIObjectGetStringProperty(src, kMIDIPropertyName, &name)
    if let n = name?.takeRetainedValue() as String?, n.contains(portName) {
        MIDIPortConnectSource(port, src, nil)
        connected = true
        FileHandle.standardError.write("Listening on: \(n)\n".data(using: .utf8)!)
    }
}

if !connected {
    FileHandle.standardError.write("No source matching '\(portName)' found. Available:\n".data(using: .utf8)!)
    for i in 0..<sourceCount {
        let src = MIDIGetSource(i)
        var name: Unmanaged<CFString>?
        MIDIObjectGetStringProperty(src, kMIDIPropertyName, &name)
        if let n = name?.takeRetainedValue() as String? {
            FileHandle.standardError.write("  - \(n)\n".data(using: .utf8)!)
        }
    }
    exit(1)
}

// Run until killed
signal(SIGTERM, SIG_DFL)
signal(SIGINT, SIG_DFL)
RunLoop.current.run(until: Date.distantFuture)
