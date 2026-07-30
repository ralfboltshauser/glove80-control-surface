use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::TaskBoardBinding;

pub const CONFIGURATION_SCHEMA_VERSION: u16 = 1;

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    pub brightness: u8,
    pub reduce_motion: bool,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            brightness: 48,
            reduce_motion: false,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationDocument {
    pub schema_version: u16,
    pub task_board: Option<TaskBoardBinding>,
    pub preferences: AppPreferences,
}

impl ConfigurationDocument {
    pub fn new(task_board: Option<TaskBoardBinding>) -> Self {
        Self {
            schema_version: CONFIGURATION_SCHEMA_VERSION,
            task_board,
            preferences: AppPreferences::default(),
        }
    }

    pub fn to_json(&self) -> Result<String, ConfigurationError> {
        Ok(serde_json::to_string_pretty(self)?)
    }

    pub fn from_json(json: &str) -> Result<Self, ConfigurationError> {
        let document: Self = serde_json::from_str(json)?;
        if document.schema_version != CONFIGURATION_SCHEMA_VERSION {
            return Err(ConfigurationError::UnsupportedSchema(
                document.schema_version,
            ));
        }
        if let Some(binding) = &document.task_board {
            binding
                .validate()
                .map_err(ConfigurationError::InvalidBinding)?;
        }
        Ok(document)
    }
}

#[derive(Debug, Error)]
pub enum ConfigurationError {
    #[error("configuration JSON is invalid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("configuration schema {0} is unsupported")]
    UnsupportedSchema(u16),
    #[error("configuration binding is invalid: {0}")]
    InvalidBinding(&'static str),
}

#[cfg(test)]
mod tests {
    use surface_protocol::CellId;

    use crate::{BindingId, TaskBoardBinding};

    use super::*;

    #[test]
    fn durable_configuration_never_serializes_runtime_resource_identity() {
        let document = ConfigurationDocument::new(Some(TaskBoardBinding {
            binding_id: BindingId("codex-board".into()),
            cells: vec![
                CellId::new(0).expect("cell"),
                CellId::new(40).expect("cell"),
            ],
            workspace_roots: vec!["/workspace".into()],
        }));
        let json = document.to_json().expect("serialize");
        assert!(json.contains("\"cells\": [\n      0,\n      40"));
        assert!(!json.contains("resource"));
        assert!(!json.contains("thread"));
        assert_eq!(
            ConfigurationDocument::from_json(&json).expect("round trip"),
            document
        );
    }
}
