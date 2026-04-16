/// Integration test: SysEx send.
/// 1. Verifies that sending SysEx without permission throws InvalidAccessError.
/// 2. Sends a SysEx message with sysex: true; verified externally by Swift listener.

import "../../mod.ts";

const IAC_NAME = Deno.env.get("MIDI_IAC_NAME") ?? "IAC Driver Bus 1";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    Deno.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

// ── Part 1: permission gate ──

const noSysexAccess = await navigator.requestMIDIAccess();
assert(noSysexAccess.sysexEnabled === false, "sysexEnabled is false without sysex option");

const noSysexOutput = Array.from(noSysexAccess.outputs.values()).find((o) =>
  o.name?.includes(IAC_NAME)
);

if (!noSysexOutput) {
  console.error(`No output matching "${IAC_NAME}" found.`);
  Deno.exit(1);
}

let threw = false;
try {
  noSysexOutput.send([0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7]);
} catch (e) {
  threw = true;
  assert(
    e instanceof DOMException && e.name === "InvalidAccessError",
    `SysEx without permission throws InvalidAccessError (got: ${e})`,
  );
}
assert(threw, "SysEx send without permission must throw");

// ── Part 2: SysEx send with permission ──

const sysexAccess = await navigator.requestMIDIAccess({ sysex: true });
assert(sysexAccess.sysexEnabled === true, "sysexEnabled is true with sysex: true");

const output = Array.from(sysexAccess.outputs.values()).find((o) =>
  o.name?.includes(IAC_NAME)
);

if (!output) {
  console.error(`No output matching "${IAC_NAME}" found.`);
  Deno.exit(1);
}

console.log(`Using output: ${output.name}`);

// Give listener time to start
await new Promise((r) => setTimeout(r, 500));

// GM System Reset SysEx
output.send([0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7]);
console.log("Sent SysEx GM reset");

await new Promise((r) => setTimeout(r, 500));

console.log("SysEx send test complete.");
