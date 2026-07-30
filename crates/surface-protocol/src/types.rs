use std::collections::HashSet;

use serde::{Deserialize, Deserializer, Serialize, de::Error as _};
use thiserror::Error;

/// Version 1 is the existing six-cell experiment. The complete-scene protocol
/// starts at 2 so the two formats can never be mistaken for one another.
pub const PROTOCOL_VERSION: u16 = 2;

/// Stable physical identity of a renderable or interactive key position.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(transparent)]
pub struct CellId(u8);

impl CellId {
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

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Deserialize, Serialize)]
#[serde(transparent)]
pub struct SessionId(u32);

impl SessionId {
    pub fn new(value: u32) -> Result<Self, ProtocolError> {
        if value == 0 {
            Err(ProtocolError::ZeroSessionId)
        } else {
            Ok(Self(value))
        }
    }

    pub const fn get(self) -> u32 {
        self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Deserialize, Serialize)]
#[serde(transparent)]
pub struct SceneGeneration(u32);

impl SceneGeneration {
    pub fn new(value: u32) -> Result<Self, ProtocolError> {
        if value == 0 {
            Err(ProtocolError::ZeroSceneGeneration)
        } else {
            Ok(Self(value))
        }
    }

    pub const fn get(self) -> u32 {
        self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Half {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EffectKind {
    Solid,
    Pulse,
}

impl EffectKind {
    pub(crate) const fn wire_value(self) -> u8 {
        match self {
            Self::Solid => 0,
            Self::Pulse => 1,
        }
    }

    pub(crate) fn from_wire(value: u8) -> Result<Self, ProtocolError> {
        match value {
            0 => Ok(Self::Solid),
            1 => Ok(Self::Pulse),
            _ => Err(ProtocolError::UnknownEffect(value)),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rgb {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CellPresentation {
    pub cell_id: CellId,
    pub color: Rgb,
    pub effect: EffectKind,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCapabilities {
    pub protocol_version: u16,
    pub topology_id: String,
    pub available_cells: Vec<CellId>,
    pub supports_input_events: bool,
    pub supports_right_half_acknowledgement: bool,
    pub supported_effects: Vec<EffectKind>,
    pub max_scene_cells: u8,
    pub max_lease_millis: u32,
    pub max_brightness: u8,
}

impl DeviceCapabilities {
    pub fn simulated_glove80() -> Self {
        Self {
            protocol_version: PROTOCOL_VERSION,
            topology_id: "glove80-rgb-80-v1".to_owned(),
            available_cells: (0..CellId::GLOVE80_CELL_COUNT)
                .map(|value| CellId::new(value).expect("catalog range"))
                .collect(),
            supports_input_events: true,
            supports_right_half_acknowledgement: true,
            supported_effects: vec![EffectKind::Solid, EffectKind::Pulse],
            max_scene_cells: CellId::GLOVE80_CELL_COUNT,
            max_lease_millis: 60_000,
            max_brightness: 96,
        }
    }

    pub fn validate(&self) -> Result<(), ProtocolError> {
        if self.protocol_version != PROTOCOL_VERSION {
            return Err(ProtocolError::UnsupportedVersion(self.protocol_version));
        }
        if self.topology_id.trim().is_empty() {
            return Err(ProtocolError::EmptyTopologyId);
        }
        if self.max_scene_cells == 0
            || self.max_scene_cells as usize > self.available_cells.len()
            || self.max_lease_millis == 0
        {
            return Err(ProtocolError::InvalidCapabilities);
        }
        if self.supported_effects.is_empty() {
            return Err(ProtocolError::InvalidCapabilities);
        }

        let mut cells = HashSet::new();
        if self.available_cells.iter().any(|cell| !cells.insert(*cell)) {
            return Err(ProtocolError::DuplicateCapabilityCell);
        }

        let mut effects = HashSet::new();
        if self
            .supported_effects
            .iter()
            .any(|effect| !effects.insert(*effect))
        {
            return Err(ProtocolError::DuplicateCapabilityEffect);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesiredScene {
    pub session_id: SessionId,
    pub generation: SceneGeneration,
    pub lease_millis: u32,
    pub brightness: u8,
    pub cells: Vec<CellPresentation>,
}

impl DesiredScene {
    pub fn validate(&self, capabilities: &DeviceCapabilities) -> Result<(), ProtocolError> {
        capabilities.validate()?;
        if self.lease_millis == 0 || self.lease_millis > capabilities.max_lease_millis {
            return Err(ProtocolError::LeaseOutOfRange(self.lease_millis));
        }
        if self.brightness > capabilities.max_brightness {
            return Err(ProtocolError::BrightnessOutOfRange(self.brightness));
        }
        if self.cells.len() > capabilities.max_scene_cells as usize {
            return Err(ProtocolError::SceneTooLarge(self.cells.len()));
        }

        let available: HashSet<CellId> = capabilities.available_cells.iter().copied().collect();
        let effects: HashSet<EffectKind> = capabilities.supported_effects.iter().copied().collect();
        let mut seen = HashSet::new();
        for presentation in &self.cells {
            if !available.contains(&presentation.cell_id) {
                return Err(ProtocolError::UnavailableCell(presentation.cell_id.get()));
            }
            if !effects.contains(&presentation.effect) {
                return Err(ProtocolError::UnsupportedEffect(presentation.effect));
            }
            if !seen.insert(presentation.cell_id) {
                return Err(ProtocolError::DuplicateSceneCell(
                    presentation.cell_id.get(),
                ));
            }
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ApplyDisposition {
    Applied,
    Partial,
    Rejected,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedScene {
    pub generation: SceneGeneration,
    pub left_generation: Option<SceneGeneration>,
    pub right_generation: Option<SceneGeneration>,
    pub disposition: ApplyDisposition,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CellEventKind {
    Down,
    Up,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CellEvent {
    pub sequence: u32,
    pub interaction_epoch: u32,
    pub cell_id: CellId,
    pub kind: CellEventKind,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceErrorCode {
    InvalidPacket,
    UnsupportedVersion,
    SessionExpired,
    IncompatibleRightHalf,
    ElectricalLimit,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DeviceEvent {
    Cell(CellEvent),
    SceneExpired { generation: SceneGeneration },
    Error { code: DeviceErrorCode },
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSnapshot {
    pub connected: bool,
    pub paused: bool,
    pub active_generation: Option<SceneGeneration>,
    pub left_generation: Option<SceneGeneration>,
    pub right_generation: Option<SceneGeneration>,
    pub lease_expires_at_millis: Option<u64>,
}

#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ProtocolError {
    #[error("cell {0} is outside the supported Glove80 topology")]
    CellOutOfRange(u8),
    #[error("session ID must be non-zero")]
    ZeroSessionId,
    #[error("scene generation must be non-zero")]
    ZeroSceneGeneration,
    #[error("protocol version {0} is unsupported")]
    UnsupportedVersion(u16),
    #[error("topology ID cannot be empty")]
    EmptyTopologyId,
    #[error("capability limits are inconsistent")]
    InvalidCapabilities,
    #[error("capabilities contain a duplicate cell")]
    DuplicateCapabilityCell,
    #[error("capabilities contain a duplicate effect")]
    DuplicateCapabilityEffect,
    #[error("effect value {0} is unknown")]
    UnknownEffect(u8),
    #[error("effect {0:?} is not supported")]
    UnsupportedEffect(EffectKind),
    #[error("lease {0}ms is outside device limits")]
    LeaseOutOfRange(u32),
    #[error("brightness {0} is outside device limits")]
    BrightnessOutOfRange(u8),
    #[error("scene has {0} cells, exceeding device limits")]
    SceneTooLarge(usize),
    #[error("cell {0} is not exposed by this device")]
    UnavailableCell(u8),
    #[error("scene contains cell {0} more than once")]
    DuplicateSceneCell(u8),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn presentation(cell: u8) -> CellPresentation {
        CellPresentation {
            cell_id: CellId::new(cell).expect("valid test cell"),
            color: Rgb {
                red: 1,
                green: 2,
                blue: 3,
            },
            effect: EffectKind::Solid,
        }
    }

    #[test]
    fn identifiers_enforce_sentinels_and_catalog_bounds() {
        assert_eq!(CellId::new(79).expect("last cell").get(), 79);
        assert_eq!(CellId::new(80), Err(ProtocolError::CellOutOfRange(80)));
        assert_eq!(SessionId::new(0), Err(ProtocolError::ZeroSessionId));
        assert_eq!(
            SceneGeneration::new(0),
            Err(ProtocolError::ZeroSceneGeneration)
        );
    }

    #[test]
    fn deserialization_cannot_bypass_cell_bounds() {
        assert_eq!(
            serde_json::from_str::<CellId>("79").expect("last cell"),
            CellId::new(79).expect("last cell")
        );
        assert!(serde_json::from_str::<CellId>("80").is_err());
        assert!(serde_json::from_str::<CellId>("256").is_err());
    }

    #[test]
    fn simulated_capabilities_are_complete_and_valid() {
        let capabilities = DeviceCapabilities::simulated_glove80();
        assert_eq!(capabilities.available_cells.len(), 80);
        assert_eq!(capabilities.available_cells[79].get(), 79);
        assert!(capabilities.supports_right_half_acknowledgement);
        assert_eq!(capabilities.validate(), Ok(()));
    }

    #[test]
    fn desired_scene_rejects_duplicates_and_excess_brightness() {
        let capabilities = DeviceCapabilities::simulated_glove80();
        let mut scene = DesiredScene {
            session_id: SessionId::new(7).expect("session"),
            generation: SceneGeneration::new(1).expect("generation"),
            lease_millis: 5_000,
            brightness: 40,
            cells: vec![presentation(0), presentation(0)],
        };
        assert_eq!(
            scene.validate(&capabilities),
            Err(ProtocolError::DuplicateSceneCell(0))
        );

        scene.cells.pop();
        scene.brightness = 97;
        assert_eq!(
            scene.validate(&capabilities),
            Err(ProtocolError::BrightnessOutOfRange(97))
        );
    }
}
