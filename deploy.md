# Deployment Guide
## How to Publish the Map So Visitors See Data Automatically

---

## The Two Deployment Modes

| Mode | When it activates | What visitors see |
|---|---|---|
| **A — Auto-load** | When data files exist in the `data/` folder | Map loads instantly, no dialog |
| **B — Upload modal** | When no data files are found | Upload dialog appears first |

**You want Mode A for your published website.**

---

## Step 1 — Prepare Your Data Files

Name your files exactly as shown and place them in the `data/` subfolder:

```
cagayan-valley-map/
├── index.html
├── style.css
├── script.js
├── deploy.md
└── data/
    ├── barangay_boundaries.geojson   ← required
    ├── rice_farmers.csv              ← required
    ├── corn_farmers.csv              ← required
    ├── municipality_boundaries.geojson  ← optional
    └── province_boundaries.geojson      ← optional
```

If you want to use different filenames, edit the top of `script.js`:

```javascript
files: {
  barangayGeoJSON:  'data/barangay_boundaries.geojson',
  riceFarmersCSV:   'data/rice_farmers.csv',
  cornFarmersCSV:   'data/corn_farmers.csv',
  provinceBoundary: 'data/province_boundaries.geojson',
},
```

---

## Step 2 — Test Locally First

```bash
cd cagayan-valley-map
python -m http.server 8000
```

Open **http://localhost:8000** — if the map loads automatically without any upload dialog, your data files are in the right place. ✅

---

## Step 3 — Choose a Publishing Platform

### Option A: GitHub Pages (free, recommended)

1. Create a free account at [github.com](https://github.com)
2. Create a new repository (e.g. `agrimap-region2`)
3. Upload all your files maintaining the folder structure:
   ```
   index.html
   style.css
   script.js
   data/barangay_boundaries.geojson
   data/rice_farmers.csv
   data/corn_farmers.csv
   ```
4. Go to **Settings → Pages → Source: Deploy from branch → main → / (root)**
5. Your map will be live at:
   `https://YOUR-USERNAME.github.io/agrimap-region2/`

> ⚠️ **GeoJSON size note:** GitHub Pages serves files up to 100MB. If your GeoJSON is larger, simplify it in QGIS first (Processing → Simplify Geometries, tolerance 0.0005).

---

### Option B: Netlify (free, drag-and-drop, fastest)

1. Go to [netlify.com](https://netlify.com) and sign up free
2. On the dashboard, drag your entire `cagayan-valley-map/` folder onto the page
3. Netlify gives you a live URL instantly (e.g. `https://agrimap-rfo2.netlify.app`)
4. To update data later, just drag-and-drop again

Netlify supports files up to 10MB per file. For larger GeoJSON, use the 100MB limit option with a paid plan, or pre-simplify the geometry.

---

### Option C: DA-RFO II Intranet / Local Server

Copy the entire folder to your web server directory:

```
# For Apache (WAMP/XAMPP on Windows):
C:\xampp\htdocs\agrimap\

# For IIS:
C:\inetpub\wwwroot\agrimap\

# For Linux Apache:
/var/www/html/agrimap/
```

Access at: `http://192.168.x.x/agrimap/` or your server's hostname.

No special server configuration needed — this is a static site (pure HTML/CSS/JS).

---

### Option D: Vercel (free, fast CDN)

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository, or use the Vercel CLI:
   ```bash
   npm i -g vercel
   cd cagayan-valley-map
   vercel
   ```
3. Live URL provided instantly.

---

## Updating Data After Publishing

When your farmer data is updated (new season, new survey round):

1. Replace `data/rice_farmers.csv` and `data/corn_farmers.csv` with the new files
2. Re-upload to your hosting platform (GitHub: commit and push; Netlify: drag-and-drop again)
3. Visitors automatically get the new data on next page load

> The "Upload Data" button in the header is always visible for admins — it lets you test a new dataset on the live site without replacing the files, useful for checking data before publishing.

---

## Controlling the Upload Modal

| Scenario | What to do |
|---|---|
| Published map, data in `data/` folder | Nothing — modal won't appear for visitors |
| You want to force the modal to always show | Set `forceUploadModal: true` in `script.js` CONFIG |
| Admin wants to re-upload data on live site | Click the **Upload Data** button in the header |
| You want to hide the Upload button from public | Add CSS: `#open-upload-modal { display:none }` |

---

## Hiding the Upload Button from Public Visitors

If you don't want the public to be able to re-upload data (recommended for final published version), add this to `style.css`:

```css
#open-upload-modal { display: none !important; }
```

Or make it visible only on localhost during testing by adding to `script.js` at the bottom:

```javascript
// Hide upload button on live site, show only locally
if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  document.getElementById('open-upload-modal').style.display = 'none';
}
```

---

## GeoJSON File Size Optimization

If your `barangay_boundaries.geojson` is very large (>10MB), it will be slow to load over the internet. Steps to reduce size in QGIS:

1. Open your barangay layer in QGIS
2. **Processing → Toolbox → Simplify Geometries**
   - Tolerance: `0.0005` degrees (good balance)
   - Method: Douglas-Peucker
3. Open attribute table → **Field Calculator** → delete all columns except: `PSGC`, `brgy_name`, `mun_name`, `prov_name`, `reg_name`
4. **Layer → Save As → GeoJSON, EPSG:4326, UTF-8**

Typical results:
| Original | After simplify | After field trim | Reduction |
|---|---|---|---|
| 80 MB | 12 MB | 8 MB | ~90% |
| 30 MB | 5 MB | 3 MB | ~90% |

---

## Summary Checklist Before Publishing

- [ ] `data/barangay_boundaries.geojson` is in the `data/` folder
- [ ] `data/rice_farmers.csv` is in the `data/` folder  
- [ ] `data/corn_farmers.csv` is in the `data/` folder
- [ ] Field names in `script.js` CONFIG match your actual file columns
- [ ] Tested locally with `python -m http.server 8000` — map loads without dialog
- [ ] GeoJSON size is under 20MB (simplify if needed)
- [ ] `CONFIG.meta.lastUpdated` is set to your current data year/date
- [ ] (Optional) Upload button hidden from public visitors
