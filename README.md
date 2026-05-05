# Cagayan Valley Barangay-Level Rice and Corn Farms Below 0.5 Hectare Counts
## Interactive Agricultural Planning Map — Region II

---

## Quick Start

### Step 1 — Place your data files

```
cagayan-valley-map/
├── index.html
├── style.css
├── script.js
├── README.md
└── data/
    ├── barangay_boundaries.geojson    ← required
    ├── rice_farmers.csv               ← required
    ├── corn_farmers.csv               ← required
    ├── municipality_boundaries.geojson   ← optional
    └── province_boundaries.geojson       ← optional
```

### Step 2 — Configure field names

Open `script.js` and edit the CONFIG block at the top to match your actual field/column names:

```javascript
geoFields: {
  code:         'PSGC',        // PSGC code in your GeoJSON
  barangay:     'brgy_name',   // barangay name property
  municipality: 'mun_name',    // municipality/city property
  province:     'prov_name',   // province property
  region:       'reg_name',    // region property
},
riceFields: {
  code:         'PSGC',
  barangay:     'brgy_name',
  municipality: 'mun_name',
  province:     'prov_name',
  count:        'rice_farmers', // ← column with rice farm count
},
cornFields: {
  code:         'PSGC',
  barangay:     'brgy_name',
  municipality: 'mun_name',
  province:     'prov_name',
  count:        'corn_farmers', // ← column with corn farm count
},
meta: {
  lastUpdated:  '2024',         // ← update this to your data year
  sourceOffice: 'DA-RFO II, Cagayan Valley',
  region:       'Region II',
},
```

### Step 3 — Test locally

```bash
cd cagayan-valley-map
python -m http.server 8000
```

Open **http://localhost:8000** — the map should load automatically with your data.

### Step 4 — Publish

Upload the entire folder (with the `data/` subfolder) to any web host. No server-side code required — this is a static website.

---

## Publishing Platforms

| Platform | Cost | How |
|---|---|---|
| **GitHub Pages** | Free | Push to GitHub repo → Settings → Pages → Deploy from main |
| **Netlify** | Free | Drag-and-drop folder at netlify.com |
| **DA Intranet** | Free | Copy to `htdocs/` or `wwwroot/` on your Apache/IIS server |
| **Vercel** | Free | `npx vercel` in the project folder |

> Visitors see the map load directly — no upload dialogs or prompts.

---

## How the Data Join Works

The system joins GeoJSON polygon features to CSV rows using a **4-pass cascade**:

| Pass | Method | Notes |
|---|---|---|
| 1 | PSGC code exact match | Most accurate — use if available |
| 2 | Province + Municipality + Barangay composite key | Normalized (trimmed, uppercased, accent-stripped) |
| 3 | Municipality + Barangay only | Catches province naming differences |
| 4 | Barangay name only | Last resort — flagged as low-confidence |

If Pass 1 (PSGC) is available in both your GeoJSON and CSVs, match rate will be near 100%. Check the **Data Validation** panel in the right sidebar after loading to see match statistics.

### Common name normalization applied automatically
- `"CITY OF TUGUEGARAO"` → `"TUGUEGARAO CITY"`
- `"MUNICIPALITY OF ALCALA"` → `"ALCALA"`
- Accent marks removed (`Ñ` → `N`)
- `STO.` → `SANTO`, `STA.` → `SANTA`
- Extra spaces, commas, quotes removed

### Adding manual name corrections
Edit the `nameCorrections` table in `script.js`:

```javascript
nameCorrections: {
  "CAGAYAN|TUGUEGARAO CITY|ANNAFUNAN EAST": "CAGAYAN|TUGUEGARAO CITY|ANNAFUNAN EAST",
  // Add more: "GEO_KEY": "CSV_KEY"
},
```

---

## CSV Format

### rice_farmers.csv
```
PSGC,brgy_name,mun_name,prov_name,rice_farmers
012345678901,San Antonio,Tuguegarao City,Cagayan,245
012345678902,Poblacion,Alcala,Cagayan,88
```

### corn_farmers.csv
```
PSGC,brgy_name,mun_name,prov_name,corn_farmers
012345678901,San Antonio,Tuguegarao City,Cagayan,130
012345678902,Poblacion,Alcala,Cagayan,56
```

---

## GeoJSON Requirements

- Coordinate reference system: **WGS 84 / EPSG:4326**
- Encoding: **UTF-8**
- Geometry type: Polygon or MultiPolygon
- Required attributes: PSGC, barangay name, municipality name, province name

### Preparing in QGIS
1. Load your shapefile or GeoPackage
2. Reproject to EPSG:4326 if needed (`Processing → Reproject Layer`)
3. Fix geometries (`Processing → Fix Geometries`)
4. Delete unnecessary attribute columns (keep only PSGC, names)
5. `Layer → Save As → GeoJSON, EPSG:4326, UTF-8`

### Reducing file size (if GeoJSON is large)
In QGIS: `Processing → Simplify Geometries` — tolerance **0.0005 degrees**.
A typical 80MB GeoJSON reduces to ~5MB after simplification and field trimming.

---

## Map Features

- **3 view levels**: Barangay · Municipality · Province
- **13 map styles**: Choropleth, Bivariate, Pie symbols, Ranked, Deviation, Ratio, Priority, and more
- **10 map variables**: Total, Rice, Corn counts; shares; ratios; dominance; priority
- **6 basemaps**: Carto Light/Dark, OpenStreetMap, Esri Imagery, Esri Topo, OpenTopoMap
- **Live dashboard**: Auto-updating summary cards and highlights
- **Charts**: Top-10 rankings and category breakdowns
- **Ranking table**: Sortable, searchable, exportable
- **Search**: Real-time barangay/municipality/province search
- **Data Validation**: Join statistics and mismatch diagnostics
- **Export**: CSV and GeoJSON export for current view
- **Executive Mode**: Simplified layout for management presentations

---

## Updating Data

Replace the CSV files in `data/` and re-deploy. Also update `CONFIG.meta.lastUpdated` in `script.js`.

---

## Limitations

1. Farmer counts depend on the quality of the registry/survey source data.
2. Name-based matching (Passes 2–4) can introduce errors for duplicated barangay names — use PSGC codes where possible.
3. Farm count is not the same as crop area, production, or yield.
4. Use the latest official PSA/NAMRIA barangay boundaries.

---

*Source: DA-RFO II, Cagayan Valley (Region II)*
