import CoreMIDI
import Foundation

// Send MIDI messages to the IAC Driver for integration testing.
// Usage: swift midi_sender.swift [port_name]

let portName = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "IAC Driver Bus 1"

var client = MIDIClientRef()
var port = MIDIPortRef()

MIDIClientCreate("TestSender" as CFString, nil, nil, &client)
MIDIOutputPortCreate(client, "Output" as CFString, &port)

// Find destination matching port name
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

// Wait a moment for the receiver to be ready
Thread.sleep(forTimeInterval: 0.5)

// Send note on: channel 0, note 60, velocity 100
sendMIDI([0x90, 60, 100])
FileHandle.standardError.write("Sent note on\n".data(using: .utf8)!)

Thread.sleep(forTimeInterval: 0.1)

// Send note off: channel 0, note 60, velocity 0
sendMIDI([0x80, 60, 0])
FileHandle.standardError.write("Sent note off\n".data(using: .utf8)!)

Thread.sleep(forTimeInterval: 0.5)
