"""Build site-ready campus data from the raw sources in data-raw/.

Inputs (data-raw/):
  kmz/{year}.kmz              original Google Earth / ArcGIS exports (preferred: they keep
                              building courtyards as holes and put the name on every part)
  dwg-geojson/{year}.geojson  DWG drawings converted with dwgread + ESRI attributes joined
                              (fallback for a year without a KMZ; every year has one now)
  site/features-{year}.json   GeoJSON from the original MASAR site (used to recover names)
  site/buildings.json         building profiles (floors, images, descriptions)
  site/campus-measurements.json  measured length / width / height per place
  site/images/                building photos

Outputs (public/data/):
  years/{year}.geojson, profiles.json, stats.json

Run:  python3 -m venv .venv && .venv/bin/pip install shapely pyproj
      .venv/bin/python scripts/build_data.py
"""
import json, re, os, math, collections, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from shapely.geometry import shape, mapping, Point
from shapely.ops import transform
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data-raw"
OUT = ROOT / "public" / "data"
YEARS = [2006, 2011, 2016, 2021, 2026]
to_m = Transformer.from_crs(4326, 32636, always_xy=True).transform


def norm(s):
    s = (s or "").strip()
    s = re.sub(r"[ـ\s_]", "", s)
    s = re.sub(r"[أإآ]", "ا", s).replace("ى", "ي").replace("ة", "ه")
    s = re.sub(r"[ًٌٍَُِّْ]", "", s)
    return s.lower()


# ---------- categories ----------
CATS = {
    "faculty": ("كليات", 30), "admin": ("مبانٍ إدارية", 16), "housing": ("سكن", 25),
    "lecture": ("مدرجات", 15), "mosque": ("مساجد", 7), "service": ("خدمات", 4),
    "kiosk": ("أكشاك خدمات", 2.5), "cafe": ("كافتيريات", 3.5), "caravan": ("كرفانات", 3),
    "construction": ("تحت الإنشاء", 8), "sports": ("ملاعب", 0.6), "parking": ("مواقف", 0.15),
    "green": ("مساحات خضراء", 0.25), "farm": ("زراعة", 0.2), "canopy": ("مظلات", 3),
    "building": ("مبانٍ أخرى", 10), "boundary": ("حدود", 0),
    "pole": ("أعمدة إنارة", 0), "power": ("أكشاك كهرباء", 0), "gate": ("بوابات", 0),
    "road": ("طرق", 0),
}
MOSQUE_H = {"القبه": 14, "اساسالقبه": 9, "الماذنه": 28, "المصلي": 7, "الوضوء": 4,
            "غرفهالوضوء": 4, "المدخل": 6, "المدخلالباب": 6}


def categorize(name, folder, gtype, area):
    n, f = norm(name), norm(folder)
    if gtype == "Point":
        if "انار" in f or "عمود" in n or n.startswith("ع") and n[1:].isdigit() or "نقاط" in f:
            return "pole"
        if "مظل" in f: return "canopy"
        if "كهرباء" in f: return "power"
        if "بواب" in f or "بواب" in n: return "gate"
        return None
    if gtype == "LineString":
        if "سور" in n: return None
        return "road"
    # polygons
    if area > 150_000 and "زراع" not in f + n and "مزرع" not in f + n: return "boundary"
    # a building named "كلية …" is a faculty even when its folder says زراعة / تحت الانشاء
    if n.startswith("كليه") and "تحتالانشاء" not in n: return "faculty"
    if "زراع" in f or "مزرع" in f + n: return "farm"
    if "حضراء" in f or "خضراء" in f + n or re.match(r"[gq]reenspace", n): return "green"
    if "مظل" in f + n: return "canopy"
    if "تحتالانشاء" in f + n: return "construction"
    if "مسجد" in f + n or "مساجد" in f or n in MOSQUE_H or n == "المصلى": return "mosque"
    if "جراج" in f + n or "موقف" in f + n: return "parking"
    if "ملاعب" in f or "ملعب" in n or "صالهالالعاب" in n: return "sports"
    if "كافتير" in f + n or "كافتري" in n: return "cafe"
    if "كشكات" in f: return "kiosk"
    if "كرفان" in f: return "caravan"
    if "سكن" in f + n: return "housing"
    if "مدرج" in f + n or "المجمع" in f or "القبه" in n: return "lecture"
    if "اداري" in f + n or "اداره" in n or "كرياتيفا" in n or "قناه" in n: return "admin"
    if "خدمات" in f or "البريد" in n or "الشهر" in n or "بريد" in n: return "service"
    if "كلي" in f + n or n.startswith("fon") or "اختبارات" in n or "الحضانه" in n or "الجامعهالاهليه" in n \
            or n in ("اداب", "تجاره", "تربيه", "هندسه", "زراعه", "بيطري", "تربيهرياضيه", "الخدماتالالكترونيه", "قاعهالمؤتمرات"):
        return "faculty"
    return "building"


# ---------- profiles ----------
ALIASES = {
    "كلية طب الأسنان": ["كلية طب اسنان", "طب إسنان", "كلية طب الأسنان"],
    "الإدارة الهندسية": ["إداره الهندسيه", "الإدارة الهندسية"],
    "مركز الاختبارات الإلكترونية": ["مبني اختبارات", "مركز الاختبارات الإلكترونية خلف صيدلة"],
    "كريتيفا": ["كرياتيفا", "كريتفا", "كريتيفا"],
    "الجامعة الأهلية": ["الجامعة الاهلية", "الجامعة الأهلية"],
    "كلية الآداب": ["كلية اداب", "اداب", "كلية آداب", "كلية الآداب"],
    "كلية التجارة": ["كلية تحارة", "تجارة", "كلية تجارة", "كلية التجارة"],
    "كلية التربية": ["كلية تربية", "تربية", "كلية التربية"],
    "كلية الهندسة": ["كلية هندسة", "هندسة", "كلية الهندسة"],
    "كلية التربية الرياضية": ["كليه تربيه رياضيه", "مبنى تربية رياضية", "تربية رياضية", "كلية تربية رياضية"],
    "كلية الحاسبات والذكاء الاصطناعي": ["كلية حاسبات ومعلومات", "حاسبات"],
    "كلية الصيدلة": ["fon2", "كلية صيدلة", "صيدله"],
    "كلية الزراعة": ["كلية زراعة", "زراعة"],
    "كلية الطب البيطري": ["كلية بيطري", "بيطري"],
}
# buildings that house several faculties (from the campus measurement document)
SHARED = {
    "كلية الزراعة": ["كلية الحقوق"],
    "كلية الطب البيطري": ["كلية الآثار", "كلية الألسن"],
    "كلية الصيدلة": ["معامل صيدلة"],
}
SKIP_PROFILE = {"29", "الجامعة الأهلية المركزية", "خلف صيدلة", "كريتفا", "كلية آداب", "كلية ألسن",
                "كلية بيطري", "كلية تربية", "كلية تربية رياضية", "كلية زراعة", "كلية صيدلة",
                "مركز الاختبارات الإلكترونية - خلف صيدلة", "معامل الصيدلة"}
alias_lookup = {norm(a): k for k, al in ALIASES.items() for a in al}


def profile_key(name):
    return alias_lookup.get(norm(name))


def build_profiles():
    b = json.load(open(RAW / "site/buildings.json", encoding="utf-8"))
    meas = json.load(open(RAW / "site/campus-measurements.json", encoding="utf-8"))
    img_dir = OUT.parent / "images" / "buildings"
    img_dir.mkdir(parents=True, exist_ok=True)
    profiles = {}
    for x in b:
        if not (x["floors"] or x["images"] or x["description"]) or x["name"] in SKIP_PROFILE:
            continue
        key = profile_key(x["name"]) or {"مركز الاختبارات الإلكترونية خلف صيدلة": "مركز الاختبارات الإلكترونية"}.get(x["name"], x["name"])
        p = profiles.setdefault(key, {"key": key, "name": key, "desc": "", "floors": [], "images": []})
        desc = x["description"] or ""
        if desc and not desc.startswith("أضف صور") and desc != "محتويات المبنى من المستند المرسل.":
            p["desc"] = p["desc"] or desc
        p["floors"] = p["floors"] or [{"floor": f["floor"], "rooms": [r.strip() for r in re.split(r"\s*–\s*|\s+-\s+", f["contents"]) if r.strip()]} for f in x["floors"]]
        for im in x["images"]:
            iid = im.split("/")[-1]
            src = next((RAW / "site/images" / f"{iid}.{e}" for e in ("jpg", "png") if (RAW / "site/images" / f"{iid}.{e}").exists()), None)
            if src:
                dst = img_dir / f"{iid}.jpg"
                if not dst.exists():
                    os.system(f'sips -s format jpeg -s formatOptions 60 -Z 1280 "{src}" --out "{dst}" >/dev/null 2>&1')
                p["images"].append(f"/images/buildings/{iid}.jpg")
    for m in meas:
        for key, p in profiles.items():
            if norm(m["place"]) == norm(key) or norm(m["place"]) in [norm(a) for a in ALIASES.get(key, [])]:
                p["size"] = {k: m[k] for k in ("length", "width", "height")}
    return profiles, meas


# ---------- features ----------
JUNK = re.compile(r"^(placemark|untitledpolygon|علامهموضعيهبلاعنوان|line\d*|lline\d*|ine\d*|\d+(\.\d+)?)$")


def clean_name(name):
    if not name: return None
    n = norm(name)
    if JUNK.match(n): return None
    return name.strip()


def load_names(year):
    """Named polygons from the original site + KMZ, used to name unnamed DWG shapes."""
    src = []
    p = RAW / f"site/features-{year}.json"
    if p.exists():
        for f in json.load(open(p, encoding="utf-8"))["features"]:
            nm = clean_name(f["properties"].get("name"))
            if nm and f.get("geometry") and "Polygon" in f["geometry"]["type"]:
                s = shape(f["geometry"]).buffer(0)
                src.append((s, nm, f["properties"].get("folder", "")))
    return src


# ---------- KMZ reader ----------
KML = "{http://www.opengis.net/kml/2.2}"


def _coords(el):
    return [[float(v) for v in t.split(",")[:2]] for t in (el.findtext(f"{KML}coordinates") or "").split()]


def _geoms(el):
    """yield GeoJSON geometries for every part of a placemark (MultiGeometry is split)."""
    for child in el:
        tag = child.tag.replace(KML, "")
        if tag == "Point":
            c = _coords(child)
            if c: yield {"type": "Point", "coordinates": c[0]}
        elif tag == "LineString":
            c = _coords(child)
            if len(c) > 1: yield {"type": "LineString", "coordinates": c}
        elif tag == "Polygon":
            outer = child.find(f"{KML}outerBoundaryIs/{KML}LinearRing")
            if outer is None: continue
            rings = [_coords(outer)] + [_coords(r) for r in child.findall(f"{KML}innerBoundaryIs/{KML}LinearRing")]
            rings = [r for r in rings if len(r) >= 4]
            if rings: yield {"type": "Polygon", "coordinates": rings}
        elif tag == "MultiGeometry":
            yield from _geoms(child)


def _attrs(pm):
    out = {}
    desc = pm.findtext(f"{KML}description") or ""
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", desc, re.S):
        tds = [re.sub(r"<[^>]+>", "", x).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(tds) == 2 and tds[0] and f"attr_{tds[0]}" not in out:
            out[f"attr_{tds[0]}"] = tds[1]
    for d in pm.iter(f"{KML}Data"):
        out.setdefault(f"attr_{d.get('name')}", d.findtext(f"{KML}value"))
    for d in pm.iter(f"{KML}SimpleData"):
        out.setdefault(f"attr_{d.get('name')}", d.text)
    return out


LAYER = {"Point": "Points", "LineString": "Polylines", "Polygon": "Polygons"}


def load_kmz(path):
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".kml"))
        xml = z.read(name).decode("utf-8", errors="replace")
    xml = re.sub(r'\s+xsi:schemaLocation="[^"]*"', "", xml)
    xml = re.sub(r'\s+xmlns:xsi="[^"]*"', "", xml)
    root = ET.fromstring(xml)
    feats = []

    def walk(el, path):
        for child in el:
            tag = child.tag.replace(KML, "")
            if tag in ("Document", "Folder"):
                walk(child, path + [(child.findtext(f"{KML}name") or "").strip()])
            elif tag == "Placemark":
                a = _attrs(child)
                nm = (child.findtext(f"{KML}name") or "").strip() or a.get("attr_Name")
                folder = "/".join(p for p in path if p)
                for g in _geoms(child):
                    feats.append({"geometry": g, "properties": {
                        "name": nm, "folder": folder, "layer": LAYER[g["type"]], **a}})
    walk(root, [])
    return feats


def rnd(geom):
    def r(c):
        if isinstance(c[0], (int, float)): return [round(c[0], 6), round(c[1], 6)]
        return [r(x) for x in c]
    return {"type": geom["type"], "coordinates": r(geom["coordinates"])}


def square(lon, lat, size_m):
    dlat = size_m / 2 / 111_320
    dlon = size_m / 2 / (111_320 * math.cos(math.radians(lat)))
    return {"type": "Polygon", "coordinates": [[[lon - dlon, lat - dlat], [lon + dlon, lat - dlat],
                                                 [lon + dlon, lat + dlat], [lon - dlon, lat + dlat], [lon - dlon, lat - dlat]]]}


def build_road_graph(fc, out_path):
    """Node the 2026 roads at every crossing and write a compact routing graph.
    nodes: [[lon, lat]], edges: [[a, b, metres, underConstruction(0/1), [[lon, lat], ...]]]"""
    from shapely.ops import unary_union
    from shapely.strtree import STRtree
    back = Transformer.from_crs(32636, 4326, always_xy=True).transform
    src = [(transform(to_m, shape(f["geometry"])), f["properties"].get("rt", ""))
           for f in fc["features"] if f["properties"]["c"] == "road"]
    lines = [g for g, _ in src]
    tree = STRtree(lines)
    noded = unary_union(lines)
    segs = list(noded.geoms) if hasattr(noded, "geoms") else [noded]
    key = lambda p: (round(p[0]), round(p[1]))
    nodes, index, edges = [], {}, []
    def node(p):
        k = key(p)
        if k not in index:
            index[k] = len(nodes)
            lon, lat = back(k[0], k[1])
            nodes.append([round(lon, 6), round(lat, 6)])
        return index[k]
    for sgm in segs:
        if sgm.length < 0.5: continue
        a, b = node(sgm.coords[0]), node(sgm.coords[-1])
        if a == b: continue
        mid = sgm.interpolate(0.5, normalized=True)
        near = tree.query(mid.buffer(1.0))
        rt = next((src[i][1] for i in near if lines[i].distance(mid) < 1.0), "")
        coords = [[round(x, 6), round(y, 6)] for x, y in (back(*c) for c in sgm.coords)]
        edges.append([a, b, round(sgm.length, 1), 1 if rt == "construction" else 0, coords])
    json.dump({"nodes": nodes, "edges": edges}, open(out_path, "w", encoding="utf-8"), separators=(",", ":"))
    print("road graph:", len(nodes), "nodes,", len(edges), "edges")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "years").mkdir(exist_ok=True)
    profiles, meas = build_profiles()
    heights_by_name = {}
    raw_years, from_kmz = {}, set()
    for y in YEARS:
        kmz = RAW / f"kmz/{y}.kmz"
        if kmz.exists():
            raw_years[y] = load_kmz(kmz); from_kmz.add(y)
        else:
            raw_years[y] = json.load(open(RAW / f"dwg-geojson/{y}.geojson", encoding="utf-8"))["features"]
    print("sources:", {y: ("kmz" if y in from_kmz else "dwg") for y in YEARS})
    for y in YEARS:
        for f in raw_years[y]:
            pr = f["properties"]
            h = pr.get("attr_ارتفاع") or pr.get("attr_الارتفاع") or pr.get("attr_height")
            if h and pr.get("name") and f["geometry"]["type"] == "Polygon":
                try:
                    if float(h) > 0: heights_by_name[norm(pr["name"])] = float(h)
                except ValueError: pass
    stats = {"years": {}, "categories": {k: v[0] for k, v in CATS.items()}}
    used_profiles = set()
    for y in YEARS:
        names = load_names(y)
        out = []
        cnt = collections.Counter()
        road_m = 0.0; built_m2 = 0.0
        # drawings often hold an unnamed copy of a named shape; drop the copy
        named_polys = [] if y in from_kmz else [shape(f["geometry"]).buffer(0) for f in raw_years[y]
                       if f["geometry"]["type"] == "Polygon" and clean_name(f["properties"].get("name"))]
        def is_copy(sh):
            for o in named_polys:
                if o.intersects(sh):
                    inter = o.intersection(sh).area
                    if inter / max(sh.area, 1e-15) > 0.8 and inter / max(o.area, 1e-15) > 0.6:
                        return True
            return False
        # multi-part buildings: only one part carries the ESRI attributes, the
        # unnamed parts sit right before it in the drawing -> inherit from it
        feats_y = raw_years[y]
        inherit = {}
        for i, f in enumerate(feats_y):
            if y in from_kmz: break
            if f["geometry"]["type"] != "Polygon" or clean_name(f["properties"].get("name")):
                continue
            c = shape(f["geometry"]).centroid
            for j in range(i + 1, min(i + 6, len(feats_y))):
                g2 = feats_y[j]
                if g2["geometry"]["type"] != "Polygon": break
                if clean_name(g2["properties"].get("name")):
                    c2 = shape(g2["geometry"]).centroid
                    if math.hypot((c.x - c2.x) * 99700, (c.y - c2.y) * 110540) < 90:
                        inherit[i] = g2["properties"]
                    break
        for i, f in enumerate(raw_years[y]):
            g = f["geometry"]; pr = f["properties"]
            if i in inherit:
                pr = {**inherit[i], "layer": pr.get("layer")}
            if pr.get("layer") == "Polylines" and g["type"] == "LineString": pass
            raw_name = pr.get("name"); folder = pr.get("folder") or ""
            gt = g["type"]
            s = shape(g)
            if gt == "Polygon":
                s = s.buffer(0)
                if s.is_empty: continue
            area = transform(to_m, s).area if gt == "Polygon" else 0
            name = clean_name(raw_name)
            if gt == "Polygon" and not name and is_copy(s):
                continue
            if gt == "Polygon" and not name:
                c = s.representative_point()
                hits = sorted([(sh.area, nm, fo) for sh, nm, fo in names if sh.contains(c)])
                if hits:
                    name = hits[0][1]; folder = folder or hits[0][2]
            cat = categorize(name or raw_name or "", folder, gt, area)
            if not cat: continue
            props = {"id": f"{y}-{i}", "c": cat}
            if cat == "gate" and not name:
                name = f"البوابة {(raw_name or '').strip()}".strip() if (raw_name or "").strip().isdigit() else "بوابة"
            if name and cat not in ("pole", "road", "canopy", "farm", "green"): props["n"] = name
            if cat == "road" and pr.get("attr_type"): props["rt"] = pr["attr_type"]
            geom = g
            if gt == "Polygon":
                geom = mapping(s)
                h = None
                for k in ("attr_ارتفاع", "attr_الارتفاع", "attr_height"):
                    try:
                        if pr.get(k) and float(pr[k]) > 0: h = float(pr[k])
                    except ValueError: pass
                if h is None and name: h = heights_by_name.get(norm(name))
                if cat == "mosque" and name: h = MOSQUE_H.get(norm(name), h or 7)
                if cat in ("construction",) and (h is None or h <= 3): h = 8
                if h is None: h = CATS[cat][1]
                if cat in ("parking", "green", "farm", "sports", "boundary"): h = CATS[cat][1]
                props["h"] = round(h, 1)
                if norm(name) == "اساسالقبه" or norm(name) == "القبه": props["b"] = 9 if norm(name) == "القبه" else 7
                if cat not in ("boundary", "green", "farm", "parking", "sports"): built_m2 += area
                key = profile_key(name) if name and cat not in ("farm", "green", "parking", "sports", "boundary", "canopy") else None
                if key and key in profiles:
                    props["p"] = key; used_profiles.add(key)
                    extra = [k for k in SHARED.get(key, []) if k in profiles]
                    if extra: props["px"] = extra; used_profiles.update(extra)
            elif gt == "LineString":
                road_m += transform(to_m, s).length
            elif gt == "Point" and cat == "canopy":
                geom = square(g["coordinates"][0], g["coordinates"][1], 6); props["h"] = 3
            out.append({"type": "Feature", "properties": props, "geometry": rnd(geom)})
            cnt[cat] += 1
        json.dump({"type": "FeatureCollection", "features": out}, open(OUT / f"years/{y}.geojson", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        if y == 2026:
            build_road_graph({"features": out}, OUT / "roads.json")
        stats["years"][y] = {"features": len(out), "byCat": dict(cnt), "roadKm": round(road_m / 1000, 1),
                             "builtM2": round(built_m2)}
        print(y, len(out), dict(cnt.most_common()), "roads km", round(road_m / 1000, 1))
    for k, p in profiles.items(): p["mapped"] = k in used_profiles
    json.dump(list(profiles.values()), open(OUT / "profiles.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(stats, open(OUT / "stats.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("profiles", len(profiles), "mapped", sorted(used_profiles))
    print("unmapped", [k for k in profiles if k not in used_profiles])


if __name__ == "__main__":
    main()
