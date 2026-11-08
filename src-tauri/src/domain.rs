use serde::Serialize;
#[derive(Serialize)]
pub struct Adapter {
    pub name: String,
    pub addresses: Vec<String>,
    pub mac: String,
    pub received: u64,
    pub transmitted: u64,
    pub download: f64,
    pub upload: f64,
}
#[derive(Serialize, sqlx::FromRow)]
pub struct Sample {
    pub at: i64,
    pub download: f64,
    pub upload: f64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub adapters: Vec<Adapter>,
    pub devices: Vec<String>,
    pub samples: Vec<Sample>,
    pub events: Vec<String>,
    pub collected_at: String,
}
