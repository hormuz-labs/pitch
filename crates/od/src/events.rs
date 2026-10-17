//! Per-project event bus behind `GET /api/projects/:id/events`.

use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::{Value, json};
use tokio::sync::broadcast;

#[derive(Default)]
pub struct ProjectEvents {
    channels: Mutex<HashMap<String, broadcast::Sender<(String, Value)>>>,
}

impl ProjectEvents {
    pub fn subscribe(&self, project_id: &str) -> broadcast::Receiver<(String, Value)> {
        self.sender(project_id).subscribe()
    }

    fn sender(&self, project_id: &str) -> broadcast::Sender<(String, Value)> {
        self.channels
            .lock()
            .unwrap()
            .entry(project_id.to_string())
            .or_insert_with(|| broadcast::channel(256).0)
            .clone()
    }

    pub fn publish(&self, project_id: &str, event: &str, data: Value) {
        let _ = self.sender(project_id).send((event.to_string(), data));
    }

    pub fn file_changed(&self, project_id: &str, path: &str, kind: &str) {
        self.publish(
            project_id,
            "file-changed",
            json!({ "type": "file-changed", "path": path, "kind": kind }),
        );
    }
}
