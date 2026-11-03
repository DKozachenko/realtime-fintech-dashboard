//! Seeded multi-instrument market model. Prices are tracked in `f64` internally
//! and exposed as integer cents.

use std::fmt;

use rand_core::{Rng, SeedableRng};
use rand_pcg::Pcg32;

use crate::constants::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GeneratorError {
    InstrumentCount(u32),
    BatchSize(u32),
}

impl fmt::Display for GeneratorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InstrumentCount(n) => write!(f, "instrument count must be between 1 and {MAX_INSTRUMENTS}, got {n}"),
            Self::BatchSize(n) => write!(f, "batch size must be between 1 and {MAX_BATCH_SIZE}, got {n}"),
        }
    }
}

impl std::error::Error for GeneratorError {}

struct Instrument {
    mid: f64,
    anchor: f64,
    bid_qty: u32,
    ask_qty: u32,
}

pub struct Market {
    rng: Pcg32,
    instruments: Vec<Instrument>,
    buffer: Vec<u32>,
}

impl Market {
    pub fn new(instrument_count: u32, seed: u64) -> Result<Market, GeneratorError> {
        if !(1..=MAX_INSTRUMENTS).contains(&instrument_count) {
            return Err(GeneratorError::InstrumentCount(instrument_count));
        }
        let mut rng = Pcg32::seed_from_u64(seed);
        let instruments = (0..instrument_count)
            .map(|_| {
                let mid = range_inclusive(&mut rng, START_PRICE_MIN_CENTS, START_PRICE_MAX_CENTS) as f64;
                Instrument {
                    mid,
                    anchor: mid,
                    bid_qty: range_inclusive(&mut rng, BOOK_QTY_START_MIN, BOOK_QTY_START_MAX),
                    ask_qty: range_inclusive(&mut rng, BOOK_QTY_START_MIN, BOOK_QTY_START_MAX),
                }
            })
            .collect();
        Ok(Market { rng, instruments, buffer: Vec::with_capacity(MAX_BATCH_SIZE as usize * FIELDS_PER_UPDATE) })
    }

    /// Pointer to the output buffer. Capacity is reserved up front, so it stays
    /// stable across batches.
    pub fn batch_ptr(&self) -> *const u32 {
        self.buffer.as_ptr()
    }

    /// Returns `size * FIELDS_PER_UPDATE` values:
    /// `[index, price, tradeQty, bid, ask, bidQty, askQty]` per update.
    pub fn next_batch(&mut self, size: u32) -> Result<&[u32], GeneratorError> {
        if !(1..=MAX_BATCH_SIZE).contains(&size) {
            return Err(GeneratorError::BatchSize(size));
        }
        self.buffer.clear();
        let count = self.instruments.len() as u32;
        for _ in 0..size {
            // 1. pick an instrument uniformly
            let index = range_inclusive(&mut self.rng, 0, count - 1);
            // 2. random step plus a light pull towards the anchor
            let step = (unit_f64(&mut self.rng) * 2.0 - 1.0) * STEP_MAX_FRACTION;
            // 3. spread of at least one cent
            let spread = range_inclusive(&mut self.rng, SPREAD_MIN_CENTS, SPREAD_MAX_CENTS);
            // 4. book quantity steps
            let bid_delta = range_inclusive(&mut self.rng, 0, 2 * BOOK_QTY_STEP);
            let ask_delta = range_inclusive(&mut self.rng, 0, 2 * BOOK_QTY_STEP);
            // 5. trade side, 50/50
            let buy = self.rng.next_u32() & 1 == 1;
            // 6. trade quantity
            let qty = range_inclusive(&mut self.rng, TRADE_QTY_MIN, TRADE_QTY_MAX);

            let ins = &mut self.instruments[index as usize];
            ins.mid += ins.mid * step + (ins.anchor - ins.mid) * ANCHOR_PULL;
            ins.mid = ins.mid.max(MIN_MID_CENTS);
            let bid = (ins.mid - spread as f64 / 2.0).round() as u32;
            let ask = bid + spread;
            ins.bid_qty = step_qty(ins.bid_qty, bid_delta);
            ins.ask_qty = step_qty(ins.ask_qty, ask_delta);
            let price = if buy { ask } else { bid };

            self.buffer.extend_from_slice(&[index, price, qty, bid, ask, ins.bid_qty, ins.ask_qty]);
        }
        Ok(&self.buffer)
    }
}

/// Applies a step in `0..=2*BOOK_QTY_STEP` as a signed move of `-STEP..=+STEP`,
/// saturating at zero.
fn step_qty(qty: u32, delta: u32) -> u32 {
    qty.saturating_add(delta).saturating_sub(BOOK_QTY_STEP)
}

/// Uniform integer in `lo..=hi`.
fn range_inclusive(rng: &mut Pcg32, lo: u32, hi: u32) -> u32 {
    let span = (hi - lo) as u64 + 1;
    lo + ((rng.next_u32() as u64 * span) >> 32) as u32
}

/// Uniform float in `[0, 1)`.
fn unit_f64(rng: &mut Pcg32) -> f64 {
    rng.next_u32() as f64 / 4_294_967_296.0
}

#[cfg(test)]
mod tests {
    use super::*;

    const F: usize = FIELDS_PER_UPDATE;

    #[test]
    fn batch_has_requested_size() {
        let mut m = Market::new(10, 1).unwrap();
        for n in [1u32, 100, 1000] {
            assert_eq!(m.next_batch(n).unwrap().len(), n as usize * F);
        }
    }

    #[test]
    fn rejects_invalid_instrument_count() {
        assert!(Market::new(0, 1).is_err());
        assert!(Market::new(51, 1).is_err());
        assert!(Market::new(1, 1).is_ok());
        assert!(Market::new(50, 1).is_ok());
        assert_eq!(Market::new(51, 1).err().unwrap().to_string(), "instrument count must be between 1 and 50, got 51");
    }

    #[test]
    fn rejects_invalid_batch_size() {
        let mut m = Market::new(5, 1).unwrap();
        assert!(m.next_batch(0).is_err());
        assert!(m.next_batch(1001).is_err());
        assert_eq!(m.next_batch(1001).unwrap_err().to_string(), "batch size must be between 1 and 1000, got 1001");
    }

    #[test]
    fn generated_values_are_valid() {
        let mut m = Market::new(50, 42).unwrap();
        let mut updates_so_far = 0;
        for _ in 0..100 {
            for u in m.next_batch(1000).unwrap().chunks(F) {
                updates_so_far += 1;
                let (index, price, qty, bid, ask) = (u[0], u[1], u[2], u[3], u[4]);
                let (bid_qty, ask_qty) = (u[5], u[6]);
                assert!(index < 50);
                assert!(price > 0);
                assert!(bid >= 1);
                assert!(bid < ask);
                assert!(price == bid || price == ask);
                assert!((TRADE_QTY_MIN..=TRADE_QTY_MAX).contains(&qty));
                // Book quantities are non-negative by type; each update moves one by at most
                // BOOK_QTY_STEP, so they never exceed the start maximum plus that many steps.
                let bound = BOOK_QTY_START_MAX + updates_so_far * BOOK_QTY_STEP;
                assert!(bid_qty <= bound);
                assert!(ask_qty <= bound);
            }
        }
    }

    #[test]
    fn prices_evolve_from_previous() {
        let mut m = Market::new(5, 7).unwrap();
        let mut prev: [Option<u32>; 5] = [None; 5];
        for _ in 0..20 {
            for u in m.next_batch(1000).unwrap().chunks(F) {
                let (i, bid) = (u[0] as usize, u[3]);
                if let Some(p) = prev[i] {
                    let diff = (bid as f64 - p as f64).abs();
                    assert!(diff <= p as f64 * 0.005 + SPREAD_MAX_CENTS as f64 + 1.0);
                }
                prev[i] = Some(bid);
            }
        }
    }

    #[test]
    fn state_carries_over_between_batches() {
        let mut a = Market::new(5, 9).unwrap();
        let mut joined = a.next_batch(10).unwrap().to_vec();
        joined.extend_from_slice(a.next_batch(10).unwrap());
        let mut b = Market::new(5, 9).unwrap();
        assert_eq!(joined, b.next_batch(20).unwrap());
    }

    #[test]
    fn same_seed_same_output() {
        let mut a = Market::new(5, 123).unwrap();
        let mut b = Market::new(5, 123).unwrap();
        let mut c = Market::new(5, 124).unwrap();
        let out_a = a.next_batch(1000).unwrap().to_vec();
        assert_eq!(out_a, b.next_batch(1000).unwrap());
        assert_ne!(out_a, c.next_batch(1000).unwrap());
    }

    #[test]
    fn every_instrument_eventually_trades() {
        let mut m = Market::new(5, 3).unwrap();
        let mut seen = [false; 5];
        for u in m.next_batch(1000).unwrap().chunks(F) {
            seen[u[0] as usize] = true;
        }
        assert!(seen.iter().all(|&s| s));
    }
}
