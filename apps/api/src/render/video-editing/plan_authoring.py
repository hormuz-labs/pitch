"""Bounded plan authoring and agent-facing reports (stdlib only)."""
import copy
from bisect import bisect_right
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import uuid


ARRAYS = ("clips", "captions", "overlays", "redactions", "coverage")
SECTIONS = (*ARRAYS, "timeline", "output", "music")


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def revision(raw):
    return hashlib.sha256(raw).hexdigest()


def safe_path(engine, value, exists=False):
    """Authoring files may not alias another file through symlinks."""
    resolved = engine.path(value, exists=exists)
    lexical = Path(os.path.abspath(engine.root / value))
    for part in (lexical, *lexical.parents):
        if part == engine.root:
            break
        if part.is_symlink():
            raise ValueError(f"Authoring path must not use symlinks: {value}")
    return resolved


def directory(engine, name):
    folder = safe_path(engine, name)
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def counts(plan):
    return {key: len(plan.get(key, [])) for key in ARRAYS}


def summary(plan, report):
    warnings = report.get("warnings", [])
    return {"duration": report["duration"], "output": report["output"],
            "counts": counts(plan), "warnings": warnings[:3], "warning_count": len(warnings)}


def bounded(value):
    """Page size alone is insufficient: legacy notes can contain arbitrary JSON."""
    raw = encode(value)
    if len(raw) <= 1600:
        return value
    return {"truncated": True, "bytes": len(raw), "preview": raw[:1200].decode("utf-8", errors="ignore")}


def page(plan, report, args):
    section = args.get("section", "clips")
    if section not in SECTIONS:
        raise ValueError(f"section must be one of: {', '.join(SECTIONS)}")
    offset, limit = args.get("offset", 0), args.get("limit", 5)
    if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 10:
        raise ValueError("offset must be an integer >=0; limit must be an integer from 1 to 10")
    value = report["timeline"] if section == "timeline" else plan.get(section, [] if section in ARRAYS else None)
    if section in ("output", "music"):
        entries = list((value or {}).items())
        items = [{"index": i, "path": f"/{section}/{key}", "value": bounded(item)}
                 for i, (key, item) in enumerate(entries) if offset <= i < offset + limit]
    else:
        entries = value
        items = [{"index": i, "path": f"/{section}/{i}", "value": bounded(item)}
                 for i, item in enumerate(entries) if offset <= i < offset + limit]
    return {"section": section, "offset": offset, "limit": limit, "total": len(entries),
            "next_offset": offset + len(items) if offset + len(items) < len(entries) else None,
            "items": items}


def pointer(path):
    if not isinstance(path, str) or not path.startswith("/"):
        raise ValueError("Patch path must be a non-root JSON pointer beginning with /")
    parts = path[1:].split("/")
    if any(re.search(r"~(?![01])", part) for part in parts):
        raise ValueError(f"Malformed JSON pointer escape: {path}")
    return [part.replace("~1", "/").replace("~0", "~") for part in parts]


def index(token, size, adding=False):
    if token == "-" and adding:
        return size
    if not re.fullmatch(r"0|[1-9][0-9]*", token):
        raise ValueError(f"Invalid array index {token!r}; use 0-based integers or '-' for add")
    n = int(token)
    if n >= size + int(adding):
        raise ValueError(f"Array index {n} out of range (length {size})")
    return n


def equal(left, right):
    # JSON booleans are not numbers, unlike Python's True == 1.
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(equal(left[k], right[k]) for k in left)
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(equal(a, b) for a, b in zip(left, right))
    return left == right


def apply_ops(candidate, ops):
    changed = []
    for op in ops:
        if not isinstance(op, dict) or set(op) - {"op", "path", "value"}:
            raise ValueError("Each patch operation accepts only op, path, value")
        action, path = op.get("op"), op.get("path")
        if action not in ("add", "replace", "remove", "test"):
            raise ValueError("Patch op must be add, replace, remove or test; move/copy are unsupported")
        if action != "remove" and "value" not in op:
            raise ValueError(f"{action} requires value")
        parts = pointer(path)
        if len(parts) == 1 and parts[0] in ARRAYS:
            raise ValueError("Bulk array sections cannot be patched; edit individual entries or fields")
        parent = candidate
        # An omitted optional section behaves as an empty array for entry adds.
        if action == "add" and len(parts) == 2 and parts[0] in ARRAYS and parts[0] not in parent:
            parent[parts[0]] = []
        for token in parts[:-1]:
            if isinstance(parent, list):
                parent = parent[index(token, len(parent))]
            elif isinstance(parent, dict) and token in parent:
                parent = parent[token]
            else:
                raise ValueError(f"Patch parent does not exist: {path}")
        token = parts[-1]
        if isinstance(parent, list):
            key = index(token, len(parent), action == "add")
        elif isinstance(parent, dict):
            key = token
            if action != "add" and key not in parent:
                raise ValueError(f"Patch path does not exist: {path}")
        else:
            raise ValueError(f"Patch parent is not an object or array: {path}")
        if action == "test":
            if not equal(parent[key], op["value"]):
                raise ValueError(f"Patch test failed: {path}; inspect the current page before retrying")
        elif action == "remove":
            del parent[key]
        elif action == "add" and isinstance(parent, list):
            parent.insert(key, copy.deepcopy(op["value"]))
        else:
            parent[key] = copy.deepcopy(op["value"])
        if action != "test":
            changed.append(path)
    return changed


def portable_plan(engine, plan):
    plan = engine.portable(plan)
    for item in [*plan.get("clips", []), *plan.get("overlays", []), *plan.get("coverage", []),
                 *([plan["music"]] if plan.get("music") else [])]:
        item["source"] = str(engine.path(item["source"]).relative_to(engine.root))
    plan["output"]["path"] = str(engine.path(plan["output"]["path"], exists=False).relative_to(engine.root))
    return plan


def preserve_requirements(engine, original, candidate):
    """Do not let two small patches disable protection, then remove the footage."""
    ranges = {}
    for item in candidate.get("coverage", []):
        source = engine.path(item["source"])
        span = engine.time_range(item, engine.video(str(source))["duration"])
        ranges.setdefault((source, "activity"), []).append(span)
        if item["kind"] == "speech":
            ranges.setdefault((source, "speech"), []).append(span)
    # Merge once, then binary-search: coverage can contain 10,000 ranges.
    for key, spans in ranges.items():
        merged = []
        for a, b in sorted(spans):
            if merged and a <= merged[-1][1] + 1e-6:
                merged[-1] = (merged[-1][0], max(merged[-1][1], b))
            else:
                merged.append((a, b))
        ranges[key] = merged
    for required in original.get("coverage", []):
        source = engine.path(required["source"])
        start, end = engine.time_range(required, engine.video(str(source))["duration"])
        kind = "speech" if required["kind"] == "speech" else "activity"
        spans = ranges.get((source, kind), [])
        i = bisect_right(spans, (start + 1e-6, float("inf"))) - 1
        if i < 0 or spans[i][1] < end - 1e-6:
            raise ValueError("Coverage requirements cannot be weakened or removed; retain protected ranges")


def commit(path, raw, create=False):
    fd, name = tempfile.mkstemp(prefix=".plan-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        if create:
            os.link(name, path)  # Atomic create-if-absent; never overwrite.
        else:
            os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def author(engine, args):
    operation = args.get("operation")
    if operation not in ("create", "inspect", "patch"):
        raise ValueError("operation must be create, inspect or patch")
    if operation == "patch":
        if len(encode(args)) > 12 * 1024:
            raise ValueError("Patch payload exceeds 12 KiB; send smaller revision-checked patches")
        ops = args.get("ops")
        if not isinstance(ops, list) or not 1 <= len(ops) <= 8:
            raise ValueError("Patch requires 1–8 ops")
        if not isinstance(args.get("revision"), str) or not re.fullmatch(r"[a-f0-9]{64}", args["revision"]):
            raise ValueError("Patch requires the SHA256 revision returned by plan inspect")
    path = safe_path(engine, args.get("plan"), exists=operation != "create")
    identity = revision(str(path.relative_to(engine.root)).encode())
    folder = directory(engine, ".video-work/plan-locks")
    lock = safe_path(engine, str(folder / f"{identity}.lock"))
    with lock.open("a+b") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        # Recheck under the stable sidecar lock, not a lock on the replaced inode.
        path = safe_path(engine, args["plan"], exists=operation != "create")
        if operation == "create":
            if path.exists():
                raise ValueError("Plan already exists; use plan inspect then patch")
            info = engine.video(args.get("source"))
            safe_path(engine, args.get("output"))
            candidate = {"version": 1, "output": {"path": args.get("output"),
                "width": info["video"]["display_width"], "height": info["video"]["display_height"],
                "fps": info["video"]["fps"]},
                "clips": [{"source": info["path"], "in": 0, "out": info["duration"]}]}
            _, report = engine.validate_plan(copy.deepcopy(candidate), path)
            candidate = portable_plan(engine, candidate)
            raw = encode(candidate) + b"\n"
            path.parent.mkdir(parents=True, exist_ok=True)
            commit(path, raw, create=True)
            return {"plan": str(path), "revision": revision(raw), **summary(candidate, report)}
        raw = path.read_bytes()
        current = revision(raw)
        if operation == "patch" and args["revision"] != current:
            raise ValueError(f"Stale plan revision; current revision is {current}. Run pitch video plan --operation inspect --plan {args['plan']} for the affected section, then rebase ops and retry with that revision.")
        original = json.loads(raw)
        if operation == "inspect":
            _, report = engine.validate_plan(copy.deepcopy(original), path, allow_existing_output=True)
            return {"plan": str(path), "revision": current, **summary(original, report),
                    **page(engine.portable(original), engine.portable(report), args)}
        candidate = copy.deepcopy(original)
        changed = apply_ops(candidate, ops)
        _, report = engine.validate_plan(copy.deepcopy(candidate), path)
        safe_path(engine, candidate["output"]["path"])
        # A patch cannot evade existing preservation by deleting coverage or the
        # last reference to a prepared source (whose sidecar would then be skipped).
        engine.validate_coverage(original.get("coverage", []), report["timeline"])
        preserve_requirements(engine, original, candidate)
        for source in {clip["source"] for clip in original["clips"]}:
            sidecar = engine.path(str(engine.path(source).with_suffix(".coverage.json")), exists=False)
            if sidecar.is_file():
                engine.validate_coverage(json.loads(sidecar.read_text())["coverage"], report["timeline"])
        candidate = portable_plan(engine, candidate)
        updated = encode(candidate) + b"\n"
        backups = directory(engine, ".video-work/plan-history")
        backup = safe_path(engine, str(backups / f"{identity}-{current}.json"))
        try:
            commit(backup, raw, create=True)
        except FileExistsError:
            if backup.read_bytes() != raw:
                raise ValueError("Prior-revision backup collision; original plan was not changed")
        if path.read_bytes() != raw:
            raise ValueError("Plan changed outside the authoring lock; inspect again and retry")
        commit(path, updated)
        return {"plan": str(path), "revision": revision(updated), "previous_revision": current,
                "backup": str(backup), "changed_paths": changed, **summary(candidate, report)}


def compact_report(engine, action, args, result):
    """Full reports remain artifacts; direct Engine callers retain full results."""
    full = engine.portable(result)
    if "plan" in args:
        full["plan"] = str(engine.path(args["plan"]).relative_to(engine.root))
    if action in ("validate", "render"):
        plan = json.loads(engine.path(args["plan"]).read_text())
        full["counts"] = counts(plan)
    folder = directory(engine, ".video-work/reports")
    report_path = safe_path(engine, str(folder / f"{action}-{uuid.uuid4().hex}.json"))
    commit(report_path, encode(full) + b"\n", create=True)
    keep = ("source", "original", "output", "plan", "prepass_plan", "plan_snapshot", "duration",
            "removed_seconds", "preview", "range", "time_basis", "counts")
    small = {key: full[key] for key in keep if key in full}
    small.update({"report": str(report_path), "compact": True})
    small.setdefault("counts", {})
    if "timeline" in full:
        sources = list(dict.fromkeys(item["source"] for item in full["timeline"]))
        small["sources"] = sources[:3]
        small["counts"]["sources"] = len(sources)
    for key, value in full.items():
        if isinstance(value, list):
            small["counts"][key] = len(value)
    warnings = full.get("warnings", [])
    small["warnings"] = [str(w)[:300] for w in warnings[:3]]
    if "duration" not in small and "range" in small:
        small["duration"] = small["range"][1] - small["range"][0]
    small["next"] = "Use plan inspect to page clips/timeline; full details are in report (CLI --details returns them)."
    return small
