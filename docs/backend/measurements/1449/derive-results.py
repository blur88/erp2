"""Derive the committed compact JSONL from a reporter raw JSONL file.

Usage: python3 derive-results.py no-limit.raw.jsonl > no-limit.jsonl
"""
import json
import statistics
import sys
from pathlib import Path

rows = [json.loads(line) for line in Path(sys.argv[1]).read_text().splitlines()]
samples = [row for row in rows if row["event"] == "sample"]
loads = [row["loadavg"][0] for row in samples]
kept = {"start", "worker", "worker-exit", "suite", "complete"}
for row in rows:
    if row["event"] in kept:
        print(json.dumps(row, separators=(",", ":")))
summary = {
    "event": "sample-summary",
    "sampleCount": len(samples),
    "requestedIntervalMs": 1000,
    "load1": {
        "min": min(loads),
        "median": statistics.median(loads),
        "max": max(loads),
    },
    "peakRssKiBByPid": {
        str(pid): max(
            sample["rssKiB"]
            for row in samples
            for sample in row["samples"]
            if sample["pid"] == pid
        )
        for pid in sorted({sample["pid"] for row in samples for sample in row["samples"]})
    },
}
print(json.dumps(summary, separators=(",", ":")))
