//! Tunable numbers of the market model, kept in one place.

pub const FIELDS_PER_UPDATE: usize = 7;
pub const MAX_INSTRUMENTS: u32 = 50;
pub const MAX_BATCH_SIZE: u32 = 1000;
pub const START_PRICE_MIN_CENTS: u32 = 1_000;
pub const START_PRICE_MAX_CENTS: u32 = 50_000;
pub const STEP_MAX_FRACTION: f64 = 0.001;
pub const ANCHOR_PULL: f64 = 0.002;
pub const MIN_MID_CENTS: f64 = 100.0;
pub const SPREAD_MIN_CENTS: u32 = 1;
pub const SPREAD_MAX_CENTS: u32 = 4;
pub const BOOK_QTY_START_MIN: u32 = 100;
pub const BOOK_QTY_START_MAX: u32 = 1_000;
pub const BOOK_QTY_STEP: u32 = 40;
pub const TRADE_QTY_MIN: u32 = 1;
pub const TRADE_QTY_MAX: u32 = 500;
