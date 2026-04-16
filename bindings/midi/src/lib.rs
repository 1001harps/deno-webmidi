use deno_bindgen::deno_bindgen;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::CString;
use std::os::raw::c_char;
use std::sync::Mutex;
extern crate portmidi as pm;

struct MidiState {
    context: pm::PortMidi,
    // SAFETY: Ports borrow from context in the same struct, stored in a
    // static Mutex. The context is never dropped while ports exist.
    input_ports: HashMap<i32, pm::InputPort<'static>>,
    output_ports: HashMap<i32, pm::OutputPort<'static>>,
    sysex_buffers: HashMap<i32, Vec<u8>>,
}

static MIDI_STATE: Mutex<Option<MidiState>> = Mutex::new(None);

#[derive(Serialize, Deserialize)]
#[deno_bindgen]
pub struct MidiDevice {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize)]
#[deno_bindgen]
pub struct MidiDevices {
    pub inputs: Vec<MidiDevice>,
    pub outputs: Vec<MidiDevice>,
}

#[deno_bindgen]
pub fn midi_init() {
    let mut state = MIDI_STATE.lock().unwrap();
    if state.is_none() {
        *state = Some(MidiState {
            context: pm::PortMidi::new().unwrap(),
            input_ports: HashMap::new(),
            output_ports: HashMap::new(),
            sysex_buffers: HashMap::new(),
        });
    }
}

#[deno_bindgen]
pub fn midi_devices() -> *const c_char {
    let state = MIDI_STATE.lock().unwrap();
    let s = state.as_ref().expect("MIDI not initialized");

    let device_list = s.context.devices().unwrap();

    let mut inputs = vec![];
    let mut outputs = vec![];

    for device in device_list {
        let d = MidiDevice {
            id: device.id().to_string(),
            name: device.name().to_string(),
        };

        match device.direction() {
            pm::Direction::Input => inputs.push(d),
            pm::Direction::Output => outputs.push(d),
        }
    }

    let devices = MidiDevices { inputs, outputs };
    let json_str = serde_json::to_string(&devices).unwrap();
    let c_str = CString::new(json_str).unwrap();
    c_str.into_raw()
}

#[deno_bindgen]
pub fn midi_open_output(device_id: i32) -> i32 {
    let mut state = MIDI_STATE.lock().unwrap();
    let s = state.as_mut().expect("MIDI not initialized");

    if s.output_ports.contains_key(&device_id) {
        return 0;
    }

    let port = match s
        .context
        .device(device_id)
        .and_then(|dev| s.context.output_port(dev, 1024))
    {
        Ok(port) => port,
        Err(_) => return -1,
    };
    let port: pm::OutputPort<'static> = unsafe { std::mem::transmute(port) };
    s.output_ports.insert(device_id, port);
    0
}

#[deno_bindgen]
pub fn midi_close_output(device_id: i32) {
    let mut state = MIDI_STATE.lock().unwrap();
    if let Some(s) = state.as_mut() {
        s.output_ports.remove(&device_id);
    }
}

#[deno_bindgen]
pub fn midi_send_message(device_id: i32, status: u8, data1: u8, data2: u8, data3: u8) {
    let mut state = MIDI_STATE.lock().unwrap();
    let s = state.as_mut().expect("MIDI not initialized");

    let port = s
        .output_ports
        .get_mut(&device_id)
        .expect("Output port not open");

    let message = pm::MidiMessage {
        status,
        data1,
        data2,
        data3,
    };

    let _ = port.write_message(message);
}

#[deno_bindgen]
pub fn midi_send_sysex(device_id: i32, data: &[u8]) -> i32 {
    if data.first() != Some(&0xF0) || data.last() != Some(&0xF7) {
        return -2;
    }
    let mut state = MIDI_STATE.lock().unwrap();
    let s = state.as_mut().expect("MIDI not initialized");
    let port = match s.output_ports.get_mut(&device_id) {
        Some(p) => p,
        None => return -3,
    };
    match port.write_sysex(0, data) {
        Ok(_) => 0,
        Err(_) => -4,
    }
}

#[deno_bindgen]
pub fn midi_open_input(device_id: i32) -> i32 {
    let mut state = MIDI_STATE.lock().unwrap();
    let s = state.as_mut().expect("MIDI not initialized");

    if s.input_ports.contains_key(&device_id) {
        return 0; // already open
    }

    let port = match s
        .context
        .device(device_id)
        .and_then(|dev| s.context.input_port(dev, 1024))
    {
        Ok(port) => port,
        Err(_) => return -1,
    };
    // SAFETY: The port borrows from s.context which lives in a static Mutex.
    // The context outlives the port because we always remove ports before the
    // static is dropped (which effectively never happens).
    let port: pm::InputPort<'static> = unsafe { std::mem::transmute(port) };
    s.input_ports.insert(device_id, port);
    0
}

#[deno_bindgen]
pub fn midi_read_messages(device_id: i32) -> *const c_char {
    let mut state = MIDI_STATE.lock().unwrap();
    let s = state.as_mut().expect("MIDI not initialized");

    let port = match s.input_ports.get_mut(&device_id) {
        Some(p) => p,
        None => {
            let empty = CString::new("[]").unwrap();
            return empty.into_raw();
        }
    };

    // Collect raw event bytes first so the port borrow ends before we touch sysex_buffers.
    let raw_events: Vec<(u8, u8, u8, u8)> = {
        let mut events = vec![];
        while let Ok(Some(event)) = port.read() {
            let m = event.message;
            events.push((m.status, m.data1, m.data2, m.data3));
        }
        events
    };

    let buf = s.sysex_buffers.entry(device_id).or_default();
    let mut messages: Vec<Vec<u8>> = vec![];

    for (status, data1, data2, data3) in raw_events {
        if status == 0xF0 {
            buf.clear();
        }
        if !buf.is_empty() || status == 0xF0 {
            // SysEx accumulation: PortMidi packs bytes into all 4 fields
            for byte in [status, data1, data2, data3] {
                buf.push(byte);
                if byte == 0xF7 {
                    messages.push(buf.clone());
                    buf.clear();
                    break;
                }
            }
        } else {
            messages.push(vec![status, data1, data2]);
        }
    }

    let json_str = serde_json::to_string(&messages).unwrap();
    let c_str = CString::new(json_str).unwrap();
    c_str.into_raw()
}

#[deno_bindgen]
pub fn midi_close_input(device_id: i32) {
    let mut state = MIDI_STATE.lock().unwrap();
    if let Some(s) = state.as_mut() {
        s.input_ports.remove(&device_id);
    }
}
