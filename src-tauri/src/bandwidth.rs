use serde::{Deserialize, Serialize};
use std::time::Instant;

/// Rates are decimal kilobits per second; None means unlimited.
#[derive(Clone, Default, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    pub upload_kbps: Option<u32>,
    pub download_kbps: Option<u32>,
    pub blocked: bool,
}
impl Policy {
    pub fn validate(&self) -> Result<(), String> {
        for rate in [self.upload_kbps, self.download_kbps].into_iter().flatten() {
            if !(1..=1_000_000).contains(&rate) {
                return Err("Rate limits must be 1–1,000,000 kbps, or unlimited.".into());
            }
        }
        Ok(())
    }
}

/// A bounded token bucket policer, with no queued packet payloads. Excess frames
/// are dropped, rather than sleeping in the capture thread and starving the
/// opposite direction. A fresh/changed rate starts with no burst credit.
pub struct Policer {
    rate: Option<u32>,
    tokens: f64,
    last: Instant,
}
impl Default for Policer {
    fn default() -> Self {
        Self {
            rate: None,
            tokens: 0.0,
            last: Instant::now(),
        }
    }
}
impl Policer {
    pub fn allow(&mut self, bytes: usize, rate: Option<u32>, now: Instant) -> bool {
        if self.rate != rate {
            self.rate = rate;
            self.tokens = 0.0;
            self.last = now;
        }
        let elapsed = now.saturating_duration_since(self.last).as_secs_f64();
        self.last = now;
        let Some(rate) = rate else {
            return true;
        };
        // 1000 bits/kilobit / 8 bits/byte. 64 KiB caps idle burst credit and
        // accommodates the largest captured frame without unbounded queues.
        self.tokens = (self.tokens + elapsed * f64::from(rate) * 125.0).min(65_536.0);
        if bytes > 65_536 || (bytes as f64) > self.tokens {
            return false;
        }
        self.tokens -= bytes as f64;
        true
    }
}
