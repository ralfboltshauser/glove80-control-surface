//! Versioned, transport-independent control-surface protocol.
//!
//! HID report IDs and operating-system APIs belong to transport adapters. This
//! crate owns the strict logical packet format shared by a simulator, host, and
//! future firmware implementation.

mod types;
mod wire;

pub use types::{
    AppliedScene, ApplyDisposition, CellEvent, CellEventKind, CellId, CellPresentation,
    DesiredScene, DeviceCapabilities, DeviceErrorCode, DeviceEvent, DeviceSnapshot, EffectKind,
    Half, ProtocolError, Rgb, SceneGeneration, SessionId,
};
pub use wire::{
    MAX_PACKET_BYTES, Packet, PacketKind, SceneFragment, WireError, decode_packet, encode_packet,
    scene_checksum,
};
