#!/usr/bin/env python3
"""Fail-closed runtime oracle for the 19-cell Markov workbook editions.

Normal mode verifies frozen English plus every shipped/staged locale and may
write one new aggregate report.  ``--self-test`` runs only trusted English and
synthetic negative fixtures.  This program never calls a model, promotes a
workbook, or mutates catalog/campaign inputs.
"""

from __future__ import annotations

import argparse
import ast
import builtins
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any

import numpy as np


REPO = Path(__file__).resolve().parent.parent
PREDECESSOR = "f88d9b9e26364eeb5e7ff1ee9bcce5f27d47c66e"
ENGLISH_SHA256 = "2daf77aa872a7210cc16083535b1c244fb2cfbc288d60f688b85f0736633c430"
FIELDS_SHA256 = "9384a5386aacb17c25a28a868e152b5cee35fbdb77f5c9e77a4497d44ee609fd"
LOCALES = ("ar", "bn", "de", "es", "fr", "hi", "id", "ja", "ko", "pt-BR", "ru", "zh")
ALL_EDITIONS = ("en",) + LOCALES
ENGLISH = REPO / "drafts/markov-mixing/en/markov-groups.srwb"
FIELDS = REPO / "drafts/markov-mixing/translation-fields.json"
ITERATION7 = REPO / "reviews/markov-mixing-english-20261007/iteration-7/runtime.json"
LEGACY_RUNTIME = REPO / "tools/test-markov-mixing-runtime.py"
REVIEWS = REPO / "reviews"
TRANSLATIONS = REVIEWS / "translations"
MARKDOWN_INDICES = (13, 15, 17)
CODE_INDICES = (14, 16, 18)
EXPECTED_SPANS = {14: 8, 16: 9, 18: 10}
CHECKPOINTS = (100, 1000, 10000)
NUMBER = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")
HTML_TAG = re.compile(r"<[^>]*>")
ALLOWED_LABEL_PATHS = (
    ("title",),
    ("xlabel",),
    ("ylabel",),
    ("layout", "title", "text"),
    ("traces", "*", "name"),
    ("traces", "*", "marker", "colorbar", "title", "text"),
)
PROTECTED_NAMESPACE = (
    "N", "FACE_NAMES", "CENTRES", "IDENTITY", "MOVE_CYCLES", "MOVE_OPTIONS", "PERMS", "M",
    "T", "move_counts", "SOLVED", "moves", "walk_state", "location_probability", "after_one_step",
    "mixing_moves", "mixing_seed", "mixing_checkpoints", "mixing_frames",
    "corner_positions", "corner_index", "corner_T", "corner_target", "corner_slots", "same_slot",
    "joint_pairs", "joint_index", "joint_reachable", "joint_mask", "joint_destinations", "joint_target",
    "visit_snapshots", "exact_snapshots", "joint_snapshots",
)
NODE_COMMAND = "node"
NODE_VERSION = "unknown"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")


def node_stable_hashes(values: dict[str, Any]) -> dict[str, str]:
    """Hash JSON values with the browser verifier's exact JS serialization."""
    script = r"""
const crypto = require('node:crypto');
const fs = require('node:fs');
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const values = JSON.parse(fs.readFileSync(0, 'utf8'));
const hashes = Object.fromEntries(Object.entries(values).map(([key, value]) =>
  [key, crypto.createHash('sha256').update(stable(value)).digest('hex')]));
process.stdout.write(JSON.stringify(hashes));
"""
    result = subprocess.run(
        [NODE_COMMAND, "-e", script], input=canonical(values), stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, check=False,
    )
    require(result.returncode == 0, "Node stable-JSON hash failed")
    hashes = load_json_bytes(result.stdout, "Node stable-JSON hashes")
    require(isinstance(hashes, dict) and set(hashes) == set(values),
            "Node stable-JSON hash result changed")
    require(all(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value)
                for value in hashes.values()), "Node stable-JSON hash is malformed")
    return hashes


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def load_json_bytes(data: bytes, label: str) -> Any:
    try:
        return json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AssertionError(f"{label} is not valid UTF-8 JSON") from error


def read_json(path: Path, label: str) -> tuple[bytes, Any]:
    try:
        data = path.read_bytes()
    except OSError as error:
        raise AssertionError(f"Missing {label}") from error
    return data, load_json_bytes(data, label)


def repo_relative(path: Path) -> str:
    resolved = path.resolve()
    require(resolved.is_relative_to(REPO), "Evidence path escaped the repository")
    return resolved.relative_to(REPO).as_posix()


def reject_symlink_ancestors(path: Path, stop: Path) -> None:
    current = path
    stop = stop.resolve()
    while current != current.parent and current != stop.parent:
        if current.exists() or current.is_symlink():
            require(not current.is_symlink(), "Symlink evidence/campaign path refused")
        if current == stop:
            return
        current = current.parent
    require(False, "Path escaped its allowed root")


def scoped_campaign(value: str | None) -> Path | None:
    if value is None:
        return None
    path = (REPO / value).resolve() if not Path(value).is_absolute() else Path(value).resolve()
    require(path.is_relative_to(TRANSLATIONS.resolve()), "Campaign must be inside reviews/translations")
    require(path.is_dir(), "Campaign directory is missing")
    reject_symlink_ancestors(path, TRANSLATIONS)
    return path


def preflight_report(value: str | None) -> Path | None:
    if value is None:
        return None
    path = (REPO / value).resolve() if not Path(value).is_absolute() else Path(value).resolve()
    require(path.is_relative_to(REVIEWS.resolve()), "Report must be inside reviews")
    reject_symlink_ancestors(path.parent, REVIEWS)
    require(not path.exists() and not path.is_symlink(), "Refusing to overwrite an existing report")
    return path


def write_new_report(path: Path, report: dict[str, Any]) -> None:
    require(not path.exists() and not path.is_symlink(), "Refusing to overwrite an existing report")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")


def git_pinned(locale: str) -> bytes:
    result = subprocess.run(
        ["git", "show", f"{PREDECESSOR}:workbooks/{locale}/markov-groups.srwb"],
        cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=False,
    )
    require(result.returncode == 0, f"Pinned predecessor unavailable for {locale}")
    return result.stdout


def resolve_node(explicit: str | None) -> tuple[str, str]:
    candidates: list[str] = []
    for value in (explicit, os.environ.get("SCIREPL_NODE"), shutil.which("node")):
        if value and value not in candidates:
            candidates.append(value)
    # Desktop/headless workspaces can retain an old distro Node while their
    # browser tooling carries a current runtime.  Discover those runtimes
    # read-only; never record their private absolute paths in evidence.
    user_root = Path(os.path.expanduser("~"))
    for pattern in (".cache/ms-playwright-go/*/node", ".vscode-server/bin/*/node",
                    ".antigravity-server/bin/*/node"):
        for candidate in sorted(user_root.glob(pattern), reverse=True):
            if str(candidate) not in candidates:
                candidates.append(str(candidate))
    for candidate in candidates:
        try:
            result = subprocess.run([candidate, "--version"], stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, text=True, check=False)
        except OSError:
            continue
        match = re.fullmatch(r"v(\d+)(?:\.\d+){2}\s*", result.stdout)
        if result.returncode == 0 and match and int(match.group(1)) >= 18:
            return candidate, result.stdout.strip()
    raise AssertionError("span-derive requires Node 18+ (use --node or SCIREPL_NODE)")


def load_legacy_runtime():
    spec = importlib.util.spec_from_file_location("_markov_mixing_runtime_oracle", LEGACY_RUNTIME)
    require(spec is not None and spec.loader is not None, "Could not load the English runtime oracle")
    module = importlib.util.module_from_spec(spec)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        spec.loader.exec_module(module)
    # The legacy run() intentionally calls getattr(__builtins__, ...).  An
    # import normally injects a dict here; restore script-execution semantics.
    module.__dict__["__builtins__"] = builtins
    return module


def expected_hybrid(locale: str, english: dict[str, Any]) -> tuple[bytes, dict[str, Any], bytes]:
    pinned_bytes = git_pinned(locale)
    pinned = load_json_bytes(pinned_bytes, f"pinned {locale} predecessor")
    require(len(pinned["notebook"]["cells"]) == 13, f"Pinned {locale} predecessor is not the 13-cell core")
    hybrid = copy.deepcopy(pinned)
    hybrid["notebook"]["cells"].extend(copy.deepcopy(english["notebook"]["cells"][13:]))
    return pinned_bytes, hybrid, json_bytes(hybrid)


def validate_core_and_suffix(locale: str, workbook: dict[str, Any], english: dict[str, Any]) -> tuple[bytes, dict[str, Any], bytes]:
    pinned_bytes, hybrid, hybrid_bytes = expected_hybrid(locale, english)
    cells = workbook.get("notebook", {}).get("cells")
    require(isinstance(cells, list) and len(cells) == 19, f"{locale}: expected a full 19-cell edition")
    pinned = load_json_bytes(pinned_bytes, f"pinned {locale} predecessor")
    require(cells[:13] == pinned["notebook"]["cells"], f"{locale}: pinned 13-cell core changed")
    restored = copy.deepcopy(workbook)
    restored["notebook"]["cells"] = copy.deepcopy(pinned["notebook"]["cells"])
    require(restored == pinned, f"{locale}: predecessor container metadata changed")
    restored_suffix = copy.deepcopy(workbook)
    for index in range(13, 19):
        restored_suffix["notebook"]["cells"][index]["code"] = hybrid["notebook"]["cells"][index]["code"]
    require(restored_suffix == hybrid, f"{locale}: unauthorized suffix field changed")
    require([cells[index]["name"] for index in range(13, 19)] ==
            ["mixing_bridge", "mixing_setup", "visit_bridge", "sticker_visits", "joint_bridge", "joint_visits"],
            f"{locale}: appended cell order changed")
    return pinned_bytes, hybrid, hybrid_bytes


def markdown_keeps(text: str) -> dict[str, Any]:
    inline = sorted(re.findall(r"`([^`\n]+)`", text))
    math = re.findall(r"\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\$)[^$\n]+\$", text)
    urls = sorted(re.findall(r"\]\(([^)]+)\)", text))
    numbers = sorted(re.findall(r"\d+(?:\.\d+)?", text))
    faces = sorted(re.findall(r"(?<![\w])(?:U|D|F|B|L|R)(?![\w])", text, flags=re.UNICODE))
    rows = []
    for line in text.splitlines():
        if re.match(r"^\|\s*\d+[–-]\d+:", line):
            columns = [part.strip() for part in line.split("|")[1:-1]]
            match = re.match(r"^(\d+[–-]\d+):\s*([UDFBLR])\s*\([^|]*\)$", columns[0]) if len(columns) == 2 else None
            require(match is not None, "Translated face/index table structure changed")
            rows.append([match.group(1), match.group(2), columns[1]])
    return {
        "inlineCode": inline, "math": math, "urls": urls, "numbers": numbers,
        "faces": faces, "tableRows": rows,
        "headings": re.findall(r"^(#{1,6})(?=\s)", text, flags=re.MULTILINE),
    }


def validate_markdown(locale: str, workbook: dict[str, Any], english: dict[str, Any]) -> None:
    for index in MARKDOWN_INDICES:
        source = english["notebook"]["cells"][index]["code"]
        target = workbook["notebook"]["cells"][index]["code"]
        require(isinstance(target, str) and target.strip(), f"{locale}: empty translated Markdown cell {index}")
        require("\ufffd" not in target and "<script" not in target.lower(), f"{locale}: unsafe/corrupt Markdown cell {index}")
        require(markdown_keeps(target) == markdown_keeps(source), f"{locale}: Markdown structural KEEP drift in cell {index}")


def span_authority(fields: dict[str, Any]) -> list[tuple[int, str, str]]:
    require(fields.get("schema") == "markov-mixing-fields-v1", "Translation fields schema changed")
    require(fields.get("predecessorCommit") == PREDECESSOR, "Translation fields predecessor changed")
    require(fields.get("candidateEnglishSha256") == ENGLISH_SHA256, "Translation fields English hash changed")
    require(len(fields.get("candidates", [])) == 27, "Expected 27 authorized code spans")
    authority = []
    for candidate in fields["candidates"]:
        index = int(candidate["id"].split(":", 1)[0])
        authority.append((index, candidate["kind"], candidate["text"]))
    require({index: sum(1 for item in authority if item[0] == index) for index in CODE_INDICES} == EXPECTED_SPANS,
            "Authorized span distribution changed")
    require(len(fields.get("protectedCandidates", [])) == 133, "Protected code candidate set changed")
    return authority


def run_span_derive(source: Path, target: Path, locale: str) -> dict[str, Any]:
    result = subprocess.run(
        [NODE_COMMAND, str(REPO / "tools/span-derive.mjs"), str(source), str(target), locale],
        cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    require(result.returncode == 0, f"{locale}: span-derive rejected executable structure")
    return load_json_bytes(result.stdout, f"{locale} span manifest")


def validate_manifest(locale: str, manifest: dict[str, Any], authority: list[tuple[int, str, str]],
                      source_sha: str, target_sha: str) -> None:
    require(manifest.get("manifest_version") == 1 and manifest.get("produced_by") == "derived",
            f"{locale}: invalid derived manifest provenance")
    require(manifest.get("generator") == "tools/span-derive.mjs", f"{locale}: unexpected span generator")
    require(manifest.get("locale") == locale, f"{locale}: manifest locale mismatch")
    require(manifest.get("source", {}).get("sha256") == source_sha, f"{locale}: manifest source hash mismatch")
    require(manifest.get("target", {}).get("sha256") == target_sha, f"{locale}: manifest target hash mismatch")
    require(manifest.get("exclusions") == [], f"{locale}: span exclusions are not authorized")
    spans = manifest.get("spans")
    require(isinstance(spans, list) and len(spans) == 27, f"{locale}: expected 27 derived spans")
    actual = [(span.get("cell_index"), span.get("kind"), span.get("source_span", {}).get("text")) for span in spans]
    require(sorted(actual) == sorted(authority), f"{locale}: derived spans differ from translation authority")
    require({index: sum(1 for span in spans if span.get("cell_index") == index) for index in CODE_INDICES} == EXPECTED_SPANS,
            f"{locale}: derived span distribution changed")
    for span in spans:
        require(span.get("cell_name") in {"mixing_setup", "sticker_visits", "joint_visits"},
                f"{locale}: derived span escaped appended code cells")
        require(isinstance(span.get("target_span", {}).get("text"), str) and span["target_span"]["text"].strip(),
                f"{locale}: empty derived translation span")


def validate_receipt_payload(locale: str, completed: dict[str, Any], verification: dict[str, Any],
                             target_sha: str, predecessor_sha: str, field_ids: list[str]) -> dict[str, Any]:
    require(completed.get("locale") == locale, f"{locale}: completion locale mismatch")
    require(completed.get("status") == "static-gates-passed", f"{locale}: campaign is not statically complete")
    require(completed.get("predecessorCommit") == PREDECESSOR, f"{locale}: completion predecessor mismatch")
    require(completed.get("englishSha256") == ENGLISH_SHA256, f"{locale}: completion English hash mismatch")
    require(completed.get("fieldsSha256") == FIELDS_SHA256, f"{locale}: completion fields hash mismatch")
    require(completed.get("fields") == field_ids, f"{locale}: completion field authority mismatch")
    require(completed.get("targetSha256") == target_sha, f"{locale}: completion target hash mismatch")
    require(completed.get("maximumRequests") == {"draft": 1, "freshReview": 1, "repair": 0},
            f"{locale}: campaign request budget changed")
    requests = completed.get("requests")
    require(isinstance(requests, dict) and set(requests) == {"draft", "freshReview", "repair"},
            f"{locale}: malformed actual request counts")
    for key, maximum in completed["maximumRequests"].items():
        require(isinstance(requests[key], int) and 0 <= requests[key] <= maximum,
                f"{locale}: actual request count exceeds its budget")
    require(requests["draft"] == 1 and requests["repair"] == 0,
            f"{locale}: dishonest draft/repair request count")
    model_approved = completed.get("modelProseApproved") is True
    controller_approved = completed.get("controllerProseReviewed") is True
    require(model_approved or controller_approved, f"{locale}: neither model nor controller approved the prose")
    require(completed.get("modelProseApproved") in (True, False), f"{locale}: missing model review state")
    if "controllerProseReviewed" in completed:
        require(completed["controllerProseReviewed"] is True, f"{locale}: invalid controller review state")
    require(completed.get("nativeSpeakerReview") == "pending", f"{locale}: unexpected native-speaker state")
    require(completed.get("runtimeReview") == "pending" and completed.get("renderedReview") == "pending",
            f"{locale}: stale runtime/rendering completion state")
    require(verification.get("schema") == "markov-mixing-translation-v1", f"{locale}: verification schema mismatch")
    require(verification.get("locale") == locale and verification.get("status") == "offline-static-gates-passed",
            f"{locale}: static verification failed")
    require(verification.get("predecessorCommit") == PREDECESSOR, f"{locale}: verification predecessor mismatch")
    require(verification.get("predecessorSha256") == predecessor_sha, f"{locale}: predecessor byte hash mismatch")
    require(verification.get("englishSha256") == ENGLISH_SHA256 and verification.get("fieldsSha256") == FIELDS_SHA256,
            f"{locale}: verification input hash mismatch")
    require(verification.get("targetSha256") == target_sha, f"{locale}: verification target hash mismatch")
    require(verification.get("cells") == 19 and verification.get("preservedCoreCells") == 13,
            f"{locale}: verification cell counts changed")
    require(verification.get("markdownFields") == ["markdown:13", "markdown:15", "markdown:17"] and
            verification.get("derivedSpans") == 27, f"{locale}: verification translation scope changed")
    require(verification.get("promoted") is False and verification.get("requestsMadeByAdapter") == 0,
            f"{locale}: verification claims an unauthorized action")
    return {"modelProseApproved": model_approved, "controllerProseReviewed": controller_approved,
            "requests": requests, "method": completed.get("method")}


def validate_review_evidence(locale: str, locale_dir: Path, completed: dict[str, Any],
                             application_proposal: dict[str, Any], application_proposal_bytes: bytes) -> tuple[dict[str, Any], dict[Path, str]]:
    guards: dict[Path, str] = {}
    evidence: list[dict[str, str]] = []
    review_summary: dict[str, Any] = {}
    entries = application_proposal.get("entries")
    require(isinstance(entries, list) and len(entries) == 30,
            f"{locale}: applied proposal does not contain exactly 30 entries")
    corrections = completed.get("controllerCorrections", 0)
    require(isinstance(corrections, int) and corrections >= 0, f"{locale}: invalid controller correction count")
    if corrections:
        proposal_path = locale_dir / "mixing.controller.proposal.json"
        correction_path = locale_dir / "mixing.controller-correction.json"
        proposal_bytes, proposal = read_json(proposal_path, f"{locale} controller proposal")
        correction_bytes, correction = read_json(correction_path, f"{locale} controller correction receipt")
        require(proposal == application_proposal, f"{locale}: applied proposal differs from controller proposal")
        require(correction.get("correctedProposalSha256") == sha256(proposal_bytes),
                f"{locale}: correction receipt does not bind controller proposal")
        require(correction.get("modelRequests") == 0 and str(correction.get("status", "")).startswith("controller-"),
                f"{locale}: correction receipt claims an unauthorized request/status")
        changes = correction.get("changes")
        if not isinstance(changes, list):
            changes = correction.get("corrections")
        count = len(changes) if isinstance(changes, list) else (1 if correction.get("field") else 0)
        require(count == corrections, f"{locale}: controller correction count mismatch")
        original_path = locale_dir / "mixing.review.proposal.json"
        require(original_path.is_file() and sha256(original_path.read_bytes()) == correction.get("originalProposalSha256"),
                f"{locale}: controller correction does not bind the immutable model review")
        for path_, data in ((proposal_path, proposal_bytes), (correction_path, correction_bytes),
                            (original_path, original_path.read_bytes())):
            guards[path_] = sha256(data); evidence.append({"path": repo_relative(path_), "sha256": sha256(data)})
    elif completed.get("controllerProseReviewed") is True:
        proposal_path = locale_dir / "mixing.controller.proposal.json"
        proposal_bytes, proposal = read_json(proposal_path, f"{locale} controller proposal")
        require(proposal == application_proposal, f"{locale}: applied proposal differs from controller proposal")
        require(completed.get("controllerProposalSha256") == sha256(proposal_bytes),
                f"{locale}: completion does not bind controller proposal")
        provenance_value = completed.get("controllerProvenancePath")
        require(isinstance(provenance_value, str), f"{locale}: missing controller provenance path")
        provenance_path = (REPO / provenance_value).resolve()
        require(provenance_path == (locale_dir / "mixing.controller.provenance.json").resolve(),
                f"{locale}: controller provenance escaped its locale")
        provenance_bytes, provenance = read_json(provenance_path, f"{locale} controller provenance")
        schema = provenance.get("schema")
        require(provenance.get("locale") == locale and provenance.get("englishSha256") == ENGLISH_SHA256,
                f"{locale}: controller provenance input pins changed")
        extra_evidence: list[tuple[Path, bytes]] = []
        if schema == "markov-mixing-controller-fallback-v1":
            require(provenance.get("fields") == 30, f"{locale}: controller fallback field count changed")
            require(provenance.get("proposalPath") == repo_relative(proposal_path)
                    and provenance.get("proposalSha256") == sha256(proposal_bytes),
                    f"{locale}: controller fallback does not bind proposal")
            require(provenance.get("modelRequestsMadeByThisFallback") == 0
                    and provenance.get("modelProseApproved") is False and provenance.get("promoted") is False,
                    f"{locale}: controller fallback makes an unauthorized claim")
            review_summary = {"controllerReviewSchema": schema, "controllerChangedFields": 30,
                              "controllerChanges": 30}
        elif schema == "markov-mixing-controller-correction-v1":
            # These are the two known post-gate fidelity corrections.  Keep
            # their failed model review immutable and prove the narrow delta.
            expected_changes = {"ru": 1, "zh": 2}
            require(locale in expected_changes and provenance.get("workbook") == "markov-groups"
                    and provenance.get("method") == "controller-correction-after-model-gate-failure",
                    f"{locale}: unrecognized controller correction provenance")
            review_path = locale_dir / "mixing.review.proposal.json"
            failure_path = locale_dir / "mixing.failed.json"
            review_bytes, reviewed = read_json(review_path, f"{locale} reviewed model proposal")
            failure_bytes, _ = read_json(failure_path, f"{locale} retained model-gate failure")
            require(provenance.get("reviewedProposalPath") == repo_relative(review_path)
                    and provenance.get("reviewedProposalSha256") == sha256(review_bytes),
                    f"{locale}: controller correction does not bind reviewed proposal")
            require(provenance.get("proposalPath") == repo_relative(proposal_path)
                    and provenance.get("proposalSha256") == sha256(proposal_bytes),
                    f"{locale}: controller correction does not bind corrected proposal")
            require(provenance.get("failurePath") == repo_relative(failure_path),
                    f"{locale}: controller correction does not bind retained failure")
            reviewed_entries = reviewed.get("entries")
            require(isinstance(reviewed_entries, list) and len(reviewed_entries) == 30,
                    f"{locale}: reviewed proposal field count changed")
            reviewed_map = {entry.get("field"): entry.get("text") for entry in reviewed_entries}
            corrected_map = {entry.get("field"): entry.get("text") for entry in entries}
            require(len(reviewed_map) == len(corrected_map) == 30 and set(reviewed_map) == set(corrected_map),
                    f"{locale}: controller correction field set changed")
            changed_fields = [entry["field"] for entry in entries
                              if corrected_map[entry["field"]] != reviewed_map[entry["field"]]]
            require(provenance.get("changedFields") == changed_fields
                    and provenance.get("unchangedFields") == 30 - len(changed_fields),
                    f"{locale}: controller correction scope does not match proposals")
            changes = provenance.get("changes")
            require(isinstance(changes, list) and len(changes) == expected_changes[locale],
                    f"{locale}: controller correction change count changed")
            for change in changes:
                before, after = change.get("before"), change.get("after")
                require(isinstance(before, str) and isinstance(after, str) and before != after
                        and any(before in reviewed_map[field] and after in corrected_map[field]
                                for field in changed_fields),
                        f"{locale}: controller correction delta is not bound to proposal text")
            require(provenance.get("modelRequestsMadeByThisCorrection") == 0
                    and provenance.get("modelProseApproved") is False
                    and provenance.get("nativeSpeakerReview") == "pending"
                    and provenance.get("promoted") is False,
                    f"{locale}: controller correction makes an unauthorized claim")
            extra_evidence.extend(((review_path, review_bytes), (failure_path, failure_bytes)))
            review_summary = {"controllerReviewSchema": schema,
                              "controllerChangedFields": len(changed_fields),
                              "controllerChanges": len(changes)}
        else:
            raise AssertionError(f"{locale}: invalid controller provenance schema")
        for path_, data in ((proposal_path, proposal_bytes), (provenance_path, provenance_bytes), *extra_evidence):
            guards[path_] = sha256(data); evidence.append({"path": repo_relative(path_), "sha256": sha256(data)})
    else:
        review_path = locale_dir / "mixing.review.proposal.json"
        review_bytes, review = read_json(review_path, f"{locale} model review proposal")
        require(review == application_proposal, f"{locale}: applied proposal differs from approved model review")
        guards[review_path] = sha256(review_bytes)
        evidence.append({"path": repo_relative(review_path), "sha256": sha256(review_bytes)})
    return {"controllerCorrections": corrections, **review_summary, "evidence": evidence}, guards


def load_campaign_edition(campaign: Path, locale: str, english: dict[str, Any], fields: dict[str, Any],
                          authority: list[tuple[int, str, str]], temporary: Path) -> dict[str, Any]:
    locale_dir = campaign / locale
    require(locale_dir.is_dir() and not locale_dir.is_symlink(), f"{locale}: campaign edition is missing")
    target_path = locale_dir / "markov-groups.srwb"
    target_bytes, workbook = read_json(target_path, f"{locale} campaign workbook")
    target_sha = sha256(target_bytes)
    pinned_bytes, hybrid, hybrid_bytes = validate_core_and_suffix(locale, workbook, english)
    validate_markdown(locale, workbook, english)

    completed_path = locale_dir / "mixing.completed.json"
    completed_bytes, completed = read_json(completed_path, f"{locale} completion receipt")
    recovery_value = completed.get("applicationVerificationPath")
    if recovery_value is not None:
        expected_recovery = f"reviews/translations/markov-mixing-20261013-controller-recovery/{locale}/mixing-application/verification.json"
        require(locale == "bn" and recovery_value == expected_recovery,
                f"{locale}: unrecognized application recovery path")
        verification_path = (REPO / recovery_value).resolve()
        require(verification_path.is_relative_to(TRANSLATIONS.resolve()),
                f"{locale}: recovery application escaped reviews/translations")
        reject_symlink_ancestors(verification_path.parent, TRANSLATIONS)
    else:
        verification_path = locale_dir / "mixing-application/verification.json"
    application_dir = verification_path.parent
    derived_path = application_dir / "derived.json"
    apply_source_path = application_dir / "apply-source.srwb"
    translated_path = application_dir / "translated.srwb"
    proposal_path = application_dir / "proposal.json"
    receipt_paths = (verification_path, derived_path, apply_source_path, translated_path, proposal_path)
    receipt_bytes = {completed_path: completed_bytes}
    receipt_json = {completed_path: completed}
    for path in receipt_paths:
        data, parsed = read_json(path, f"{locale} campaign receipt {path.name}")
        receipt_bytes[path] = data; receipt_json[path] = parsed
    require(receipt_bytes[apply_source_path] == hybrid_bytes, f"{locale}: stored apply-source is not the exact hybrid")
    require(receipt_bytes[translated_path] == target_bytes, f"{locale}: translated application output differs from final draft")
    field_ids = [entry["field"] for entry in fields["workerEntries"]]
    review = validate_receipt_payload(locale, completed, receipt_json[verification_path], target_sha,
                                      sha256(pinned_bytes), field_ids)
    controller, controller_guards = validate_review_evidence(
        locale, locale_dir, completed, receipt_json[proposal_path], receipt_bytes[proposal_path])
    review.update(controller)
    stored_manifest = receipt_json[derived_path]
    validate_manifest(locale, stored_manifest, authority, sha256(hybrid_bytes), target_sha)

    source_snapshot = temporary / f"{locale}-source.srwb"
    target_snapshot = temporary / f"{locale}-target.srwb"
    source_snapshot.write_bytes(hybrid_bytes)
    target_snapshot.write_bytes(target_bytes)
    fresh_manifest = run_span_derive(source_snapshot, target_snapshot, locale)
    validate_manifest(locale, fresh_manifest, authority, sha256(hybrid_bytes), target_sha)
    require(fresh_manifest["spans"] == stored_manifest["spans"] and fresh_manifest["exclusions"] == stored_manifest["exclusions"],
            f"{locale}: fresh span derivation differs from campaign receipt")
    return {
        "locale": locale, "path": target_path, "bytes": target_bytes, "workbook": workbook,
        "sha256": target_sha, "sourceKind": "staged-campaign",
        "staticGate": {"completedSha256": sha256(receipt_bytes[completed_path]),
                       "verificationSha256": sha256(receipt_bytes[verification_path]),
                       "derivedSha256": sha256(receipt_bytes[derived_path]), "review": review},
        "predecessorSha256": sha256(pinned_bytes), "derivedSpanCounts": EXPECTED_SPANS,
        "guarded": ({path: sha256(data) for path, data in [(target_path, target_bytes), *receipt_bytes.items()]}
                    | controller_guards),
    }


def load_canonical_edition(locale: str, english: dict[str, Any], fields: dict[str, Any],
                           authority: list[tuple[int, str, str]], temporary: Path) -> dict[str, Any]:
    target_path = REPO / f"workbooks/{locale}/markov-groups.srwb"
    target_bytes, workbook = read_json(target_path, f"{locale} canonical workbook")
    pinned_bytes, hybrid, hybrid_bytes = validate_core_and_suffix(locale, workbook, english)
    validate_markdown(locale, workbook, english)
    source_snapshot = temporary / f"{locale}-canonical-source.srwb"
    target_snapshot = temporary / f"{locale}-canonical-target.srwb"
    source_snapshot.write_bytes(hybrid_bytes)
    target_snapshot.write_bytes(target_bytes)
    manifest = run_span_derive(source_snapshot, target_snapshot, locale)
    validate_manifest(locale, manifest, authority, sha256(hybrid_bytes), sha256(target_bytes))
    return {"locale": locale, "path": target_path, "bytes": target_bytes, "workbook": workbook,
            "sha256": sha256(target_bytes), "sourceKind": "canonical", "staticGate": None,
            "predecessorSha256": sha256(pinned_bytes), "derivedSpanCounts": EXPECTED_SPANS,
            "guarded": {target_path: sha256(target_bytes)}}


def freeze(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return {"array": value.tolist(), "dtype": str(value.dtype), "shape": list(value.shape)}
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {str(key): freeze(value[key]) for key in sorted(value, key=lambda item: repr(item))}
    if isinstance(value, (list, tuple)):
        return [freeze(item) for item in value]
    if isinstance(value, (set, frozenset)):
        return sorted((freeze(item) for item in value), key=lambda item: canonical(item))
    return value


def numeric_tokens(text: str) -> list[str]:
    return NUMBER.findall(text)


def safe_label_markup(text: str) -> bool:
    """Localized Plotly labels may add line breaks, but no other markup."""
    markup = HTML_TAG.findall(text)
    remainder = HTML_TAG.sub("", text)
    return all(tag == "<br>" for tag in markup) and "<" not in remainder and ">" not in remainder


def label_locations(plot: dict[str, Any]) -> list[tuple[tuple[Any, ...], str]]:
    locations: list[tuple[tuple[Any, ...], str]] = []
    for key in ("title", "xlabel", "ylabel"):
        if key in plot:
            locations.append(((key,), plot[key]))
    if isinstance(plot.get("layout", {}).get("title"), dict) and "text" in plot["layout"]["title"]:
        locations.append((("layout", "title", "text"), plot["layout"]["title"]["text"]))
    for index, trace in enumerate(plot.get("traces", [])):
        if "name" in trace:
            locations.append((("traces", index, "name"), trace["name"]))
        title = trace.get("marker", {}).get("colorbar", {}).get("title")
        if isinstance(title, dict) and "text" in title:
            locations.append((("traces", index, "marker", "colorbar", "title", "text"), title["text"]))
    return locations


def get_path(value: Any, path: tuple[Any, ...]) -> Any:
    for key in path:
        value = value[key]
    return value


def set_path(value: Any, path: tuple[Any, ...], replacement: Any) -> None:
    for key in path[:-1]:
        value = value[key]
    value[path[-1]] = replacement


def normalized_plots(reference: list[dict[str, Any]], candidate: list[dict[str, Any]],
                     sentinel: bool = False) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    require(len(candidate) == len(reference) == 6, "Expected exactly six plot payloads")
    left, right = copy.deepcopy(reference), copy.deepcopy(candidate)
    for plot_index, (expected, actual) in enumerate(zip(left, right)):
        expected_locations = label_locations(expected)
        actual_locations = label_locations(actual)
        require([path for path, _ in actual_locations] == [path for path, _ in expected_locations],
                f"Plot {plot_index}: localized label key set changed")
        for (path, source), (_, target) in zip(expected_locations, actual_locations):
            require(isinstance(target, str) and target.strip(), f"Plot {plot_index}: blank/non-string localized label")
            require(numeric_tokens(target) == numeric_tokens(source), f"Plot {plot_index}: numeric text changed in localized label")
            require(safe_label_markup(source) and safe_label_markup(target),
                    f"Plot {plot_index}: localized label contains markup other than <br>")
            replacement = "<localized-label>" if sentinel else source
            set_path(expected, path, replacement)
            set_path(actual, path, replacement)
        require(actual.get("title") == actual.get("layout", {}).get("title", {}).get("text"),
                f"Plot {plot_index}: top-level/layout titles diverged")
    require(right == left, "Localized plot changed protected data/layout/API fields")
    return left, right


def compare_namespace(reference: dict[str, Any], candidate: dict[str, Any]) -> None:
    for key in PROTECTED_NAMESPACE:
        require(key in reference and key in candidate, f"Missing protected runtime value: {key}")
        require(freeze(candidate[key]) == freeze(reference[key]), f"Protected runtime value changed: {key}")


def validate_plot_counts(plots: list[dict[str, Any]]) -> None:
    require([len(plot["traces"]) for plot in plots] == [2, 2, 2, 1, 1, 1], "Plot trace counts changed")
    for index, plot in enumerate(plots[:3]):
        require(plot["traces"][0]["type"] == "bar" and len(plot["traces"][0]["x"]) == 24,
                f"Histogram {index} does not have 24 bars")
    for index, plot in enumerate(plots[3:]):
        trace = plot["traces"][0]
        require(trace["type"] == "bar" and len(trace["x"]) == 504 and len(trace["marker"]["color"]) == 504,
                f"Heatmap {index} does not have 504 reachable tiles")
        require(len(plot["layout"]["shapes"]) == 50, f"Heatmap {index} does not have 50 cell-edge shapes")
        for axis in ("xaxis", "yaxis"):
            layout = plot["layout"][axis]
            require(layout["range"] == [-0.5, 23.5], f"Heatmap {index} axis extent changed")
            require(layout["tickvals"] == [0, 4, 8, 12, 16, 20, 23] and
                    layout["ticktext"] == [1, 5, 9, 13, 17, 21, 24], f"Heatmap {index} 1-24 axis changed")


def independent_10000_oracle(namespace: dict[str, Any]) -> None:
    rng = np.random.default_rng(namespace["mixing_seed"])
    state = np.arange(1, 55)
    single = np.zeros(24, int)
    pair = np.zeros((24, 24), int)
    for step in range(1, 10001):
        move = namespace["mixing_moves"][int(rng.integers(13))]
        destination = np.empty_like(state)
        destination[move] = state
        state = destination
        first = int(np.flatnonzero(state == 1)[0])
        second = int(np.flatnonzero(state == 3)[0])
        single[namespace["corner_index"][first]] += 1
        pair[namespace["corner_index"][second], namespace["corner_index"][first]] += 1
        if step in CHECKPOINTS:
            require(np.array_equal(namespace["visit_snapshots"][step], single / step),
                    "Independent single-sticker trajectory oracle failed")
            require(np.array_equal(namespace["joint_snapshots"][step], pair / step),
                    "Independent joint trajectory oracle failed")


def run_edition(legacy, edition: dict[str, Any], english_namespace: dict[str, Any],
                english_plots: list[dict[str, Any]], english_output: str) -> dict[str, Any]:
    cells = edition["workbook"]["notebook"]["cells"]
    namespace, plots, output = legacy.run(cells)
    repeated_namespace, repeated_plots, repeated_output = legacy.run(cells)
    require(plots == repeated_plots and output == repeated_output, f"{edition['locale']}: nondeterministic runtime output")
    compare_namespace(namespace, repeated_namespace)
    compare_namespace(english_namespace, namespace)
    require(numeric_tokens(output) == numeric_tokens(english_output), f"{edition['locale']}: numeric stdout changed")
    normalized, _ = normalized_plots(english_plots, plots)
    legacy.validate(namespace, normalized)
    validate_plot_counts(plots)
    _, protected = normalized_plots(english_plots, plots, sentinel=True)
    labels = [{"path": "." + ".".join(map(str, path)), "text": value}
              for plot in plots for path, value in label_locations(plot)]
    require(len(labels) == 33, f"{edition['locale']}: localized plot-label topology changed")
    plot_hashes = node_stable_hashes({"protected": protected, "labels": labels})
    snapshots = []
    mask = namespace["joint_mask"]
    for step in CHECKPOINTS:
        snapshots.append({
            "steps": step,
            "singleVisitTV": float(np.abs(namespace["visit_snapshots"][step] - 1 / 24).sum() / 2),
            "exactEndPositionTV": float(np.abs(namespace["exact_snapshots"][step] - 1 / 24).sum() / 2),
            "jointVisitTV": float(np.abs(namespace["joint_snapshots"][step][mask] - 1 / 504).sum() / 2),
        })
    return {
        "namespace": namespace, "plots": plots, "output": output,
        "record": {
            "locale": edition["locale"], "sourceKind": edition["sourceKind"],
            "path": repo_relative(edition["path"]), "targetSha256": edition["sha256"],
            "predecessorSha256": edition["predecessorSha256"],
            "derivedSpanCounts": {str(key): value for key, value in edition["derivedSpanCounts"].items()},
            "cells": 19, "preservedCoreCells": 13, "movesExecuted": 10000,
            "plots": {"count": 6, "traceCounts": [2, 2, 2, 1, 1, 1],
                      "histogramBars": [24, 24, 24], "heatmapTiles": [504, 504, 504],
                      "cellEdgeShapes": [50, 50, 50],
                      "protectedPayloadSha256": plot_hashes["protected"],
                      "localizedLabelsSha256": plot_hashes["labels"]},
            "snapshots": snapshots,
            "numericStdoutSha256": sha256(canonical(numeric_tokens(output))),
            "deterministicStdoutSha256": sha256(output.encode("utf-8")),
            **({"staticGate": edition["staticGate"]} if edition["staticGate"] else {}),
        },
    }


def expect_rejection(action, label: str) -> str:
    try:
        action()
    except (AssertionError, ValueError, SyntaxError, ImportError):
        return label
    raise AssertionError(f"Negative oracle was accepted: {label}")


def negative_oracles(legacy, english: dict[str, Any], namespace: dict[str, Any],
                     plots: list[dict[str, Any]], output: str, fields: dict[str, Any]) -> list[str]:
    rejected = []
    broken = copy.deepcopy(english)
    broken["notebook"]["cells"][0]["code"] += "\ncorruption"
    rejected.append(expect_rejection(lambda: validate_core_and_suffix("en", broken, english), "core-mutation"))
    broken = copy.deepcopy(english)
    broken["notebook"]["cells"][16]["code"] = broken["notebook"]["cells"][16]["code"].replace('"bar"', '"scatter"', 1)
    authority = span_authority(fields)
    with tempfile.TemporaryDirectory(prefix="markov-mixing-span-selftest-") as directory:
        source_path, target_path = Path(directory) / "source.srwb", Path(directory) / "target.srwb"
        source_path.write_bytes(json_bytes(english)); target_path.write_bytes(json_bytes(broken))
        def reject_protected_suffix() -> None:
            manifest = run_span_derive(source_path, target_path, "es")
            validate_manifest("es", manifest, authority, sha256(source_path.read_bytes()), sha256(target_path.read_bytes()))
        rejected.append(expect_rejection(reject_protected_suffix, "protected-suffix-mutation"))
    broken_plots = copy.deepcopy(plots)
    broken_plots[0]["traces"][0]["y"][0] += 0.001
    rejected.append(expect_rejection(lambda: normalized_plots(plots, broken_plots), "numeric-plot-mutation"))
    broken_plots = copy.deepcopy(plots)
    broken_plots[3]["layout"]["xaxis"]["ticktext"][0] = 0
    rejected.append(expect_rejection(lambda: normalized_plots(plots, broken_plots), "protected-layout-mutation"))
    label_only = copy.deepcopy(plots)
    label_only[0]["title"] = label_only[0]["title"].replace("One sticker", "Localized label")
    label_only[0]["layout"]["title"]["text"] = label_only[0]["title"]
    normalized_plots(plots, label_only)
    wrapped_label = copy.deepcopy(plots)
    wrapped_label[0]["xlabel"] = wrapped_label[0]["xlabel"].replace(" position", "<br>position")
    normalized_plots(plots, wrapped_label)
    for tag in ("<b>", "<script>"):
        tagged_label = copy.deepcopy(plots)
        tagged_label[0]["xlabel"] = tagged_label[0]["xlabel"].replace("Label", f"{tag}Label")
        rejected.append(expect_rejection(lambda value=tagged_label: normalized_plots(plots, value),
                                         f"unsafe-label-{tag[1:-1]}"))
    broken_plots = copy.deepcopy(plots)
    broken_plots[3]["traces"][0]["name"] = "added"
    rejected.append(expect_rejection(lambda: normalized_plots(plots, broken_plots), "added-label-key"))
    changed_number = output + " 999999"
    rejected.append(expect_rejection(lambda: require(numeric_tokens(changed_number) == numeric_tokens(output),
                                                      "numeric stdout changed"), "numeric-stdout-mutation"))
    require(numeric_tokens(output + " localized prose") == numeric_tokens(output), "Prose-only stdout fixture failed")
    rejected.append(expect_rejection(lambda: legacy.safe_source("import urllib.request"), "network-import"))
    rejected.append(expect_rejection(lambda: legacy.safe_source("open('secret')"), "file-open"))
    error_cell = [{"name": "negative", "type": "code", "language": "python", "code": "raise ValueError('sentinel')"}]
    rejected.append(expect_rejection(lambda: legacy.run(error_cell), "runtime-error"))
    field_ids = [entry["field"] for entry in fields["workerEntries"]]
    completion = {"locale": "es", "status": "held", "predecessorCommit": PREDECESSOR,
                  "englishSha256": ENGLISH_SHA256, "fieldsSha256": FIELDS_SHA256, "fields": field_ids,
                  "targetSha256": "0" * 64, "requests": {"draft": 1, "freshReview": 1, "repair": 0},
                  "maximumRequests": {"draft": 1, "freshReview": 1, "repair": 0}, "modelProseApproved": True,
                  "nativeSpeakerReview": "pending", "runtimeReview": "pending", "renderedReview": "pending"}
    verification = {"schema": "markov-mixing-translation-v1", "locale": "es", "status": "offline-static-gates-passed",
                    "predecessorCommit": PREDECESSOR, "predecessorSha256": "1" * 64,
                    "englishSha256": ENGLISH_SHA256, "fieldsSha256": FIELDS_SHA256, "targetSha256": "0" * 64,
                    "cells": 19, "preservedCoreCells": 13, "markdownFields": ["markdown:13", "markdown:15", "markdown:17"],
                    "derivedSpans": 27, "promoted": False, "requestsMadeByAdapter": 0}
    rejected.append(expect_rejection(lambda: validate_receipt_payload("es", completion, verification, "0" * 64,
                                                                       "1" * 64, field_ids), "held-response"))
    with tempfile.TemporaryDirectory(prefix="markov-mixing-report-selftest-") as directory:
        existing = Path(directory) / "existing.json"
        existing.write_text("{}", encoding="utf-8")
        rejected.append(expect_rejection(lambda: write_new_report(existing, {}), "exclusive-report-write"))
    require(len(rejected) == 13, "Negative oracle coverage changed")
    return rejected


def source_guard(edition: dict[str, Any]) -> None:
    for path, expected in edition["guarded"].items():
        require(sha256(path.read_bytes()) == expected, f"{edition['locale']}: source/receipt changed during execution")


def execute(args: argparse.Namespace) -> dict[str, Any]:
    global NODE_COMMAND, NODE_VERSION
    NODE_COMMAND, NODE_VERSION = resolve_node(args.node)
    english_bytes, english = read_json(ENGLISH, "frozen English candidate")
    require(sha256(english_bytes) == ENGLISH_SHA256, "Frozen English candidate hash changed")
    fields_bytes, fields = read_json(FIELDS, "translation fields")
    require(sha256(fields_bytes) == FIELDS_SHA256, "Translation fields hash changed")
    authority = span_authority(fields)
    iteration_bytes, iteration = read_json(ITERATION7, "iteration-7 runtime oracle")
    require(iteration.get("allPassed") is True and iteration.get("checks") == 10829,
            "Iteration-7 runtime oracle is not the accepted run")
    require(iteration.get("candidateSha256") == ENGLISH_SHA256, "Iteration-7 English hash mismatch")
    validate_core_and_suffix("en", english, english)
    span_probe = run_span_derive(ENGLISH, ENGLISH, "en")
    require(span_probe.get("produced_by") == "derived" and span_probe.get("spans") == []
            and span_probe.get("source", {}).get("sha256") == ENGLISH_SHA256
            and span_probe.get("target", {}).get("sha256") == ENGLISH_SHA256,
            "Positive span-derive self-probe failed")

    legacy = load_legacy_runtime()
    english_namespace, english_plots, english_output = legacy.run(english["notebook"]["cells"])
    repeated_namespace, repeated_plots, repeated_output = legacy.run(english["notebook"]["cells"])
    require(english_plots == repeated_plots and english_output == repeated_output, "English runtime is nondeterministic")
    compare_namespace(english_namespace, repeated_namespace)
    legacy.validate(english_namespace, english_plots)
    validate_plot_counts(english_plots)
    require(english_plots == iteration["plots"], "Fresh English plot payload differs from iteration 7")
    independent_10000_oracle(english_namespace)
    negatives = negative_oracles(legacy, english, english_namespace, english_plots, english_output, fields)

    english_predecessor = git_pinned("en")
    english_edition = {"locale": "en", "path": ENGLISH, "bytes": english_bytes, "workbook": english,
                       "sha256": ENGLISH_SHA256, "sourceKind": "frozen-english-draft", "staticGate": None,
                       "predecessorSha256": sha256(english_predecessor), "derivedSpanCounts": {},
                       "guarded": {ENGLISH: ENGLISH_SHA256, FIELDS: FIELDS_SHA256, ITERATION7: sha256(iteration_bytes)}}
    english_result = run_edition(legacy, english_edition, english_namespace, english_plots, english_output)
    records = [english_result["record"]]
    if not args.self_test:
        campaign = scoped_campaign(args.campaign)
        with tempfile.TemporaryDirectory(prefix="markov-mixing-editions-") as directory:
            temporary = Path(directory)
            editions = []
            for locale in LOCALES:
                edition = (load_campaign_edition(campaign, locale, english, fields, authority, temporary)
                           if campaign else load_canonical_edition(locale, english, fields, authority, temporary))
                editions.append(edition)
            # Every target is fully gated and snapshotted before any translated
            # code executes.  A partial campaign therefore executes no locale.
            for edition in editions:
                result = run_edition(legacy, edition, english_namespace, english_plots, english_output)
                records.append(result["record"])
                source_guard(edition)
    source_guard(english_edition)
    require([record["locale"] for record in records] == (["en"] if args.self_test else list(ALL_EDITIONS)),
            "Edition coverage changed")
    protected_hashes = {record["plots"]["protectedPayloadSha256"] for record in records}
    require(len(protected_hashes) == 1, "Protected plot payload hash differs across editions")
    return {
        "schema": "markov-mixing-editions-runtime-v1", "allPassed": True,
        "englishSha256": ENGLISH_SHA256, "predecessorCommit": PREDECESSOR,
        "scope": ("Frozen English self-test and synthetic fail-closed oracles only; no translated edition executed"
                  if args.self_test else
                  "Offline NumPy execution of frozen English plus all 12 full 19-cell editions; exact protected runtime/plot data; no browser, native, model, promotion, or native-speaker approval"),
        "platform": {"python": platform.python_version(), "implementation": platform.python_implementation(),
                     "numpy": np.__version__, "system": platform.system(), "release": platform.release(),
                     "machine": platform.machine(), "spanDeriveNode": NODE_VERSION},
        "provenance": {"englishPath": repo_relative(ENGLISH), "translationFieldsPath": repo_relative(FIELDS),
                       "translationFieldsSha256": FIELDS_SHA256,
                       "iteration7RuntimePath": repo_relative(ITERATION7),
                       "iteration7RuntimeSha256": sha256(iteration_bytes), "iteration7Checks": 10829,
                       "legacyOraclePath": repo_relative(LEGACY_RUNTIME),
                       "legacyOracleSha256": sha256(LEGACY_RUNTIME.read_bytes())},
        "invariants": {"cells": 19, "coreCells": 13, "authorizedMarkdownFields": 3,
                       "authorizedCodeSpans": 27, "protectedCodeCandidates": 133,
                       "seed": 20261007, "checkpoints": list(CHECKPOINTS), "moves": 10000,
                       "cornerPositions": english_namespace["corner_positions"].tolist(),
                       "reachableOrderedPairs": 504, "maskedSameCubiePairs": 72,
                       "rowColumnReachableCounts": 21, "rowColumnGaps": 3},
        "negativeOracles": [{"name": name, "status": "rejected"} for name in negatives],
        "locales": records,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--campaign", help="Staged campaign under reviews/translations; omit for canonical workbooks")
    parser.add_argument("--report", help="Fresh aggregate JSON path under reviews (never overwritten)")
    parser.add_argument("--node", help="Node 18+ executable for the existing span-derive gate")
    parser.add_argument("--self-test", action="store_true", help="Run frozen-English/synthetic fixtures only")
    args = parser.parse_args(argv)
    require(not args.self_test or args.campaign is None, "--self-test does not accept --campaign")
    return args


def public_error(error: BaseException) -> str:
    if not isinstance(error, AssertionError):
        return type(error).__name__
    message = str(error) or "Assertion failed"
    message = message.replace(str(REPO), "<repo>")
    message = re.sub(r"/(?:tmp|home)/[^\s:'\"]+", "<private-path>", message)
    return message


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(sys.argv[1:] if argv is None else argv)
        report_path = preflight_report(args.report)
        report = execute(args)
        if report_path is not None:
            write_new_report(report_path, report)
        summary = {key: report[key] for key in ("schema", "allPassed", "englishSha256", "scope")}
        summary["locales"] = [{"locale": item["locale"], "targetSha256": item["targetSha256"]}
                              for item in report["locales"]]
        summary["report"] = repo_relative(report_path) if report_path else None
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except BaseException as error:  # compact, path-scrubbed fail-closed CLI
        print(json.dumps({"allPassed": False, "error": public_error(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
