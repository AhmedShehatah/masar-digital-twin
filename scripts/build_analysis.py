"""Turn the GIS analysis KMZs from Drive (data-raw/drive/) into map layers.

Outputs (public/data/analysis/):
  img/{id}-{year}[-{season}].png   raster overlays, copied out of their KMZ untouched
  {id}.geojson                     vector analyses (network, hydrology)
  index.json                       manifest the layers panel and map engine read

Rasters are the campus-scale exports only. The Sohag-scale copies and the campus
climate rasters (one flat colour each) are left out on purpose.

Run:  .venv/bin/python scripts/build_analysis.py   (also part of `npm run data`)
"""
import json, re, shutil, sys, zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_data import load_kmz, rnd  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-raw" / "drive"
OUT = ROOT / "public" / "data" / "analysis"

VEG = "المؤشرات النباتات"
LST = "درجه حراره السطح"
SEASONS = {"winter": ("Winter", "الشتاء", "شتاء"), "spring": ("Spring", "الربيع", "ربيع"),
           "summer": ("Summer", "الصيف", "صيف"), "autumn": ("Autumn", "الخريف", "خريف")}

VEG_RAMP = ["#ffffcc", "#d9f0a3", "#78c679", "#238443", "#004529"]
RASTERS = [
    {"id": "ndvi", "label": "NDVI", "sub": "مؤشر الغطاء النباتي", "byYear": True,
     "legend": {"ramp": VEG_RAMP, "lo": "أرض جرداء", "hi": "نبات كثيف"},
     "files": {2006: f"{VEG}/NDVI/2006/NDVI 2006 حرم.kmz", 2011: f"{VEG}/NDVI/2011/NDVI 2011 حرم.kmz",
               2016: f"{VEG}/NDVI/2016/ndvi2016.kmz", 2021: f"{VEG}/NDVI/2021/NDVI 2021 حرم.kmz",
               2026: f"{VEG}/NDVI/2026/NDVI 2026 حرم.kmz"}},
    {"id": "savi", "label": "SAVI", "sub": "مؤشر النبات المعدَّل للتربة", "byYear": True,
     "legend": {"ramp": VEG_RAMP, "lo": "أرض جرداء", "hi": "نبات كثيف"},
     "files": {2006: f"{VEG}/SAVI/2006/SAVI 2006 حرم.kmz", 2011: f"{VEG}/SAVI/2011/SAVI 2011 حرم.kmz",
               2016: f"{VEG}/SAVI/2016/savi2016.kmz", 2021: f"{VEG}/SAVI/2021/SAVI 2021 حرم.kmz",
               2026: f"{VEG}/SAVI/2026/SAVI 2026 حرم.kmz"}},
    {"id": "cci", "label": "CCI", "sub": "مؤشر محتوى الكلوروفيل", "byYear": True,
     "legend": {"ramp": VEG_RAMP, "lo": "أقل", "hi": "أعلى"},
     "files": {2006: f"{VEG}/CCI/2006/CCI 2006 حرم.kmz", 2011: f"{VEG}/CCI/2011/CCI 2011 حرم.kmz",
               2016: f"{VEG}/CCI/2016/cci 2016.kmz", 2021: f"{VEG}/CCI/2021/CCI 2021 حرم.kmz",
               2026: f"{VEG}/CCI/2026/CCI 2026 حرم.kmz"}},
    {"id": "lst", "label": "حرارة السطح", "sub": "LST · لكل فصل", "byYear": True, "seasons": list(SEASONS),
     "legend": {"ramp": ["#2b2bff", "#19d3ff", "#f6f04a", "#ff9a1f", "#e8231f"], "lo": "أبرد", "hi": "أحرّ"},
     "dirs": {2006: f"{LST}/2006", 2016: f"{LST}/2016", 2026: f"{LST}/2026"}},
    {"id": "landcover", "label": "الغطاء الأرضي", "sub": "تصنيف موجَّه", "byYear": True,
     "legend": {"classes": [["#fdf3c4", "أرض فضاء"], ["#ff2a1a", "مبانٍ وطرق"], ["#46b51f", "نباتات"]]},
     "files": {2016: "التصنيف/2016/2016_LayerToKML.kmz", 2021: "التصنيف/2021/2021_LayerToKML.kmz",
               2026: "التصنيف/2026/تصنيف الغطاء الأر_LayerToKML.kmz"}},
    {"id": "dem", "label": "نموذج الارتفاع", "sub": "DEM", "byYear": False,
     "legend": {"ramp": ["#f1e7c6", "#c9b48a", "#8c6d45"]},
     "files": {0: "تحليل الطبوغرافي/منطقه الحرم الجامعه dem.kmz"}},
    {"id": "slope", "label": "الانحدار", "sub": "Slope", "byYear": False,
     "legend": {"ramp": ["#1e6b1a", "#4da32a", "#b6dc3c"]},
     "files": {0: "تحليل الطبوغرافي/slop (2).kmz"}},
]

NAMES = {"Sohag University": "جامعة سوهاج", "covered areana": "الصالة المغطاة",
         "المبني الإداري لجامعة سوه": "المبنى الإداري", "الجامعه الاهليه": "الجامعة الأهلية",
         "قاعه مؤتمرات": "قاعة المؤتمرات"}


def overlay(kmz, dest):
    """copy the overlay image out of a KMZ and return its corner coordinates"""
    with zipfile.ZipFile(kmz) as z:
        kml = z.read(next(n for n in z.namelist() if n.lower().endswith(".kml"))).decode("utf-8", "replace")
        go = re.search(r"<GroundOverlay\b.*?</GroundOverlay>", kml, re.S).group(0)
        href = re.search(r"<href>([^<]+)</href>", go).group(1).strip()
        box = {k: float(re.search(rf"<{k}>([-\d.]+)</{k}>", go).group(1)) for k in ("north", "south", "east", "west")}
        rot = re.search(r"<rotation>([-\d.]+)</rotation>", go)
        if rot and abs(float(rot.group(1))) > 1e-6:
            raise ValueError(f"{kmz.name}: rotated overlays are not supported")
        dest.write_bytes(z.read(href))
    n, s, e, w = (round(box[k], 6) for k in ("north", "south", "east", "west"))
    return [[w, n], [e, n], [e, s], [w, s]]


def build_rasters():
    (OUT / "img").mkdir(parents=True, exist_ok=True)
    out = []
    for r in RASTERS:
        frames = []
        if "dirs" in r:
            for year, d in r["dirs"].items():
                for kmz in sorted((SRC / d).glob("*.kmz")):
                    season = next((s for s, keys in SEASONS.items() if any(k in kmz.stem for k in keys)), None)
                    if not season:
                        raise ValueError(f"no season in {kmz}")
                    name = f"{r['id']}-{year}-{season}.png"
                    frames.append({"year": year, "season": season, "url": f"/data/analysis/img/{name}",
                                   "coords": overlay(kmz, OUT / "img" / name)})
        else:
            for year, rel in r["files"].items():
                name = f"{r['id']}-{year}.png" if year else f"{r['id']}.png"
                f = {"url": f"/data/analysis/img/{name}", "coords": overlay(SRC / rel, OUT / "img" / name)}
                if year: f["year"] = year
                frames.append(f)
        entry = {k: v for k, v in r.items() if k not in ("files", "dirs")}
        entry["frames"] = frames
        out.append(entry)
        print(f"raster {r['id']}: {len(frames)} frames")
    return out


def feats(rel, kind, keep):
    """features of one KMZ tagged with kind `k`; `keep` maps output prop -> (attr, cast)"""
    out = []
    for f in load_kmz(SRC / rel):
        p = {"k": kind}
        for key, (attr, cast) in keep.items():
            v = f["properties"].get(attr)
            if v in (None, "", "<Null>", "NULL"): continue
            try: p[key] = cast(v)
            except ValueError: pass
        if "n" in p: p["n"] = NAMES.get(p["n"], p["n"])
        out.append({"type": "Feature", "properties": p, "geometry": rnd(f["geometry"])})
    return out


def bbox(fs):
    xs, ys = [], []
    def walk(c):
        if isinstance(c[0], (int, float)): xs.append(c[0]); ys.append(c[1])
        else:
            for x in c: walk(x)
    for f in fs: walk(f["geometry"]["coordinates"])
    return [[min(xs), min(ys)], [max(xs), max(ys)]]


NET = "التحليل الشبكي"
VECTORS = [
    {"id": "service", "label": "مناطق الخدمة", "sub": "نطاقات 10 · 100 · 350 م حول المنشآت",
     "legend": {"classes": [["#ffd27a", "حتى 10 م"], ["#f59e0b", "10 – 100 م"], ["#b45309", "100 – 350 م"]]},
     "parts": [(f"{NET}/service area/خدمه 2.kmz", "area", {"to": ("attr_ToBreak", float)}),
               (f"{NET}/service area/خدمه1.kmz", "facility", {"n": ("attr_Name", str)})]},
    {"id": "closest", "label": "أقرب منشأة", "sub": "أقصر مسار من كل نقطة إلى أقرب 5 منشآت",
     "legend": {"classes": [["#7fe3ff", "الأقرب"], ["#3b82f6", "البدائل"], ["#ffd27a", "منشأة"], ["#f472b6", "نقطة انطلاق"]]},
     "parts": [(f"{NET}/closet fasility/بوابه3.kmz", "route", {"rank": ("attr_FacilityRank", int), "m": ("attr_Total_Length", float)}),
               (f"{NET}/closet fasility/بوابه1.kmz", "facility", {"n": ("attr_Name", str)}),
               (f"{NET}/closet fasility/بوابه2.kmz", "incident", {"n": ("attr_Name", str)})]},
    {"id": "odmatrix", "label": "مصفوفة التكلفة", "sub": "المسافة من كل مبنى إلى أقرب جراجين",
     "legend": {"classes": [["#c4b5fd", "الجراج الأقرب"], ["#7c3aed", "الجراج الثاني"], ["#ffd27a", "مبنى"], ["#a78bfa", "جراج"]]},
     "parts": [(f"{NET}/COST MATRIX/جراش 3.kmz", "line", {"rank": ("attr_DestinationRank", int), "m": ("attr_Total_Length", float)}),
               (f"{NET}/COST MATRIX/جراش 1.kmz", "origin", {"n": ("attr_Name", str)}),
               (f"{NET}/COST MATRIX/جراش2.kmz", "dest", {})]},
    {"id": "tour", "label": "مسار الزيارات", "sub": "أفضل ترتيب لزيارة 18 منشأة · 6.2 كم",
     "legend": {"classes": [["#4ade80", "المسار"], ["#ffffff", "محطة"]]},
     "parts": [(f"{NET}/road/اقصر طريق1.kmz", "route", {"m": ("attr_Total_Length", float)}),
               (f"{NET}/road/طرق 1.kmz", "stop", {"n": ("attr_Name", str), "seq": ("attr_Sequence", int)})]},
    {"id": "hydro", "label": "الأحواض والمجاري", "sub": "أحواض التصريف ورتب المجاري ونقاط الخطر",
     "legend": {"classes": [["#38bdf8", "مجرى (حسب الرتبة)"], ["#0ea5e9", "حوض تصريف"], ["#ef4444", "نقطة خطر"]]},
     "parts": [("تحليل الهيدرولوجي/Exportالاحواض_Clip1_LayerToK.kmz", "basin", {"n": ("attr_الاسم", str)}),
               ("تحليل الهيدرولوجي/StreamT_Stream12_Clip1_Layer.kmz", "stream", {"order": ("attr_grid_code", int)}),
               ("تحليل الهيدرولوجي/المخطر_LayerToKML.kmz", "hazard", {})]},
]


def build_vectors():
    out = []
    for v in VECTORS:
        fs = [f for rel, kind, keep in v["parts"] for f in feats(rel, kind, keep)]
        json.dump({"type": "FeatureCollection", "features": fs}, open(OUT / f"{v['id']}.geojson", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        entry = {k: x for k, x in v.items() if k != "parts"}
        entry.update(url=f"/data/analysis/{v['id']}.geojson", bounds=bbox(fs))
        out.append(entry)
        print(f"vector {v['id']}: {len(fs)} features")
    return out


def main():
    if OUT.exists(): shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    index = {"rasters": build_rasters(), "vectors": build_vectors()}
    json.dump(index, open(OUT / "index.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
