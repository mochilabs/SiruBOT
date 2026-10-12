#!/usr/bin/env python3
"""
WCAG 2.1/2.2 contrast audit for dashboard CSS tokens.
Parses globals.css :root and .dark variables, then checks common
control-on-surface combinations for SC 1.4.3 (text) and SC 1.4.11 (non-text).
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CSS_PATH = ROOT / "src" / "app" / "globals.css"

TEXT_CONTRAST = 4.5
NON_TEXT_CONTRAST = 3.0


@dataclass(frozen=True)
class Color:
    r: int
    g: int
    b: int

    @classmethod
    def from_hex(cls, hex_color: str) -> Color:
        h = hex_color.lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 4:
            h = "".join(h[i] * 2 for i in range(3))
        return cls(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

    def relative_luminance(self) -> float:
        def channel(c: int) -> float:
            v = c / 255.0
            return v / 12.92 if v <= 0.03928 else pow((v + 0.055) / 1.055, 2.4)

        return 0.2126 * channel(self.r) + 0.7152 * channel(self.g) + 0.0722 * channel(self.b)


def contrast(c1: Color, c2: Color) -> float:
    l1 = c1.relative_luminance()
    l2 = c2.relative_luminance()
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def parse_theme_variables(css_text: str, selector: str) -> dict[str, str]:
    """Extract all --* variables from every top-level selector block with the given name.

    Later declarations override earlier ones, mirroring CSS cascade behavior.
    """
    normalized = re.sub(r"/\*.*?\*/", "", css_text, flags=re.DOTALL)
    pattern = re.compile(
        rf"{re.escape(selector)}\s*\{{(.*?)\}}",
        re.DOTALL,
    )
    variables: dict[str, str] = {}
    for match in pattern.finditer(normalized):
        block = match.group(1)
        for line in block.splitlines():
            line = line.strip()
            if not line:
                continue
            m = re.match(r"(--[\w-]+):\s*(.+?);", line)
            if m:
                variables[m.group(1)] = m.group(2).strip()
    return variables


def resolve_color(value: str, palette: dict[str, str], depth: int = 5) -> Color:
    """Resolve CSS variables like var(--foo) or bare --foo to a concrete hex color."""
    value = value.strip()
    if value.startswith("--"):
        value = f"var({value})"
    if value.startswith("var("):
        if depth <= 0:
            raise ValueError(f"variable resolution depth exceeded: {value}")
        name = value[4:-1].strip()
        resolved = palette.get(name)
        if resolved is None:
            raise KeyError(f"undefined CSS variable: {name}")
        return resolve_color(resolved, palette, depth - 1)
    if value.startswith("#"):
        return Color.from_hex(value)
    raise ValueError(f"unsupported color value: {value}")


@dataclass(frozen=True)
class Check:
    name: str
    fg: str
    bg: str
    kind: str  # "text" or "non-text"
    min_ratio: float
    description: str
    expected_fail: bool = False


CONTROL_CHECKS: list[Check] = [
    # Text contrast: labels and values that sit on control fills.
    Check(
        "primary button label on brand fill",
        "--primary-foreground",
        "--primary",
        "text",
        TEXT_CONTRAST,
        "기본 버튼: bg-primary / text-primary-foreground",
    ),
    Check(
        "primary-control text on fill",
        "--primary-control-text",
        "--primary-control",
        "text",
        TEXT_CONTRAST,
        "on-state/CTA 라벨: text-primary-control-text on bg-primary-control",
    ),
    Check(
        "primary-control hover text on fill",
        "--primary-control-text",
        "--primary-control-hover",
        "text",
        TEXT_CONTRAST,
        "cta/on-state hover 라벨",
    ),
    Check(
        "primary-text on neutral surfaces",
        "--primary-text",
        "--background",
        "text",
        TEXT_CONTRAST,
        "Accent 텍스트: text-primary-text on bg-background",
    ),
    Check(
        "secondary-control text on fill",
        "--secondary-foreground",
        "--secondary",
        "text",
        TEXT_CONTRAST,
        "Neutral control label",
    ),
    Check(
        "danger-control text on fill",
        "--destructive-foreground",
        "--destructive",
        "text",
        TEXT_CONTRAST,
        "Danger control label (solid fill)",
    ),
    Check(
        "muted-foreground on card",
        "--muted-foreground",
        "--card",
        "text",
        TEXT_CONTRAST,
        "Secondary text on cards",
    ),
    Check(
        "foreground on background",
        "--foreground",
        "--background",
        "text",
        TEXT_CONTRAST,
        "Body text",
    ),
    # Non-text contrast: the control boundary/fill against its host surface.
    Check(
        "secondary fill vs card (fill only, no boundary)",
        "--secondary",
        "--card",
        "non-text",
        NON_TEXT_CONTRAST,
        "Expected FAIL: warm secondary fill alone is decorative; use shadow-control-boundary",
        expected_fail=True,
    ),
    Check(
        "secondary + inset boundary vs card",
        "--border-strong",
        "--card",
        "non-text",
        NON_TEXT_CONTRAST,
        "Neutral button/switch boundary via shadow-control-boundary",
    ),
    Check(
        "primary-control fill vs card",
        "--primary-control",
        "--card",
        "non-text",
        NON_TEXT_CONTRAST,
        "Brand 핑크 채움 — 팔레트 값. 라벨 텍스트(AA)로 컨트롤 식별, 1px 경계는 bg-primary 계열에만 필요",
        expected_fail=True,
    ),
    Check(
        "switch checked track vs card",
        "--primary-control",
        "--card",
        "non-text",
        NON_TEXT_CONTRAST,
        "Switch on track — 팔레트 값. knob 위치 변화 + 라벨로 상태 식별",
        expected_fail=True,
    ),
    Check(
        "switch thumb vs unchecked track",
        "--switch-thumb",
        "--secondary",
        "non-text",
        NON_TEXT_CONTRAST,
        "Expected FAIL: thumb은 iOS/Discord 관례로 항상 단색 흰색(--switch-thumb) — OFF 트랙 경계는 shadow-control-boundary(--border-strong, 3:1+ 통과)가, 상태는 knob 위치가 전달",
        expected_fail=True,
    ),
    Check(
        "switch thumb vs checked track",
        "--switch-thumb",
        "--primary-control",
        "non-text",
        NON_TEXT_CONTRAST,
        "Expected FAIL: thumb은 iOS/Discord 관례로 항상 단색 흰색(--switch-thumb) — ON 상태는 트랙 채움(bg-primary-control) + knob 위치로 식별",
        expected_fail=True,
    ),
    Check(
        "input boundary vs card",
        "--border-strong",
        "--card",
        "non-text",
        NON_TEXT_CONTRAST,
        "Input inset boundary via shadow-control-boundary",
    ),
    Check(
        "input invalid boundary vs card",
        "--destructive",
        "--card",
        "non-text",
        NON_TEXT_CONTRAST,
        "Invalid input inset boundary color",
    ),
    Check(
        "outline button border vs card",
        "--border-strong",
        "--card",
        "non-text",
        NON_TEXT_CONTRAST,
        "Outline button border boundary",
    ),
    Check(
        "primary brand surface vs background",
        "--primary",
        "--background",
        "non-text",
        NON_TEXT_CONTRAST,
        "Expected FAIL: primary surface is designed to sit on cards/surfaces, never directly on the page background",
        expected_fail=True,
    ),
]


def format_result(ratio: float, threshold: float) -> str:
    if ratio >= threshold:
        return f"PASS  {ratio:.2f}:1 >= {threshold:.1f}:1"
    return f"FAIL  {ratio:.2f}:1 <  {threshold:.1f}:1"


def main() -> int:
    css_text = CSS_PATH.read_text(encoding="utf-8")

    light = parse_theme_variables(css_text, ":root")
    dark = parse_theme_variables(css_text, ".dark")

    if not light or not dark:
        print(f"ERROR: could not parse :root or .dark from {CSS_PATH}")
        return 1

    print(f"WCAG contrast audit for {CSS_PATH.relative_to(ROOT.parents[1])}")
    print()

    unexpected_failures = 0
    expected_failures = 0
    for theme_name, palette in (("light", light), ("dark", dark)):
        print(f"[{theme_name}]")
        for check in CONTROL_CHECKS:
            try:
                fg = resolve_color(check.fg, palette)
                bg = resolve_color(check.bg, palette)
            except (KeyError, ValueError) as exc:
                print(f"  {check.name}: SKIP ({exc})")
                continue

            ratio = contrast(fg, bg)
            passes = ratio >= check.min_ratio
            if passes:
                status = "PASS"
            elif check.expected_fail:
                status = "EXPECTED_FAIL"
                expected_failures += 1
            else:
                status = "FAIL"
                unexpected_failures += 1

            label = f"{check.name} ({check.kind})"
            print(f"  {status}  {ratio:.2f}:1  {label}")
            print(f"        fg {check.fg}={palette.get(check.fg, check.fg)}  bg {check.bg}={palette.get(check.bg, check.bg)}")
            print(f"        {check.description}")
        print()

    print(f"Expected failures (documented): {expected_failures}")
    print(f"Unexpected failures: {unexpected_failures}")
    return 1 if unexpected_failures else 0


if __name__ == "__main__":
    sys.exit(main())
