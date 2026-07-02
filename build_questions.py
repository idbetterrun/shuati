#!/usr/bin/env python3
"""Parse the markdown question banks in docs/ into questions.json."""
import json
import re
from pathlib import Path

DOCS_DIR = Path(__file__).parent / "docs"
OUT_FILE = Path(__file__).parent / "questions.json"

HEADING_RE = re.compile(r"^#{3,4} (.+)$", re.M)
OPTION_RE = re.compile(r"^\*\s*([A-Da-d])\.\s*(.+)$", re.M)
STANDARD_Q_RE = re.compile(r"\*\*题目[:：]\*\*\s*(.+)")
CORRECT_RE = re.compile(r"\*\*正确答案[:：]\*\*\s*(.+)")
EXPLANATION_RE = re.compile(r"💡\s*\*\*[^*]*\*\*\s*(.+)", re.S)
COMPACT_Q_RE = re.compile(r"\*\s*\*\*题目(\d+)[:：]\*\*\s*(.+?)\s*——\s*\*\*答案[:：]\s*(.+?)\*\*")


def clean(text):
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    return text


def to_truefalse(raw):
    if re.match(r"^(对|True)", raw.strip()):
        return True
    if re.match(r"^(错|False)", raw.strip()):
        return False
    return None


def parse_block(block_text, source, counter):
    questions = []

    # Compact multi-question sub-blocks, e.g. "* **题目5：** ... —— **答案：C (25%)**"
    compact_matches = list(COMPACT_Q_RE.finditer(block_text))
    if compact_matches:
        exp_match = EXPLANATION_RE.search(block_text)
        if exp_match:
            # trim explanation at the next markdown section boundary if present
            raw_exp = re.split(r"\n---|\n#{1,4} |\n\*\*答题统计", exp_match.group(1))[0]
            explanation = clean(raw_exp)
        else:
            explanation = ""
        for m in compact_matches:
            q_text = clean(m.group(2))
            answer_raw = clean(m.group(3))
            tf = to_truefalse(answer_raw)
            if tf is not None:
                questions.append({
                    "id": f"{source}-{counter[0]}",
                    "source": source,
                    "type": "truefalse",
                    "question": q_text,
                    "answer": tf,
                    "answerLabel": answer_raw,
                    "explanation": explanation,
                })
            else:
                questions.append({
                    "id": f"{source}-{counter[0]}",
                    "source": source,
                    "type": "recall",
                    "question": q_text,
                    "answerLabel": answer_raw,
                    "explanation": explanation,
                })
            counter[0] += 1
        return questions

    # Standard single-question block
    q_match = STANDARD_Q_RE.search(block_text)
    if not q_match:
        return questions

    q_text = clean(q_match.group(1))
    correct_match = CORRECT_RE.search(block_text)
    if not correct_match:
        return questions
    correct_raw = clean(correct_match.group(1))

    exp_match = EXPLANATION_RE.search(block_text)
    if exp_match:
        raw_exp = re.split(r"\n---|\n#{1,4} |\n\*\*答题统计", exp_match.group(1))[0]
        explanation = clean(raw_exp)
    else:
        explanation = ""

    # options only count if they appear before the "你的答案" marker
    pre_answer_text = block_text.split("你的答案")[0] if "你的答案" in block_text else block_text
    options = OPTION_RE.findall(pre_answer_text)

    if options:
        letter_match = re.match(r"^([A-D])\b", correct_raw)
        answer_letter = letter_match.group(1) if letter_match else correct_raw[:1]
        questions.append({
            "id": f"{source}-{counter[0]}",
            "source": source,
            "type": "single",
            "question": q_text,
            "options": [{"label": l.upper(), "text": clean(t)} for l, t in options],
            "answer": answer_letter,
            "answerLabel": correct_raw,
            "explanation": explanation,
        })
    else:
        tf = to_truefalse(correct_raw)
        if tf is not None:
            questions.append({
                "id": f"{source}-{counter[0]}",
                "source": source,
                "type": "truefalse",
                "question": q_text,
                "answer": tf,
                "answerLabel": correct_raw,
                "explanation": explanation,
            })
        else:
            questions.append({
                "id": f"{source}-{counter[0]}",
                "source": source,
                "type": "recall",
                "question": q_text,
                "answerLabel": correct_raw,
                "explanation": explanation,
            })
    counter[0] += 1
    return questions


def parse_file(path):
    text = path.read_text(encoding="utf-8")
    source = path.stem
    positions = [m.start() for m in HEADING_RE.finditer(text)]
    positions.append(len(text))
    counter = [1]
    questions = []
    for i in range(len(positions) - 1):
        block = text[positions[i]:positions[i + 1]]
        questions.extend(parse_block(block, source, counter))
    return questions


def main():
    all_questions = []
    for path in sorted(DOCS_DIR.glob("*.md")):
        qs = parse_file(path)
        print(f"{path.name}: {len(qs)} questions")
        all_questions.extend(qs)

    for i, q in enumerate(all_questions):
        q["id"] = i

    OUT_FILE.write_text(
        json.dumps(all_questions, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Total: {len(all_questions)} questions written to {OUT_FILE}")


if __name__ == "__main__":
    main()
