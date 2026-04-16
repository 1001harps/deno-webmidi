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
  midi_send_sysex,
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

class MIDIConnectionEvent extends Event implements WebMidi.MIDIConnectionEvent {
  readonly port: WebMidi.MIDIPort;
  constructor(type: string, init: { port: WebMidi.MIDIPort }) {
    super(type);
    this.port = init.port;
  }
}

function parseMidiDevices(ptr: Deno.PointerObject | null): MidiDevices {
  if (!ptr) {
    return { inputs: [], outputs: [] };
  }

  const view = new Deno.UnsafePointerView(ptr);
  return JSON.parse(view.getCString()) as MidiDevices;
}

/**
 * Represents a MIDI input port. Implements the Web MIDI API `MIDIInput` interface.
 *
 * Receive MIDI messages by setting {@linkcode MIDIInput.onmidimessage} or using
 * {@linkcode MIDIInput.addEventListener} with the `"midimessage"` event type.
 * The port is opened implicitly when a message handler is attached.
 *
 * @example
 * ```ts
 * const access = await navigator.requestMIDIAccess();
 * const input = access.inputs.values().next().value;
 * input.onmidimessage = (e) => console.log(e.data);
 * ```
 */
export class MIDIInput implements WebMidi.MIDIInput {
  /** Always `"input"`. */
  readonly type = "input";
  /** Unique identifier for this port. */
  id: string;
  /** Manufacturer name, if provided by the driver. */
  manufacturer?: string | undefined;
  /** Human-readable port name. */
  name?: string | undefined;
  /** Version string, if provided by the driver. */
  version?: string | undefined;
  /** Whether the device is `"connected"` or `"disconnected"`. */
  state: WebMidi.MIDIPortDeviceState = "connected";
  /** Whether the port is `"open"`, `"closed"`, or `"pending"`. */
  connection: WebMidi.MIDIPortConnectionState = "closed";
  /** Callback fired when the port's state or connection changes. */
  onstatechange: ((e: WebMidi.MIDIConnectionEvent) => void) | null = null;
  _access: MIDIAccess | null = null;

  private _onmidimessage: ((e: WebMidi.MIDIMessageEvent) => void) | null = null;
  private _pollInterval: number | null = null;
  private _listeners: Map<string, Set<EventListenerOrEventListenerObject>> =
    new Map();

  /** @param id - The numeric device ID as a string. */
  constructor(id: string) {
    this.id = id;
  }

  /** Callback fired when a MIDI message is received on this input. */
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
    this._fireStateChange();
  }

  private _closePort(): void {
    this._stopPolling();
    midi_close_input(parseInt(this.id));
    this.connection = "closed";
    this._fireStateChange();
  }

  private _fireStateChange(): void {
    const event = new MIDIConnectionEvent("statechange", {
      port: this as unknown as WebMidi.MIDIPort,
    });
    this.onstatechange?.(event);
    this._dispatchToListeners("statechange", event);
    this._access?._dispatchStateChange(event);
  }

  private _dispatchToListeners(type: string, event: Event): void {
    const listeners = this._listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        if (typeof listener === "function") {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    }
  }

  private _startPolling(): void {
    if (this._pollInterval !== null) return;
    const deviceId = parseInt(this.id);
    this._pollInterval = setInterval(() => {
      const messages = parseMessages(midi_read_messages(deviceId));
      for (const msg of messages) {
        if (msg[0] === 0xF0 && !this._access?.sysexEnabled) continue;
        const event = new MIDIMessageEvent("midimessage", {
          data: new Uint8Array(msg),
        });
        this._onmidimessage?.(event);
        this._dispatchToListeners("midimessage", event);
      }
    }, 5);
  }

  private _stopPolling(): void {
    if (this._pollInterval !== null) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  /**
   * Registers an event listener for `"midimessage"` or `"statechange"` events.
   *
   * @param type - The event type to listen for.
   * @param listener - The callback or listener object to invoke.
   */
  // @ts-ignore: implementation satisfies all overloads at runtime
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | AddEventListenerOptions,
  ): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  /**
   * Removes a previously registered event listener.
   *
   * @param type - The event type the listener was registered for.
   * @param listener - The callback or listener object to remove.
   */
  // @ts-ignore: implementation satisfies all overloads at runtime
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions,
  ): void {
    this._listeners.get(type)?.delete(listener);
  }

  /**
   * Opens the MIDI input port, making it ready to receive messages.
   * If the port is already open this is a no-op.
   *
   * @returns A promise that resolves to this port.
   */
  open(): Promise<WebMidi.MIDIPort> {
    if (this.connection !== "open") {
      this._openPort();
    }
    return Promise.resolve(this as unknown as WebMidi.MIDIPort);
  }

  /**
   * Closes the MIDI input port and stops polling for messages.
   * If the port is already closed this is a no-op.
   *
   * @returns A promise that resolves to this port.
   */
  close(): Promise<WebMidi.MIDIPort> {
    if (this.connection === "open") {
      this._closePort();
    }
    return Promise.resolve(this as unknown as WebMidi.MIDIPort);
  }

  /**
   * Dispatches an event to all registered listeners and the `onmidimessage` /
   * `onstatechange` callbacks.
   *
   * @param event - The event to dispatch.
   * @returns Always `true`.
   */
  dispatchEvent(event: Event): boolean {
    const type = event.type;
    if (type === "midimessage") {
      this._onmidimessage?.(event as WebMidi.MIDIMessageEvent);
    } else if (type === "statechange") {
      this.onstatechange?.(event as WebMidi.MIDIConnectionEvent);
    }
    this._dispatchToListeners(type, event);
    return true;
  }
}

/**
 * Represents a MIDI output port. Implements the Web MIDI API `MIDIOutput` interface.
 *
 * Send MIDI messages via {@linkcode MIDIOutput.send}. The port is opened
 * implicitly on the first `send()` call, per the Web MIDI spec.
 *
 * @example
 * ```ts
 * const access = await navigator.requestMIDIAccess();
 * const output = access.outputs.values().next().value;
 * // Send a middle-C note-on (channel 1)
 * output.send([0x90, 60, 127]);
 * ```
 */
export class MIDIOutput implements WebMidi.MIDIOutput {
  /** Always `"output"`. */
  readonly type = "output";
  /** Unique identifier for this port. */
  id: string;
  /** Manufacturer name, if provided by the driver. */
  manufacturer?: string | undefined;
  /** Human-readable port name. */
  name?: string | undefined;
  /** Version string, if provided by the driver. */
  version?: string | undefined;
  /** Whether the device is `"connected"` or `"disconnected"`. */
  state: WebMidi.MIDIPortDeviceState = "connected";
  /** Whether the port is `"open"`, `"closed"`, or `"pending"`. */
  connection: WebMidi.MIDIPortConnectionState = "closed";
  /** Callback fired when the port's state or connection changes. */
  onstatechange: ((e: WebMidi.MIDIConnectionEvent) => void) | null = null;
  onmidimessage: ((e: WebMidi.MIDIMessageEvent) => void) | null = null;
  _access: MIDIAccess | null = null;
  private _listeners: Map<string, Set<EventListenerOrEventListenerObject>> =
    new Map();

  /** @param id - The numeric device ID as a string. */
  constructor(id: string) {
    this.id = id;
  }

  /**
   * Registers an event listener for `"statechange"` events.
   *
   * @param type - The event type to listen for.
   * @param listener - The callback or listener object to invoke.
   */
  // @ts-ignore: implementation satisfies all overloads at runtime
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | AddEventListenerOptions,
  ): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  /**
   * Removes a previously registered event listener.
   *
   * @param type - The event type the listener was registered for.
   * @param listener - The callback or listener object to remove.
   */
  // @ts-ignore: implementation satisfies all overloads at runtime
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions,
  ): void {
    this._listeners.get(type)?.delete(listener);
  }

  /**
   * Opens the MIDI output port, making it ready to send messages.
   * If the port is already open this is a no-op.
   *
   * @returns A promise that resolves to this port.
   */
  open(): Promise<WebMidi.MIDIPort> {
    if (this.connection !== "open") {
      const deviceId = parseInt(this.id);
      const result = midi_open_output(deviceId);
      if (result < 0) {
        throw new Error(`Failed to open output device ${this.id}`);
      }
      this.connection = "open";
      this._fireStateChange();
    }
    return Promise.resolve(this as unknown as WebMidi.MIDIPort);
  }

  /**
   * Closes the MIDI output port.
   * If the port is already closed this is a no-op.
   *
   * @returns A promise that resolves to this port.
   */
  close(): Promise<WebMidi.MIDIPort> {
    if (this.connection === "open") {
      midi_close_output(parseInt(this.id));
      this.connection = "closed";
      this._fireStateChange();
    }
    return Promise.resolve(this as unknown as WebMidi.MIDIPort);
  }
  private _fireStateChange(): void {
    const event = new MIDIConnectionEvent("statechange", {
      port: this as unknown as WebMidi.MIDIPort,
    });
    this.onstatechange?.(event);
    this._dispatchToListeners("statechange", event);
    this._access?._dispatchStateChange(event);
  }
  private _dispatchToListeners(type: string, event: Event): void {
    const listeners = this._listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        if (typeof listener === "function") {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    }
  }
  /**
   * Dispatches an event to all registered listeners and the `onstatechange` callback.
   *
   * @param event - The event to dispatch.
   * @returns Always `true`.
   */
  dispatchEvent(event: Event): boolean {
    const type = event.type;
    if (type === "statechange") {
      this.onstatechange?.(event as WebMidi.MIDIConnectionEvent);
    }
    this._dispatchToListeners(type, event);
    return true;
  }

  /**
   * Sends a MIDI message to the output device. The port is opened implicitly
   * if it is not already open.
   *
   * SysEx messages (starting with `0xF0`) are only permitted when
   * `sysexEnabled` is `true` on the parent {@linkcode MIDIAccess} object, and
   * must end with `0xF7`.
   *
   * @param data - The MIDI message bytes. Must be at least 3 bytes for
   *   non-SysEx messages.
   * @param _timestamp - Ignored; messages are sent immediately.
   * @throws {DOMException} If SysEx is not enabled and a SysEx message is sent.
   * @throws {TypeError} If a SysEx message does not end with `0xF7`, or a
   *   non-SysEx message is shorter than 3 bytes.
   */
  send(data: number[] | Uint8Array, _timestamp?: number): void {
    // Implicitly open if not already open (per Web MIDI spec)
    if (this.connection !== "open") {
      this._openAndFireStateChange();
    }

    const bytes = Array.isArray(data) ? data : Array.from(data);

    if (bytes[0] === 0xF0) {
      if (!this._access?.sysexEnabled) {
        throw new DOMException("SysEx not enabled", "InvalidAccessError");
      }
      if (bytes[bytes.length - 1] !== 0xF7) {
        throw new TypeError("SysEx message must end with 0xF7");
      }
      const result = midi_send_sysex(parseInt(this.id), new Uint8Array(bytes));
      if (result < 0) {
        throw new Error(`Failed to send SysEx: error ${result}`);
      }
      return;
    }

    if (bytes.length < 3) {
      throw new TypeError("MIDI message must be at least 3 bytes long");
    }

    midi_send_message(
      parseInt(this.id),
      bytes[0],
      bytes[1],
      bytes[2],
      bytes.length > 3 ? bytes[3] : 0,
    );
  }
  private _openAndFireStateChange(): void {
    const deviceId = parseInt(this.id);
    const result = midi_open_output(deviceId);
    if (result < 0) {
      throw new Error(`Failed to open output device ${this.id}`);
    }
    this.connection = "open";
    this._fireStateChange();
  }
  /**
   * Clears any pending MIDI messages in the output buffer.
   * This implementation is a no-op because messages are sent immediately.
   */
  clear(): void {
    // No-op: messages are sent immediately, no output buffer to clear.
  }
}

/**
 * Provides access to connected MIDI input and output devices.
 * Implements the Web MIDI API `MIDIAccess` interface.
 *
 * Obtain an instance via `navigator.requestMIDIAccess()` rather than
 * constructing this class directly.
 *
 * @example
 * ```ts
 * const access = await navigator.requestMIDIAccess({ sysex: true });
 * for (const input of access.inputs.values()) {
 *   console.log(input.name);
 * }
 * ```
 */
export class MIDIAccess implements WebMidi.MIDIAccess {
  /** Map of all available MIDI input ports, keyed by port ID. */
  inputs: WebMidi.MIDIInputMap;
  /** Map of all available MIDI output ports, keyed by port ID. */
  outputs: WebMidi.MIDIOutputMap;
  /** Whether SysEx messages are permitted. Set via `requestMIDIAccess({ sysex: true })`. */
  sysexEnabled: boolean = false;
  /** Callback fired when a MIDI port is connected or disconnected. */
  onstatechange: ((e: WebMidi.MIDIConnectionEvent) => void) | null = null;
  private _listeners: Map<string, Set<EventListenerOrEventListenerObject>> =
    new Map();

  /**
   * @param _options - Optional MIDI access options. Set `sysex: true` to
   *   enable sending and receiving SysEx messages.
   */
  constructor(_options?: WebMidi.MIDIOptions) {
    this.sysexEnabled = _options?.sysex === true;

    // Initialize MIDI
    midi_init();

    const devices = parseMidiDevices(midi_devices());

    const inputs = new Map<string, WebMidi.MIDIInput>();
    const outputs = new Map<string, WebMidi.MIDIOutput>();

    // Add input devices
    devices.inputs.forEach((device) => {
      const input = new MIDIInput(device.id);
      input.name = device.name;
      input._access = this;
      inputs.set(device.id, input as unknown as WebMidi.MIDIInput);
    });

    // Add output devices
    devices.outputs.forEach((device) => {
      const output = new MIDIOutput(device.id);
      output.name = device.name;
      output._access = this;
      outputs.set(device.id, output as unknown as WebMidi.MIDIOutput);
    });

    this.inputs = inputs;
    this.outputs = outputs;
  }

  _dispatchStateChange(event: MIDIConnectionEvent): void {
    this.onstatechange?.(event);
    const listeners = this._listeners.get("statechange");
    if (listeners) {
      for (const listener of listeners) {
        if (typeof listener === "function") {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    }
  }

  /**
   * Registers an event listener for `"statechange"` events, fired when a
   * MIDI port is connected or disconnected.
   *
   * @param type - The event type to listen for.
   * @param listener - The callback or listener object to invoke.
   */
  // @ts-ignore: implementation satisfies all overloads at runtime
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | AddEventListenerOptions,
  ): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  /**
   * Removes a previously registered event listener.
   *
   * @param type - The event type the listener was registered for.
   * @param listener - The callback or listener object to remove.
   */
  // @ts-ignore: implementation satisfies all overloads at runtime
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    _options?: boolean | EventListenerOptions,
  ): void {
    this._listeners.get(type)?.delete(listener);
  }

  /**
   * Dispatches an event to all registered listeners and the `onstatechange` callback.
   *
   * @param event - The event to dispatch.
   * @returns Always `true`.
   */
  dispatchEvent(event: Event): boolean {
    if (event.type === "statechange") {
      this.onstatechange?.(event as WebMidi.MIDIConnectionEvent);
    }
    const listeners = this._listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        if (typeof listener === "function") {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    }
    return true;
  }
}

let loaded = false;

/**
 * Returns a {@linkcode MIDIAccess} object that provides access to connected
 * MIDI devices. Loads the native binary on first call.
 *
 * This function is also assigned to `navigator.requestMIDIAccess`, making it
 * compatible with code written against the browser Web MIDI API.
 *
 * @param options - Optional MIDI access options. Set `sysex: true` to enable
 *   SysEx support.
 * @returns A promise that resolves to a {@linkcode MIDIAccess} instance.
 *
 * @example
 * ```ts
 * import "@1001harps/deno-webmidi";
 *
 * const access = await navigator.requestMIDIAccess();
 * for (const [id, input] of access.inputs) {
 *   console.log(id, input.name);
 * }
 * ```
 */
export const requestMIDIAccess = async (
  options?: WebMidi.MIDIOptions,
): Promise<WebMidi.MIDIAccess> => {
  if (!loaded) {
    const binaryPath = await loadBinary();
    load(binaryPath);
    loaded = true;
  }
  return new MIDIAccess(options) as unknown as WebMidi.MIDIAccess;
};

navigator.requestMIDIAccess = requestMIDIAccess;
