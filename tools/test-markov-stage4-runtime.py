#!/usr/bin/env python3
"""Offline Stage 4 regression checks; requires preinstalled NumPy and Git history.

Executes only the previously inspected, pinned English educational cells and
their exact approved mechanical split. Locale workbooks are structural data,
never execution inputs. AST restrictions are an additional check, not a general
security sandbox. No network, model calls, package installation or Git writes.
"""
import argparse
import ast
import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys

try:
    import numpy as np
except ImportError:
    print(json.dumps({"allPassed": False, "error": "Preinstalled NumPy is required"}, separators=(",", ":")), file=sys.stderr)
    sys.exit(1)

REPO = Path(__file__).resolve().parent.parent
PREDECESSOR = "017ea7eed65a9dc7875aa5b8c59df489114facbd"
LOCALES = ("en", "ar", "bn", "de", "es", "fr", "hi", "id", "ja", "ko", "pt-BR", "ru", "zh")
OLD_ORDER = ["intro", "coordinates", "cube_moves", "check_moves", "cycles",
             "show_turn", "markov_bridge", "random_walk", "takeaways"]
NEW_ORDER = OLD_ORDER[:6] + ["markov_bridge", "transition_matrix", "sticker_bridge",
                           "sticker_step", "trajectory_bridge", "random_walk", "takeaways"]
CODE_ORDER = ["cube_moves", "check_moves", "show_turn", "transition_matrix", "sticker_step", "random_walk"]
PART_KEYS = ("matrix", "sticker", "trajectory")
OLD_FORMULA = "T = (IDENTITY + sum((M[name] + M[name].T for name in FACE_NAMES), np.zeros((N, N), dtype=int))) / len(MOVE_OPTIONS)"
NEW_FORMULA = "\n".join(("move_counts = IDENTITY.copy()", "for name in FACE_NAMES:",
                         "    move_counts += M[name]", "    move_counts += M[name].T",
                         "T = move_counts / len(MOVE_OPTIONS)"))
OLD_INTRO_TOKEN = "`show_turn`"
NEW_INTRO_TOKENS = "`show_turn`, `transition_matrix`, `sticker_step`"


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def pinned_workbook(locale):
    content = subprocess.check_output(
        ["git", "show", f"{PREDECESSOR}:workbooks/{locale}/markov-groups.srwb"],
        cwd=REPO, stderr=subprocess.PIPE,
    )
    return json.loads(content), hashlib.sha256(content).hexdigest()


def expected_book(old, texts):
    """Independent exact structural derivation; no JavaScript/helper execution."""
    original = old["notebook"]["cells"]
    check([cell["name"] for cell in original] == OLD_ORDER, "Pinned nine-cell order changed")
    blocks = original[7]["code"].split("\n\n")
    check(len(blocks) == 3 and [len(block.split("\n")) for block in blocks] == [6, 6, 10],
          "Pinned random_walk block counts changed")
    check(blocks[0].split("\n")[1] == OLD_FORMULA, "Pinned sum formula changed")
    blocks[0] = blocks[0].replace(OLD_FORMULA, NEW_FORMULA, 1)
    expected = copy.deepcopy(old)
    prefix = expected["notebook"]["cells"][:6]
    check(prefix[0]["code"].count(OLD_INTRO_TOKEN) == 1, "Pinned run-order token is not unique")
    prefix[0]["code"] = prefix[0]["code"].replace(OLD_INTRO_TOKEN, NEW_INTRO_TOKENS, 1)
    pairs = []
    for index, text in enumerate(texts):
        markdown, code = copy.deepcopy(original[6]), copy.deepcopy(original[7])
        markdown.update(name=NEW_ORDER[6 + index * 2], code=text)
        code.update(name=NEW_ORDER[7 + index * 2], code=blocks[index])
        pairs.extend((markdown, code))
    expected["notebook"]["cells"] = prefix + pairs + [copy.deepcopy(original[8])]
    return expected


def source_safety(code, label):
    tree = ast.parse(code, filename=label)
    banned_names = {"open", "eval", "exec", "compile", "__import__", "input", "globals", "locals",
                    "getattr", "setattr", "delattr", "vars", "help", "breakpoint"}
    banned_attrs = {"load", "save", "savez", "savez_compressed", "loadtxt", "savetxt", "genfromtxt",
                    "fromfile", "tofile", "memmap", "ctypes", "f2py"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            check(len(node.names) == 1 and node.names[0].name == "numpy" and node.names[0].asname == "np",
                  f"{label}: only the inspected NumPy import is allowed")
        check(not isinstance(node, ast.ImportFrom), f"{label}: import-from is not allowed")
        if isinstance(node, ast.Name):
            check(node.id not in banned_names and not node.id.startswith("__"), f"{label}: unsafe name")
        if isinstance(node, ast.Attribute):
            check(not node.attr.startswith("_") and node.attr not in banned_attrs, f"{label}: unsafe attribute")
    return tree


def guarded_import(name, *args, **kwargs):
    # NumPy may lazily request its own preinstalled submodules while evaluating
    # an inspected cell; the cell AST itself permits only `import numpy as np`.
    check(name == "numpy" or name.startswith("numpy."), "Only preinstalled NumPy may be imported by the inspected cells")
    return __import__(name, *args, **kwargs)


def run_inspected_english(cells, label):
    permitted_builtins = {"__import__": guarded_import, "range": range, "len": len, "zip": zip, "sum": sum,
                          "int": int, "float": float, "str": str, "round": round, "print": print,
                          "list": list, "dict": dict, "tuple": tuple, "sorted": sorted,
                          "all": all, "any": any, "ValueError": ValueError}
    namespace = {"__builtins__": permitted_builtins}
    outputs = {}
    for cell in cells:
        if cell["type"] != "code":
            continue
        check(cell["language"] == "python", f"{label}: unexpected code language")
        cell_label = f"{label}/{cell['name']}"
        tree = source_safety(cell["code"], cell_label)
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            exec(compile(tree, cell_label, "exec", optimize=0), namespace, namespace)
        outputs[cell["name"]] = stream.getvalue()
    return namespace, outputs


def check_equivalence(old, new):
    for key in ("T", "location_probability", "after_one_step", "walk_state", "SOLVED", "CENTRES", "IDENTITY"):
        check(np.array_equal(old[key], new[key]), f"Old/new numerical mismatch: {key}")
    check(old["moves"] == new["moves"], "Seeded move choices changed")
    for face in "UDFBLR":
        for key in ("M", "PERMS"):
            check(np.array_equal(old[key][face], new[key][face]), f"Old/new move mismatch: {key}/{face}")


def check_distribution(namespace):
    matrix, initial, after = (namespace[key] for key in ("T", "location_probability", "after_one_step"))
    check(matrix.shape == (54, 54), "Sticker matrix shape is not 54 by 54")
    check(np.all(matrix >= 0) and np.allclose(matrix.sum(axis=0), 1) and np.allclose(matrix.sum(axis=1), 1),
          "Sticker matrix is not doubly stochastic")
    check(np.array_equal(matrix, matrix.T), "Equal turn/inverse weighting is not symmetric")
    check(np.array_equal(initial, np.eye(54)[0]), "Initial distribution is not position-0 one-hot")
    check(np.array_equal(after, matrix[:, 0]), "One-hot update is not the first column")
    destinations = np.flatnonzero(after).tolist()
    check(destinations == [0, 2, 6, 18, 35, 42, 47], "Unexpected first-step destinations")
    check(after[0] == 7 / 13 and all(after[d] == 1 / 13 for d in destinations if d != 0),
          "Expected seven stays and six single-choice destinations")
    check(np.isclose(after.sum(), 1), "First-step probability mass is not one")
    for centre in namespace["CENTRES"]:
        check(np.array_equal(matrix[:, centre], np.eye(54)[:, centre]), "Centre location changed")
    check(np.array_equal(np.sort(namespace["walk_state"]), namespace["SOLVED"]), "Sample lost a sticker label")
    centres = namespace["CENTRES"]
    check(np.array_equal(namespace["walk_state"][centres], namespace["SOLVED"][centres]), "Sample moved a centre")
    return destinations


def expect_rejected(action, message):
    try:
        action()
    except AssertionError:
        return
    raise AssertionError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--locales", default=",".join(LOCALES), help="Comma-separated structural checks; English is always included")
    parser.add_argument("--report", type=Path, help="Optional generated JSON report path; default is stdout only")
    options = parser.parse_args()
    requested = options.locales.split(",")
    check(len(set(requested)) == len(requested) and all(locale in LOCALES for locale in requested), "Unknown or duplicate locale")
    locales = ["en"] + [locale for locale in requested if locale != "en"]
    source_parts = json.loads((REPO / "tools/markov-stage4-text.json").read_text(encoding="utf-8"))
    check(set(source_parts) == set(PART_KEYS) and all(isinstance(source_parts[key], str) for key in PART_KEYS),
          "Approved source requires exactly three Markdown strings")
    structures = []
    english = None
    old_english = None
    for locale in locales:
        content = (REPO / "workbooks" / locale / "markov-groups.srwb").read_bytes()
        current = json.loads(content)
        old, old_hash = pinned_workbook(locale)
        cells = current["notebook"]["cells"]
        check([cell["name"] for cell in cells] == NEW_ORDER, f"{locale}: thirteen-cell order differs")
        texts = [cells[index]["code"] for index in (6, 8, 10)]
        check(all(isinstance(text, str) for text in texts), f"{locale}: Markdown is not text")
        if locale == "en":
            check(texts == [source_parts[key] for key in PART_KEYS], "English differs from approved Stage 4 prose")
            english, old_english = current, old
        check(current == expected_book(old, texts), f"{locale}: drift outside the authorized split/loop/intro/prose")
        check([cell["name"] for cell in cells if cell["type"] == "code"] == CODE_ORDER, f"{locale}: code order differs")
        for cell in cells:
            if cell["type"] == "code":
                check(cell["language"] == "python", f"{locale}: unexpected code language")
                source_safety(cell["code"], f"{locale}/{cell['name']}")
        structures.append({"locale": locale, "sha256": hashlib.sha256(content).hexdigest(),
                           "predecessorSha256": old_hash, "cells": 13, "preservationPassed": True})

    # Exact structural validation above is required before executing any cells.
    old, old_outputs = run_inspected_english(old_english["notebook"]["cells"], "pinned/en")
    new, new_outputs = run_inspected_english(english["notebook"]["cells"], "current/en")
    check_equivalence(old, new)
    check(np.array_equal(new["IDENTITY"], np.eye(54, dtype=int)), "Loop mutated IDENTITY")
    for name in ("cube_moves", "check_moves", "show_turn"):
        check(old_outputs[name] == new_outputs[name], f"Output changed: {name}")
    check(old_outputs["random_walk"] == "".join(new_outputs[name] for name in CODE_ORDER[3:]), "Split outputs changed")
    destinations = check_distribution(new)
    matrix_code = english["notebook"]["cells"][7]["code"]
    tree = ast.parse(matrix_code)
    check(any(isinstance(node, ast.For) and isinstance(node.iter, ast.Name) and node.iter.id == "FACE_NAMES"
              for node in tree.body), "Visible face loop missing")
    check("IDENTITY.copy()" in matrix_code and not any(isinstance(node, ast.GeneratorExp) for node in ast.walk(tree)),
          "Expected copied identity and explicit loop")
    choices = [new["IDENTITY"] if move == "I" else new["M"][move[:-1]].T if move.endswith("'")
               else new["M"][move] for move in new["MOVE_OPTIONS"]]
    check(len(choices) == 13, "Expected thirteen actual move choices")
    enumerated = np.zeros((54, 54))
    for first in choices:
        for second in choices:
            enumerated += second @ first
    enumerated /= 13**2
    check(np.allclose(new["T"] @ new["T"], enumerated), "Two-step ordered average differs from T squared")
    check(np.allclose(new["T"] @ new["after_one_step"], enumerated @ new["location_probability"]),
          "Two-step sticker distribution differs from ordered enumeration")
    check(not np.array_equal(new["M"]["R"] @ new["M"]["U"], new["M"]["U"] @ new["M"]["R"]),
          "Noncommuting U/R regression failed")

    # Known local numerical mutations only; no mutated workbook code executes.
    wrong_loop = new["IDENTITY"].copy()
    for face in "UDFBLR":
        wrong_loop += 2 * new["M"][face]  # Deliberately replace each inverse by another forward turn.
    expect_rejected(lambda: check_equivalence(old, {**new, "T": wrong_loop / 13}), "Broken inverse loop went undetected")
    wrong_initial = np.eye(54)[1]
    expect_rejected(lambda: check_distribution({**new, "location_probability": wrong_initial,
                                               "after_one_step": new["T"] @ wrong_initial}),
                    "Wrong starting position went undetected")
    evidence = {"allPassed": True, "scope": "Offline inspected English NumPy cells; locale structure only",
                "predecessorCommit": PREDECESSOR, "numpyVersion": np.__version__, "localeStructure": structures,
                "matrixExactToOldSum": True, "seededTrajectoryExact": True, "splitOutputsExact": True,
                "twoStepOrderedEnumerationPassed": True, "negativeRegressions": 2,
                "firstColumn": [{"position": d, "choicesOutOf13": int(round(new["after_one_step"][d] * 13))}
                                for d in destinations], "sampledMoves": new["moves"],
                "limits": ["No browser/Pyodide runtime initialized", "No network, model, installation or Git writes"]}
    serialized = json.dumps(evidence, ensure_ascii=False, separators=(",", ":")) + "\n"
    if options.report:
        options.report.write_text(serialized, encoding="utf-8")
    sys.stdout.write(serialized)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not leak checkout/report paths into portable CI output.
        detail = str(error).replace(str(REPO), "[repository]") if isinstance(error, AssertionError) else type(error).__name__
        print(json.dumps({"allPassed": False, "error": detail}, separators=(",", ":")), file=sys.stderr)
        sys.exit(1)
