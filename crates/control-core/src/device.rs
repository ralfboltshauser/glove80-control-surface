use std::collections::VecDeque;

use surface_protocol::{
    AppliedScene, ApplyDisposition, CellEvent, CellEventKind, CellId, DesiredScene,
    DeviceCapabilities, DeviceEvent, DeviceSnapshot, ProtocolError,
};
use thiserror::Error;

pub trait SurfaceDevice {
    fn connect(&mut self) -> Result<DeviceCapabilities, DevicePortError>;
    fn disconnect(&mut self);
    fn set_desired_scene(&mut self, scene: DesiredScene) -> Result<AppliedScene, DevicePortError>;
    fn pause(&mut self);
    fn resume(&mut self);
    fn snapshot(&self) -> DeviceSnapshot;
    fn drain_events(&mut self) -> Vec<DeviceEvent>;
}

#[derive(Clone, Debug)]
pub struct SimulatedSurfaceDevice {
    capabilities: DeviceCapabilities,
    connected: bool,
    paused: bool,
    right_connected: bool,
    now_millis: u64,
    active_scene: Option<DesiredScene>,
    lease_expires_at_millis: Option<u64>,
    events: VecDeque<DeviceEvent>,
    next_event_sequence: u32,
}

impl Default for SimulatedSurfaceDevice {
    fn default() -> Self {
        Self {
            capabilities: DeviceCapabilities::simulated_glove80(),
            connected: false,
            paused: false,
            right_connected: true,
            now_millis: 0,
            active_scene: None,
            lease_expires_at_millis: None,
            events: VecDeque::new(),
            next_event_sequence: 1,
        }
    }
}

impl SimulatedSurfaceDevice {
    pub fn set_right_connected(&mut self, connected: bool) {
        self.right_connected = connected;
    }

    pub fn advance_to(&mut self, now_millis: u64) {
        assert!(now_millis >= self.now_millis, "simulated time is monotonic");
        self.now_millis = now_millis;
        if self
            .lease_expires_at_millis
            .is_some_and(|expires| now_millis >= expires)
        {
            if let Some(scene) = self.active_scene.take() {
                self.events.push_back(DeviceEvent::SceneExpired {
                    generation: scene.generation,
                });
            }
            self.lease_expires_at_millis = None;
        }
    }

    pub fn inject_cell_event(
        &mut self,
        interaction_epoch: u32,
        cell_id: CellId,
        kind: CellEventKind,
    ) -> Result<(), DevicePortError> {
        if !self.connected {
            return Err(DevicePortError::Disconnected);
        }
        let event = CellEvent {
            sequence: self.next_event_sequence,
            interaction_epoch,
            cell_id,
            kind,
        };
        self.next_event_sequence = self.next_event_sequence.wrapping_add(1).max(1);
        self.events.push_back(DeviceEvent::Cell(event));
        Ok(())
    }
}

impl SurfaceDevice for SimulatedSurfaceDevice {
    fn connect(&mut self) -> Result<DeviceCapabilities, DevicePortError> {
        self.capabilities.validate()?;
        self.connected = true;
        Ok(self.capabilities.clone())
    }

    fn disconnect(&mut self) {
        self.connected = false;
    }

    fn set_desired_scene(&mut self, scene: DesiredScene) -> Result<AppliedScene, DevicePortError> {
        if !self.connected {
            return Err(DevicePortError::Disconnected);
        }
        if self.paused {
            return Err(DevicePortError::Paused);
        }
        scene.validate(&self.capabilities)?;
        if self
            .active_scene
            .as_ref()
            .is_some_and(|current| scene.generation.get() <= current.generation.get())
        {
            return Err(DevicePortError::StaleGeneration(scene.generation.get()));
        }

        let generation = scene.generation;
        self.lease_expires_at_millis = Some(self.now_millis + u64::from(scene.lease_millis));
        self.active_scene = Some(scene);
        let has_right_cells = self
            .active_scene
            .as_ref()
            .expect("stored")
            .cells
            .iter()
            .any(|cell| cell.cell_id.get() >= 40);
        let right_generation = (!has_right_cells || self.right_connected).then_some(generation);
        Ok(AppliedScene {
            generation,
            left_generation: Some(generation),
            right_generation,
            disposition: if right_generation.is_some() {
                ApplyDisposition::Applied
            } else {
                ApplyDisposition::Partial
            },
        })
    }

    fn pause(&mut self) {
        self.paused = true;
        self.active_scene = None;
        self.lease_expires_at_millis = None;
    }

    fn resume(&mut self) {
        self.paused = false;
    }

    fn snapshot(&self) -> DeviceSnapshot {
        let generation = self.active_scene.as_ref().map(|scene| scene.generation);
        let has_right_cells = self
            .active_scene
            .as_ref()
            .is_some_and(|scene| scene.cells.iter().any(|cell| cell.cell_id.get() >= 40));
        DeviceSnapshot {
            connected: self.connected,
            paused: self.paused,
            active_generation: generation,
            left_generation: generation,
            right_generation: generation.filter(|_| !has_right_cells || self.right_connected),
            lease_expires_at_millis: self.lease_expires_at_millis,
        }
    }

    fn drain_events(&mut self) -> Vec<DeviceEvent> {
        self.events.drain(..).collect()
    }
}

#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum DevicePortError {
    #[error("surface device is disconnected")]
    Disconnected,
    #[error("surface output is paused")]
    Paused,
    #[error("scene generation {0} is not newer than the active scene")]
    StaleGeneration(u32),
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
}

#[cfg(test)]
mod tests {
    use surface_protocol::{CellPresentation, EffectKind, Rgb, SceneGeneration, SessionId};

    use super::*;

    fn scene(generation: u32, cells: &[u8]) -> DesiredScene {
        DesiredScene {
            session_id: SessionId::new(1).expect("session"),
            generation: SceneGeneration::new(generation).expect("generation"),
            lease_millis: 1_000,
            brightness: 40,
            cells: cells
                .iter()
                .map(|cell| CellPresentation {
                    cell_id: CellId::new(*cell).expect("cell"),
                    color: Rgb {
                        red: 1,
                        green: 2,
                        blue: 3,
                    },
                    effect: EffectKind::Solid,
                })
                .collect(),
        }
    }

    #[test]
    fn simulator_reports_partial_application_when_right_half_is_absent() {
        let mut device = SimulatedSurfaceDevice::default();
        device.connect().expect("connect");
        device.set_right_connected(false);
        let applied = device.set_desired_scene(scene(1, &[0, 40])).expect("set");
        assert_eq!(applied.disposition, ApplyDisposition::Partial);
        assert_eq!(applied.left_generation, applied.generation.into());
        assert_eq!(applied.right_generation, None);
    }

    #[test]
    fn lease_expiry_clears_scene_and_emits_event() {
        let mut device = SimulatedSurfaceDevice::default();
        device.connect().expect("connect");
        device.set_desired_scene(scene(1, &[0])).expect("set");
        device.advance_to(999);
        assert!(device.drain_events().is_empty());
        device.advance_to(1_000);
        assert_eq!(
            device.drain_events(),
            vec![DeviceEvent::SceneExpired {
                generation: SceneGeneration::new(1).expect("generation")
            }]
        );
        assert_eq!(device.snapshot().active_generation, None);
    }

    #[test]
    fn injected_input_uses_monotonic_sequences() {
        let mut device = SimulatedSurfaceDevice::default();
        device.connect().expect("connect");
        device
            .inject_cell_event(3, CellId::new(79).expect("cell"), CellEventKind::Down)
            .expect("inject");
        let events = device.drain_events();
        assert!(matches!(
            events.as_slice(),
            [DeviceEvent::Cell(CellEvent {
                sequence: 1,
                interaction_epoch: 3,
                ..
            })]
        ));
    }
}
