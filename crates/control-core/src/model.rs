use serde::{Deserialize, Serialize};
use surface_protocol::CellId;

#[derive(Clone, Debug, Eq, Hash, PartialEq, Deserialize, Serialize)]
#[serde(transparent)]
pub struct BindingId(pub String);

#[derive(Clone, Debug, Eq, Hash, PartialEq, Deserialize, Serialize)]
#[serde(transparent)]
pub struct ResourceId(pub String);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Retention {
    Normal,
    Protected,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SemanticState {
    Idle,
    Working,
    CompletedUnread,
    NeedsInput,
    Failed,
    Stale,
}

impl SemanticState {
    pub const fn retention(self) -> Retention {
        match self {
            Self::Idle | Self::Stale => Retention::Normal,
            Self::Working | Self::CompletedUnread | Self::NeedsInput | Self::Failed => {
                Retention::Protected
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionAvailability {
    pub enabled: bool,
    pub explanation: Option<String>,
}

impl ActionAvailability {
    pub fn enabled() -> Self {
        Self {
            enabled: true,
            explanation: None,
        }
    }

    pub fn disabled(explanation: impl Into<String>) -> Self {
        Self {
            enabled: false,
            explanation: Some(explanation.into()),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTile {
    pub resource_id: ResourceId,
    pub label: String,
    pub context: String,
    pub state: SemanticState,
    pub action: ActionAvailability,
    pub retention: Retention,
    pub revision: u64,
}

impl ResolvedTile {
    pub fn allocation_candidate(&self) -> AllocationCandidate {
        AllocationCandidate {
            resource_id: self.resource_id.clone(),
            retention: self.retention,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllocationCandidate {
    pub resource_id: ResourceId,
    pub retention: Retention,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CollectionAvailability {
    Online,
    Stale,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedCollection {
    pub binding_id: BindingId,
    pub availability: CollectionAvailability,
    pub collection_revision: u64,
    pub observed_at_millis: u64,
    pub expires_at_millis: u64,
    pub tiles: Vec<ResolvedTile>,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskBoardBinding {
    pub binding_id: BindingId,
    pub cells: Vec<CellId>,
    pub workspace_roots: Vec<String>,
}

impl TaskBoardBinding {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.binding_id.0.trim().is_empty() {
            return Err("binding ID cannot be empty");
        }
        if self.cells.is_empty() {
            return Err("task board needs at least one cell");
        }
        let mut cells = self.cells.clone();
        cells.sort_unstable();
        cells.dedup();
        if cells.len() != self.cells.len() {
            return Err("task board cells must be unique");
        }
        Ok(())
    }
}
