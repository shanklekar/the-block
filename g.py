#!/usr/bin/env python3

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent


def run_command(args: list[str], *, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=REPO_ROOT,
        input=input_text,
        text=True,
        capture_output=True,
        check=True,
    )


def git_output(*args: str) -> str:
    result = run_command(["git", *args])
    return result.stdout.strip()


def require_tool(name: str) -> None:
    if shutil.which(name) is None:
        print(f"Missing required tool: {name}", file=sys.stderr)
        sys.exit(1)


def generate_commit_message() -> str:
    status = git_output("status", "--short")
    diff_stat = git_output("diff", "--cached", "--stat")
    diff = git_output("diff", "--cached", "--unified=0", "--no-color")

    prompt = f"""
You are writing a git commit message.

Return exactly one commit subject line with no bullet points, no quotes, and no extra commentary.
Use imperative mood and keep it under 72 characters if possible.

Repository: {REPO_ROOT.name}

Git status after staging:
{status or "(no status output)"}

Staged diff stat:
{diff_stat or "(no diff stat output)"}

Staged diff:
{diff or "(no diff output)"}
""".strip()

    with tempfile.NamedTemporaryFile(prefix="codex-commit-msg-", suffix=".txt") as output_file:
        run_command(
            [
                "codex",
                "exec",
                "-C",
                str(REPO_ROOT),
                "-s",
                "read-only",
                "--output-last-message",
                output_file.name,
                "-",
            ],
            input_text=prompt,
        )
        message = Path(output_file.name).read_text(encoding="utf-8").strip()

    first_line = next((line.strip() for line in message.splitlines() if line.strip()), "")
    first_line = first_line.strip("\"'")
    if not first_line:
        raise RuntimeError("Codex returned an empty commit message.")

    return first_line


def main() -> int:
    require_tool("git")
    require_tool("codex")

    try:
        repo_root = git_output("rev-parse", "--show-toplevel")
    except subprocess.CalledProcessError as error:
        print(error.stderr.strip() or "Not inside a git repository.", file=sys.stderr)
        return 1

    if Path(repo_root).resolve() != REPO_ROOT:
        print(
            f"Run this script from its repo root: {REPO_ROOT}",
            file=sys.stderr,
        )
        return 1

    try:
        run_command(["git", "add", "."])
        if not git_output("diff", "--cached", "--name-only"):
            print("Nothing to commit.")
            return 0

        commit_message = generate_commit_message()
        print(f"Commit message: {commit_message}")

        run_command(["git", "commit", "-m", commit_message])
        run_command(["git", "push"])
    except subprocess.CalledProcessError as error:
        if error.stdout:
            print(error.stdout.strip(), file=sys.stderr)
        if error.stderr:
            print(error.stderr.strip(), file=sys.stderr)
        return error.returncode or 1
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1

    print("Changes committed and pushed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
