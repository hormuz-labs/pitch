use std::path::PathBuf;
use std::sync::Arc;

use sqlx::SqlitePool;

use crate::agent::Harness;
use crate::config::Config;
use crate::content::Library;
use crate::events::ProjectEvents;
use crate::runs::Runs;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: SqlitePool,
    pub library: Arc<Library>,
    pub harness: Arc<Harness>,
    pub runs: Arc<Runs>,
    pub events: Arc<ProjectEvents>,
}

impl AppState {
    pub fn project_dir(&self, id: &str) -> PathBuf {
        self.config.projects_dir().join(id)
    }
}
