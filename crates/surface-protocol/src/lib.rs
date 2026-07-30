//! Versioned types shared by simulated and physical control-surface devices.
//!
//! This crate deliberately contains no HID or ZMK dependency. A transport can
//! only claim a capability after decoding it from a device or simulator.

use serde::{Deserialize, Deserializer, Serialize, de::Error as _};
use thiserror::Error;

/// Stable physical identity of a renderable or interactive key position.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(transparent)]
pub struct CellId(u8);

impl CellId {
    /// Number of physical cells in the first supported Glove80 topology.
    pub const GLOVE80_CELL_COUNT: u8 = 80;

    pub fn new(value: u8) -> Result<Self, ProtocolError> {
        if value < Self::GLOVE80_CELL_COUNT {
            Ok(Self(value))
        } else {
            Err(ProtocolError::CellOutOfRange(value))
        }
    }

    pub const fn get(self) -> u8 {
        self.0
    }
}

impl<'de> Deserialize<'de> for CellId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = u8::deserialize(deserializer)?;
        Self::new(value).map_err(D::Error::custom)
    }
}

/// Rendering vocabulary implemented locally by the device.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EffectKind {
    Solid,
    Pulse,
}

/// An sRGB color after host-side palette and brightness policy have resolved.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
pub struct Rgb {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
}

/// One complete desired cell presentation.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CellPresentation {
    pub cell_id: CellId,
    pub color: Rgb,
    pub effect: EffectKind,
}

/// Facts reported by one logical keyboard connection.
#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCapabilities {
    pub protocol_version: u16,
    pub topology_id: String,
    pub available_cells: Vec<CellId>,
    pub supports_input_events: bool,
    pub supports_right_half_acknowledgement: bool,
    pub supported_effects: Vec<EffectKind>,
}

impl DeviceCapabilities {
    /// Deterministic two-half capabilities for development without hardware.
    pub fn simulated_glove80() -> Self {
        Self {
            protocol_version: 1,
            topology_id: "glove80-rgb-80-v1".to_owned(),
            available_cells: (0..CellId::GLOVE80_CELL_COUNT)
                .map(|value| CellId::new(value).expect("range is valid"))
                .collect(),
            supports_input_events: true,
            supports_right_half_acknowledgement: true,
            supported_effects: vec![EffectKind::Solid, EffectKind::Pulse],
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ProtocolError {
    #[error("cell {0} is outside the supported Glove80 topology")]
    CellOutOfRange(u8),
}

#[cfg(test)]
mod tests {
    use super::{CellId, DeviceCapabilities, EffectKind, ProtocolError};

    #[test]
    fn cell_ids_enforce_the_catalog_boundary() {
        assert_eq!(CellId::new(79).expect("last cell").get(), 79);
        assert_eq!(CellId::new(80), Err(ProtocolError::CellOutOfRange(80)));
    }

    #[test]
    fn deserialization_cannot_bypass_the_catalog_boundary() {
        assert_eq!(
            serde_json::from_str::<CellId>("79").expect("last cell"),
            CellId::new(79).expect("last cell")
        );
        assert!(serde_json::from_str::<CellId>("80").is_err());
        assert!(serde_json::from_str::<CellId>("256").is_err());
    }

    #[test]
    fn simulated_capabilities_describe_both_complete_halves() {
        let capabilities = DeviceCapabilities::simulated_glove80();

        assert_eq!(capabilities.available_cells.len(), 80);
        assert_eq!(capabilities.available_cells[0].get(), 0);
        assert_eq!(capabilities.available_cells[79].get(), 79);
        assert_eq!(
            capabilities.supported_effects,
            vec![EffectKind::Solid, EffectKind::Pulse]
        );
        assert!(capabilities.supports_right_half_acknowledgement);
    }
}
