pub mod constants;
pub mod market;

use market::Market;
use wasm_bindgen::prelude::*;

/// JS-facing wrapper around [`Market`]. The batch is read directly from Wasm
/// memory via `batch_ptr` after `next_batch`.
#[wasm_bindgen]
pub struct Generator {
    market: Market,
}

#[wasm_bindgen]
impl Generator {
    #[wasm_bindgen(constructor)]
    pub fn new(instrument_count: u32, seed: u32) -> Result<Generator, JsError> {
        let market = Market::new(instrument_count, u64::from(seed))
            .map_err(|err| JsError::new(&err.to_string()))?;
        Ok(Generator { market })
    }

    /// Generates a batch and returns the number of u32 values written.
    pub fn next_batch(&mut self, size: u32) -> Result<u32, JsError> {
        let batch = self
            .market
            .next_batch(size)
            .map_err(|err| JsError::new(&err.to_string()))?;
        Ok(batch.len() as u32)
    }

    pub fn batch_ptr(&self) -> *const u32 {
        self.market.batch_ptr()
    }
}
