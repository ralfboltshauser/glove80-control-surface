//! Pure application policy for bindings, live collections, scenes, and a
//! deterministic logical device.

mod allocation;
mod core;
mod device;
mod model;
mod persistence;

pub use allocation::{AllocationError, AllocationResult, SlotAllocation};
pub use core::{CoreError, CoreEvent, CoreSnapshot, TaskBoardCore};
pub use device::{DevicePortError, SimulatedSurfaceDevice, SurfaceDevice};
pub use model::{
    ActionAvailability, BindingId, CollectionAvailability, ResolvedCollection, ResolvedTile,
    ResourceId, Retention, SemanticState, TaskBoardBinding,
};
pub use persistence::{AppPreferences, ConfigurationDocument, ConfigurationError};
