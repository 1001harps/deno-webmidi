import "./mod.ts";

navigator.requestMIDIAccess().then((midiAccess) => {
  // Debug: Show available MIDI devices
  console.log("Available MIDI outputs:");
  for (const [id, output] of midiAccess.outputs) {
    console.log(`  - ${output.name} (${id})`);
  }

  // Get the first available output
  const output = Array.from(midiAccess.outputs.values())[0];
  if (!output) {
    console.log("No MIDI outputs found");
    return;
  }

  console.log(`Using MIDI output: ${output.name}`);

  // MIDI note-on: [144, 60, 100] — channel 1, note 60 (middle C), velocity 100
  console.log("Playing middle C...");
  output.send([0x90, 60, 100]);
  // After 1 second, send note-off: [128, 60, 0]
  setTimeout(() => {
    console.log("Stopping note...");
    output.send([0x80, 60, 0]);
  }, 1000);
});
