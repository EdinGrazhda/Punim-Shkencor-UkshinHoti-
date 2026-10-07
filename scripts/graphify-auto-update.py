"""Run the installed Graphify CLI after saved repository files change."""

from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer


ROOT = Path(__file__).resolve().parent.parent
IGNORED_DIRS = {
    ".git", ".venv", ".pytest_cache", ".vite", "__pycache__",
    "dist", "graphify-out", "node_modules",
}
IGNORED_FILES = {".env", ".env.local", ".env.production"}


def relevant(path: str) -> bool:
    try:
        relative = Path(path).resolve().relative_to(ROOT)
    except ValueError:
        return False
    return not (any(part in IGNORED_DIRS for part in relative.parts) or relative.name in IGNORED_FILES)


class Changes(FileSystemEventHandler):
    def __init__(self) -> None:
        self.last_change = 0.0
        self.pending = False

    def on_any_event(self, event: FileSystemEvent) -> None:
        if event.is_directory or event.event_type not in {"created", "modified", "deleted", "moved"}:
            return
        paths = (event.src_path, getattr(event, "dest_path", ""))
        if any(path and relevant(path) for path in paths):
            self.last_change = time.monotonic()
            self.pending = True


def update(graphify: str) -> None:
    print("[graphify-auto-update] Running graphify update .", flush=True)
    result = subprocess.run([graphify, "update", "."], cwd=ROOT, check=False)
    print(f"[graphify-auto-update] Exit status: {result.returncode}", flush=True)


def main() -> int:
    graphify = shutil.which("graphify")
    if graphify is None:
        print("[graphify-auto-update] graphify is not on PATH", file=sys.stderr)
        return 1

    changes = Changes()
    observer = Observer()
    observer.schedule(changes, str(ROOT), recursive=True)
    observer.start()
    print(f"[graphify-auto-update] Watching {ROOT}", flush=True)
    update(graphify)  # Catch changes made while the service was stopped.
    try:
        while True:
            time.sleep(0.5)
            if changes.pending and time.monotonic() - changes.last_change >= 2:
                changes.pending = False
                update(graphify)
    except KeyboardInterrupt:
        return 0
    finally:
        observer.stop()
        observer.join()


if __name__ == "__main__":
    raise SystemExit(main())
