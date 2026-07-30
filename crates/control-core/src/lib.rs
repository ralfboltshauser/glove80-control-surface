//! Pure application policy.
//!
//! The durable binding names a changing collection. Individual Codex thread
//! identities only exist in [`SlotAllocation`], which is runtime state.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use surface_protocol::CellId;

#[derive(Clone, Debug, Eq, Hash, PartialEq, Deserialize, Serialize)]
#[serde(transparent)]
pub struct ResourceId(pub String);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Retention {
    Normal,
    Protected,
}

/// A provider-sorted runtime resource. Earlier entries are more relevant.
#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationCandidate {
    pub resource_id: ResourceId,
    pub retention: Retention,
}

/// Durable configuration. It cannot contain a runtime resource/thread ID.
#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskBoardBinding {
    pub cells: Vec<CellId>,
    pub workspace_roots: Vec<String>,
}

/// Sticky runtime placement for one dynamic collection.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SlotAllocation {
    by_cell: HashMap<CellId, ResourceId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllocationResult {
    pub by_cell: HashMap<CellId, ResourceId>,
    pub overflow: Vec<ResourceId>,
}

impl SlotAllocation {
    /// Reconcile provider-sorted candidates without moving resources that are
    /// still represented.
    ///
    /// Empty cells fill first. If full, a more relevant incoming candidate may
    /// replace the least relevant normal occupant. Protected occupants never
    /// move merely because another resource changed state.
    pub fn reconcile(
        &mut self,
        ordered_cells: &[CellId],
        candidates: &[AllocationCandidate],
    ) -> AllocationResult {
        let eligible: HashSet<&ResourceId> = candidates
            .iter()
            .map(|candidate| &candidate.resource_id)
            .collect();
        let valid_cells: HashSet<CellId> = ordered_cells.iter().copied().collect();

        self.by_cell
            .retain(|cell, resource| valid_cells.contains(cell) && eligible.contains(resource));

        let priority: HashMap<&ResourceId, usize> = candidates
            .iter()
            .enumerate()
            .map(|(index, candidate)| (&candidate.resource_id, index))
            .collect();
        let retention: HashMap<&ResourceId, Retention> = candidates
            .iter()
            .map(|candidate| (&candidate.resource_id, candidate.retention))
            .collect();

        for candidate in candidates {
            if self
                .by_cell
                .values()
                .any(|resource| resource == &candidate.resource_id)
            {
                continue;
            }

            if let Some(empty_cell) = ordered_cells
                .iter()
                .find(|cell| !self.by_cell.contains_key(cell))
            {
                self.by_cell
                    .insert(*empty_cell, candidate.resource_id.clone());
                continue;
            }

            let candidate_priority = priority[&candidate.resource_id];
            let replacement = ordered_cells
                .iter()
                .filter_map(|cell| {
                    let occupant = self.by_cell.get(cell)?;
                    if retention.get(occupant) != Some(&Retention::Normal) {
                        return None;
                    }
                    let occupant_priority = priority.get(occupant).copied()?;
                    (candidate_priority < occupant_priority).then_some((*cell, occupant_priority))
                })
                .max_by_key(|(_, occupant_priority)| *occupant_priority);

            if let Some((cell, _)) = replacement {
                self.by_cell.insert(cell, candidate.resource_id.clone());
            }
        }

        let represented: HashSet<&ResourceId> = self.by_cell.values().collect();
        let overflow = candidates
            .iter()
            .filter(|candidate| !represented.contains(&candidate.resource_id))
            .map(|candidate| candidate.resource_id.clone())
            .collect();

        AllocationResult {
            by_cell: self.by_cell.clone(),
            overflow,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AllocationCandidate, ResourceId, Retention, SlotAllocation, TaskBoardBinding};
    use surface_protocol::CellId;

    fn candidate(id: &str, retention: Retention) -> AllocationCandidate {
        AllocationCandidate {
            resource_id: ResourceId(id.to_owned()),
            retention,
        }
    }

    #[test]
    fn status_reordering_does_not_shuffle_represented_tasks() {
        let cells = [CellId::new(0).unwrap(), CellId::new(1).unwrap()];
        let mut allocation = SlotAllocation::default();

        allocation.reconcile(
            &cells,
            &[
                candidate("task-a", Retention::Normal),
                candidate("task-b", Retention::Protected),
            ],
        );
        let result = allocation.reconcile(
            &cells,
            &[
                candidate("task-b", Retention::Protected),
                candidate("task-a", Retention::Normal),
            ],
        );

        assert_eq!(result.by_cell[&cells[0]], ResourceId("task-a".into()));
        assert_eq!(result.by_cell[&cells[1]], ResourceId("task-b".into()));
    }

    #[test]
    fn urgent_new_task_replaces_only_the_worst_normal_task() {
        let cells = [CellId::new(0).unwrap(), CellId::new(1).unwrap()];
        let mut allocation = SlotAllocation::default();

        allocation.reconcile(
            &cells,
            &[
                candidate("old-idle", Retention::Normal),
                candidate("working", Retention::Protected),
            ],
        );
        let result = allocation.reconcile(
            &cells,
            &[
                candidate("needs-input", Retention::Protected),
                candidate("working", Retention::Protected),
                candidate("old-idle", Retention::Normal),
            ],
        );

        assert_eq!(result.by_cell[&cells[0]], ResourceId("needs-input".into()));
        assert_eq!(result.by_cell[&cells[1]], ResourceId("working".into()));
        assert_eq!(result.overflow, vec![ResourceId("old-idle".into())]);
    }

    #[test]
    fn protected_board_overflows_without_moving_existing_tasks() {
        let cells = [CellId::new(0).unwrap(), CellId::new(1).unwrap()];
        let mut allocation = SlotAllocation::default();

        allocation.reconcile(
            &cells,
            &[
                candidate("working-a", Retention::Protected),
                candidate("working-b", Retention::Protected),
            ],
        );
        let result = allocation.reconcile(
            &cells,
            &[
                candidate("needs-input", Retention::Protected),
                candidate("working-a", Retention::Protected),
                candidate("working-b", Retention::Protected),
            ],
        );

        assert_eq!(result.by_cell[&cells[0]], ResourceId("working-a".into()));
        assert_eq!(result.by_cell[&cells[1]], ResourceId("working-b".into()));
        assert_eq!(result.overflow, vec![ResourceId("needs-input".into())]);
    }

    #[test]
    fn durable_binding_serialization_has_no_runtime_task_identity() {
        let binding = TaskBoardBinding {
            cells: vec![CellId::new(0).unwrap(), CellId::new(1).unwrap()],
            workspace_roots: Vec::new(),
        };
        let json = serde_json::to_string(&binding).expect("serializable");

        assert_eq!(json, r#"{"cells":[0,1],"workspaceRoots":[]}"#);
        assert!(!json.contains("thread"));
        assert!(!json.contains("resource"));
    }
}
