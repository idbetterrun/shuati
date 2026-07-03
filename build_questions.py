#!/usr/bin/env python3
"""Parse the markdown question banks in docs/<subject>/*.md into questions.json.

Two source markdown styles are supported (auto-detected per file):
  - "finance style": blocks marked with **题目：** / **正确答案：** / 💡 ...解析
  - "numbered style": blocks marked with **N. question** under a
    "# X、选择题/填空题/判断题/匹配题" section heading, followed by
    "- **答案：...**" and "- **解析**：..." lines.
"""
import json
import re
from pathlib import Path

DOCS_DIR = Path(__file__).parent / "docs"
OUT_FILE = Path(__file__).parent / "questions.json"


def clean(text):
    return re.sub(r"\s+", " ", text.strip())


def to_truefalse(raw):
    raw = raw.strip()
    if re.match(r"^(对|True|T\b)", raw):
        return True
    if re.match(r"^(错|False|F\b)", raw):
        return False
    return None


# ---------------------------------------------------------------------------
# Finance-style parser (e.g. docs/国际金融/*.md)
# ---------------------------------------------------------------------------

HEADING_RE = re.compile(r"^#{3,4} (.+)$", re.M)
OPTION_RE = re.compile(r"^\*\s*([A-Da-d])\.\s*(.+)$", re.M)
STANDARD_Q_RE = re.compile(r"\*\*题目[:：]\*\*\s*(.+)")
CORRECT_RE = re.compile(r"\*\*正确答案[:：]\*\*\s*(.+)")
EXPLANATION_RE = re.compile(r"💡\s*\*\*[^*]*\*\*\s*(.+)", re.S)
COMPACT_Q_RE = re.compile(r"\*\s*\*\*题目(\d+)[:：]\*\*\s*(.+?)\s*——\s*\*\*答案[:：]\s*(.+?)\*\*")


def is_finance_style(text):
    return bool(STANDARD_Q_RE.search(text) or COMPACT_Q_RE.search(text))


def parse_finance_block(block_text):
    questions = []

    compact_matches = list(COMPACT_Q_RE.finditer(block_text))
    if compact_matches:
        exp_match = EXPLANATION_RE.search(block_text)
        if exp_match:
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
                    "type": "truefalse", "question": q_text,
                    "answer": tf, "answerLabel": answer_raw, "explanation": explanation,
                })
            else:
                questions.append({
                    "type": "fill", "question": q_text,
                    "answerLabel": answer_raw, "explanation": explanation,
                })
        return questions

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

    pre_answer_text = block_text.split("你的答案")[0] if "你的答案" in block_text else block_text
    options = OPTION_RE.findall(pre_answer_text)

    if options:
        letter_match = re.match(r"^([A-D])\b", correct_raw)
        answer_letter = letter_match.group(1) if letter_match else correct_raw[:1]
        questions.append({
            "type": "single", "question": q_text,
            "options": [{"label": l.upper(), "text": clean(t)} for l, t in options],
            "answer": answer_letter, "answerLabel": correct_raw, "explanation": explanation,
        })
    else:
        tf = to_truefalse(correct_raw)
        if tf is not None:
            questions.append({
                "type": "truefalse", "question": q_text,
                "answer": tf, "answerLabel": correct_raw, "explanation": explanation,
            })
        else:
            questions.append({
                "type": "fill", "question": q_text,
                "answerLabel": correct_raw, "explanation": explanation,
            })
    return questions


def parse_finance_style(text):
    positions = [m.start() for m in HEADING_RE.finditer(text)]
    positions.append(len(text))
    questions = []
    for i in range(len(positions) - 1):
        questions.extend(parse_finance_block(text[positions[i]:positions[i + 1]]))
    return questions


# ---------------------------------------------------------------------------
# Numbered-style parser (e.g. docs/语言学/*.md)
# ---------------------------------------------------------------------------

SECTION_RE = re.compile(r"^#\s+[一二三四五六七八九十]+、\s*(.+)$", re.M)
Q_START_RE = re.compile(r"^\*\*\d+\.\s", re.M)
ANSWER_LINE_RE = re.compile(r"^-\s*\*\*答案(?:（[^）]*）)?[:：]\s*(.+?)\*\*")
EXPLANATION_LINE_RE = re.compile(r"^-\s*\*\*解析\*\*[:：]?\s*(.+)$")
HEADER_LINE_RE = re.compile(r"^\*\*\d+\.\s*(.+?)\*\*\s*$")
OPTION_INLINE_RE = re.compile(r"^([A-D])\.\s*(.+)$")


def is_numbered_style(text):
    return bool(Q_START_RE.search(text))


def classify_section(label):
    if "选择" in label:
        return "single"
    if "判断" in label:
        return "truefalse"
    if "填空" in label:
        return "fill"
    if "匹配" in label:
        return "matching"
    return None


def parse_numbered_question_chunk(chunk, qtype):
    lines = chunk.split("\n")
    header_match = HEADER_LINE_RE.match(lines[0])
    if not header_match:
        return None
    question_text = clean(header_match.group(1))

    idx = 1
    options = None
    if qtype == "single":
        while idx < len(lines) and lines[idx].strip() == "":
            idx += 1
        if idx < len(lines):
            pieces = lines[idx].split("　")
            opts = []
            for piece in pieces:
                m = OPTION_INLINE_RE.match(piece.strip())
                if m:
                    opts.append({"label": m.group(1), "text": clean(m.group(2))})
            if opts:
                options = opts
                idx += 1

    answer_raw = None
    explanation = ""
    for line in lines[idx:]:
        m = ANSWER_LINE_RE.match(line)
        if m:
            answer_raw = clean(m.group(1))
            continue
        m2 = EXPLANATION_LINE_RE.match(line)
        if m2:
            explanation = clean(m2.group(1))

    if answer_raw is None:
        return None

    if qtype == "single" and options:
        letter_match = re.match(r"^([A-D])\b", answer_raw)
        answer_letter = letter_match.group(1) if letter_match else answer_raw[:1]
        return {
            "type": "single", "question": question_text, "options": options,
            "answer": answer_letter, "answerLabel": answer_raw, "explanation": explanation,
        }
    if qtype == "truefalse":
        tf = to_truefalse(answer_raw)
        if tf is None:
            return None
        return {
            "type": "truefalse", "question": question_text,
            "answer": tf, "answerLabel": answer_raw, "explanation": explanation,
        }
    # fill-in-the-blank (and any other non-choice numbered type)
    return {
        "type": "fill", "question": question_text,
        "answerLabel": answer_raw, "explanation": explanation,
    }


def parse_numbered_style(text):
    questions = []
    sections = list(SECTION_RE.finditer(text))
    boundaries = [(m.start(), m.group(1)) for m in sections]
    boundaries.append((len(text), None))
    for i in range(len(boundaries) - 1):
        start, label = boundaries[i]
        if label is None:
            continue
        qtype = classify_section(label)
        if qtype is None:
            continue
        block_text = text[start:boundaries[i + 1][0]]
        q_starts = [m.start() for m in Q_START_RE.finditer(block_text)]
        q_starts.append(len(block_text))
        for j in range(len(q_starts) - 1):
            q = parse_numbered_question_chunk(block_text[q_starts[j]:q_starts[j + 1]], qtype)
            if q:
                questions.append(q)
    return questions


# ---------------------------------------------------------------------------

def parse_file(path):
    text = path.read_text(encoding="utf-8")
    if is_finance_style(text):
        return parse_finance_style(text)
    if is_numbered_style(text):
        return parse_numbered_style(text)
    return []


def main():
    all_questions = []
    for subject_dir in sorted(p for p in DOCS_DIR.iterdir() if p.is_dir()):
        subject = subject_dir.name
        for path in sorted(subject_dir.glob("*.md")):
            qs = parse_file(path)
            print(f"{subject}/{path.name}: {len(qs)} questions")
            for q in qs:
                q["subject"] = subject
                q["source"] = path.stem
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
