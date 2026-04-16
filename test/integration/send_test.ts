/// Integration test: sends MIDI via our library, verifies with external listener.
/// Also tests open()/close()/state/connection on MIDIOutput.

import "../../mod.ts";

const IAC_NAME = Deno.env.get("MIDI_IAC_NAME") ?? "IAC Driver Bus 1";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    Deno.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

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

console.log(`Using output: ${output.name}`);

// Test initial state
assert(output.state === "connected", `state is "connected" initially`);
assert(output.connection === "closed", `connection is "closed" initially`);

// Test explicit open
await output.open();
assert(output.connection === "open", `connection is "open" after open()`);

// Test double open is idempotent
await output.open();
assert(
  output.connection === "open",
  `connection still "open" after second open()`,
);

// Give listener time to start
await new Promise((r) => setTimeout(r, 500));

// Send note on, then note off
output.send([0x90, 60, 100]);
await new Promise((r) => setTimeout(r, 100));
output.send([0x80, 60, 0]);

// Test close
await output.close();
assert(output.connection === "closed", `connection is "closed" after close()`);

// Test double close is idempotent
await output.close();
assert(
  output.connection === "closed",
  `connection still "closed" after second close()`,
);

// Give listener time to capture
await new Promise((r) => setTimeout(r, 500));

console.log("Send test complete.");
