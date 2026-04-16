/// Integration test: receives MIDI via onmidimessage, verifies correct bytes.
/// Also tests open()/close()/state/connection on MIDIInput.

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

console.log(`Using input: ${input.name}`);

// Test initial state
assert(input.state === "connected", `state is "connected" initially`);
assert(input.connection === "closed", `connection is "closed" initially`);

// Test explicit open
await input.open();
assert(input.connection === "open", `connection is "open" after open()`);

// Test double open is idempotent
await input.open();
assert(
  input.connection === "open",
  `connection still "open" after second open()`,
);

// Close, then let onmidimessage re-open implicitly
await input.close();
assert(input.connection === "closed", `connection is "closed" after close()`);

const received: string[] = [];
const expected = ["90 3c 64", "80 3c 00"];

// Setting onmidimessage should implicitly open
input.onmidimessage = (e: WebMidi.MIDIMessageEvent) => {
  const hex = Array.from(e.data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  console.log(`Received: ${hex}`);
  received.push(hex);

  if (received.length >= expected.length) {
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

    // Verify close after clearing handler (port stays open, just stops polling)
    assert(
      input.connection === "open",
      `connection still "open" after clearing handler`,
    );
    input.close();
    assert(
      input.connection === "closed",
      `connection "closed" after final close()`,
    );

    Deno.exit(passed ? 0 : 1);
  }
};

assert(
  input.connection === "open",
  `connection is "open" after setting onmidimessage`,
);

// Timeout after 10 seconds
setTimeout(() => {
  console.error("FAIL: timed out waiting for MIDI messages");
  console.error(`Received ${received.length}/${expected.length} messages`);
  input.onmidimessage = null;
  Deno.exit(1);
}, 10000);
