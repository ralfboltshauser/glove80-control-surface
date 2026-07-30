use std::collections::{HashMap, HashSet};

use surface_protocol::{
    CellId, CellPresentation, DesiredScene, EffectKind, Rgb, SceneGeneration, SessionId,
};
use thiserror::Error;

use crate::{
    AllocationError, CollectionAvailability, ResolvedCollection, ResolvedTile, ResourceId,
    SemanticState, SlotAllocation, TaskBoardBinding,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CoreEvent {
    Observe(ResolvedCollection),
    Tick { now_millis: u64 },
    Acknowledge { resource_id: ResourceId },
    BeginInteraction { epoch: u32 },
    EndInteraction { epoch: u32 },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CoreSnapshot {
    pub binding: TaskBoardBinding,
    pub by_cell: HashMap<CellId, ResolvedTile>,
    pub overflow: Vec<ResolvedTile>,
    pub desired_scene: DesiredScene,
    pub collection_availability: CollectionAvailability,
    pub interaction_epoch: Option<u32>,
}

#[derive(Clone, Debug)]
pub struct TaskBoardCore {
    binding: TaskBoardBinding,
    allocation: SlotAllocation,
    tiles: HashMap<ResourceId, ResolvedTile>,
    acknowledged: HashMap<ResourceId, u64>,
    overflow_ids: Vec<ResourceId>,
    availability: CollectionAvailability,
    expires_at_millis: Option<u64>,
    last_collection_revision: Option<u64>,
    deferred_tiles: Option<HashMap<ResourceId, ResolvedTile>>,
    interaction_epoch: Option<u32>,
    next_scene_generation: u32,
    session_id: SessionId,
}

impl TaskBoardCore {
    pub fn new(binding: TaskBoardBinding, session_id: SessionId) -> Result<Self, CoreError> {
        binding.validate().map_err(CoreError::InvalidBinding)?;
        Ok(Self {
            binding,
            allocation: SlotAllocation::default(),
            tiles: HashMap::new(),
            acknowledged: HashMap::new(),
            overflow_ids: Vec::new(),
            availability: CollectionAvailability::Unavailable,
            expires_at_millis: None,
            last_collection_revision: None,
            deferred_tiles: None,
            interaction_epoch: None,
            next_scene_generation: 1,
            session_id,
        })
    }

    pub fn transition(&mut self, event: CoreEvent) -> Result<CoreSnapshot, CoreError> {
        match event {
            CoreEvent::Observe(collection) => self.observe(collection)?,
            CoreEvent::Tick { now_millis } => {
                if self
                    .expires_at_millis
                    .is_some_and(|expires| now_millis >= expires)
                {
                    self.availability = CollectionAvailability::Stale;
                }
            }
            CoreEvent::Acknowledge { resource_id } => {
                let revision = self
                    .tiles
                    .get(&resource_id)
                    .ok_or(CoreError::UnknownResource)?
                    .revision;
                self.acknowledged.insert(resource_id, revision);
            }
            CoreEvent::BeginInteraction { epoch } => {
                self.allocation.begin_interaction(epoch)?;
                self.interaction_epoch = Some(epoch);
            }
            CoreEvent::EndInteraction { epoch } => {
                if let Some(result) = self.allocation.end_interaction(epoch)? {
                    self.overflow_ids = result.overflow;
                    if let Some(tiles) = self.deferred_tiles.take() {
                        self.tiles = tiles;
                    }
                }
                self.interaction_epoch = None;
            }
        }
        self.snapshot()
    }

    fn observe(&mut self, collection: ResolvedCollection) -> Result<(), CoreError> {
        if collection.binding_id != self.binding.binding_id {
            return Err(CoreError::WrongBinding);
        }
        if collection.collection_revision == 0
            || self
                .last_collection_revision
                .is_some_and(|revision| collection.collection_revision <= revision)
        {
            return Err(CoreError::StaleCollectionRevision {
                incoming: collection.collection_revision,
                current: self.last_collection_revision.unwrap_or(0),
            });
        }
        if collection.expires_at_millis <= collection.observed_at_millis {
            return Err(CoreError::InvalidExpiry);
        }
        if collection.tiles.iter().any(|tile| tile.revision == 0) {
            return Err(CoreError::ZeroTileRevision);
        }

        self.last_collection_revision = Some(collection.collection_revision);
        self.availability = collection.availability;
        self.expires_at_millis = Some(collection.expires_at_millis);
        if collection.availability != CollectionAvailability::Online {
            return Ok(());
        }

        let mut resource_ids = HashSet::new();
        if collection
            .tiles
            .iter()
            .any(|tile| !resource_ids.insert(tile.resource_id.clone()))
        {
            return Err(CoreError::DuplicateResource);
        }
        let incoming_tiles = collection
            .tiles
            .iter()
            .cloned()
            .map(|tile| (tile.resource_id.clone(), tile))
            .collect::<HashMap<_, _>>();
        let candidates = collection
            .tiles
            .iter()
            .map(ResolvedTile::allocation_candidate)
            .collect::<Vec<_>>();
        let result = self.allocation.reconcile(
            &self.binding.cells,
            &candidates,
            collection.collection_revision,
        )?;
        self.overflow_ids = result.overflow;
        if result.deferred_during_interaction {
            self.deferred_tiles = Some(incoming_tiles);
        } else {
            self.tiles = incoming_tiles;
        }
        Ok(())
    }

    fn snapshot(&mut self) -> Result<CoreSnapshot, CoreError> {
        let stale = self.availability != CollectionAvailability::Online;
        let by_cell = self
            .allocation
            .by_cell()
            .iter()
            .filter_map(|(cell, resource)| {
                self.tiles.get(resource).cloned().map(|mut tile| {
                    if stale {
                        tile.state = SemanticState::Stale;
                        tile.action =
                            crate::ActionAvailability::disabled("Source is stale or unavailable");
                    } else if self
                        .acknowledged
                        .get(resource)
                        .is_some_and(|revision| *revision >= tile.revision)
                        && matches!(
                            tile.state,
                            SemanticState::CompletedUnread | SemanticState::Failed
                        )
                    {
                        tile.state = SemanticState::Idle;
                        tile.retention = crate::Retention::Normal;
                    }
                    (*cell, tile)
                })
            })
            .collect::<HashMap<_, _>>();
        let overflow = self
            .overflow_ids
            .iter()
            .filter_map(|resource| self.tiles.get(resource).cloned())
            .collect();
        let desired_scene = DesiredScene {
            session_id: self.session_id,
            generation: SceneGeneration::new(self.next_scene_generation)
                .map_err(CoreError::Protocol)?,
            lease_millis: 5_000,
            brightness: 48,
            cells: by_cell
                .iter()
                .map(|(cell, tile)| presentation(*cell, tile.state))
                .collect(),
        };
        self.next_scene_generation = self.next_scene_generation.wrapping_add(1).max(1);
        Ok(CoreSnapshot {
            binding: self.binding.clone(),
            by_cell,
            overflow,
            desired_scene,
            collection_availability: self.availability,
            interaction_epoch: self.interaction_epoch,
        })
    }

    pub fn frozen_resource(&self, epoch: u32, cell: CellId) -> Option<&ResourceId> {
        self.allocation.frozen_resource(epoch, cell)
    }
}

fn presentation(cell_id: CellId, state: SemanticState) -> CellPresentation {
    let (color, effect) = match state {
        SemanticState::Idle => (
            Rgb {
                red: 220,
                green: 226,
                blue: 235,
            },
            EffectKind::Solid,
        ),
        SemanticState::Working => (
            Rgb {
                red: 54,
                green: 132,
                blue: 255,
            },
            EffectKind::Pulse,
        ),
        SemanticState::CompletedUnread => (
            Rgb {
                red: 52,
                green: 199,
                blue: 89,
            },
            EffectKind::Solid,
        ),
        SemanticState::NeedsInput => (
            Rgb {
                red: 255,
                green: 176,
                blue: 32,
            },
            EffectKind::Pulse,
        ),
        SemanticState::Failed => (
            Rgb {
                red: 255,
                green: 69,
                blue: 58,
            },
            EffectKind::Solid,
        ),
        SemanticState::Stale => (
            Rgb {
                red: 92,
                green: 96,
                blue: 104,
            },
            EffectKind::Solid,
        ),
    };
    CellPresentation {
        cell_id,
        color,
        effect,
    }
}

#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum CoreError {
    #[error("binding is invalid: {0}")]
    InvalidBinding(&'static str),
    #[error("collection belongs to another binding")]
    WrongBinding,
    #[error("collection expiry must be after observation")]
    InvalidExpiry,
    #[error("collection revision {incoming} is not newer than {current}")]
    StaleCollectionRevision { incoming: u64, current: u64 },
    #[error("tile revision must be non-zero")]
    ZeroTileRevision,
    #[error("collection repeats a resource identity")]
    DuplicateResource,
    #[error("resource is not currently represented")]
    UnknownResource,
    #[error(transparent)]
    Allocation(#[from] AllocationError),
    #[error(transparent)]
    Protocol(#[from] surface_protocol::ProtocolError),
}

#[cfg(test)]
mod tests {
    use crate::{ActionAvailability, BindingId};

    use super::*;

    fn cell(value: u8) -> CellId {
        CellId::new(value).expect("cell")
    }

    fn tile(id: &str, state: SemanticState) -> ResolvedTile {
        ResolvedTile {
            resource_id: ResourceId(id.into()),
            label: id.into(),
            context: "workspace".into(),
            state,
            action: ActionAvailability::enabled(),
            retention: state.retention(),
            revision: 1,
        }
    }

    fn collection(revision: u64, tiles: Vec<ResolvedTile>) -> ResolvedCollection {
        ResolvedCollection {
            binding_id: BindingId("codex-board".into()),
            availability: CollectionAvailability::Online,
            collection_revision: revision,
            observed_at_millis: 100,
            expires_at_millis: 200,
            tiles,
        }
    }

    fn core() -> TaskBoardCore {
        TaskBoardCore::new(
            TaskBoardBinding {
                binding_id: BindingId("codex-board".into()),
                cells: vec![cell(0), cell(40)],
                workspace_roots: Vec::new(),
            },
            SessionId::new(4).expect("session"),
        )
        .expect("core")
    }

    #[test]
    fn high_churn_resources_fill_stable_cross_half_cells() {
        let mut core = core();
        let first = core
            .transition(CoreEvent::Observe(collection(
                1,
                vec![
                    tile("a", SemanticState::Idle),
                    tile("b", SemanticState::Working),
                ],
            )))
            .expect("first");
        assert_eq!(first.by_cell[&cell(0)].resource_id, ResourceId("a".into()));
        assert_eq!(first.by_cell[&cell(40)].resource_id, ResourceId("b".into()));

        let second = core
            .transition(CoreEvent::Observe(collection(
                2,
                vec![
                    tile("b", SemanticState::Working),
                    tile("a", SemanticState::Idle),
                    tile("new", SemanticState::NeedsInput),
                ],
            )))
            .expect("second");
        assert_eq!(second.by_cell[&cell(0)].resource_id, ResourceId("a".into()));
        assert_eq!(
            second.by_cell[&cell(40)].resource_id,
            ResourceId("b".into())
        );
        assert_eq!(second.overflow[0].resource_id, ResourceId("new".into()));
    }

    #[test]
    fn expiry_preserves_identity_but_disables_action_and_marks_stale() {
        let mut core = core();
        core.transition(CoreEvent::Observe(collection(
            1,
            vec![tile("a", SemanticState::Working)],
        )))
        .expect("observe");
        let stale = core
            .transition(CoreEvent::Tick { now_millis: 200 })
            .expect("tick");
        let tile = &stale.by_cell[&cell(0)];
        assert_eq!(tile.resource_id, ResourceId("a".into()));
        assert_eq!(tile.state, SemanticState::Stale);
        assert!(!tile.action.enabled);
    }

    #[test]
    fn acknowledgement_clears_completed_unread_presentation() {
        let mut core = core();
        core.transition(CoreEvent::Observe(collection(
            1,
            vec![tile("done", SemanticState::CompletedUnread)],
        )))
        .expect("observe");
        let acknowledged = core
            .transition(CoreEvent::Acknowledge {
                resource_id: ResourceId("done".into()),
            })
            .expect("ack");
        assert_eq!(acknowledged.by_cell[&cell(0)].state, SemanticState::Idle);

        let mut completed_again = tile("done", SemanticState::CompletedUnread);
        completed_again.revision = 2;
        let next_revision = core
            .transition(CoreEvent::Observe(collection(2, vec![completed_again])))
            .expect("new completion");
        assert_eq!(
            next_revision.by_cell[&cell(0)].state,
            SemanticState::CompletedUnread
        );
    }

    #[test]
    fn online_churn_does_not_change_visible_allocation_during_interaction() {
        let mut core = core();
        core.transition(CoreEvent::Observe(collection(
            1,
            vec![tile("a", SemanticState::Idle)],
        )))
        .expect("observe");
        core.transition(CoreEvent::BeginInteraction { epoch: 9 })
            .expect("begin");

        let during = core
            .transition(CoreEvent::Observe(collection(
                2,
                vec![tile("b", SemanticState::NeedsInput)],
            )))
            .expect("defer churn");
        assert_eq!(during.by_cell[&cell(0)].resource_id, ResourceId("a".into()));
        assert_eq!(
            core.frozen_resource(9, cell(0)),
            Some(&ResourceId("a".into()))
        );

        let after = core
            .transition(CoreEvent::EndInteraction { epoch: 9 })
            .expect("end");
        assert_eq!(after.by_cell[&cell(0)].resource_id, ResourceId("b".into()));
    }

    #[test]
    fn older_collection_cannot_resurrect_after_an_unavailable_update() {
        let mut core = core();
        core.transition(CoreEvent::Observe(collection(
            1,
            vec![tile("a", SemanticState::Working)],
        )))
        .expect("observe");
        let mut unavailable = collection(3, Vec::new());
        unavailable.availability = CollectionAvailability::Unavailable;
        core.transition(CoreEvent::Observe(unavailable))
            .expect("unavailable");

        let error = core
            .transition(CoreEvent::Observe(collection(
                2,
                vec![tile("stale", SemanticState::Working)],
            )))
            .expect_err("older collection");
        assert_eq!(
            error,
            CoreError::StaleCollectionRevision {
                incoming: 2,
                current: 3,
            }
        );
    }
}
