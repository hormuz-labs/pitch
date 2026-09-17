# Use from another agent harness

Copy this `icon-library` skill folder and the repository's `assets/icons/`
directory, including its manifest and licenses. No Pitch server, API key or
package installation is required; the bundled script uses Node built-ins.

Set `ICON_LIBRARY_DIR` to the copied catalog directory, or pass `--library`:

```sh
node /path/to/icon-library/scripts/icons.mjs search "slack" --library /path/to/assets/icons
node /path/to/icon-library/scripts/icons.mjs import svgl/slack lucide/check --library /path/to/assets/icons --workspace /path/to/project
```

Commands return JSON with selected local files. Imports include licenses and
an `attributions.json` ledger. `--out` chooses a directory inside the project.
The script can also be wrapped as a host tool: exported functions are
`searchIcons(library, query, options)`, `importIcons(library, workspace, ids, out)`
and `collections(library)`.
