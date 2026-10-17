//! The per-turn protocol markers the agent writes into its text:
//! `<od-title>`, `<od-done key/>`, `<od-next key value/>`, `<od-focus key open show/>`.

use std::sync::LazyLock;

use regex::Regex;

static TITLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?s)<od-title>(.*?)</od-title>").unwrap());
static NEXT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"<od-next\s+key="([A-Za-z0-9_-]{4,64})"\s+value="([^"]*)"\s*/>"#).unwrap()
});
static FOCUS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<od-focus\s+([^>]*?)/>"#).unwrap());
static ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"([a-z]+)="([^"]*)""#).unwrap());

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Focus {
    pub open: Option<String>,
    pub show: Option<Vec<String>>,
}

/// Incremental scanner over the assistant's growing text.
#[derive(Default)]
pub struct MarkerScanner {
    key: String,
    title_seen: bool,
    next_seen: usize,
    focus_seen: usize,
}

#[derive(Debug, PartialEq)]
pub enum Marker {
    Title(String),
    NextSteps(Vec<String>),
    Focus(Focus),
}

impl MarkerScanner {
    pub fn new(key: &str) -> Self {
        Self {
            key: key.to_string(),
            ..Default::default()
        }
    }

    /// Markers that became complete since the last call.
    pub fn scan(&mut self, text: &str) -> Vec<Marker> {
        let mut out = Vec::new();
        if !self.title_seen {
            if let Some(c) = TITLE.captures(text) {
                self.title_seen = true;
                let title: String = c[1].trim().chars().take(80).collect();
                if !title.is_empty() {
                    out.push(Marker::Title(title));
                }
            }
        }
        let next: Vec<String> = NEXT
            .captures_iter(text)
            .filter(|c| c[1] == self.key)
            .map(|c| html_unescape(&c[2]))
            .collect();
        if next.len() > self.next_seen {
            self.next_seen = next.len();
            out.push(Marker::NextSteps(next.into_iter().take(3).collect()));
        }
        let focus: Vec<Focus> = FOCUS
            .captures_iter(text)
            .filter_map(|c| {
                let attrs: Vec<(String, String)> = ATTR
                    .captures_iter(&c[1])
                    .map(|a| (a[1].to_string(), html_unescape(&a[2])))
                    .collect();
                let get = |k: &str| attrs.iter().find(|(n, _)| n == k).map(|(_, v)| v.clone());
                if get("key").as_deref() != Some(self.key.as_str()) {
                    return None;
                }
                Some(Focus {
                    open: get("open"),
                    show: get("show").map(|s| {
                        s.split(',')
                            .map(|p| p.trim().to_string())
                            .filter(|p| !p.is_empty())
                            .collect()
                    }),
                })
            })
            .collect();
        if focus.len() > self.focus_seen {
            for f in &focus[self.focus_seen..] {
                out.push(Marker::Focus(f.clone()));
            }
            self.focus_seen = focus.len();
        }
        out
    }
}

/// Text as stored and shown: title, next-step and focus markers removed.
/// The done marker stays, because the client splits narration from the
/// answer on it.
pub fn strip_host_markers(text: &str) -> String {
    let t = TITLE.replace_all(text, "");
    let t = NEXT.replace_all(&t, "");
    let t = FOCUS.replace_all(&t, "");
    t.trim().to_string()
}

fn html_unescape(s: &str) -> String {
    s.replace("&quot;", "\"")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_markers_once() {
        let mut s = MarkerScanner::new("abcd1234");
        let text = r#"<od-title>Order dashboard</od-title> working <od-focus key="abcd1234" open="index.html"/>"#;
        let found = s.scan(text);
        assert_eq!(found.len(), 2);
        assert!(s.scan(text).is_empty());
        let more = format!(
            "{text}\n<od-next key=\"abcd1234\" value=\"Add a dark mode\"/>\n<od-next key=\"wrongkey\" value=\"x\"/>"
        );
        assert_eq!(
            s.scan(&more),
            vec![Marker::NextSteps(vec!["Add a dark mode".into()])]
        );
        assert_eq!(strip_host_markers(&more), "working");
    }
}
