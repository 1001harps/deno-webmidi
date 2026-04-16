# Deno Web MIDI API Polyfill

A Web MIDI API polyfill for Deno — use `navigator.requestMIDIAccess()` just like
in the browser, backed by a Rust/PortMIDI native binding.

## Installation

```typescript
import "jsr:@9h/webmidi";
```

The native binary for your platform is downloaded and cached automatically on
first use.

## Permissions

This package requires the `--allow-ffi`, `--allow-env`, and `--allow-read` flags:

```bash
deno run --allow-ffi --allow-env --allow-read your_script.ts
```

## Usage

### Sending MIDI

```typescript
import "jsr:@9h/webmidi";

const access = await navigator.requestMIDIAccess();
const output = Array.from(access.outputs.values())[0];

if (output) {
  output.send([0x90, 60, 100]); // Note on - middle C
  setTimeout(() => {
    output.send([0x80, 60, 0]); // Note off
  }, 1000);
}
```

### Receiving MIDI

```typescript
import "jsr:@9h/webmidi";

const access = await navigator.requestMIDIAccess();
const input = Array.from(access.inputs.values())[0];

if (input) {
  input.onmidimessage = (e) => {
    console.log("Received:", e.data);
  };
}
```

### SysEx

SysEx support must be explicitly requested:

```typescript
import "jsr:@9h/webmidi";

const access = await navigator.requestMIDIAccess({ sysex: true });
const output = Array.from(access.outputs.values())[0];

output?.send([0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7]);
```

## Implementation Status

- ✅ `navigator.requestMIDIAccess()`
- ✅ `MIDIAccess.inputs`
- ✅ `MIDIAccess.outputs`
- ✅ `MIDIAccess.onstatechange`
- ✅ `MIDIOutput.send()`
- ✅ `MIDIOutput.clear()`
- ✅ `MIDIInput.onmidimessage`
- ✅ `MIDIPort.open()` / `close()`
- ✅ `MIDIPort.state` / `connection`
- ✅ `MIDIPort.onstatechange`
- ✅ `addEventListener` / `removeEventListener`
- ✅ SysEx
- ❌ High-precision timing
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
MIDI_BINARY_PATH=/path/to/libmidi.dylib deno run --allow-ffi --allow-env --allow-read your_script.ts
```
