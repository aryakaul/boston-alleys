#!/usr/bin/env python3
"""Fetch all public and private alleys in Boston from OSM and write docs/data/alleys.geojson."""

import json
import re
import sys
from pathlib import Path

import requests

OVERPASS_QUERY = '[out:json][timeout:60];way["name"~"(Public|Private) Alley"](42.30,-71.14,42.40,-70.98);out geom;'
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
HEADERS = {"User-Agent": "boston-alley-rankings/1.0 (personal research project)"}
OUTPUT = Path(__file__).parent.parent / "docs" / "data" / "alleys.geojson"

_num_re = re.compile(r"(?:Public|Private) Alley(?:\s+No\.?)?\s*(\d+)", re.IGNORECASE)


def parse_number(name):
    m = _num_re.search(name or "")
    return int(m.group(1)) if m else None


def fetch_ways():
    for url in OVERPASS_ENDPOINTS:
        print(f"Trying {url} ...")
        try:
            resp = requests.post(url, data={"data": OVERPASS_QUERY}, headers=HEADERS, timeout=90)
            if resp.status_code == 200:
                return resp.json()["elements"]
            print(f"  HTTP {resp.status_code}: {resp.text[:120]}")
        except requests.RequestException as e:
            print(f"  Error: {e}")
    print("All endpoints failed.", file=sys.stderr)
    sys.exit(1)


def to_geojson(ways):
    features = []
    for way in ways:
        name = way["tags"].get("name", "")
        coords = [[n["lon"], n["lat"]] for n in way.get("geometry", [])]
        if not coords:
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "name": name,
                "number": parse_number(name),
                "alley_type": "private" if "Private" in name else "public",
                "osm_id": way["id"],
            },
            "geometry": {"type": "LineString", "coordinates": coords},
        })
    return {"type": "FeatureCollection", "features": features}


if __name__ == "__main__":
    ways = fetch_ways()
    print(f"Fetched {len(ways)} ways.")
    geojson = to_geojson(ways)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump(geojson, f)
    public  = sum(1 for ft in geojson["features"] if ft["properties"]["alley_type"] == "public")
    private = sum(1 for ft in geojson["features"] if ft["properties"]["alley_type"] == "private")
    print(f"Written to {OUTPUT}  (public: {public}, private: {private})")
