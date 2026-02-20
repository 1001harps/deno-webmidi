/// <reference types="@types/webmidi" />
import {
  load,
  midi_init,
  midi_devices,
  midi_send_message,
} from "./bindings/midi/mod.ts";
import { loadBinary } from "./bindings/midi/load_binary.ts";

type MidiDevice = {
  id: string;
  name: string;
};

type MidiDevices = {
  inputs: Array<MidiDevice>;
  outputs: Array<MidiDevice>;
};

function parseMidiDevices(ptr: Deno.PointerObject | null): MidiDevices {
  if (!ptr) {
    return { inputs: [], outputs: [] };
  }

  const view = new Deno.UnsafePointerView(ptr);
  return JSON.parse(view.getCString()) as MidiDevices;
}

export class MIDIInput implements WebMidi.MIDIInput {
  readonly type = "input";
  id: string;
  manufacturer?: string | undefined;
  name?: string | undefined;
  version?: string | undefined;
  state: WebMidi.MIDIPortDeviceState = "disconnected";
  connection: WebMidi.MIDIPortConnectionState = "closed";
  onstatechange: ((e: WebMidi.MIDIConnectionEvent) => void) | null = null;
  onmidimessage: ((e: WebMidi.MIDIMessageEvent) => void) | null = null;

  constructor(id: string) {
    this.id = id;
  }

  addEventListener(type: unknown, listener: unknown, options?: unknown): void {
    throw new Error("Method not implemented.");
  }

  removeEventListener(
    type: unknown,
    listener: unknown,
    options?: unknown
  ): void {
    throw new Error("Method not implemented.");
  }

  open(): Promise<WebMidi.MIDIPort> {
    throw new Error("Method not implemented.");
  }
  close(): Promise<WebMidi.MIDIPort> {
    throw new Error("Method not implemented.");
  }
  dispatchEvent(event: Event): boolean {
    throw new Error("Method not implemented.");
  }
}

export class MIDIOutput implements WebMidi.MIDIOutput {
  readonly type = "output";
  id: string;
  manufacturer?: string | undefined;
  name?: string | undefined;
  version?: string | undefined;
  state: WebMidi.MIDIPortDeviceState = "disconnected";
  connection: WebMidi.MIDIPortConnectionState = "closed";
  onstatechange: ((e: WebMidi.MIDIConnectionEvent) => void) | null = null;
  onmidimessage: ((e: WebMidi.MIDIMessageEvent) => void) | null = null;

  constructor(id: string) {
    this.id = id;
  }
  addEventListener(type: unknown, listener: unknown, options?: unknown): void {
    throw new Error("Method not implemented.");
  }
  removeEventListener(
    type: unknown,
    listener: unknown,
    options?: unknown
  ): void {
    throw new Error("Method not implemented.");
  }
  open(): Promise<WebMidi.MIDIPort> {
    throw new Error("Method not implemented.");
  }
  close(): Promise<WebMidi.MIDIPort> {
    throw new Error("Method not implemented.");
  }
  dispatchEvent(event: Event): boolean {
    throw new Error("Method not implemented.");
  }
  send(data: number[] | Uint8Array, _timestamp?: number): void {
    // Convert Uint8Array to number array if needed
    const bytes = Array.isArray(data) ? data : Array.from(data);

    if (bytes.length < 3) {
      throw new Error("MIDI message must be at least 3 bytes long");
    }

    // Use the general midi_send_message function
    midi_send_message(
      bytes[0],
      bytes[1],
      bytes[2],
      bytes.length > 3 ? bytes[3] : 0
    );
  }
  clear(): void {
    throw new Error("Method not implemented.");
  }
}

export class MIDIAccess implements WebMidi.MIDIAccess {
  inputs: WebMidi.MIDIInputMap;
  outputs: WebMidi.MIDIOutputMap;
  sysexEnabled: boolean = false;
  onstatechange: ((e: WebMidi.MIDIConnectionEvent) => void) | null = null;

  constructor(_options?: WebMidi.MIDIOptions) {
    // Initialize MIDI
    midi_init();

    const devices = parseMidiDevices(midi_devices());

    const inputs = new Map<string, WebMidi.MIDIInput>();
    const outputs = new Map<string, WebMidi.MIDIOutput>();

    // Add input devices
    devices.inputs.forEach((device) => {
      const input = new MIDIInput(device.id);
      input.name = device.name;
      inputs.set(device.id, input);
    });

    // Add output devices
    devices.outputs.forEach((device) => {
      const output = new MIDIOutput(device.id);
      output.name = device.name;
      outputs.set(device.id, output);
    });

    this.inputs = inputs;
    this.outputs = outputs;
  }

  addEventListener(
    _type: "statechange" | string,
    _listener: unknown,
    _options?: unknown
  ): void {
    throw new Error("Method not implemented.");
  }

  removeEventListener(
    _type: "statechange" | string,
    _listener: unknown,
    _options?: unknown
  ): void {
    throw new Error("Method not implemented.");
  }

  dispatchEvent(_event: Event): boolean {
    throw new Error("Method not implemented.");
  }
}

let loaded = false;

const requestMIDIAccess = async (
  options?: WebMidi.MIDIOptions
): Promise<WebMidi.MIDIAccess> => {
  if (!loaded) {
    const binaryPath = await loadBinary();
    load(binaryPath);
    loaded = true;
  }
  return new MIDIAccess(options);
};

navigator.requestMIDIAccess = requestMIDIAccess;
