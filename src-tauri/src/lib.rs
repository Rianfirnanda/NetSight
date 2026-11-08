mod domain;
use domain::{Adapter, Sample, Snapshot};
#[cfg(feature = "desktop")]
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;
use std::{
    collections::HashMap,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use sysinfo::Networks;
#[cfg(feature = "desktop")]
use tauri::Manager;
use tokio::sync::Mutex;

pub struct Collector {
    networks: Networks,
    previous: HashMap<String, (u64, u64)>,
    last: Instant,
}
pub struct State {
    collector: Mutex<Collector>,
    db: SqlitePool,
}

#[derive(Debug, thiserror::Error)]
pub enum CollectError {
    #[error("Local database operation failed")]
    Database(#[from] sqlx::Error),
    #[error("Local IP configuration is unavailable")]
    Interfaces(#[from] std::io::Error),
}

pub async fn collect(state: &State) -> Result<Snapshot, CollectError> {
    let mut collector = state.collector.lock().await;
    let addresses = if_addrs::get_if_addrs()?;
    collector.networks.refresh(true);
    let seconds = collector.last.elapsed().as_secs_f64().max(0.001);
    let adapters: Vec<Adapter> = collector
        .networks
        .iter()
        .map(|(name, n)| {
            let (download, upload) = collector
                .previous
                .get(name)
                .map(|(rx, tx)| {
                    (
                        n.total_received().saturating_sub(*rx) as f64 / seconds,
                        n.total_transmitted().saturating_sub(*tx) as f64 / seconds,
                    )
                })
                .unwrap_or((0.0, 0.0));
            Adapter {
                name: name.clone(),
                addresses: addresses
                    .iter()
                    .filter(|a| a.name == *name)
                    .map(|a| a.ip().to_string())
                    .collect(),
                mac: n.mac_address().to_string(),
                received: n.total_received(),
                transmitted: n.total_transmitted(),
                download,
                upload,
            }
        })
        .collect();
    collector.previous = adapters
        .iter()
        .map(|a| (a.name.clone(), (a.received, a.transmitted)))
        .collect();
    collector.last = Instant::now();
    let at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let download = adapters.iter().map(|a| a.download).sum::<f64>();
    let upload = adapters.iter().map(|a| a.upload).sum::<f64>();
    let mut tx = state.db.begin().await?;
    sqlx::query("INSERT OR REPLACE INTO telemetry_samples(at, download, upload) VALUES(?, ?, ?)")
        .bind(at)
        .bind(download)
        .bind(upload)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM telemetry_samples WHERE at < ?")
        .bind(at - 86_400_000)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let samples=sqlx::query_as::<_,Sample>("SELECT at, download, upload FROM (SELECT * FROM telemetry_samples ORDER BY at DESC LIMIT 720) ORDER BY at").fetch_all(&state.db).await?;
    Ok(Snapshot {
        adapters,
        devices: vec![],
        samples,
        events: vec![],
        collected_at: at.to_string(),
    })
}

#[cfg(feature = "desktop")]
#[tauri::command]
async fn snapshot(state: tauri::State<'_, State>) -> Result<Snapshot, String> {
    collect(&state).await.map_err(|e| {
        tracing::warn!("Snapshot collection failed");
        e.to_string()
    })
}

fn validate_endpoint(host: &str, port: u16) -> Result<(), String> {
    if port == 0
        || host.is_empty()
        || host.len() > 253
        || !host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".-:".contains(c))
    {
        return Err("Enter a hostname or IP address and port 1–65535".into());
    }
    Ok(())
}

pub async fn probe_endpoint(host: String, port: u16) -> Result<f64, String> {
    validate_endpoint(&host, port)?;
    let started = Instant::now();
    let stream = tokio::time::timeout(
        Duration::from_secs(5),
        tokio::net::TcpStream::connect((host.as_str(), port)),
    )
    .await
    .map_err(|_| "TCP connection timed out after 5 seconds".to_string())?
    .map_err(|_| "TCP connection failed; check endpoint and network access".to_string())?;
    drop(stream);
    Ok(started.elapsed().as_secs_f64() * 1000.0)
}

// Keep root-level Tauri commands private: public command macros are exported
// and then re-imported into the same macro namespace by tauri::command.
#[cfg(feature = "desktop")]
#[tauri::command]
async fn check_endpoint(host: String, port: u16) -> Result<f64, String> {
    probe_endpoint(host, port).await
}

#[cfg(feature = "desktop")]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("netsight=info")
        .init();
    tauri::Builder::default()
        .setup(|app| {
            let path = app.path().app_data_dir()?;
            std::fs::create_dir_all(&path)?;
            let db_path = path.join("netsight.sqlite");
            let state = tauri::async_runtime::block_on(async {
                let options = sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(db_path)
                    .create_if_missing(true);
                let db = SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect_with(options)
                    .await?;
                sqlx::migrate!("./migrations").run(&db).await?;
                Ok::<_, Box<dyn std::error::Error>>(State {
                    db,
                    collector: Mutex::new(Collector {
                        networks: Networks::new_with_refreshed_list(),
                        previous: HashMap::new(),
                        last: Instant::now(),
                    }),
                })
            })?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![snapshot, check_endpoint])
        .run(tauri::generate_context!())
        .expect("NetSight desktop runtime failed");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn collector_migrates_persists_and_prunes_history() {
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&db).await.unwrap();
        sqlx::query("INSERT INTO telemetry_samples VALUES(1, 1.0, 1.0)")
            .execute(&db)
            .await
            .unwrap();
        let state = State {
            db,
            collector: Mutex::new(Collector {
                networks: Networks::new_with_refreshed_list(),
                previous: HashMap::new(),
                last: Instant::now(),
            }),
        };
        let first = collect(&state).await.unwrap();
        assert!(!first.adapters.is_empty());
        assert!(first
            .adapters
            .iter()
            .all(|a| a.download == 0.0 && a.upload == 0.0));
        assert_eq!(first.samples.len(), 1);
        assert!(first.samples[0].at > 1);
        tokio::time::sleep(Duration::from_millis(20)).await;
        let second = collect(&state).await.unwrap();
        assert_eq!(second.samples.len(), 2);
        assert!(second
            .adapters
            .iter()
            .all(|a| a.download.is_finite() && a.upload.is_finite()));
    }
    #[test]
    fn endpoint_validation_rejects_commands_and_urls() {
        for host in ["", "https://example.com", "a;whoami", "a/b", "a b"] {
            assert!(validate_endpoint(host, 443).is_err());
        }
        assert!(validate_endpoint("example.com", 0).is_err());
        assert!(validate_endpoint("127.0.0.1", 443).is_ok());
        assert!(validate_endpoint("::1", 80).is_ok());
    }
    #[tokio::test]
    async fn tcp_check_connects_to_local_listener() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(probe_endpoint("127.0.0.1".into(), port).await.unwrap() >= 0.0);
    }
}
