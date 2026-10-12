#!/usr/bin/env python3
"""Create the JPEG fixtures the web app test suite parses.

Two files, both tiny and synthetic (no personal data):
  tests/fixtures/gps-photo.jpg   - GPS block, capture time with UTC offset, camera strings
  tests/fixtures/no-gps-photo.jpg - same image with every metadata block removed

Requires pillow and piexif:
    python3 -m venv .venv && .venv/bin/pip install pillow piexif
    .venv/bin/python tools/make-test-fixtures.py
"""
from __future__ import annotations

import json
from pathlib import Path

import piexif
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"

# The reference values inside the fixtures. tests/app.test.mjs asserts against
# this JSON so the two halves cannot drift apart.
EXPECTED = {
    "lat": 34.0151,
    "lon": 71.5249,
    "altitude_m": 331.5,
    "datetime_original": "2026:10:12 11:30:00",
    "offset_time_original": "+05:00",
    "make": "FixtureCam",
    "model": "Finder-1000",
    "lens_model": "Fixture 26mm f/2.8",
    "software": "gpsfinder-test-fixture 1.0",
    "iso": 100,
    "fnumber": 2.8,
    "exposure_time": "1/500",
    "focal_length_mm": 3.99,
    "focal_length_35mm": 26,
    "orientation": 1,
    "pixel_width": 160,
    "pixel_height": 120,
    "image_unique_id": "0123456789abcdef0123456789abcdef",
    "gps_dop": 4.5,
    "gps_hpe_m": 6.0,
}


def dms_rational(value: float) -> tuple:
    """Decimal degrees to ((d,1),(m,1),(s,100))."""
    value = abs(value)
    degrees = int(value)
    minutes_float = (value - degrees) * 60
    minutes = int(minutes_float)
    seconds = round((minutes_float - minutes) * 60, 2)
    return ((degrees, 1), (minutes, 1), (int(seconds * 100), 100))


def rational(text: str) -> tuple[int, int]:
    if "/" in text:
        num, den = text.split("/")
        return (int(num), int(den))
    return (int(float(text) * 100), 100)


def build_exif() -> bytes:
    zeroth = {
        piexif.ImageIFD.Make: EXPECTED["make"].encode(),
        piexif.ImageIFD.Model: EXPECTED["model"].encode(),
        piexif.ImageIFD.Software: EXPECTED["software"].encode(),
        piexif.ImageIFD.Orientation: EXPECTED["orientation"],
        piexif.ImageIFD.DateTime: b"2026:10:12 11:30:05",
        piexif.ImageIFD.Artist: b"Test Fixture",
    }
    exif = {
        piexif.ExifIFD.DateTimeOriginal: EXPECTED["datetime_original"].encode(),
        piexif.ExifIFD.DateTimeDigitized: EXPECTED["datetime_original"].encode(),
        piexif.ExifIFD.OffsetTimeOriginal: EXPECTED["offset_time_original"].encode(),
        piexif.ExifIFD.ISOSpeedRatings: EXPECTED["iso"],
        piexif.ExifIFD.FNumber: (28, 10),
        piexif.ExifIFD.ExposureTime: rational(EXPECTED["exposure_time"]),
        piexif.ExifIFD.FocalLength: (399, 100),
        piexif.ExifIFD.FocalLengthIn35mmFilm: EXPECTED["focal_length_35mm"],
        piexif.ExifIFD.LensModel: EXPECTED["lens_model"].encode(),
        piexif.ExifIFD.ImageUniqueID: EXPECTED["image_unique_id"].encode(),
        piexif.ExifIFD.PixelXDimension: EXPECTED["pixel_width"],
        piexif.ExifIFD.PixelYDimension: EXPECTED["pixel_height"],
    }
    gps = {
        piexif.GPSIFD.GPSVersionID: (2, 3, 0, 0),
        piexif.GPSIFD.GPSLatitudeRef: b"N",
        piexif.GPSIFD.GPSLatitude: dms_rational(EXPECTED["lat"]),
        piexif.GPSIFD.GPSLongitudeRef: b"E",
        piexif.GPSIFD.GPSLongitude: dms_rational(EXPECTED["lon"]),
        piexif.GPSIFD.GPSAltitudeRef: 0,
        piexif.GPSIFD.GPSAltitude: (int(EXPECTED["altitude_m"] * 10), 10),
        piexif.GPSIFD.GPSDOP: (45, 10),
        piexif.GPSIFD.GPSHPositioningError: (int(EXPECTED["gps_hpe_m"] * 10), 10),
        piexif.GPSIFD.GPSDateStamp: b"2026:10:12",
        piexif.GPSIFD.GPSTimeStamp: ((6, 1), (30, 1), (0, 1)),
        piexif.GPSIFD.GPSMapDatum: b"WGS-84",
        piexif.GPSIFD.GPSImgDirectionRef: b"T",
        piexif.GPSIFD.GPSImgDirection: (1200, 10),
        piexif.GPSIFD.GPSProcessingMethod: b"ASCII\x00\x00\x00NETWORK",
    }
    return piexif.dump({"0th": zeroth, "Exif": exif, "GPS": gps, "1st": {}, "thumbnail": None})


def main() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (EXPECTED["pixel_width"], EXPECTED["pixel_height"]), (18, 24, 30))
    draw = ImageDraw.Draw(image)
    draw.rectangle([8, 8, 152, 112], outline=(53, 196, 160), width=2)
    draw.line([8, 60, 152, 60], fill=(242, 181, 68), width=1)
    draw.text((16, 20), "GPSTEST 1284", fill=(230, 237, 243))
    draw.text((16, 84), "34 00 54 N", fill=(168, 184, 198))

    with_exif = FIXTURES / "gps-photo.jpg"
    image.save(with_exif, "JPEG", quality=88, exif=build_exif())

    without = FIXTURES / "no-gps-photo.jpg"
    image.save(without, "JPEG", quality=88)

    (FIXTURES / "expected.json").write_text(json.dumps(EXPECTED, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {with_exif} ({with_exif.stat().st_size} bytes)")
    print(f"wrote {without} ({without.stat().st_size} bytes)")
    print(f"wrote {FIXTURES / 'expected.json'}")


if __name__ == "__main__":
    main()
