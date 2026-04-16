/// Integration test: SysEx receive.
/// Listens for a SysEx message sent by the Swift sysex sender and verifies the full byte sequence.

import "../../mod.ts";

const IAC_NAME = Deno.env.get("MIDI_IAC_NAME") ?? "IAC Driver Bus 1";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    Deno.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
assert(midiAccess.sysexEnabled === true, "sysexEnabled is true");

const input = Array.from(midiAccess.inputs.values()).find((i) =>
  i.name?.includes(IAC_NAME)
);

if (!input) {
  console.error(`No input matching "${IAC_NAME}" found. Available inputs:`);
  for (const [id, i] of midiAccess.inputs) {
    console.error(`  - ${i.name} (${id})`);
  }
  Deno.exit(1);
}

console.log(`Using input: ${input.name}`);

// Expected: GM System Reset SysEx [f0 7e 7f 09 01 f7]
const EXPECTED = [0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7];

input.onmidimessage = (e: WebMidi.MIDIMessageEvent) => {
  const hex = Array.from(e.data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  console.log(`Received: ${hex}`);

  if (e.data[0] !== 0xF0) return; // ignore non-SysEx

  assert(
    e.data.length === EXPECTED.length,
    `SysEx length is ${EXPECTED.length} bytes (got ${e.data.length})`,
  );

  const matches = EXPECTED.every((b, i) => e.data[i] === b);
  assert(matches, `SysEx bytes match expected [${EXPECTED.map((b) => b.toString(16)).join(" ")}]`);

  input.onmidimessage = null;
  input.close();
  Deno.exit(0);
};

assert(input.connection === "open", "connection is open after setting onmidimessage");

setTimeout(() => {
  console.error("FAIL: timed out waiting for SysEx message");
  input.onmidimessage = null;
  Deno.exit(1);
}, 10000);
