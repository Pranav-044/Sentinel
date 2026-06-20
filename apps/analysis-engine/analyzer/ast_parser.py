"""
ast_parser.py
─────────────
Tree-Sitter based AST parser for Python, TypeScript, and JavaScript.

For each source file, extracts:
  - All import/require statements  → edges in the dependency graph
  - All function/method definitions → complexity calculation units
  - File-level metadata (language, line count)
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript
from tree_sitter import Language, Parser, Node

# ── Language registry ─────────────────────────────────────────────────────────

PY_LANGUAGE  = Language(tspython.language())
JS_LANGUAGE  = Language(tsjavascript.language())
TSX_LANGUAGE = Language(tstypescript.language_tsx())
TS_LANGUAGE  = Language(tstypescript.language_typescript())

EXTENSION_MAP: dict[str, Language] = {
    ".py":  PY_LANGUAGE,
    ".js":  JS_LANGUAGE,
    ".mjs": JS_LANGUAGE,
    ".cjs": JS_LANGUAGE,
    ".jsx": JS_LANGUAGE,
    ".ts":  TS_LANGUAGE,
    ".tsx": TSX_LANGUAGE,
}

SUPPORTED_EXTENSIONS = set(EXTENSION_MAP.keys())

# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class FunctionDef:
    name: str
    start_line: int
    end_line: int
    decision_points: int = 0      # branches, loops, catches — for cyclomatic complexity
    nesting_depth: int = 0        # max nesting — for cognitive complexity


@dataclass
class ImportRef:
    """Represents a resolved import reference (module path or package name)."""
    raw_path: str         # e.g. "../../utils" or "lodash"
    resolved_path: str    # relative from repo root, e.g. "src/utils"
    is_external: bool     # True if it's an npm/pip package, not a local file


@dataclass
class ParsedFile:
    file_path: str          # Relative to repo root
    language: str
    line_count: int
    function_count: int
    imports: list[ImportRef] = field(default_factory=list)
    functions: list[FunctionDef] = field(default_factory=list)
    error: Optional[str] = None


# ── Cyclomatic complexity ─────────────────────────────────────────────────────
# Decision points: if, elif, else-if, for, while, case, catch, &&, ||, ?:
# Base score = 1 per function + 1 per decision point

DECISION_POINT_TYPES = frozenset({
    # Python
    "if_statement", "elif_clause", "for_statement", "while_statement",
    "except_clause", "with_statement",
    # JS/TS
    "if_statement", "else_clause", "for_statement", "for_in_statement",
    "for_of_statement", "while_statement", "do_statement",
    "catch_clause", "switch_case", "ternary_expression",
    "logical_expression",
})


def _count_decision_points(node: Node) -> int:
    count = 0
    if node.type in DECISION_POINT_TYPES:
        count += 1
    for child in node.children:
        count += _count_decision_points(child)
    return count


def _max_nesting(node: Node, current: int = 0) -> int:
    NESTING_TYPES = frozenset({
        "if_statement", "for_statement", "while_statement",
        "function_definition", "function_declaration", "arrow_function",
        "try_statement",
    })
    depth = current
    if node.type in NESTING_TYPES:
        depth = current + 1
    return max(depth, *(
        _max_nesting(child, depth) for child in node.children
    ), default=depth)


# ── Function node detection ───────────────────────────────────────────────────

FUNCTION_NODE_TYPES = frozenset({
    "function_definition",          # Python def
    "async_function_definition",    # Python async def
    "function_declaration",         # JS/TS function foo()
    "function_expression",          # JS const foo = function()
    "arrow_function",               # JS const foo = () =>
    "method_definition",            # JS/TS class methods
    "method_declaration",           # TS class methods
    "generator_function_declaration",
})


def _extract_functions(node: Node, source: bytes) -> list[FunctionDef]:
    results: list[FunctionDef] = []
    if node.type in FUNCTION_NODE_TYPES:
        # Try to get the function name
        name = "anonymous"
        for child in node.children:
            if child.type in ("identifier", "property_identifier"):
                name = source[child.start_byte:child.end_byte].decode("utf-8", errors="replace")
                break
        start_line = node.start_point[0] + 1
        end_line = node.end_point[0] + 1
        decision_points = _count_decision_points(node)
        nesting_depth = _max_nesting(node)
        results.append(FunctionDef(
            name=name,
            start_line=start_line,
            end_line=end_line,
            decision_points=decision_points,
            nesting_depth=nesting_depth,
        ))
    for child in node.children:
        results.extend(_extract_functions(child, source))
    return results


# ── Import extraction ─────────────────────────────────────────────────────────

def _is_external(path: str) -> bool:
    """Heuristic: if not starting with '.', it's a package import."""
    return not path.startswith(".")


def _resolve_import(raw: str, file_path: str, repo_root: str) -> str:
    """Attempt to resolve a relative import to a repo-root-relative path."""
    if _is_external(raw):
        return raw  # Return package name as-is
    file_dir = os.path.dirname(os.path.join(repo_root, file_path))
    resolved = os.path.normpath(os.path.join(file_dir, raw))
    try:
        rel = os.path.relpath(resolved, repo_root)
        return rel.replace("\\", "/")
    except ValueError:
        return raw


def _extract_imports_python(tree: Node, source: bytes, file_path: str, repo_root: str) -> list[ImportRef]:
    imports: list[ImportRef] = []
    for node in _iter_nodes(tree):
        if node.type == "import_statement":
            for child in node.children:
                if child.type == "dotted_name":
                    raw = source[child.start_byte:child.end_byte].decode("utf-8", errors="replace")
                    imports.append(ImportRef(raw_path=raw, resolved_path=raw, is_external=True))
        elif node.type == "import_from_statement":
            # from X import Y — X is the module
            module_node = next(
                (c for c in node.children if c.type in ("dotted_name", "relative_import")), None
            )
            if module_node:
                raw = source[module_node.start_byte:module_node.end_byte].decode("utf-8", errors="replace")
                raw = raw.lstrip(".")
                external = _is_external(raw)
                resolved = _resolve_import(raw, file_path, repo_root)
                imports.append(ImportRef(raw_path=raw, resolved_path=resolved, is_external=external))
    return imports


def _extract_imports_js(tree: Node, source: bytes, file_path: str, repo_root: str) -> list[ImportRef]:
    imports: list[ImportRef] = []
    for node in _iter_nodes(tree):
        if node.type in ("import_statement", "import_declaration"):
            for child in node.children:
                if child.type == "string":
                    raw = source[child.start_byte:child.end_byte].decode("utf-8", errors="replace").strip("\"'`")
                    external = _is_external(raw)
                    resolved = _resolve_import(raw, file_path, repo_root)
                    imports.append(ImportRef(raw_path=raw, resolved_path=resolved, is_external=external))
        elif node.type == "call_expression":
            # require("...") / import("...")
            fn = node.child_by_field_name("function")
            if fn and source[fn.start_byte:fn.end_byte] in (b"require", b"import"):
                args = node.child_by_field_name("arguments")
                if args:
                    for child in args.children:
                        if child.type == "string":
                            raw = source[child.start_byte:child.end_byte].decode("utf-8", errors="replace").strip("\"'`")
                            external = _is_external(raw)
                            resolved = _resolve_import(raw, file_path, repo_root)
                            imports.append(ImportRef(raw_path=raw, resolved_path=resolved, is_external=external))
    return imports


def _iter_nodes(node: Node):
    yield node
    for child in node.children:
        yield from _iter_nodes(child)


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_file(abs_path: str, repo_root: str) -> ParsedFile:
    """Parse a single source file and return its ParsedFile metadata."""
    rel_path = os.path.relpath(abs_path, repo_root).replace("\\", "/")
    ext = Path(abs_path).suffix.lower()
    language = EXTENSION_MAP.get(ext)
    lang_name = {
        ".py": "python", ".js": "javascript", ".mjs": "javascript",
        ".cjs": "javascript", ".jsx": "javascript",
        ".ts": "typescript", ".tsx": "tsx",
    }.get(ext, "unknown")

    if language is None:
        return ParsedFile(file_path=rel_path, language=lang_name, line_count=0, function_count=0,
                          error="Unsupported extension")

    try:
        source = Path(abs_path).read_bytes()
    except Exception as e:
        return ParsedFile(file_path=rel_path, language=lang_name, line_count=0, function_count=0,
                          error=str(e))

    parser = Parser(language)
    tree = parser.parse(source)
    root = tree.root_node

    functions = _extract_functions(root, source)

    if lang_name == "python":
        imports = _extract_imports_python(root, source, rel_path, repo_root)
    else:
        imports = _extract_imports_js(root, source, rel_path, repo_root)

    line_count = source.count(b"\n") + 1

    return ParsedFile(
        file_path=rel_path,
        language=lang_name,
        line_count=line_count,
        function_count=len(functions),
        imports=imports,
        functions=functions,
    )


def walk_repo(repo_root: str, exclude_dirs: set[str] | None = None) -> list[str]:
    """Yield all supported source files in the repo, excluding typical noise dirs."""
    if exclude_dirs is None:
        exclude_dirs = {
            "node_modules", ".git", "dist", "build", "__pycache__",
            ".venv", "venv", "env", ".pytest_cache", "coverage",
            ".next", ".nuxt", "vendor",
        }
    result: list[str] = []
    for dirpath, dirnames, filenames in os.walk(repo_root):
        # Prune excluded directories in-place
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        for filename in filenames:
            if Path(filename).suffix.lower() in SUPPORTED_EXTENSIONS:
                result.append(os.path.join(dirpath, filename))
    return result
