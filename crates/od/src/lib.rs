//! Pitch Studio: the design-agent server, as a library so the CLI and the
//! desktop app embed the same thing.

mod agent;
mod api;
pub mod config;
mod content;
mod db;
mod events;
mod export;
mod files;
mod markers;
mod prompt;
mod runs;
pub mod server;
mod state;
mod tools;
mod util;
