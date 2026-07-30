use std::collections::{HashMap, HashSet};

use surface_protocol::CellId;
use thiserror::Error;

use crate::model::{AllocationCandidate, ResourceId, Retention};

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct SlotAllocation {
    by_cell: HashMap<CellId, ResourceId>,
    last_collection_revision: Option<u64>,
    frozen: Option<FrozenAllocation>,
    deferred: Option<DeferredReconcile>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct FrozenAllocation {
    epoch: u32,
    by_cell: HashMap<CellId, ResourceId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct DeferredReconcile {
    ordered_cells: Vec<CellId>,
    candidates: Vec<AllocationCandidate>,
    collection_revision: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllocationResult {
    pub by_cell: HashMap<CellId, ResourceId>,
    pub overflow: Vec<ResourceId>,
    pub deferred_during_interaction: bool,
}

impl SlotAllocation {
    pub fn reconcile(
        &mut self,
        ordered_cells: &[CellId],
        candidates: &[AllocationCandidate],
        collection_revision: u64,
    ) -> Result<AllocationResult, AllocationError> {
        let current_revision = self
            .deferred
            .as_ref()
            .map(|deferred| deferred.collection_revision)
            .or(self.last_collection_revision);
        if current_revision.is_some_and(|revision| collection_revision <= revision) {
            return Err(AllocationError::StaleCollection {
                incoming: collection_revision,
                current: current_revision.expect("checked"),
            });
        }

        if self.frozen.is_some() {
            self.deferred = Some(DeferredReconcile {
                ordered_cells: ordered_cells.to_vec(),
                candidates: candidates.to_vec(),
                collection_revision,
            });
            return Ok(AllocationResult {
                by_cell: self.by_cell.clone(),
                overflow: overflow(&self.by_cell, candidates),
                deferred_during_interaction: true,
            });
        }

        Ok(self.reconcile_now(ordered_cells, candidates, collection_revision))
    }

    fn reconcile_now(
        &mut self,
        ordered_cells: &[CellId],
        candidates: &[AllocationCandidate],
        collection_revision: u64,
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

        self.last_collection_revision = Some(collection_revision);
        AllocationResult {
            overflow: overflow(&self.by_cell, candidates),
            by_cell: self.by_cell.clone(),
            deferred_during_interaction: false,
        }
    }

    pub fn begin_interaction(&mut self, epoch: u32) -> Result<(), AllocationError> {
        if epoch == 0 {
            return Err(AllocationError::ZeroInteractionEpoch);
        }
        if let Some(frozen) = &self.frozen {
            return Err(AllocationError::InteractionAlreadyActive(frozen.epoch));
        }
        self.frozen = Some(FrozenAllocation {
            epoch,
            by_cell: self.by_cell.clone(),
        });
        Ok(())
    }

    pub fn end_interaction(
        &mut self,
        epoch: u32,
    ) -> Result<Option<AllocationResult>, AllocationError> {
        let active_epoch = self
            .frozen
            .as_ref()
            .ok_or(AllocationError::NoInteractionActive)?
            .epoch;
        if active_epoch != epoch {
            return Err(AllocationError::WrongInteractionEpoch {
                expected: active_epoch,
                received: epoch,
            });
        }
        self.frozen = None;
        Ok(self.deferred.take().map(|deferred| {
            self.reconcile_now(
                &deferred.ordered_cells,
                &deferred.candidates,
                deferred.collection_revision,
            )
        }))
    }

    pub fn frozen_resource(&self, epoch: u32, cell: CellId) -> Option<&ResourceId> {
        self.frozen
            .as_ref()
            .filter(|frozen| frozen.epoch == epoch)
            .and_then(|frozen| frozen.by_cell.get(&cell))
    }

    pub fn by_cell(&self) -> &HashMap<CellId, ResourceId> {
        &self.by_cell
    }
}

fn overflow(
    by_cell: &HashMap<CellId, ResourceId>,
    candidates: &[AllocationCandidate],
) -> Vec<ResourceId> {
    let represented: HashSet<&ResourceId> = by_cell.values().collect();
    candidates
        .iter()
        .filter(|candidate| !represented.contains(&candidate.resource_id))
        .map(|candidate| candidate.resource_id.clone())
        .collect()
}

#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum AllocationError {
    #[error("collection revision {incoming} is not newer than {current}")]
    StaleCollection { incoming: u64, current: u64 },
    #[error("interaction epoch must be non-zero")]
    ZeroInteractionEpoch,
    #[error("interaction epoch {0} is already active")]
    InteractionAlreadyActive(u32),
    #[error("no interaction is active")]
    NoInteractionActive,
    #[error("interaction epoch {received} does not match active epoch {expected}")]
    WrongInteractionEpoch { expected: u32, received: u32 },
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cell(value: u8) -> CellId {
        CellId::new(value).expect("cell")
    }

    fn candidate(id: &str, retention: Retention) -> AllocationCandidate {
        AllocationCandidate {
            resource_id: ResourceId(id.to_owned()),
            retention,
        }
    }

    #[test]
    fn represented_resources_do_not_shuffle_when_priority_changes() {
        let cells = [cell(0), cell(1)];
        let mut allocation = SlotAllocation::default();
        allocation
            .reconcile(
                &cells,
                &[
                    candidate("a", Retention::Normal),
                    candidate("b", Retention::Protected),
                ],
                1,
            )
            .expect("first");
        let result = allocation
            .reconcile(
                &cells,
                &[
                    candidate("b", Retention::Protected),
                    candidate("a", Retention::Normal),
                ],
                2,
            )
            .expect("second");
        assert_eq!(result.by_cell[&cell(0)], ResourceId("a".into()));
        assert_eq!(result.by_cell[&cell(1)], ResourceId("b".into()));
    }

    #[test]
    fn protected_board_overflows_without_moving_existing_resources() {
        let cells = [cell(0), cell(1)];
        let mut allocation = SlotAllocation::default();
        allocation
            .reconcile(
                &cells,
                &[
                    candidate("working-a", Retention::Protected),
                    candidate("working-b", Retention::Protected),
                ],
                1,
            )
            .expect("first");
        let result = allocation
            .reconcile(
                &cells,
                &[
                    candidate("needs-input", Retention::Protected),
                    candidate("working-a", Retention::Protected),
                    candidate("working-b", Retention::Protected),
                ],
                2,
            )
            .expect("second");
        assert_eq!(result.by_cell[&cell(0)], ResourceId("working-a".into()));
        assert_eq!(result.by_cell[&cell(1)], ResourceId("working-b".into()));
        assert_eq!(result.overflow, vec![ResourceId("needs-input".into())]);
    }

    #[test]
    fn interaction_freezes_every_cell_until_matching_epoch_ends() {
        let cells = [cell(0), cell(1)];
        let mut allocation = SlotAllocation::default();
        allocation
            .reconcile(&cells, &[candidate("a", Retention::Normal)], 1)
            .expect("first");
        allocation.begin_interaction(7).expect("begin");

        let deferred = allocation
            .reconcile(&cells, &[candidate("b", Retention::Protected)], 2)
            .expect("deferred");
        assert!(deferred.deferred_during_interaction);
        assert_eq!(
            allocation.frozen_resource(7, cell(0)),
            Some(&ResourceId("a".into()))
        );

        let applied = allocation
            .end_interaction(7)
            .expect("end")
            .expect("deferred reconciliation");
        assert_eq!(applied.by_cell[&cell(0)], ResourceId("b".into()));
    }

    #[test]
    fn stale_collection_revision_is_rejected() {
        let mut allocation = SlotAllocation::default();
        allocation
            .reconcile(&[cell(0)], &[candidate("a", Retention::Normal)], 4)
            .expect("first");
        assert_eq!(
            allocation.reconcile(&[cell(0)], &[candidate("b", Retention::Normal)], 4),
            Err(AllocationError::StaleCollection {
                incoming: 4,
                current: 4
            })
        );
    }
}
