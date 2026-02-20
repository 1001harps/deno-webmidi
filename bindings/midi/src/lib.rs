use deno_bindgen::deno_bindgen;
use serde::{Deserialize, Serialize};
use std::ffi::CString;
use std::os::raw::c_char;
use std::sync::Mutex;
extern crate portmidi as pm;

static MIDI_CONTEXT: Mutex<Option<pm::PortMidi>> = Mutex::new(None);

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
    let mut context = MIDI_CONTEXT.lock().unwrap();
    if context.is_none() {
        *context = Some(pm::PortMidi::new().unwrap());
    }
}

#[deno_bindgen]
pub fn midi_devices() -> *const c_char {
    let context = MIDI_CONTEXT.lock().unwrap();
    let ctx = context.as_ref().expect("MIDI not initialized");

    let device_list = ctx.devices().unwrap();

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
pub fn midi_send_message(status: u8, data1: u8, data2: u8, data3: u8) {
    let context = MIDI_CONTEXT.lock().unwrap();
    let ctx = context.as_ref().expect("MIDI not initialized");

    let id = ctx.default_output_device_id().unwrap();

    let mut out_port = ctx
        .device(id)
        .and_then(|dev| ctx.output_port(dev, 1024))
        .unwrap();

    let message = pm::MidiMessage {
        status,
        data1,
        data2,
        data3,
    };

    let _ = out_port.write_message(message);
}
