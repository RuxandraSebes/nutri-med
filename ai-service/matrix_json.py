from __future__ import annotations

import json
import re
import logging

from matrix_constants import LEGACY_SNACK_KEY

logger = logging.getLogger(__name__)

def _strip_json_like_noise(text: str) -> str:
    if not text:
        return text
    s = re.sub(r"/\*[\s\S]*?\*/", "", text)
    out = []
    for line in s.splitlines():
        st = line.lstrip()
        if st.startswith("//"):
            continue
        out.append(line)
    return "\n".join(out)

def _close_truncated_json_suffix(text: str) -> str:
    stack: list[str] = []
    in_string = False
    escape = False
    for ch in text:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in ("}", "]") and stack and stack[-1] == ch:
            stack.pop()
    suffix = ('"' if in_string else "") + "".join(reversed(stack))
    return text + suffix

def _repair_truncated_json(raw_text: str) -> dict:
    raw_text = (raw_text or "").strip()
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.IGNORECASE)
    raw_text = re.sub(r"\s*```$", "", raw_text)
    raw_text = _strip_json_like_noise(raw_text)

    def _try_parse(s: str) -> dict | None:
        s = s.strip()
        if not s:
            return None
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            return None

    parsed = _try_parse(raw_text)
    if parsed is not None:
        return parsed

    start = raw_text.find("{")
    if start == -1:
        raise ValueError("LLM returned invalid JSON - no JSON object found.")

    depth = 0
    for i in range(start, len(raw_text)):
        if raw_text[i] == "{":
            depth += 1
        elif raw_text[i] == "}":
            depth -= 1
            if depth == 0:
                chunk = _strip_json_like_noise(raw_text[start : i + 1])
                parsed = _try_parse(chunk)
                if parsed is not None:
                    return parsed
                for extra in ("", "}", '"}', "]", "]}", "}}", '}}"', "]}}"):
                    parsed = _try_parse(chunk + extra)
                    if parsed is not None:
                        return parsed
                raise ValueError(
                    "LLM returned invalid JSON - parse failed after repair attempts.",
                ) from None

    tail = _strip_json_like_noise(raw_text[start:])
    closed = _close_truncated_json_suffix(tail)
    for candidate in (closed, closed + "}", closed + "]}"):
        parsed = _try_parse(candidate)
        if parsed is not None:
            logger.warning(
                "Repaired truncated JSON by closing %d open bracket(s)/brace(s)",
                closed.count("}") + closed.count("]") - tail.count("}") - tail.count("]"),
            )
            return parsed

    raise ValueError(
        "LLM returned truncated JSON - unbalanced braces. Try increasing "
        "OLLAMA_BATCH_NUM_PREDICT, set MATRIX_DAYS_PER_BATCH=1, or use a larger model.",
    )

def _normalize_food_item(f) -> dict:
    if not isinstance(f, dict):
        return {
            "name": str(f),
            "portion_g": 0.0,
            "kcal": 0.0,
            "protein_g": 0.0,
            "carbs_g": 0.0,
            "fat_g": 0.0,
        }
    out = {
        "name": str(f.get("name", "unknown")),
        "portion_g": float(f.get("portion_g", 0) or 0),
        "kcal": float(f.get("kcal", 0) or 0),
        "protein_g": float(f.get("protein_g", 0) or 0),
        "carbs_g": float(f.get("carbs_g", 0) or 0),
        "fat_g": float(f.get("fat_g", 0) or 0),
    }
    if f.get("macro_role"):
        out["macro_role"] = str(f.get("macro_role"))
    return out

def _normalize_legacy_meal_keys(matrix: dict) -> dict:
    if not isinstance(matrix, dict):
        return matrix
    for day_obj in matrix.values():
        if not isinstance(day_obj, dict):
            continue
        if LEGACY_SNACK_KEY in day_obj:
            if "Snack" not in day_obj:
                day_obj["Snack"] = day_obj.pop(LEGACY_SNACK_KEY)
            else:
                del day_obj[LEGACY_SNACK_KEY]
    return matrix
