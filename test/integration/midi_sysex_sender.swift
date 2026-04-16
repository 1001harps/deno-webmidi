import CoreMIDI
import Foundation

// Send a SysEx message to the IAC Driver for integration testing.
// Usage: midi_sysex_sender [port_name]

let portName = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "IAC Driver Bus 1"

var client = MIDIClientRef()
var port = MIDIPortRef()

MIDIClientCreate("SysExSender" as CFString, nil, nil, &client)
MIDIOutputPortCreate(client, "Output" as CFString, &port)

let destCount = MIDIGetNumberOfDestinations()
var dest: MIDIEndpointRef? = nil

for i in 0..<destCount {
    let endpoint = MIDIGetDestination(i)
    var name: Unmanaged<CFString>?
    MIDIObjectGetStringProperty(endpoint, kMIDIPropertyName, &name)
    if let n = name?.takeRetainedValue() as String?, n.contains(portName) {
        dest = endpoint
        FileHandle.standardError.write("Sending to: \(n)\n".data(using: .utf8)!)
        break
    }
}

guard let destination = dest else {
    FileHandle.standardError.write("No destination matching '\(portName)' found. Available:\n".data(using: .utf8)!)
    for i in 0..<destCount {
        let endpoint = MIDIGetDestination(i)
        var name: Unmanaged<CFString>?
        MIDIObjectGetStringProperty(endpoint, kMIDIPropertyName, &name)
        if let n = name?.takeRetainedValue() as String? {
            FileHandle.standardError.write("  - \(n)\n".data(using: .utf8)!)
        }
    }
    exit(1)
}

func sendMIDI(_ bytes: [UInt8]) {
    var packetList = MIDIPacketList()
    var packet = MIDIPacketListInit(&packetList)
    packet = MIDIPacketListAdd(&packetList, 1024, packet, 0, bytes.count, bytes)
    MIDISend(port, destination, &packetList)
}

Thread.sleep(forTimeInterval: 0.5)

// GM System Reset SysEx — safe, universal, easily identified
sendMIDI([0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7])
FileHandle.standardError.write("Sent SysEx GM reset\n".data(using: .utf8)!)

Thread.sleep(forTimeInterval: 0.5)
