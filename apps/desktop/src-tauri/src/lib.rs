use serde::Serialize;
use surface_protocol::DeviceCapabilities;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
    mode: &'static str,
    device: DeviceCapabilities,
}

#[tauri::command]
fn bootstrap_state() -> BootstrapState {
    BootstrapState {
        mode: "simulation",
        device: DeviceCapabilities::simulated_glove80(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![bootstrap_state])
        .run(tauri::generate_context!())
        .expect("failed to run Glove80 Control Surface");
}
