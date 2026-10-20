//! Exports that need no browser: a ZIP of the project, and a single
//! self-contained HTML file with the page's local assets inlined.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use anyhow::{Context, Result, bail};
use base64::Engine;
use regex::{Captures, Regex};

use crate::files;

pub fn zip_project(root: &Path) -> Result<Vec<u8>> {
    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for f in files::list(root) {
            zip.start_file(&f.path, options)?;
            zip.write_all(&std::fs::read(root.join(&f.path))?)?;
        }
        zip.finish()?;
    }
    Ok(buf.into_inner())
}

static LINK_CSS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>"#).unwrap()
});
static HREF: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)\bhref=["']?([^"'\s>]+)"#).unwrap());
static SCRIPT_SRC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)<script\b([^>]*)\bsrc=["']?([^"'\s>]+)["']?([^>]*)>\s*</script>"#).unwrap()
});
static MEDIA_SRC: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)(<(?:img|source|video|audio)\b[^>]*?\b(?:src|poster)=)(["']?)([^"'\s>]+)(["']?)"#).unwrap()
});
static CSS_URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"url\(\s*(["']?)([^"')]+)(["']?)\s*\)"#).unwrap());

const MAX_ASSET: u64 = 50 * 1024 * 1024;

fn is_local(url: &str) -> bool {
    !(url.starts_with("http:")
        || url.starts_with("https:")
        || url.starts_with("//")
        || url.starts_with("data:")
        || url.starts_with("blob:")
        || url.starts_with('#')
        || url.starts_with("mailto:"))
}

fn local_path(root: &Path, base_dir: &Path, url: &str) -> Option<PathBuf> {
    if !is_local(url) {
        return None;
    }
    let clean = url.split(['?', '#']).next().unwrap_or(url);
    let rel = base_dir.join(clean);
    let rel = rel.to_string_lossy().replace('\\', "/");
    let path = files::resolve(root, &rel).ok()?;
    let meta = std::fs::metadata(&path).ok()?;
    (meta.is_file() && meta.len() <= MAX_ASSET).then_some(path)
}

fn data_uri(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    Some(format!(
        "data:{};base64,{}",
        mime.essence_str(),
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn inline_css_urls(root: &Path, css_dir: &Path, css: &str) -> String {
    CSS_URL
        .replace_all(css, |c: &Captures| {
            match local_path(root, css_dir, &c[2]).and_then(|p| data_uri(&p)) {
                Some(uri) => format!("url(\"{uri}\")"),
                None => c[0].to_string(),
            }
        })
        .to_string()
}

/// `entry` with its local stylesheets, scripts, images, media and CSS
/// `url()`s inlined. Remote URLs are left as they are.
pub fn standalone_html(root: &Path, entry: &str) -> Result<String> {
    let entry_path = files::resolve(root, entry)?;
    let html = std::fs::read_to_string(&entry_path).with_context(|| format!("cannot read {entry}"))?;
    if html.len() > 8 * 1024 * 1024 {
        bail!("{entry} is larger than 8 MB");
    }
    let base_dir = Path::new(entry).parent().unwrap_or(Path::new("")).to_path_buf();

    let html = LINK_CSS.replace_all(&html, |c: &Captures| {
        let Some(href) = HREF.captures(&c[0]).map(|h| h[1].to_string()) else {
            return c[0].to_string();
        };
        match local_path(root, &base_dir, &href) {
            Some(p) => {
                let css = std::fs::read_to_string(&p).unwrap_or_default();
                let css_dir = Path::new(&href).parent().map(|d| base_dir.join(d)).unwrap_or(base_dir.clone());
                format!("<style>\n{}\n</style>", inline_css_urls(root, &css_dir, &css))
            }
            None => c[0].to_string(),
        }
    });
    let html = SCRIPT_SRC.replace_all(&html, |c: &Captures| {
        match local_path(root, &base_dir, &c[2]) {
            Some(p) => {
                let js = std::fs::read_to_string(&p).unwrap_or_default().replace("</script", "<\\/script");
                format!("<script{}{}>\n{js}\n</script>", &c[1], &c[3])
            }
            None => c[0].to_string(),
        }
    });
    let html = MEDIA_SRC.replace_all(&html, |c: &Captures| {
        match local_path(root, &base_dir, &c[3]).and_then(|p| data_uri(&p)) {
            Some(uri) => format!("{}\"{uri}\"", &c[1]),
            None => c[0].to_string(),
        }
    });
    Ok(inline_css_urls(root, &base_dir, &html))
}
