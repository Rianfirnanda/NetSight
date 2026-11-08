//! Explicit, time-limited IPv4 lab sessions. Packet payloads are never logged.
use crate::bandwidth::Policy;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub address: String,
    pub target: String,
    pub gateway: String,
    pub seconds: u64,
    pub confirmation: String,
    #[serde(default)]
    pub policy: Policy,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub running: bool,
    pub phase: String,
    pub target: String,
    pub gateway: String,
    pub forwarded: u64,
    pub bytes: u64,
    pub remaining: u64,
    pub restoration: String,
    pub error: Option<String>,
    pub upload_bytes: u64,
    pub download_bytes: u64,
    pub dropped_frames: u64,
    pub dropped_bytes: u64,
    pub policy: Policy,
}

pub struct Manager {
    status: Arc<Mutex<Status>>,
    stop: Arc<AtomicBool>,
    worker: Mutex<Option<JoinHandle<()>>>,
    audit: PathBuf,
    policy: Arc<Mutex<Policy>>,
    audit_lock: Arc<Mutex<()>>,
}
impl Manager {
    pub fn new(audit: PathBuf) -> Self {
        Self {
            status: Arc::new(Mutex::new(Status {
                phase: "Idle".into(),
                ..Status::default()
            })),
            stop: Arc::new(AtomicBool::new(false)),
            worker: Mutex::new(None),
            audit,
            policy: Arc::new(Mutex::new(Policy::default())),
            audit_lock: Arc::new(Mutex::new(())),
        }
    }
    pub fn status(&self) -> Result<Status, String> {
        self.status
            .lock()
            .map(|s| s.clone())
            .map_err(|_| "Lab status lock failed".into())
    }
    pub fn start(&self, config: Config) -> Result<(), String> {
        config.policy.validate()?;
        if !cfg!(windows) {
            return Err("Lab sessions require Windows, Npcap and administrator access.".into());
        }
        if !(30..=300).contains(&config.seconds)
            || config.confirmation != format!("LAB {} {}", config.target, config.gateway)
        {
            return Err(
                "Enter the exact lab confirmation and choose a duration of 30–300 seconds.".into(),
            );
        }
        let mut worker = self.worker.lock().map_err(|_| "Lab session lock failed")?;
        if worker.as_ref().is_some_and(|w| !w.is_finished()) {
            return Err("A lab session is already running".into());
        }
        if let Some(old) = worker.take() {
            let _ = old.join();
        }
        self.stop.store(false, Ordering::Release);
        *self.policy.lock().map_err(|_| "Policy lock failed")? = config.policy.clone();
        *self.status.lock().map_err(|_| "Lab status lock failed")? = Status {
            running: true,
            phase: "Preparing".into(),
            target: config.target.clone(),
            gateway: config.gateway.clone(),
            remaining: config.seconds,
            restoration: "Not yet needed".into(),
            policy: config.policy.clone(),
            ..Status::default()
        };
        let status = self.status.clone();
        let stop = self.stop.clone();
        let path = self.audit.clone();
        let policy = self.policy.clone();
        let audit_lock = self.audit_lock.clone();
        *worker = Some(std::thread::spawn(move || {
            use std::io::Write;
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(
                || -> Result<(), String> {
                    if std::fs::metadata(&path).is_ok_and(|m| m.len() > 1_048_576) {
                        return Err("Archive the lab audit file before starting another session (1 MiB limit).".into());
                    }
                    let mut audit = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&path)
                        .map_err(|_| "Cannot open lab audit file")?;
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis();
                    let line = serde_json::json!({"action":"start_requested","at":now,"address":config.address,"target":config.target,"gateway":config.gateway,"seconds":config.seconds,"policy":config.policy});
                    let guard = audit_lock.lock().map_err(|_| "Audit lock failed")?;
                    writeln!(audit, "{line}")
                        .and_then(|_| audit.sync_data())
                        .map_err(|_| "Cannot persist lab audit entry")?;
                    drop(guard);
                    let outcome = run(&config, &stop, &status, &policy);
                    let final_state = status.lock().map_err(|_| "Lab status lock failed")?.clone();
                    let line = serde_json::json!({"action":"session_finished","target":config.target,"gateway":config.gateway,"forwarded":final_state.forwarded,"droppedFrames":final_state.dropped_frames,"uploadBytes":final_state.upload_bytes,"downloadBytes":final_state.download_bytes,"policy":final_state.policy,"restoration":final_state.restoration,"error":outcome.as_ref().err()});
                    let _guard = audit_lock.lock().map_err(|_| "Audit lock failed")?;
                    writeln!(audit, "{line}")
                        .and_then(|_| audit.sync_data())
                        .map_err(|_| "Cannot persist lab completion audit entry")?;
                    outcome
                },
            ));
            if let Ok(mut s) = status.lock() {
                s.running = false;
                s.remaining = 0;
                match result {
                    Ok(Ok(())) => s.phase = "Stopped".into(),
                    Ok(Err(error)) => {
                        s.phase = "Failed".into();
                        s.error = Some(error);
                    }
                    Err(_) => {
                        s.phase = "Failed".into();
                        s.error=Some("Lab worker terminated unexpectedly; verify connectivity on both lab devices.".into());
                    }
                }
            }
        }));
        Ok(())
    }
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
    }
    pub fn update_policy(
        &self,
        target: &str,
        gateway: &str,
        policy: Policy,
        confirmation: &str,
    ) -> Result<(), String> {
        use std::io::Write;
        policy.validate()?;
        if confirmation != format!("CONTROL {target} {gateway}") {
            return Err(
                "Type the exact CONTROL confirmation for the active target and gateway.".into(),
            );
        }
        let _worker = self.worker.lock().map_err(|_| "Lab session lock failed")?;
        let snapshot = self.status()?;
        if !snapshot.running || snapshot.target != target || snapshot.gateway != gateway {
            return Err("The selected lab session is not active.".into());
        }
        let audit_guard = self.audit_lock.lock().map_err(|_| "Audit lock failed")?;
        if std::fs::metadata(&self.audit).is_ok_and(|m| m.len() > 1_048_576) {
            return Err("Archive the lab audit file before changing policy (1 MiB limit).".into());
        }
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&self.audit)
            .map_err(|_| "Cannot open lab audit file")?;
        let at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        writeln!(file,"{}",serde_json::json!({"action":"policy_change_requested","at":at,"target":target,"gateway":gateway,"policy":policy})).and_then(|_|file.sync_data()).map_err(|_|"Cannot persist policy audit entry")?;
        drop(audit_guard);
        let mut status = self.status.lock().map_err(|_| "Lab status lock failed")?;
        if !status.running {
            return Err("The session ended before the policy could be applied.".into());
        }
        let mut active = self.policy.lock().map_err(|_| "Policy lock failed")?;
        *active = policy.clone();
        status.policy = policy;
        Ok(())
    }
    pub fn shutdown(&self) {
        self.stop();
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(handle) = worker.take() {
                let _ = handle.join();
            }
        }
    }
}
impl Drop for Manager {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(not(windows))]
fn run(_: &Config, _: &AtomicBool, _: &Mutex<Status>, _: &Mutex<Policy>) -> Result<(), String> {
    Err("Windows/Npcap is required".into())
}
#[cfg(windows)]
#[path = "lab_windows.rs"]
mod native;
#[cfg(windows)]
use native::run;
