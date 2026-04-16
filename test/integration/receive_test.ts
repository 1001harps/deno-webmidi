/// Integration test: receives MIDI via onmidimessage, verifies correct bytes.
/// An external sender (midi_sender.swift) sends messages to the IAC port.

import "../../mod.ts";

const IAC_NAME = Deno.env.get("MIDI_IAC_NAME") ?? "IAC Driver Bus 1";

const midiAccess = await navigator.requestMIDIAccess();

// Find the IAC input
const input = Array.from(midiAccess.inputs.values()).find((i) =>
  i.name?.includes(IAC_NAME),
);

if (!input) {
  console.error(`No input matching "${IAC_NAME}" found. Available inputs:`);
  for (const [id, i] of midiAccess.inputs) {
    console.error(`  - ${i.name} (${id})`);
  }
  Deno.exit(1);
}

console.log(`Listening on: ${input.name}`);

const received: string[] = [];
const expected = ["90 3c 64", "80 3c 00"];

input.onmidimessage = (e: WebMidi.MIDIMessageEvent) => {
  const hex = Array.from(e.data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  console.log(`Received: ${hex}`);
  received.push(hex);

  if (received.length >= expected.length) {
    // Got all expected messages, verify and exit
    let passed = true;
    for (const exp of expected) {
      if (!received.includes(exp)) {
        console.error(`FAIL: expected "${exp}" not received`);
        passed = false;
      }
    }
    if (passed) {
      console.log("ALL RECEIVE CHECKS PASSED");
    }
    input.onmidimessage = null;
    Deno.exit(passed ? 0 : 1);
  }
};

// Timeout after 10 seconds
setTimeout(() => {
  console.error("FAIL: timed out waiting for MIDI messages");
  console.error(`Received ${received.length}/${expected.length} messages`);
  input.onmidimessage = null;
  Deno.exit(1);
}, 10000);
