# Deno Web MIDI API Polyfill

A Web MIDI API polyfill implementation for Deno using Rust bindings with
PortMIDI.

## Overview

This project provides a partial implementation of the
[Web MIDI API](https://www.w3.org/TR/webmidi/) for Deno runtime environments. It
uses Rust bindings via `deno_bindgen` to interface with the system's MIDI
devices through the PortMIDI library.

## Installation

```typescript
import "jsr:@9h/webmidi";
```

The native binary for your platform is downloaded and cached automatically on
first use.

## Usage

```typescript
import "jsr:@9h/webmidi";

navigator.requestMIDIAccess().then((midiAccess) => {
  // Get the first available output
  const output = Array.from(midiAccess.outputs.values())[0];
  if (!output) {
    console.log("No MIDI outputs found");
    return;
  }

  // Play middle C for 1 second
  output.send([0x90, 60, 100]); // Note on
  setTimeout(() => {
    output.send([0x80, 60, 0]); // Note off
  }, 1000);
});
```

## Implementation Status

- ✅ `navigator.requestMIDIAccess()`
- ✅ `MIDIAccess.inputs`
- ✅ `MIDIAccess.outputs`
- ✅ `MIDIOutput.send()`
- ✅ `MIDIInput.onmidimessage`
- ❌ `MIDIPort.open()`
- ❌ `MIDIPort.close()`
- ❌ `MIDIPort.state`
- ❌ `MIDIPort.connection`
- ❌ `MIDIPort.onstatechange`
- ❌ `MIDIAccess.onstatechange`
- ❌ `MIDIOutput.clear()`
- ❌ SysEx support
- ❌ High-precision timing
- ❌ Event listeners (`addEventListener`/`removeEventListener`)
- ❌ Device hotplug detection

## Development

### Dependencies

- Deno runtime
- Rust toolchain
- `deno_bindgen_cli` (`cargo install deno_bindgen_cli`)

### Build and Generate Bindings

```bash
# Build Rust library (release)
deno task build:bindings

# Regenerate TypeScript bindings from Rust exports
deno task bindings

# Run the test against a local build
deno task test
```

To use a locally built binary instead of downloading from releases, set
`MIDI_BINARY_PATH`:

```bash
MIDI_BINARY_PATH=/path/to/libmidi.dylib deno run --allow-ffi --allow-env --allow-net mod.ts
```
