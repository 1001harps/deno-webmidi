/// <reference types="npm:@types/webmidi@2.1.0" />
import {
  load,
  midi_close_input,
  midi_close_output,
  midi_devices,
  midi_init,
  midi_open_input,
  midi_open_output,
  midi_read_messages,
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

function parseMessages(ptr: Deno.PointerObject | null): number[][] {
  if (!ptr) return [];
  const view = new Deno.UnsafePointerView(ptr);
  return JSON.parse(view.getCString()) as number[][];
}

class MIDIMessageEvent extends Event implements WebMidi.MIDIMessageEvent {
  readonly data: Uint8Array;
  constructor(type: string, init: { data: Uint8Array }) {
    super(type);
    this.data = init.data;
  }
}

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
  state: WebMidi.MIDIPortDeviceState = "connected";
  connection: WebMidi.MIDIPortConnectionState = "closed";
  onstatechange: ((e: WebMidi.MIDIConnectionEvent) => void) | null = null;

  private _onmidimessage: ((e: WebMidi.MIDIMessageEvent) => void) | null = null;
  private _pollInterval: number | null = null;

  constructor(id: string) {
    this.id = id;
  }

  get onmidimessage(): ((e: WebMidi.MIDIMessageEvent) => void) | null {
    return this._onmidimessage;
  }

  set onmidimessage(handler: ((e: WebMidi.MIDIMessageEvent) => void) | null) {
    this._onmidimessage = handler;

    if (handler) {
      // Implicitly open if not already open (per Web MIDI spec)
      if (this.connection !== "open") {
        this._openPort();
      }
      this._startPolling();
    } else {
      this._stopPolling();
    }
  }

  private _openPort(): void {
    const deviceId = parseInt(this.id);
    const result = midi_open_input(deviceId);
    if (result < 0) {
      throw new Error(`Failed to open input device ${this.id}`);
    }
    this.connection = "open";
  }

  private _closePort(): void {
    this._stopPolling();
    midi_close_input(parseInt(this.id));
    this.connection = "closed";
  }

  private _startPolling(): void {
    if (this._pollInterval !== null) return;
    const deviceId = parseInt(this.id);
    this._pollInterval = setInterval(() => {
      const messages = parseMessages(midi_read_messages(deviceId));
      for (const msg of messages) {
        const event = new MIDIMessageEvent("midimessage", {
          data: new Uint8Array(msg),
        });
        this._onmidimessage?.(event);
      }
    }, 5);
  }

  private _stopPolling(): void {
    if (this._pollInterval !== null) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  addEventListener(type: unknown, listener: unknown, options?: unknown): void {
    throw new Error("Method not implemented.");
  }

  removeEventListener(
    type: unknown,
    listener: unknown,
    options?: unknown,
  ): void {
    throw new Error("Method not implemented.");
  }

  open(): Promise<WebMidi.MIDIPort> {
    if (this.connection !== "open") {
      this._openPort();
    }
    return Promise.resolve(this);
  }

  close(): Promise<WebMidi.MIDIPort> {
    if (this.connection === "open") {
      this._closePort();
    }
    return Promise.resolve(this);
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
  state: WebMidi.MIDIPortDeviceState = "connected";
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
    options?: unknown,
  ): void {
    throw new Error("Method not implemented.");
  }
  open(): Promise<WebMidi.MIDIPort> {
    if (this.connection !== "open") {
      const deviceId = parseInt(this.id);
      const result = midi_open_output(deviceId);
      if (result < 0) {
        throw new Error(`Failed to open output device ${this.id}`);
      }
      this.connection = "open";
    }
    return Promise.resolve(this);
  }
  close(): Promise<WebMidi.MIDIPort> {
    if (this.connection === "open") {
      midi_close_output(parseInt(this.id));
      this.connection = "closed";
    }
    return Promise.resolve(this);
  }
  dispatchEvent(event: Event): boolean {
    throw new Error("Method not implemented.");
  }
  send(data: number[] | Uint8Array, _timestamp?: number): void {
    // Implicitly open if not already open (per Web MIDI spec)
    if (this.connection !== "open") {
      const deviceId = parseInt(this.id);
      const result = midi_open_output(deviceId);
      if (result < 0) {
        throw new Error(`Failed to open output device ${this.id}`);
      }
      this.connection = "open";
    }

    // Convert Uint8Array to number array if needed
    const bytes = Array.isArray(data) ? data : Array.from(data);

    if (bytes.length < 3) {
      throw new Error("MIDI message must be at least 3 bytes long");
    }

    // Send to the specific device by ID
    midi_send_message(
      parseInt(this.id),
      bytes[0],
      bytes[1],
      bytes[2],
      bytes.length > 3 ? bytes[3] : 0,
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
    _options?: unknown,
  ): void {
    throw new Error("Method not implemented.");
  }

  removeEventListener(
    _type: "statechange" | string,
    _listener: unknown,
    _options?: unknown,
  ): void {
    throw new Error("Method not implemented.");
  }

  dispatchEvent(_event: Event): boolean {
    throw new Error("Method not implemented.");
  }
}

let loaded = false;

const requestMIDIAccess = async (
  options?: WebMidi.MIDIOptions,
): Promise<WebMidi.MIDIAccess> => {
  if (!loaded) {
    const binaryPath = await loadBinary();
    load(binaryPath);
    loaded = true;
  }
  return new MIDIAccess(options);
};

navigator.requestMIDIAccess = requestMIDIAccess;
