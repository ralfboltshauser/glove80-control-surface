use std::collections::HashSet;

use crc32fast::Hasher;
use thiserror::Error;

use crate::{
    CellEventKind, CellId, CellPresentation, EffectKind, ProtocolError, Rgb, SceneGeneration,
    SessionId,
};

const MAGIC: [u8; 2] = *b"G8";
const VERSION: u8 = 2;
const HEADER_BYTES: usize = 8;
const CHECKSUM_BYTES: usize = 4;
const MAX_PAYLOAD_BYTES: usize = MAX_PACKET_BYTES - HEADER_BYTES - CHECKSUM_BYTES;
const CELL_WIRE_BYTES: usize = 6;

/// Logical packet size fits inside one common 64-byte HID report payload.
pub const MAX_PACKET_BYTES: usize = 64;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum PacketKind {
    CapabilityQuery = 1,
    OpenSession = 2,
    RenewSession = 3,
    SceneFragment = 4,
    SceneCommit = 5,
    CloseSession = 6,
    CellEvent = 7,
}

impl PacketKind {
    fn from_wire(value: u8) -> Result<Self, WireError> {
        match value {
            1 => Ok(Self::CapabilityQuery),
            2 => Ok(Self::OpenSession),
            3 => Ok(Self::RenewSession),
            4 => Ok(Self::SceneFragment),
            5 => Ok(Self::SceneCommit),
            6 => Ok(Self::CloseSession),
            7 => Ok(Self::CellEvent),
            _ => Err(WireError::UnknownPacketKind(value)),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SceneFragment {
    pub session_id: SessionId,
    pub generation: SceneGeneration,
    pub fragment_index: u8,
    pub fragment_count: u8,
    pub total_cells: u8,
    pub cells: Vec<CellPresentation>,
}

impl SceneFragment {
    pub const MAX_CELLS: usize = (MAX_PAYLOAD_BYTES - 12) / CELL_WIRE_BYTES;

    fn validate(&self) -> Result<(), WireError> {
        if self.fragment_count == 0 || self.fragment_index >= self.fragment_count {
            return Err(WireError::InvalidFragmentIndex {
                index: self.fragment_index,
                count: self.fragment_count,
            });
        }
        if self.total_cells > CellId::GLOVE80_CELL_COUNT || self.cells.len() > Self::MAX_CELLS {
            return Err(WireError::InvalidFragmentCellCount(self.cells.len()));
        }
        let mut seen = HashSet::new();
        if self.cells.iter().any(|cell| !seen.insert(cell.cell_id)) {
            return Err(WireError::DuplicateFragmentCell);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Packet {
    CapabilityQuery,
    OpenSession {
        session_id: SessionId,
        lease_millis: u32,
    },
    RenewSession {
        session_id: SessionId,
        lease_millis: u32,
    },
    SceneFragment(SceneFragment),
    SceneCommit {
        session_id: SessionId,
        generation: SceneGeneration,
        fragment_count: u8,
        total_cells: u8,
        lease_millis: u32,
        brightness: u8,
        scene_checksum: u32,
    },
    CloseSession {
        session_id: SessionId,
    },
    CellEvent {
        sequence: u32,
        interaction_epoch: u32,
        cell_id: CellId,
        event_kind: CellEventKind,
    },
}

impl Packet {
    fn kind(&self) -> PacketKind {
        match self {
            Self::CapabilityQuery => PacketKind::CapabilityQuery,
            Self::OpenSession { .. } => PacketKind::OpenSession,
            Self::RenewSession { .. } => PacketKind::RenewSession,
            Self::SceneFragment(_) => PacketKind::SceneFragment,
            Self::SceneCommit { .. } => PacketKind::SceneCommit,
            Self::CloseSession { .. } => PacketKind::CloseSession,
            Self::CellEvent { .. } => PacketKind::CellEvent,
        }
    }
}

pub fn encode_packet(sequence: u16, packet: &Packet) -> Result<Vec<u8>, WireError> {
    let mut payload = Vec::new();
    encode_payload(&mut payload, packet)?;
    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err(WireError::PayloadTooLarge(payload.len()));
    }

    let mut encoded = Vec::with_capacity(HEADER_BYTES + payload.len() + CHECKSUM_BYTES);
    encoded.extend_from_slice(&MAGIC);
    encoded.push(VERSION);
    encoded.push(packet.kind() as u8);
    encoded.extend_from_slice(&sequence.to_le_bytes());
    encoded.extend_from_slice(&(payload.len() as u16).to_le_bytes());
    encoded.extend_from_slice(&payload);
    let checksum = crc32fast::hash(&encoded);
    encoded.extend_from_slice(&checksum.to_le_bytes());
    Ok(encoded)
}

pub fn decode_packet(bytes: &[u8]) -> Result<(u16, Packet), WireError> {
    if bytes.len() < HEADER_BYTES + CHECKSUM_BYTES || bytes.len() > MAX_PACKET_BYTES {
        return Err(WireError::InvalidPacketLength(bytes.len()));
    }
    if bytes[..2] != MAGIC {
        return Err(WireError::InvalidMagic);
    }
    if bytes[2] != VERSION {
        return Err(WireError::UnsupportedVersion(bytes[2]));
    }

    let payload_len = u16::from_le_bytes([bytes[6], bytes[7]]) as usize;
    let expected_len = HEADER_BYTES + payload_len + CHECKSUM_BYTES;
    if bytes.len() != expected_len {
        return Err(WireError::LengthMismatch {
            declared: payload_len,
            actual: bytes.len() - HEADER_BYTES - CHECKSUM_BYTES,
        });
    }

    let checksum_offset = bytes.len() - CHECKSUM_BYTES;
    let expected_checksum = u32::from_le_bytes(
        bytes[checksum_offset..]
            .try_into()
            .expect("checksum length checked"),
    );
    if crc32fast::hash(&bytes[..checksum_offset]) != expected_checksum {
        return Err(WireError::ChecksumMismatch);
    }

    let sequence = u16::from_le_bytes([bytes[4], bytes[5]]);
    let kind = PacketKind::from_wire(bytes[3])?;
    let payload = &bytes[HEADER_BYTES..checksum_offset];
    Ok((sequence, decode_payload(kind, payload)?))
}

fn encode_payload(payload: &mut Vec<u8>, packet: &Packet) -> Result<(), WireError> {
    match packet {
        Packet::CapabilityQuery => {}
        Packet::OpenSession {
            session_id,
            lease_millis,
        }
        | Packet::RenewSession {
            session_id,
            lease_millis,
        } => {
            payload.extend_from_slice(&session_id.get().to_le_bytes());
            payload.extend_from_slice(&lease_millis.to_le_bytes());
        }
        Packet::SceneFragment(fragment) => {
            fragment.validate()?;
            payload.extend_from_slice(&fragment.session_id.get().to_le_bytes());
            payload.extend_from_slice(&fragment.generation.get().to_le_bytes());
            payload.push(fragment.fragment_index);
            payload.push(fragment.fragment_count);
            payload.push(fragment.total_cells);
            payload.push(fragment.cells.len() as u8);
            for cell in &fragment.cells {
                payload.push(cell.cell_id.get());
                payload.push(cell.color.red);
                payload.push(cell.color.green);
                payload.push(cell.color.blue);
                payload.push(cell.effect.wire_value());
                payload.push(0);
            }
        }
        Packet::SceneCommit {
            session_id,
            generation,
            fragment_count,
            total_cells,
            lease_millis,
            brightness,
            scene_checksum,
        } => {
            if *fragment_count == 0 || *total_cells > CellId::GLOVE80_CELL_COUNT {
                return Err(WireError::InvalidCommit);
            }
            payload.extend_from_slice(&session_id.get().to_le_bytes());
            payload.extend_from_slice(&generation.get().to_le_bytes());
            payload.push(*fragment_count);
            payload.push(*total_cells);
            payload.extend_from_slice(&lease_millis.to_le_bytes());
            payload.push(*brightness);
            payload.extend_from_slice(&scene_checksum.to_le_bytes());
        }
        Packet::CloseSession { session_id } => {
            payload.extend_from_slice(&session_id.get().to_le_bytes());
        }
        Packet::CellEvent {
            sequence,
            interaction_epoch,
            cell_id,
            event_kind,
        } => {
            payload.extend_from_slice(&sequence.to_le_bytes());
            payload.extend_from_slice(&interaction_epoch.to_le_bytes());
            payload.push(cell_id.get());
            payload.push(match event_kind {
                CellEventKind::Down => 0,
                CellEventKind::Up => 1,
            });
        }
    }
    Ok(())
}

fn decode_payload(kind: PacketKind, payload: &[u8]) -> Result<Packet, WireError> {
    match kind {
        PacketKind::CapabilityQuery => {
            expect_len(payload, 0)?;
            Ok(Packet::CapabilityQuery)
        }
        PacketKind::OpenSession | PacketKind::RenewSession => {
            expect_len(payload, 8)?;
            let session_id = session(payload, 0)?;
            let lease_millis = u32_at(payload, 4);
            Ok(if kind == PacketKind::OpenSession {
                Packet::OpenSession {
                    session_id,
                    lease_millis,
                }
            } else {
                Packet::RenewSession {
                    session_id,
                    lease_millis,
                }
            })
        }
        PacketKind::SceneFragment => decode_fragment(payload).map(Packet::SceneFragment),
        PacketKind::SceneCommit => {
            expect_len(payload, 19)?;
            let fragment_count = payload[8];
            let total_cells = payload[9];
            if fragment_count == 0 || total_cells > CellId::GLOVE80_CELL_COUNT {
                return Err(WireError::InvalidCommit);
            }
            Ok(Packet::SceneCommit {
                session_id: session(payload, 0)?,
                generation: generation(payload, 4)?,
                fragment_count,
                total_cells,
                lease_millis: u32_at(payload, 10),
                brightness: payload[14],
                scene_checksum: u32_at(payload, 15),
            })
        }
        PacketKind::CloseSession => {
            expect_len(payload, 4)?;
            Ok(Packet::CloseSession {
                session_id: session(payload, 0)?,
            })
        }
        PacketKind::CellEvent => {
            expect_len(payload, 10)?;
            let event_kind = match payload[9] {
                0 => CellEventKind::Down,
                1 => CellEventKind::Up,
                value => return Err(WireError::UnknownCellEventKind(value)),
            };
            Ok(Packet::CellEvent {
                sequence: u32_at(payload, 0),
                interaction_epoch: u32_at(payload, 4),
                cell_id: CellId::new(payload[8])?,
                event_kind,
            })
        }
    }
}

fn decode_fragment(payload: &[u8]) -> Result<SceneFragment, WireError> {
    if payload.len() < 12 {
        return Err(WireError::InvalidPayloadLength(payload.len()));
    }
    let cell_count = payload[11] as usize;
    expect_len(payload, 12 + cell_count * CELL_WIRE_BYTES)?;
    let mut cells = Vec::with_capacity(cell_count);
    for encoded in payload[12..].chunks_exact(CELL_WIRE_BYTES) {
        if encoded[5] != 0 {
            return Err(WireError::NonZeroReservedByte(encoded[5]));
        }
        cells.push(CellPresentation {
            cell_id: CellId::new(encoded[0])?,
            color: Rgb {
                red: encoded[1],
                green: encoded[2],
                blue: encoded[3],
            },
            effect: EffectKind::from_wire(encoded[4])?,
        });
    }
    let fragment = SceneFragment {
        session_id: session(payload, 0)?,
        generation: generation(payload, 4)?,
        fragment_index: payload[8],
        fragment_count: payload[9],
        total_cells: payload[10],
        cells,
    };
    fragment.validate()?;
    Ok(fragment)
}

fn expect_len(payload: &[u8], expected: usize) -> Result<(), WireError> {
    if payload.len() == expected {
        Ok(())
    } else {
        Err(WireError::InvalidPayloadLength(payload.len()))
    }
}

fn u32_at(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(
        bytes[offset..offset + 4]
            .try_into()
            .expect("payload length checked"),
    )
}

fn session(bytes: &[u8], offset: usize) -> Result<SessionId, WireError> {
    SessionId::new(u32_at(bytes, offset)).map_err(WireError::from)
}

fn generation(bytes: &[u8], offset: usize) -> Result<SceneGeneration, WireError> {
    SceneGeneration::new(u32_at(bytes, offset)).map_err(WireError::from)
}

/// Stable checksum for the complete ordered cell payload referenced by commit.
pub fn scene_checksum(cells: &[CellPresentation]) -> u32 {
    let mut hasher = Hasher::new();
    for cell in cells {
        hasher.update(&[
            cell.cell_id.get(),
            cell.color.red,
            cell.color.green,
            cell.color.blue,
            cell.effect.wire_value(),
        ]);
    }
    hasher.finalize()
}

#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum WireError {
    #[error("packet length {0} is outside protocol limits")]
    InvalidPacketLength(usize),
    #[error("packet magic is invalid")]
    InvalidMagic,
    #[error("wire protocol version {0} is unsupported")]
    UnsupportedVersion(u8),
    #[error("packet kind {0} is unknown")]
    UnknownPacketKind(u8),
    #[error("payload length {0} is invalid for the packet kind")]
    InvalidPayloadLength(usize),
    #[error("declared payload length {declared} does not match actual length {actual}")]
    LengthMismatch { declared: usize, actual: usize },
    #[error("packet checksum does not match")]
    ChecksumMismatch,
    #[error("payload with {0} bytes cannot fit one packet")]
    PayloadTooLarge(usize),
    #[error("fragment index {index} is invalid for {count} fragments")]
    InvalidFragmentIndex { index: u8, count: u8 },
    #[error("fragment cell count {0} is invalid")]
    InvalidFragmentCellCount(usize),
    #[error("fragment repeats a cell")]
    DuplicateFragmentCell,
    #[error("scene commit fields are invalid")]
    InvalidCommit,
    #[error("reserved byte must be zero, got {0}")]
    NonZeroReservedByte(u8),
    #[error("cell event kind {0} is unknown")]
    UnknownCellEventKind(u8),
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn packet() -> Packet {
        Packet::SceneFragment(SceneFragment {
            session_id: SessionId::new(0x0102_0304).expect("session"),
            generation: SceneGeneration::new(9).expect("generation"),
            fragment_index: 0,
            fragment_count: 1,
            total_cells: 1,
            cells: vec![CellPresentation {
                cell_id: CellId::new(79).expect("cell"),
                color: Rgb {
                    red: 0x11,
                    green: 0x22,
                    blue: 0x33,
                },
                effect: EffectKind::Pulse,
            }],
        })
    }

    #[test]
    fn golden_scene_fragment_is_stable() {
        let encoded = encode_packet(0x0506, &packet()).expect("encodes");
        let expected = [
            0x47, 0x38, 0x02, 0x04, 0x06, 0x05, 0x12, 0x00, 0x04, 0x03, 0x02, 0x01, 0x09, 0x00,
            0x00, 0x00, 0x00, 0x01, 0x01, 0x01, 0x4f, 0x11, 0x22, 0x33, 0x01, 0x00, 0x34, 0xac,
            0x60, 0x58,
        ];
        assert_eq!(encoded, expected);
        assert_eq!(decode_packet(&expected), Ok((0x0506, packet())));
    }

    #[test]
    fn decoder_rejects_checksum_length_reserved_and_unknown_fields() {
        let encoded = encode_packet(1, &packet()).expect("encodes");

        let mut corrupted = encoded.clone();
        corrupted[12] ^= 1;
        assert_eq!(decode_packet(&corrupted), Err(WireError::ChecksumMismatch));

        let mut reserved = encoded.clone();
        reserved[25] = 1;
        let checksum_offset = reserved.len() - CHECKSUM_BYTES;
        let checksum = crc32fast::hash(&reserved[..checksum_offset]);
        reserved[checksum_offset..].copy_from_slice(&checksum.to_le_bytes());
        assert_eq!(
            decode_packet(&reserved),
            Err(WireError::NonZeroReservedByte(1))
        );

        assert!(matches!(
            decode_packet(&encoded[..encoded.len() - 1]),
            Err(WireError::LengthMismatch { .. })
        ));
    }

    #[test]
    fn fragment_capacity_is_accepted_and_one_extra_is_rejected() {
        let make_cells = |count: usize| {
            (0..count)
                .map(|value| CellPresentation {
                    cell_id: CellId::new(value as u8).expect("cell"),
                    color: Rgb {
                        red: 0,
                        green: 0,
                        blue: 0,
                    },
                    effect: EffectKind::Solid,
                })
                .collect()
        };
        let mut fragment = match packet() {
            Packet::SceneFragment(fragment) => fragment,
            _ => unreachable!(),
        };
        fragment.total_cells = SceneFragment::MAX_CELLS as u8;
        fragment.cells = make_cells(SceneFragment::MAX_CELLS);
        assert!(encode_packet(1, &Packet::SceneFragment(fragment.clone())).is_ok());

        fragment.total_cells += 1;
        fragment.cells = make_cells(SceneFragment::MAX_CELLS + 1);
        assert_eq!(
            encode_packet(1, &Packet::SceneFragment(fragment)),
            Err(WireError::InvalidFragmentCellCount(
                SceneFragment::MAX_CELLS + 1
            ))
        );
    }
}
