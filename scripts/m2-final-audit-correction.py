from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "apps/web/src/hardware/protocol-resource-regressions.test.ts"
source = path.read_text(encoding="utf-8")
source = source.replace("  concatBytes,\n", "")
source = source.replace(
    "    const parsed = parser.push(concatBytes(noise, frame));\n\n"
    "    expect(parsed).toHaveLength(1);",
    "    expect(parser.push(noise)).toHaveLength(0);\n"
    "    const parsed = parser.push(frame);\n\n"
    "    expect(parsed).toHaveLength(1);",
)
if "concatBytes(noise, frame)" in source:
    raise RuntimeError("The invalid combined oversize experiment remains")
path.write_text(source, encoding="utf-8")
