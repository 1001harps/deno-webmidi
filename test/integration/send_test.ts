/// Integration test: sends MIDI via our library, verifies with external listener.
/// Requires: IAC Driver enabled in Audio MIDI Setup, `receivemidi` installed.

import "../../mod.ts";

const IAC_NAME = Deno.env.get("MIDI_IAC_NAME") ?? "IAC Driver Bus 1";

const midiAccess = await navigator.requestMIDIAccess();

// Find the IAC output
const output = Array.from(midiAccess.outputs.values()).find((o) =>
  o.name?.includes(IAC_NAME),
);

if (!output) {
  console.error(`No output matching "${IAC_NAME}" found. Available outputs:`);
  for (const [id, o] of midiAccess.outputs) {
    console.error(`  - ${o.name} (${id})`);
  }
  Deno.exit(1);
}

console.log(`Sending to: ${output.name}`);

// Give receivemidi time to start listening
await new Promise((r) => setTimeout(r, 500));

// Send note on, then note off
output.send([0x90, 60, 100]);
await new Promise((r) => setTimeout(r, 100));
output.send([0x80, 60, 0]);

// Give receivemidi time to capture
await new Promise((r) => setTimeout(r, 500));

console.log("Messages sent.");
