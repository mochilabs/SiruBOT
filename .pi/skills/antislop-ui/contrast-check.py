#!/usr/bin/env python3
"""WCAG 2.x contrast checker for the antislop-ui skill.

Usage:
    python3 contrast-check.py "#FFFFFF" "#777777"
    python3 contrast-check.py FFFFFF 777777

Prints the contrast ratio and a PASS/FAIL verdict for normal text (4.5:1)
and large text (3:1, 18px+ per antislop R-25). Exit code 0 only when both
verdicts pass, so scripts can chain on it.
"""

import re
import sys


def parse_hex(value):
    value = value.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", value):
        raise ValueError(f"expected a hex color like #FFFFFF, got {value!r}")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def linearize(channel):
    c = channel / 255.0
    if c <= 0.03928:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb):
    r, g, b = (linearize(ch) for ch in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(color_a, color_b):
    lum_a, lum_b = luminance(color_a), luminance(color_b)
    lighter, darker = sorted((lum_a, lum_b), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def main(argv):
    if len(argv) != 2:
        print("usage: python3 contrast-check.py <hex1> <hex2>")
        return 2
    try:
        ratio = contrast_ratio(parse_hex(argv[0]), parse_hex(argv[1]))
    except ValueError as exc:
        print(f"error: {exc}")
        return 2

    normal = ratio >= 4.5
    large = ratio >= 3.0
    print(f"ratio: {ratio:.2f}:1")
    print(f"normal text (4.5:1): {'PASS' if normal else 'FAIL'}")
    print(f"large text  (3.0:1): {'PASS' if large else 'FAIL'}")
    return 0 if normal and large else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
