/* =================================================================
   CAGAYAN VALLEY RICE & CORN FARMS BELOW 0.5 HA DISTRIBUTION MAP
   script.js — Complete Interactive Web Map System
   ================================================================= */

'use strict';

// ====================================================================
// SECTION 1: CONFIGURATION
// ====================================================================
const CONFIG = {
  // --- FILE PATHS (edit these to match your actual filenames) ---
  files: {
    barangayGeoJSON:   'data/barangay_boundaries.geojson',
    riceFarmersCSV:    'data/rice_farmers.csv',
    cornFarmersCSV:    'data/corn_farmers.csv',
    provinceBoundary:  'data/province_boundaries.geojson',  // optional
  },

  // --- FIELD NAMES IN YOUR GEOJSON (edit to match your data) ---
  geoFields: {
    code:         'PSGC',       // barangay PSGC code (preferred join key)
    barangay:     'brgy_name',  // barangay name field
    municipality: 'mun_name',   // municipality/city name field
    province:     'prov_name',  // province name field
    region:       'reg_name',   // region name field
  },

  // --- FIELD NAMES IN YOUR RICE CSV ---
  riceFields: {
    code:         'PSGC',        // match field (preferred) - leave blank to use name match
    barangay:     'brgy_name',
    municipality: 'mun_name',
    province:     'prov_name',
    count:        'rice_farmers', // numeric count field
  },

  // --- FIELD NAMES IN YOUR CORN CSV ---
  cornFields: {
    code:         'PSGC',
    barangay:     'brgy_name',
    municipality: 'mun_name',
    province:     'prov_name',
    count:        'corn_farmers',
  },

  // --- DATA METADATA ---
  meta: {
    lastUpdated:  '2024',        // update this
    sourceOffice: 'DA-RFO II, Cagayan Valley',
    region:       'Region II',
  },

  // --- CLASSIFICATION THRESHOLDS (edit freely) ---
  classification: {
    numClasses: 5,
    balancedThreshold: 0.1,   // |rice% - corn%| < 10% = balanced
    priorityBreaks: null,     // null = auto-quantile; or [100,300,600,1000]
  },

  // --- MAP DEFAULTS ---
  defaults: {
    center: [17.6132, 121.7270],
    zoom: 8,
    variable: 'total_farmers',
    style: 'choropleth',
    classification: 'quantile',
    basemap: 'carto-light',
  },

  // --- DEPLOYMENT MODE ---
  // Set to true to always show the upload modal even if data/ files exist
  forceUploadModal: false,

  // --- NAME CORRECTIONS CROSSWALK (edit as needed) ---
  // Format: "PROVINCE|MUNICIPALITY|BARANGAY": "PROVINCE|MUNICIPALITY|BARANGAY"
  nameCorrections: {
    "CAGAYAN|CITY OF TUGUEGARAO|ANNAFUNAN EAST": "CAGAYAN|TUGUEGARAO CITY|ANNAFUNAN EAST",
    "ISABELA|CITY OF ILAGAN|SAN VICENTE":         "ISABELA|ILAGAN CITY|SAN VICENTE",
    "ISABELA|CAUAYAN|DISTRICT I":                 "ISABELA|CAUAYAN CITY|DISTRICT I",
    // Add more corrections here as needed
  },
};

// ====================================================================
// SECTION 2: COLOR PALETTES
// ====================================================================
const COLORS = {
  rice5:     ['#edf8e9','#bae4b3','#74c476','#31a354','#006d2c'],
  corn5:     ['#fff5eb','#fee6ce','#fdae6b','#e6550d','#a63603'],
  total5:    ['#eff3ff','#bdd7e7','#6baed6','#2171b5','#084594'],
  diverging: ['#d73027','#fc8d59','#fee090','#e0f3f8','#91bfdb','#4575b4'],
  bivariate: {
    // 3x3: rows=corn (low→high), cols=rice (low→high)
    'LL': '#e8e8e8', 'ML': '#ace4e4', 'HL': '#5ac8c8',
    'LM': '#dfb0d6', 'MM': '#a5b3cc', 'HM': '#5698b9',
    'LH': '#be64ac', 'MH': '#8c62aa', 'HH': '#3b4994',
  },
  dominant: {
    rice:     '#2d8c4e',
    corn:     '#d4820a',
    balanced: '#2c7bb6',
    nodata:   '#c8c8c8',
  },
  priority: {
    'Very High': '#c0392b',
    'High':      '#e67e22',
    'Moderate':  '#f1c40f',
    'Low':       '#27ae60',
    'Watchlist': '#bdc3c7',
  },
  deviation: {
    'Far Above': '#0d3e6e',
    'Above':     '#2196f3',
    'Near Avg':  '#90caf9',
    'Below':     '#ffb74d',
    'Far Below': '#e53935',
  },
  ratio: {
    'Strong Rice':  '#006d2c',
    'Mod. Rice':    '#74c476',
    'Balanced':     '#c8c8c8',
    'Mod. Corn':    '#fdae6b',
    'Strong Corn':  '#a63603',
  },
};

// ====================================================================
// SECTION 3: APPLICATION STATE
// ====================================================================
const STATE = {
  map: null,
  layers: { barangay: null, municipality: null, province: null, circles: null, pies: null },
  data: {
    geojson: null,
    riceCsv: [],
    cornCsv: [],
    joined: [],          // final barangay-level merged features
    municipalSummary: [],
    provinceSummary: [],
    validation: {},
  },
  filters: { province: '', municipality: '', barangay: '' },
  view: 'barangay',      // 'barangay' | 'municipality' | 'province'
  variable: CONFIG.defaults.variable,
  mapStyle: CONFIG.defaults.style,
  classification: CONFIG.defaults.classification,
  priorityVariable: 'total_farmers',
  rankedN: 10,
  deviationBase: 'regional',
  sortCol: 'total_farmers',
  sortDir: 'desc',
  tableSearch: '',
  execMode: false,
  chart: null,
  breaks: {},            // cached classification breaks
  basemap: CONFIG.defaults.basemap,
};

// ====================================================================
// SECTION 4: UTILITY FUNCTIONS
// ====================================================================
const Utils = {
  fmt: (n) => {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toLocaleString('en-PH');
  },

  fmtPct: (n) => {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toFixed(1) + '%';
  },

  fmtRatio: (n) => {
    if (n === null || n === undefined || isNaN(n) || !isFinite(n)) return '—';
    return n.toFixed(2) + ':1';
  },

  normalize: (s) => {
    if (s === null || s === undefined) return '';
    let v = s.toString().trim().toUpperCase();
    v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    v = v.replace(/\s+/g, ' ');
    v = v.replace(/[.,;:`"]/g, '');
    // "CITY OF X" => "X CITY"
    const cityOf = v.match(/^CITY\s+OF\s+(.+)/);
    if (cityOf) v = cityOf[1].trim() + ' CITY';
    v = v.replace(/^MUNICIPALITY\s+OF\s+/,'').replace(/^TOWN\s+OF\s+/,'');
    v = v.replace(/\s*\(CAPITAL\)\s*/g,'').replace(/\s*\(MUN\)\s*/g,'');
    v = v.replace(/'/g,'').trim();
    return v;
  },

  normalizeKey: (s) => {
    if (!s) return '';
    let v = Utils.normalize(s);
    v = v.replace(/\bSTO\.?\b/g,'SANTO').replace(/\bSTA\.?\b/g,'SANTA');
    v = v.replace(/-/g,' ').replace(/\s+/g,' ').trim();
    return v;
  },

  makeKey: (province, municipality, barangay) => {
    return [
      Utils.normalizeKey(province),
      Utils.normalizeKey(municipality),
      Utils.normalizeKey(barangay),
    ].join('|');
  },

  makeLooseKey: (municipality, barangay) => {
    return Utils.normalizeKey(municipality) + '|' + Utils.normalizeKey(barangay);
  },

  makeBrgyKey: (barangay) => {
    return Utils.normalizeKey(barangay);
  },

  toNumber: (v) => {
    if (v === null || v === undefined || v === '') return 0;
    const n = parseFloat(String(v).replace(/,/g, '').trim());
    return isNaN(n) ? 0 : n;
  },

  setLoadMsg: (msg, pct) => {
    const el = document.getElementById('loading-msg');
    const bar = document.getElementById('loading-bar');
    if (el) el.textContent = msg;
    if (bar && pct !== undefined) bar.style.width = pct + '%';
  },

  hideLoading: () => {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.add('hidden');
  },

  domPriority: (cls) => {
    const map = { 'Very High': 'very-high', 'High': 'high', 'Moderate': 'moderate', 'Low': 'low', 'Watchlist': 'watchlist' };
    return map[cls] || 'watchlist';
  },

  domClass: (d) => {
    const map = { 'Rice': 'dom-rice', 'Corn': 'dom-corn', 'Balanced': 'dom-balanced', 'No Data': 'dom-nodata' };
    return map[d] || 'dom-nodata';
  },

  hexToRgb: (hex) => {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return [r,g,b];
  },

  lerpColor: (c1, c2, t) => {
    const r1 = Utils.hexToRgb(c1);
    const r2 = Utils.hexToRgb(c2);
    const r = Math.round(r1[0] + (r2[0]-r1[0])*t);
    const g = Math.round(r1[1] + (r2[1]-r1[1])*t);
    const b = Math.round(r1[2] + (r2[2]-r1[2])*t);
    return `rgb(${r},${g},${b})`;
  },
};

// ====================================================================
// SECTION 5: DATA LOADING
// ====================================================================
async function loadAllData() {
  Utils.setLoadMsg('Loading barangay boundaries…', 10);
  let geojson = null;
  try {
    const r = await fetch(CONFIG.files.barangayGeoJSON);
    if (!r.ok) throw new Error('GeoJSON not found');
    geojson = await r.json();
    Utils.setLoadMsg(`Loaded ${geojson.features.length} barangay polygons.`, 35);
  } catch(e) {
    console.error('GeoJSON load failed:', e);
    Utils.setLoadMsg('⚠️ GeoJSON not found. Loading demo data…', 35);
    geojson = buildDemoGeoJSON();
  }

  Utils.setLoadMsg('Loading rice farm data…', 50);
  let riceCsv = [], cornCsv = [];
  try {
    const r = await fetch(CONFIG.files.riceFarmersCSV);
    if (r.ok) {
      const txt = await r.text();
      riceCsv = Papa.parse(txt, { header:true, skipEmptyLines:true }).data;
    } else throw new Error('Rice CSV not found');
  } catch(e) {
    console.warn('Rice CSV not found, using demo data');
    riceCsv = buildDemoRiceCSV(geojson);
  }

  Utils.setLoadMsg('Loading corn farm data…', 65);
  try {
    const r = await fetch(CONFIG.files.cornFarmersCSV);
    if (r.ok) {
      const txt = await r.text();
      cornCsv = Papa.parse(txt, { header:true, skipEmptyLines:true }).data;
    } else throw new Error('Corn CSV not found');
  } catch(e) {
    console.warn('Corn CSV not found, using demo data');
    cornCsv = buildDemoCornCSV(geojson);
  }

  STATE.data.geojson = geojson;
  STATE.data.riceCsv = riceCsv;
  STATE.data.cornCsv = cornCsv;

  Utils.setLoadMsg('Joining and validating data…', 80);
  joinData();

  Utils.setLoadMsg('Building summaries…', 90);
  buildMunicipalSummary();
  buildProvincialSummary();

  Utils.setLoadMsg('Rendering map…', 95);
}

// ====================================================================
// SECTION 6: DATA JOINING  (robust multi-pass matcher)
// ====================================================================

/* Join strategy — 4 passes in decreasing precision:
   Pass 1 — PSGC code exact match (most reliable)
   Pass 2 — province + municipality + barangay composite key (normalized)
   Pass 3 — municipality + barangay key (ignores province differences)
   Pass 4 — barangay-only key (last resort, flagged as low-confidence)
   Any barangay still unmatched → farm counts = 0, flagged in data_quality
*/
function joinData() {
  const gf = CONFIG.geoFields;
  const rf = CONFIG.riceFields;
  const cf = CONFIG.cornFields;

  console.group('🔗 JOIN DIAGNOSTICS');
  console.log('GeoJSON fields:', gf);
  console.log('Rice fields:', rf);
  console.log('Corn fields:', cf);

  // Sample first GeoJSON feature properties
  const sampleGeo = STATE.data.geojson.features[0]?.properties || {};
  console.log('Sample GeoJSON props (1st feature):', sampleGeo);

  // Sample first CSV rows
  if (STATE.data.riceCsv.length > 0) console.log('Sample Rice CSV row (1st):', STATE.data.riceCsv[0]);
  if (STATE.data.cornCsv.length > 0) console.log('Sample Corn CSV row (1st):', STATE.data.cornCsv[0]);

  // ── Build multi-index lookups ──
  const buildLookup = (rows, codeField, provField, munField, brgyField) => {
    const byCode    = {};
    const byFull    = {};   // prov|mun|brgy
    const byMunBrgy = {};   // mun|brgy
    const byBrgy    = {};   // brgy only

    rows.forEach((row, idx) => {
      // Code index
      const code = row[codeField] ? String(row[codeField]).replace(/\.0$/, '').trim() : '';
      if (code && code !== '0') {
        byCode[code] = row;
        // Also index padded/unpadded variants
        byCode[code.padStart(9,'0')] = row;
        byCode[code.replace(/^0+/, '') || '0'] = row;
      }

      // Composite key index (3 variants)
      const prov = row[provField]  || '';
      const mun  = row[munField]   || '';
      const brgy = row[brgyField]  || '';

      const fullKey    = Utils.makeKey(prov, mun, brgy);
      const munBrgyKey = Utils.makeLooseKey(mun, brgy);
      const brgyKey    = Utils.makeBrgyKey(brgy);

      // Apply name corrections
      const corrFull = CONFIG.nameCorrections[fullKey] || fullKey;

      if (!byFull[corrFull])    byFull[corrFull]       = row;
      if (!byMunBrgy[munBrgyKey]) byMunBrgy[munBrgyKey] = row;
      if (!byBrgy[brgyKey])    byBrgy[brgyKey]         = row;
    });

    return { byCode, byFull, byMunBrgy, byBrgy };
  };

  const riceIdx = buildLookup(
    STATE.data.riceCsv, rf.code, rf.province, rf.municipality, rf.barangay
  );
  const cornIdx = buildLookup(
    STATE.data.cornCsv, cf.code, cf.province, cf.municipality, cf.barangay
  );

  console.log('Rice index sizes — code:', Object.keys(riceIdx.byCode).length,
    '| full:', Object.keys(riceIdx.byFull).length,
    '| mun+brgy:', Object.keys(riceIdx.byMunBrgy).length);
  console.log('Corn index sizes — code:', Object.keys(cornIdx.byCode).length,
    '| full:', Object.keys(cornIdx.byFull).length,
    '| mun+brgy:', Object.keys(cornIdx.byMunBrgy).length);

  // Show a sample of built keys for diagnosis
  const riceKeys = Object.keys(riceIdx.byFull).slice(0, 5);
  const cornKeys = Object.keys(cornIdx.byFull).slice(0, 5);
  console.log('Sample rice full keys:', riceKeys);
  console.log('Sample corn full keys:', cornKeys);

  // Validation counters
  const val = {
    polygons:     STATE.data.geojson.features.length,
    riceRecords:  STATE.data.riceCsv.length,
    cornRecords:  STATE.data.cornCsv.length,
    joinedBoth:   0,
    joinedRiceOnly: 0,
    joinedCornOnly: 0,
    noMatch:      0,
    missingRice:  [],
    missingCorn:  [],
    unmatchedRice: [],
    unmatchedCorn: [],
    duplicateCodes: [],
    warnings:     [],
    passStats: { code:0, full:0, munBrgy:0, brgy:0, none:0 },
    joinField:    '',
    sampleGeoKey: '',
    sampleCsvKey: '',
  };

  const matchedRiceKeys = new Set();
  const matchedCornKeys = new Set();

  // Helper: find row in index with multi-pass
  const findRow = (idx, geoCode, geoProv, geoMun, geoBrgy, matchedSet, passStat) => {
    const code        = geoCode ? String(geoCode).replace(/\.0$/, '').trim() : '';
    const fullKey     = Utils.makeKey(geoProv, geoMun, geoBrgy);
    const corrFull    = CONFIG.nameCorrections[fullKey] || fullKey;
    const munBrgyKey  = Utils.makeLooseKey(geoMun, geoBrgy);
    const brgyKey     = Utils.makeBrgyKey(geoBrgy);

    // Pass 1: code
    if (code && idx.byCode[code]) {
      matchedSet.add(code); passStat.code++; return { row: idx.byCode[code], pass: 1 };
    }
    // Also try zero-padded/stripped code variants
    if (code) {
      const padded   = code.padStart(9,'0');
      const stripped = code.replace(/^0+/,'') || '0';
      if (idx.byCode[padded])   { matchedSet.add(padded);   passStat.code++;    return { row: idx.byCode[padded],   pass: 1 }; }
      if (idx.byCode[stripped]) { matchedSet.add(stripped); passStat.code++;    return { row: idx.byCode[stripped], pass: 1 }; }
    }
    // Pass 2: full composite key
    if (idx.byFull[corrFull]) {
      matchedSet.add(corrFull); passStat.full++;    return { row: idx.byFull[corrFull],    pass: 2 };
    }
    // Pass 3: mun+brgy
    if (idx.byMunBrgy[munBrgyKey]) {
      matchedSet.add(munBrgyKey); passStat.munBrgy++; return { row: idx.byMunBrgy[munBrgyKey], pass: 3 };
    }
    // Pass 4: brgy only
    if (idx.byBrgy[brgyKey]) {
      matchedSet.add(brgyKey);  passStat.brgy++;    return { row: idx.byBrgy[brgyKey],    pass: 4 };
    }
    passStat.none++;
    return null;
  };

  // Log a sample GeoJSON key vs CSV key for diagnosis
  let sampleLogged = false;

  const joined = STATE.data.geojson.features.map(feat => {
    const props = feat.properties || {};
    const code  = props[gf.code]         ? String(props[gf.code]).replace(/\.0$/, '').trim() : '';
    const brgy  = props[gf.barangay]     || '';
    const mun   = props[gf.municipality] || '';
    const prov  = props[gf.province]     || '';
    const reg   = props[gf.region]       || CONFIG.meta.region;
    const key   = Utils.makeKey(prov, mun, brgy);

    if (!sampleLogged && brgy) {
      console.log('Sample GEO normalized key:', key, '| raw:', prov, '/', mun, '/', brgy);
      val.sampleGeoKey = key;
      sampleLogged = true;
    }

    const riceResult = findRow(riceIdx, code, prov, mun, brgy, matchedRiceKeys, val.passStats);
    const cornResult = findRow(cornIdx, code, prov, mun, brgy, matchedCornKeys, val.passStats);

    const riceRow = riceResult?.row || null;
    const cornRow = cornResult?.row || null;

    const rice = riceRow ? Utils.toNumber(riceRow[rf.count]) : 0;
    const corn = cornRow ? Utils.toNumber(cornRow[cf.count]) : 0;

    // Build data quality note
    let dqNote = '';
    let passNote = '';
    if (riceResult) passNote += `rice:pass${riceResult.pass} `;
    if (cornResult) passNote += `corn:pass${cornResult.pass}`;

    if (!riceRow && !cornRow) {
      dqNote = 'No rice or corn data matched';
      val.noMatch++;
    } else if (!riceRow) {
      dqNote = 'No rice data matched';
      val.joinedCornOnly++;
      val.missingRice.push(`${brgy}, ${mun}, ${prov}`);
    } else if (!cornRow) {
      dqNote = 'No corn data matched';
      val.joinedRiceOnly++;
      val.missingCorn.push(`${brgy}, ${mun}, ${prov}`);
    } else {
      val.joinedBoth++;
      // Flag pass 3/4 matches as lower confidence
      if ((riceResult.pass >= 3 || cornResult.pass >= 3)) {
        dqNote = `Low-confidence match (pass ${Math.max(riceResult.pass, cornResult.pass)})`;
      }
    }

    const total    = rice + corn;
    const ricePct  = total > 0 ? rice / total * 100 : 0;
    const cornPct  = total > 0 ? corn / total * 100 : 0;
    const r2c      = corn > 0 ? rice / corn : (rice > 0 ? Infinity : null);
    const c2r      = rice > 0 ? corn / rice : (corn > 0 ? Infinity : null);

    let dominant = 'No Data';
    if (total > 0) {
      if (Math.abs(ricePct - cornPct) <= CONFIG.classification.balancedThreshold * 100) dominant = 'Balanced';
      else dominant = rice > corn ? 'Rice' : 'Corn';
    }

    return {
      ...feat,
      properties: {
        ...props,
        _brgy:     brgy,
        _mun:      mun,
        _prov:     prov,
        _reg:      reg,
        _code:     code,
        _key:      key,
        rice_farmers:        rice,
        corn_farmers:        corn,
        total_farmers:       total,
        rice_share_percent:  ricePct,
        corn_share_percent:  cornPct,
        rice_to_corn_ratio:  r2c,
        corn_to_rice_ratio:  c2r,
        dominant_crop:       dominant,
        priority_class:      '',
        data_quality:        dqNote || 'OK',
        _pass_note:          passNote,
      }
    };
  });

  // Find unmatched CSV rows
  const trackUnmatched = (csvRows, codeField, brgyField, munField, provField, idx, matchedSet, unmatchedArr) => {
    csvRows.forEach(row => {
      const code       = row[codeField] ? String(row[codeField]).replace(/\.0$/, '').trim() : '';
      const fullKey    = Utils.makeKey(row[provField]||'', row[munField]||'', row[brgyField]||'');
      const munBrgyKey = Utils.makeLooseKey(row[munField]||'', row[brgyField]||'');
      const brgyKey    = Utils.makeBrgyKey(row[brgyField]||'');
      const corrFull   = CONFIG.nameCorrections[fullKey] || fullKey;
      const matched = (code && (matchedSet.has(code) || matchedSet.has(code.padStart(9,'0')) || matchedSet.has(code.replace(/^0+/,'')||'0')))
        || matchedSet.has(corrFull) || matchedSet.has(munBrgyKey) || matchedSet.has(brgyKey);
      if (!matched) {
        unmatchedArr.push(`${row[brgyField]||'?'}, ${row[munField]||'?'}, ${row[provField]||'?'}`);
      }
    });
  };

  trackUnmatched(STATE.data.riceCsv, rf.code, rf.barangay, rf.municipality, rf.province, riceIdx, matchedRiceKeys, val.unmatchedRice);
  trackUnmatched(STATE.data.cornCsv, cf.code, cf.barangay, cf.municipality, cf.province, cornIdx, matchedCornKeys, val.unmatchedCorn);

  // Build joinField description
  const p1 = val.passStats.code, p2 = val.passStats.full, p3 = val.passStats.munBrgy, p4 = val.passStats.brgy;
  val.joinField = `Code:${p1} | Full key:${p2} | Mun+Brgy:${p3} | Brgy only:${p4} | No match:${val.passStats.none}`;

  console.log('Join results — both:', val.joinedBoth, '| rice only:', val.joinedRiceOnly,
    '| corn only:', val.joinedCornOnly, '| no match:', val.noMatch);
  console.log('Pass stats:', val.passStats);
  console.log('Unmatched rice (first 5):', val.unmatchedRice.slice(0,5));
  console.log('Unmatched corn (first 5):', val.unmatchedCorn.slice(0,5));

  if (val.unmatchedRice.length > 0) {
    const sampleCsvRow = STATE.data.riceCsv[0];
    const sampleKey = Utils.makeKey(sampleCsvRow[rf.province]||'', sampleCsvRow[rf.municipality]||'', sampleCsvRow[rf.barangay]||'');
    console.log('Sample CSV normalized key:', sampleKey, '| raw row:', sampleCsvRow);
    val.sampleCsvKey = sampleKey;
  }

  console.groupEnd();

  assignPriorityClasses(joined, 'total_farmers');

  STATE.data.joined    = joined;
  STATE.data.validation = val;
}

// ====================================================================
// SECTION 7: PRIORITY CLASSIFICATION
// ====================================================================
function assignPriorityClasses(features, variable) {
  const vals = features
    .map(f => f.properties[variable])
    .filter(v => v !== null && !isNaN(v) && v > 0);

  if (vals.length === 0) return;
  vals.sort((a,b) => a-b);

  const q = (p) => {
    const idx = Math.floor(p * vals.length);
    return vals[Math.min(idx, vals.length-1)];
  };

  const breaks = [q(0.2), q(0.4), q(0.6), q(0.8)];

  features.forEach(f => {
    const v = f.properties[variable];
    if (!v || isNaN(v) || v === 0) {
      f.properties.priority_class = 'Watchlist';
    } else if (v > breaks[3]) {
      f.properties.priority_class = 'Very High';
    } else if (v > breaks[2]) {
      f.properties.priority_class = 'High';
    } else if (v > breaks[1]) {
      f.properties.priority_class = 'Moderate';
    } else if (v > breaks[0]) {
      f.properties.priority_class = 'Low';
    } else {
      f.properties.priority_class = 'Watchlist';
    }
  });
}

// ====================================================================
// SECTION 8: AGGREGATIONS
// ====================================================================
function buildMunicipalSummary() {
  const munMap = {};
  STATE.data.joined.forEach(feat => {
    const p = feat.properties;
    const key = Utils.normalize(p._prov) + '|' + Utils.normalize(p._mun);
    if (!munMap[key]) {
      munMap[key] = {
        _mun: p._mun, _prov: p._prov, _reg: p._reg,
        rice_farmers: 0, corn_farmers: 0, total_farmers: 0,
        barangay_count: 0, with_rice: 0, with_corn: 0, missing: 0,
      };
    }
    const m = munMap[key];
    m.rice_farmers  += p.rice_farmers || 0;
    m.corn_farmers  += p.corn_farmers || 0;
    m.total_farmers += p.total_farmers || 0;
    m.barangay_count++;
    if (p.rice_farmers > 0) m.with_rice++;
    if (p.corn_farmers > 0) m.with_corn++;
    if (p.data_quality !== 'OK') m.missing++;
  });

  STATE.data.municipalSummary = Object.values(munMap).map(m => {
    const t = m.total_farmers;
    const ricePct = t > 0 ? m.rice_farmers/t*100 : 0;
    const cornPct = t > 0 ? m.corn_farmers/t*100 : 0;
    let dominant = 'No Data';
    if (t > 0) {
      if (Math.abs(ricePct-cornPct) <= CONFIG.classification.balancedThreshold*100) dominant = 'Balanced';
      else dominant = m.rice_farmers > m.corn_farmers ? 'Rice' : 'Corn';
    }
    return { ...m, rice_share_percent: ricePct, corn_share_percent: cornPct,
      dominant_crop: dominant, priority_class: '' };
  });

  assignPriorityClasses(
    STATE.data.municipalSummary.map(m => ({ properties: m })),
    'total_farmers'
  );
  STATE.data.municipalSummary.forEach((m, i) => {
    m.priority_class = STATE.data.municipalSummary[i].priority_class || 'Watchlist';
  });
}

function buildProvincialSummary() {
  const provMap = {};
  STATE.data.joined.forEach(feat => {
    const p = feat.properties;
    const key = Utils.normalize(p._prov);
    if (!provMap[key]) {
      provMap[key] = {
        _prov: p._prov, _reg: p._reg,
        rice_farmers: 0, corn_farmers: 0, total_farmers: 0,
        barangay_count: 0, with_rice: 0, with_corn: 0, missing: 0,
        municipalities: new Set(),
      };
    }
    const pv = provMap[key];
    pv.rice_farmers  += p.rice_farmers  || 0;
    pv.corn_farmers  += p.corn_farmers  || 0;
    pv.total_farmers += p.total_farmers || 0;
    pv.barangay_count++;
    pv.municipalities.add(Utils.normalize(p._mun));
    if (p.rice_farmers > 0) pv.with_rice++;
    if (p.corn_farmers > 0) pv.with_corn++;
    if (p.data_quality !== 'OK') pv.missing++;
  });

  STATE.data.provinceSummary = Object.values(provMap).map(pv => {
    const t = pv.total_farmers;
    const ricePct = t > 0 ? pv.rice_farmers/t*100 : 0;
    const cornPct = t > 0 ? pv.corn_farmers/t*100 : 0;
    let dominant = 'No Data';
    if (t > 0) {
      if (Math.abs(ricePct-cornPct) <= CONFIG.classification.balancedThreshold*100) dominant = 'Balanced';
      else dominant = pv.rice_farmers > pv.corn_farmers ? 'Rice' : 'Corn';
    }
    const muns = pv.municipalities;
    return {
      ...pv,
      municipalities: undefined,
      municipality_count: muns.size,
      rice_share_percent: ricePct,
      corn_share_percent: cornPct,
      rice_to_corn_ratio: pv.corn_farmers > 0 ? pv.rice_farmers/pv.corn_farmers : null,
      corn_to_rice_ratio: pv.rice_farmers > 0 ? pv.corn_farmers/pv.rice_farmers : null,
      dominant_crop: dominant,
      priority_class: '',
    };
  });

  assignPriorityClasses(
    STATE.data.provinceSummary.map(m => ({ properties: m })),
    'total_farmers'
  );
}

// ====================================================================
// SECTION 9: CLASSIFICATION BREAKS
// ====================================================================
function getBreaks(values, method, numClasses) {
  const sorted = [...values].filter(v => v !== null && !isNaN(v) && v >= 0).sort((a,b) => a-b);
  if (sorted.length === 0) return [0];
  const min = sorted[0], max = sorted[sorted.length-1];
  if (min === max) return [min];

  if (method === 'quantile') {
    const breaks = [];
    for (let i = 1; i < numClasses; i++) {
      const idx = Math.floor(i * sorted.length / numClasses);
      breaks.push(sorted[idx]);
    }
    return [...new Set([min, ...breaks, max])];
  }

  if (method === 'equalInterval') {
    const step = (max - min) / numClasses;
    const breaks = [];
    for (let i = 1; i < numClasses; i++) breaks.push(min + i * step);
    return [min, ...breaks, max];
  }

  if (method === 'naturalBreaks') {
    return jenksBreaks(sorted, numClasses);
  }

  if (method === 'stdDev') {
    const mean = sorted.reduce((a,b) => a+b, 0) / sorted.length;
    const std  = Math.sqrt(sorted.reduce((s,v) => s + Math.pow(v-mean,2), 0) / sorted.length);
    return [mean - 2*std, mean - std, mean, mean + std, mean + 2*std].filter(v => v >= min && v <= max);
  }

  return [min, max];
}

function jenksBreaks(sorted, numClasses) {
  if (sorted.length <= numClasses) return sorted;
  const n = sorted.length;
  const mat1 = Array.from({length: n+1}, () => new Array(numClasses+1).fill(0));
  const mat2 = Array.from({length: n+1}, () => new Array(numClasses+1).fill(Infinity));
  for (let i = 1; i <= numClasses; i++) { mat1[1][i] = 1; mat2[1][i] = 0; }
  for (let j = 2; j <= n; j++) mat2[j][1] = Infinity;

  for (let l = 2; l <= n; l++) {
    let s1=0, s2=0, w=0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1;
      const val = sorted[i3-1];
      w++;
      s2 += val * val;
      s1 += val;
      const v = s2 - (s1*s1)/w;
      const i4 = i3 - 1;
      if (i4 !== 0) {
        for (let j2 = 2; j2 <= numClasses; j2++) {
          if (mat2[l][j2] >= v + mat2[i4][j2-1]) {
            mat1[l][j2] = i3;
            mat2[l][j2] = v + mat2[i4][j2-1];
          }
        }
      }
    }
    mat1[l][1] = 1;
    mat2[l][1] = s2 - (s1*s1)/w;
  }

  const k = n;
  const kclass = new Array(numClasses+1).fill(0);
  kclass[numClasses] = sorted[k-1];
  kclass[1] = sorted[0];
  let countNum = numClasses;
  let id = k;
  while (countNum >= 2) {
    const idx = mat1[id][countNum] - 2;
    kclass[countNum-1] = sorted[idx];
    id = mat1[id][countNum] - 1;
    countNum--;
  }
  return kclass.slice(1);
}

function getColorForValue(val, breaks, palette) {
  if (val === null || val === undefined || isNaN(val) || val === 0) return '#cccccc';
  for (let i = 0; i < breaks.length - 1; i++) {
    if (val <= breaks[i+1]) return palette[Math.min(i, palette.length-1)];
  }
  return palette[palette.length-1];
}

function getColorContinuous(val, min, max, palette) {
  if (val === null || isNaN(val) || max === min) return '#cccccc';
  const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
  const idx = t * (palette.length - 2);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, palette.length - 1);
  return Utils.lerpColor(palette[lo], palette[hi], idx - lo);
}

// ====================================================================
// SECTION 10: DEMO DATA GENERATORS
// ====================================================================
function buildDemoGeoJSON() {
  // Generates synthetic barangay-like polygons for Cagayan Valley region
  const provinces = [
    { name: 'Cagayan',       lat: 17.7,  lng: 121.8, muns: ['Tuguegarao City', 'Abulug', 'Alcala', 'Allacapan', 'Amulung'] },
    { name: 'Isabela',       lat: 16.9,  lng: 121.8, muns: ['Ilagan City',     'Cauayan City', 'Santiago City', 'Angadanan', 'Aurora'] },
    { name: 'Nueva Vizcaya', lat: 16.3,  lng: 121.1, muns: ['Bayombong',       'Solano',       'Bambang',       'Kasibu',   'Kayapa'] },
    { name: 'Quirino',       lat: 16.3,  lng: 121.6, muns: ['Cabarroguis',     'Diffun',       'Maddela',       'Nagtipunan','Saguday'] },
    { name: 'Batanes',       lat: 20.4,  lng: 121.9, muns: ['Basco',           'Itbayat',      'Ivana',         'Mahatao',  'Sabtang'] },
  ];
  const brgyNames = ['Poblacion','San Antonio','San Jose','San Pedro','Santa Maria',
    'Santo Tomas','Bagumbayan','Magsaysay','Rizal','Mabini',
    'Roxas','Quezon','Bonifacio','Del Pilar','Luna',
    'Annafunan East','Annafunan West','Caccam','Calaccab','Carig'];

  const features = [];
  let id = 100000;
  provinces.forEach(prov => {
    prov.muns.forEach((mun, mi) => {
      const baseLat = prov.lat + (mi - 2) * 0.15;
      const baseLng = prov.lng + (mi % 3 - 1) * 0.18;
      for (let b = 0; b < 12; b++) {
        const bLat = baseLat + (Math.random() - 0.5) * 0.12;
        const bLng = baseLng + (Math.random() - 0.5) * 0.14;
        const sz = 0.04 + Math.random() * 0.03;
        const coords = [[
          [bLng,      bLat],
          [bLng+sz,   bLat+sz*0.3],
          [bLng+sz*1.2, bLat+sz],
          [bLng+sz*0.5, bLat+sz*1.3],
          [bLng-sz*0.2, bLat+sz],
          [bLng,        bLat],
        ]];
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: coords },
          properties: {
            PSGC:      String(id++),
            brgy_name: brgyNames[b % brgyNames.length] + (b > 9 ? ' '+Math.ceil(b/10) : ''),
            mun_name:  mun,
            prov_name: prov.name,
            reg_name:  'Region II',
          }
        });
      }
    });
  });
  return { type: 'FeatureCollection', features };
}

function buildDemoRiceCSV(geojson) {
  return geojson.features.map(f => {
    const p = f.properties;
    // Generate realistic data: more rice in Cagayan & Isabela
    const base = (['Cagayan','Isabela'].includes(p.prov_name)) ? 350 : 150;
    const rice = Math.max(0, Math.floor(base + (Math.random()-0.3)*200));
    return {
      PSGC: p.PSGC,
      brgy_name: p.brgy_name,
      mun_name:  p.mun_name,
      prov_name: p.prov_name,
      rice_farmers: rice,
    };
  });
}

function buildDemoCornCSV(geojson) {
  return geojson.features.map(f => {
    const p = f.properties;
    // Generate realistic data: more corn in Nueva Vizcaya & Quirino
    const base = (['Nueva Vizcaya','Quirino'].includes(p.prov_name)) ? 280 : 120;
    const corn = Math.max(0, Math.floor(base + (Math.random()-0.3)*160));
    return {
      PSGC: p.PSGC,
      brgy_name: p.brgy_name,
      mun_name:  p.mun_name,
      prov_name: p.prov_name,
      corn_farmers: corn,
    };
  });
}

// ====================================================================
// SECTION 11: MAP INITIALIZATION
// ====================================================================
const BASEMAPS = {
  'carto-light': L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    { attribution: '© OpenStreetMap contributors © CARTO', subdomains:'abcd', maxZoom:19 }
  ),
  'osm': L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap contributors', maxZoom:19 }
  ),
  'carto-dark': L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { attribution: '© OpenStreetMap contributors © CARTO', subdomains:'abcd', maxZoom:19 }
  ),
  'esri-imagery': L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles © Esri', maxZoom:19 }
  ),
  'esri-topo': L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles © Esri', maxZoom:19 }
  ),
  'otopo': L.tileLayer(
    'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenTopoMap', maxZoom:17 }
  ),
};

function initMap() {
  STATE.map = L.map('map', {
    center: CONFIG.defaults.center,
    zoom: CONFIG.defaults.zoom,
    zoomControl: true,
    preferCanvas: true,
  });

  BASEMAPS[STATE.basemap].addTo(STATE.map);
}

// ====================================================================
// SECTION 12: LAYER RENDERING
// ====================================================================
function renderMap() {
  clearLayers();

  const view   = STATE.view;
  const style  = STATE.mapStyle;
  const variable = STATE.variable;

  if (view === 'barangay')    renderBarangayLayer(style, variable);
  else if (view === 'municipality') renderMunicipalLayer(style, variable);
  else if (view === 'province') renderProvinceLayer(style, variable);

  updateLegend();
  updateDashboard();
  updateTable();
  updateChart();
  updateInterpretation();
  updateValidationPanel();
}

function clearLayers() {
  Object.values(STATE.layers).forEach(l => { if (l) STATE.map.removeLayer(l); });
  STATE.layers = { barangay: null, municipality: null, province: null, circles: null, pies: null };
}

// ------- BARANGAY LAYER -------
function renderBarangayLayer(style, variable) {
  const features = getFilteredFeatures();

  if (['choropleth','gradient','deviation','priority','ratio','dominant'].includes(style)) {
    STATE.layers.barangay = L.geoJSON(
      { type:'FeatureCollection', features },
      {
        style: (feat) => getPolygonStyle(feat, style, variable),
        onEachFeature: (feat, layer) => bindFeatureEvents(feat, layer, 'barangay'),
      }
    ).addTo(STATE.map);

  } else if (['proportional','graduated','pie','bar'].includes(style)) {
    // Base outline layer
    STATE.layers.barangay = L.geoJSON(
      { type:'FeatureCollection', features },
      {
        style: () => ({ fillColor:'transparent', weight:0.7, color:'#888', opacity:0.5, fillOpacity:0 }),
        onEachFeature: (feat, layer) => bindFeatureEvents(feat, layer, 'barangay'),
      }
    ).addTo(STATE.map);
    renderSymbolLayer(features, style, variable);

  } else if (style === 'bivariate') {
    STATE.layers.barangay = L.geoJSON(
      { type:'FeatureCollection', features },
      {
        style: (feat) => getBivariateStyle(feat),
        onEachFeature: (feat, layer) => bindFeatureEvents(feat, layer, 'barangay'),
      }
    ).addTo(STATE.map);

  } else if (style === 'ranked') {
    renderRankedLayer(features, variable);

  } else if (style === 'boundary') {
    STATE.layers.barangay = L.geoJSON(
      { type:'FeatureCollection', features },
      {
        style: () => ({ fillColor:'transparent', fillOpacity:0, weight:1.2, color:'#2d8c4e', opacity:0.8 }),
        onEachFeature: (feat, layer) => bindFeatureEvents(feat, layer, 'barangay'),
      }
    ).addTo(STATE.map);
  }

  // Fit map to data
  if (STATE.layers.barangay) {
    try { STATE.map.fitBounds(STATE.layers.barangay.getBounds(), { padding:[20,20] }); } catch(e) {}
  }
}

// ------- POLYGON STYLE -------
function getPolygonStyle(feat, style, variable) {
  const p = feat.properties;
  const val = p[variable];
  const base = { weight:0.8, opacity:0.9, fillOpacity:0.75 };

  if (style === 'boundary') return { ...base, fillColor:'transparent', fillOpacity:0, color:'#555' };

  if (style === 'dominant') {
    const col = COLORS.dominant[p.dominant_crop?.toLowerCase()] || COLORS.dominant.nodata;
    return { ...base, fillColor:col, color: '#fff', weight:0.5 };
  }

  if (style === 'priority') {
    const col = COLORS.priority[p.priority_class] || '#ccc';
    return { ...base, fillColor:col, color:'#fff', weight:0.5 };
  }

  if (style === 'ratio') {
    const r = p.rice_to_corn_ratio;
    let cls = 'Balanced';
    if (!r || isNaN(r)) cls = 'Balanced';
    else if (r > 3) cls = 'Strong Rice';
    else if (r > 1.5) cls = 'Mod. Rice';
    else if (r < 0.33) cls = 'Strong Corn';
    else if (r < 0.67) cls = 'Mod. Corn';
    return { ...base, fillColor: COLORS.ratio[cls] || '#ccc', color:'#fff', weight:0.5 };
  }

  // Numeric choropleth/gradient/deviation
  const palette = getPaletteForVariable(variable);
  const allVals = getActiveFeatures().map(f => f.properties[variable]).filter(v => v > 0);

  if (style === 'gradient') {
    const min = Math.min(...allVals), max = Math.max(...allVals);
    const col = val > 0 ? getColorContinuous(val, min, max, palette) : '#e0e0e0';
    return { ...base, fillColor:col, color:'rgba(255,255,255,0.5)', weight:0.5 };
  }

  if (style === 'deviation') {
    const col = getDeviationColor(val, p, variable);
    return { ...base, fillColor:col, color:'#fff', weight:0.5 };
  }

  // Choropleth
  const breaks = getClassBreaks(allVals, variable);
  const col = val > 0 ? getColorForValue(val, breaks, palette) : '#e0e0e0';
  return { ...base, fillColor:col, color:'rgba(255,255,255,0.4)', weight:0.5 };
}

function getPaletteForVariable(variable) {
  if (variable === 'rice_farmers' || variable === 'rice_share_percent') return COLORS.rice5;
  if (variable === 'corn_farmers' || variable === 'corn_share_percent') return COLORS.corn5;
  return COLORS.total5;
}

function getClassBreaks(vals, variable) {
  const key = variable + '_' + STATE.classification;
  if (STATE.breaks[key]) return STATE.breaks[key];
  const b = getBreaks(vals, STATE.classification, 5);
  STATE.breaks[key] = b;
  return b;
}

function getDeviationColor(val, p, variable) {
  const allFeats = getActiveFeatures();
  let compareVals = allFeats.map(f => f.properties[variable]).filter(v => v > 0);

  if (STATE.deviationBase === 'provincial') {
    compareVals = allFeats.filter(f => f.properties._prov === p._prov).map(f => f.properties[variable]).filter(v => v > 0);
  } else if (STATE.deviationBase === 'municipal') {
    compareVals = allFeats.filter(f => f.properties._mun === p._mun).map(f => f.properties[variable]).filter(v => v > 0);
  }

  if (compareVals.length === 0) return '#ccc';
  const mean = compareVals.reduce((a,b)=>a+b,0)/compareVals.length;
  const std  = Math.sqrt(compareVals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/compareVals.length);

  if (!val || val === 0) return '#eeeeee';
  const z = (val - mean) / (std || 1);
  if (z > 1.5)       return COLORS.deviation['Far Above'];
  else if (z > 0.5)  return COLORS.deviation['Above'];
  else if (z > -0.5) return COLORS.deviation['Near Avg'];
  else if (z > -1.5) return COLORS.deviation['Below'];
  else               return COLORS.deviation['Far Below'];
}

function getBivariateStyle(feat) {
  const p = feat.properties;
  const allVals = getActiveFeatures().map(f => f.properties);
  const riceVals = allVals.map(a => a.rice_farmers).filter(v=>v>0).sort((a,b)=>a-b);
  const cornVals = allVals.map(a => a.corn_farmers).filter(v=>v>0).sort((a,b)=>a-b);

  const rq = (v, arr) => {
    if (!v || arr.length === 0) return 'L';
    const p = v / arr[arr.length-1];
    if (p > 0.67) return 'H';
    if (p > 0.33) return 'M';
    return 'L';
  };

  const riceQ = rq(p.rice_farmers, riceVals);
  const cornQ = rq(p.corn_farmers, cornVals);
  const col = COLORS.bivariate[cornQ+''+riceQ] || '#ccc';
  return { weight:0.5, opacity:0.9, color:'rgba(255,255,255,0.4)', fillColor:col, fillOpacity:0.8 };
}

// ------- SYMBOL LAYERS -------
function renderSymbolLayer(features, style, variable) {
  const circleGroup = L.layerGroup().addTo(STATE.map);
  STATE.layers.circles = circleGroup;

  const allVals = features.map(f => f.properties[variable]).filter(v => v > 0);
  const maxVal  = Math.max(...allVals, 1);
  const breaks  = getClassBreaks(allVals, variable);
  const palette = getPaletteForVariable(variable);

  features.forEach(feat => {
    const p = feat.properties;
    const val = p[variable];
    if (!val || val === 0) return;

    const center = getCentroid(feat.geometry);
    if (!center) return;

    if (style === 'proportional' || style === 'graduated') {
      const maxR = 30, minR = 4;
      let radius;
      if (style === 'proportional') {
        radius = minR + (maxR - minR) * Math.sqrt(val / maxVal);
      } else {
        const classIdx = breaks.findIndex((b, i) => val <= (breaks[i+1] || Infinity));
        radius = minR + (maxR - minR) * (classIdx / (breaks.length - 2));
      }
      const col = getColorForValue(val, breaks, palette);
      L.circleMarker(center, {
        radius, fillColor:col, color:'white', weight:1.5,
        fillOpacity:0.8, opacity:0.9
      })
      .bindTooltip(buildTooltip(p), { sticky:true, opacity:1 })
      .addTo(circleGroup);

    } else if (style === 'pie') {
      const canvas = buildPieCanvas(p, Math.max(16, Math.min(40, 8 + Math.sqrt(p.total_farmers / maxVal) * 32)));
      if (canvas) {
        const icon = L.divIcon({ html: canvas, className:'', iconAnchor:[canvas._r, canvas._r] });
        L.marker(center, { icon })
          .bindTooltip(buildTooltip(p), { sticky:true, opacity:1 })
          .addTo(circleGroup);
      }

    } else if (style === 'bar') {
      const canvas = buildBarCanvas(p);
      if (canvas) {
        const icon = L.divIcon({ html: canvas, className:'', iconAnchor:[20, 30] });
        L.marker(center, { icon })
          .bindTooltip(buildTooltip(p), { sticky:true, opacity:1 })
          .addTo(circleGroup);
      }
    }
  });
}

function getCentroid(geometry) {
  try {
    if (geometry.type === 'Polygon') {
      const coords = geometry.coordinates[0];
      let lat=0, lng=0;
      coords.forEach(c => { lng+=c[0]; lat+=c[1]; });
      return [lat/coords.length, lng/coords.length];
    }
    if (geometry.type === 'MultiPolygon') {
      const coords = geometry.coordinates[0][0];
      let lat=0, lng=0;
      coords.forEach(c => { lng+=c[0]; lat+=c[1]; });
      return [lat/coords.length, lng/coords.length];
    }
  } catch(e) {}
  return null;
}

function buildPieCanvas(p, r) {
  if (!p.total_farmers) return null;
  const size = r * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rice = p.rice_share_percent / 100;
  const corn = 1 - rice;

  ctx.beginPath();
  ctx.moveTo(r,r);
  ctx.arc(r,r,r-1, -Math.PI/2, -Math.PI/2 + rice * Math.PI*2);
  ctx.closePath();
  ctx.fillStyle = '#2d8c4e';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(r,r);
  ctx.arc(r,r,r-1, -Math.PI/2 + rice*Math.PI*2, -Math.PI/2 + Math.PI*2);
  ctx.closePath();
  ctx.fillStyle = '#d4820a';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(r,r,r-1,0,Math.PI*2);
  ctx.strokeStyle='white'; ctx.lineWidth=1.5; ctx.stroke();

  const out = canvas.outerHTML || canvas.toDataURL();
  canvas._r = r;
  return canvas.outerHTML;
}

function buildBarCanvas(p) {
  const w=40, h=30, pad=3;
  const canvas = document.createElement('canvas');
  canvas.width=w; canvas.height=h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle='rgba(255,255,255,0.85)';
  ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#ccc'; ctx.lineWidth=0.5;
  ctx.strokeRect(0,0,w,h);

  const maxVal = Math.max(p.rice_farmers, p.corn_farmers, 1);
  const bw = (w-pad*3)/2;

  // Rice bar
  const rh = Math.max(1, (p.rice_farmers/maxVal)*(h-pad*2));
  ctx.fillStyle='#2d8c4e';
  ctx.fillRect(pad, h-pad-rh, bw, rh);

  // Corn bar
  const ch = Math.max(1, (p.corn_farmers/maxVal)*(h-pad*2));
  ctx.fillStyle='#d4820a';
  ctx.fillRect(pad*2+bw, h-pad-ch, bw, ch);

  return canvas.outerHTML;
}

function renderRankedLayer(features, variable) {
  const sorted = [...features]
    .filter(f => f.properties[variable] > 0)
    .sort((a,b) => b.properties[variable] - a.properties[variable])
    .slice(0, STATE.rankedN);

  const rankedKeys = new Set(sorted.map(f => f.properties._code || f.properties._key));

  STATE.layers.barangay = L.geoJSON(
    { type:'FeatureCollection', features },
    {
      style: (feat) => {
        const key = feat.properties._code || feat.properties._key;
        const isTop = rankedKeys.has(key);
        const rank = sorted.findIndex(f => (f.properties._code || f.properties._key) === key);
        let col = '#e8eaed';
        if (isTop) {
          const t = 1 - (rank / STATE.rankedN);
          const palette = getPaletteForVariable(variable);
          col = palette[Math.floor(t * (palette.length-1))];
        }
        return {
          fillColor: col,
          fillOpacity: isTop ? 0.85 : 0.2,
          weight: isTop ? 1.5 : 0.4,
          color: isTop ? '#fff' : '#ccc',
          opacity: 0.9,
        };
      },
      onEachFeature: (feat, layer) => bindFeatureEvents(feat, layer, 'barangay'),
    }
  ).addTo(STATE.map);

  // Add rank labels for top entries
  sorted.slice(0, Math.min(20, STATE.rankedN)).forEach((feat, rank) => {
    const center = getCentroid(feat.geometry);
    if (!center) return;
    L.marker(center, {
      icon: L.divIcon({
        html: `<div style="background:${rank<3?'#d4af37':'#1a6e3c'};color:white;border-radius:50%;width:18px;height:18px;line-height:18px;text-align:center;font-size:9px;font-weight:700;font-family:'IBM Plex Mono',monospace;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${rank+1}</div>`,
        className:'',
        iconAnchor:[9,9],
      })
    }).addTo(STATE.map);
  });
}

// ------- MUNICIPAL / PROVINCE DISSOLVE LAYERS -------
function renderMunicipalLayer(style, variable) {
  const munFeatures = buildDissolvedFeatures('municipality');
  renderGenericLayer(munFeatures, style, variable, 'municipality');
}

function renderProvinceLayer(style, variable) {
  const provFeatures = buildDissolvedFeatures('province');
  renderGenericLayer(provFeatures, style, variable, 'province');
}

function buildDissolvedFeatures(level) {
  // Use bounding-box approximation for browser-based dissolve
  // (Full polygon union requires turf.js, which we load here)
  const map = {};
  STATE.data.joined.forEach(feat => {
    const p = feat.properties;
    const key = level === 'province' ? Utils.normalize(p._prov) : Utils.normalize(p._prov) + '|' + Utils.normalize(p._mun);

    if (!map[key]) {
      map[key] = {
        coords: [],
        props: level === 'province'
          ? STATE.data.provinceSummary.find(ps => Utils.normalize(ps._prov) === Utils.normalize(p._prov))
          : STATE.data.municipalSummary.find(ms => Utils.normalize(ms._prov) === Utils.normalize(p._prov) && Utils.normalize(ms._mun) === Utils.normalize(p._mun)),
      };
    }
    // Collect all polygon vertices for bounding box
    const geom = feat.geometry;
    const addCoords = (ring) => ring.forEach(c => map[key].coords.push(c));
    if (geom.type === 'Polygon') addCoords(geom.coordinates[0]);
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(poly => addCoords(poly[0]));
  });

  return Object.entries(map).map(([key, { coords, props }]) => {
    if (!props || coords.length === 0) return null;
    // Build convex-hull-like polygon from collected vertices
    const hull = convexHull(coords);
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [hull] },
      properties: {
        ...props,
        _brgy: props?._mun || props?._prov || key,
        _mun:  props?._mun || '',
        _prov: props?._prov || '',
      }
    };
  }).filter(Boolean);
}

function convexHull(points) {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const cross = (o,a,b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length-1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  const hull = lower.concat(upper);
  hull.push(hull[0]); // close ring
  return hull;
}

function renderGenericLayer(features, style, variable, levelType) {
  const layer = L.geoJSON(
    { type:'FeatureCollection', features },
    {
      style: (feat) => {
        const p = feat.properties;
        const val = p[variable];
        if (!val || isNaN(val)) return { fillColor:'#e0e0e0', weight:2, color:'#888', fillOpacity:0.65, opacity:0.9 };

        const allVals = features.map(f => f.properties[variable]).filter(v=>v>0);
        const palette = getPaletteForVariable(variable);

        if (style === 'dominant') {
          return { fillColor: COLORS.dominant[p.dominant_crop?.toLowerCase()]||'#ccc', weight:2.5, color:'white', fillOpacity:0.8, opacity:0.9 };
        }
        if (style === 'priority') {
          return { fillColor: COLORS.priority[p.priority_class]||'#ccc', weight:2.5, color:'white', fillOpacity:0.8, opacity:0.9 };
        }

        const breaks = getBreaks(allVals, STATE.classification, 5);
        const col    = getColorForValue(val, breaks, palette);
        return { fillColor:col, weight:2, color:'white', fillOpacity:0.78, opacity:0.9 };
      },
      onEachFeature: (feat, layer) => bindFeatureEvents(feat, layer, levelType),
    }
  );

  if (levelType === 'municipality') STATE.layers.municipality = layer.addTo(STATE.map);
  else STATE.layers.province = layer.addTo(STATE.map);

  if (layer) {
    try { STATE.map.fitBounds(layer.getBounds(), { padding:[20,20] }); } catch(e) {}
  }
}

// ====================================================================
// SECTION 13: TOOLTIPS & POPUPS
// ====================================================================
function buildTooltip(p) {
  const val = p[STATE.variable];
  const varLabel = getVariableLabel(STATE.variable);
  const valStr = typeof val === 'number' ? Utils.fmt(val) : (val || '—');
  return `<div class="tooltip-name">${p._brgy || p._mun || p._prov}</div>
    <div class="tooltip-loc">${[p._mun, p._prov].filter(Boolean).join(', ')}</div>
    <div class="tooltip-value">${varLabel}: <b>${valStr}</b></div>
    <div class="tooltip-dom">Dominant: ${p.dominant_crop || '—'}</div>`;
}

function buildPopupContent(p) {
  const r2c = p.rice_to_corn_ratio;
  const c2r = p.corn_to_rice_ratio;
  const r2cStr = (r2c === Infinity || r2c === null) ? (p.rice_farmers > 0 ? 'Rice only' : '—') : Utils.fmtRatio(r2c);
  const c2rStr = (c2r === Infinity || c2r === null) ? (p.corn_farmers > 0 ? 'Corn only' : '—') : Utils.fmtRatio(c2r);
  const dqClass = p.data_quality === 'OK' ? '' : 'popup-quality-note';

  return `<div class="popup-inner">
    <div class="popup-header">
      <div class="popup-brgy-name">${p._brgy || p._mun || p._prov || '—'}</div>
      <div class="popup-location">${[p._mun, p._prov].filter(Boolean).join(', ')}</div>
    </div>
    <div class="popup-grid">
      <div class="popup-metric"><div class="popup-metric-label">🌾 Rice Farms</div><div class="popup-metric-value rice">${Utils.fmt(p.rice_farmers)}</div></div>
      <div class="popup-metric"><div class="popup-metric-label">🌽 Corn Farms</div><div class="popup-metric-value corn">${Utils.fmt(p.corn_farmers)}</div></div>
      <div class="popup-metric full"><div class="popup-metric-label">🌿 Total Farms</div><div class="popup-metric-value total">${Utils.fmt(p.total_farmers)}</div></div>
      <div class="popup-metric"><div class="popup-metric-label">Rice Share</div><div class="popup-metric-value">${Utils.fmtPct(p.rice_share_percent)}</div></div>
      <div class="popup-metric"><div class="popup-metric-label">Corn Share</div><div class="popup-metric-value">${Utils.fmtPct(p.corn_share_percent)}</div></div>
      <div class="popup-metric"><div class="popup-metric-label">Rice:Corn Ratio</div><div class="popup-metric-value">${r2cStr}</div></div>
      <div class="popup-metric"><div class="popup-metric-label">Corn:Rice Ratio</div><div class="popup-metric-value">${c2rStr}</div></div>
    </div>
    <div class="popup-tags">
      <span class="dom-chip ${Utils.domClass(p.dominant_crop)}">🌾 ${p.dominant_crop || 'No Data'}</span>
      <span class="pri-chip pri-${Utils.domPriority(p.priority_class)}">★ ${p.priority_class || 'Watchlist'}</span>
    </div>
    ${p.data_quality && p.data_quality !== 'OK' ? `<div class="popup-quality-note">⚠️ ${p.data_quality}</div>` : ''}
  </div>`;
}

function bindFeatureEvents(feat, layer, levelType) {
  const p = feat.properties;

  layer.bindTooltip(buildTooltip(p), { sticky:true, opacity:1 });
  layer.bindPopup(buildPopupContent(p), { maxWidth:360 });

  layer.on('mouseover', function(e) {
    this.setStyle({ weight: 2.5, opacity: 1, fillOpacity: 0.9 });
    this.bringToFront();
  });

  layer.on('mouseout', function(e) {
    // Restore original style
    const stl = getPolygonStyle(feat, STATE.mapStyle, STATE.variable);
    if (STATE.layers.barangay) STATE.layers.barangay.resetStyle(this);
    if (STATE.layers.municipality) STATE.layers.municipality.resetStyle(this);
    if (STATE.layers.province) STATE.layers.province.resetStyle(this);
  });

  layer.on('click', function(e) {
    this.openPopup();
  });
}


// ====================================================================
// SECTION 14: LEGEND
// ====================================================================
function updateLegend() {
  const title = document.getElementById('legend-title');
  const content = document.getElementById('legend-content');
  const style = STATE.mapStyle;
  const variable = STATE.variable;
  const varLabel = getVariableLabel(variable);
  title.textContent = varLabel;

  content.innerHTML = '';

  if (style === 'dominant' || variable === 'dominant_crop') {
    [['Rice','#2d8c4e'],['Corn','#d4820a'],['Balanced','#2c7bb6'],['No Data','#c8c8c8']].forEach(([label,col]) => {
      content.innerHTML += `<div class="legend-item"><span class="legend-color" style="background:${col}"></span>${label}</div>`;
    });

  } else if (style === 'priority' || variable === 'priority_class') {
    Object.entries(COLORS.priority).forEach(([label,col]) => {
      content.innerHTML += `<div class="legend-item"><span class="legend-color" style="background:${col}"></span>${label}</div>`;
    });

  } else if (style === 'ratio') {
    Object.entries(COLORS.ratio).forEach(([label,col]) => {
      content.innerHTML += `<div class="legend-item"><span class="legend-color" style="background:${col}"></span>${label}</div>`;
    });

  } else if (style === 'deviation') {
    Object.entries(COLORS.deviation).forEach(([label,col]) => {
      content.innerHTML += `<div class="legend-item"><span class="legend-color" style="background:${col}"></span>${label}</div>`;
    });

  } else if (style === 'bivariate') {
    content.innerHTML = `
      <div style="font-size:10px;color:#888;margin-bottom:4px">Rice (→) × Corn (↑)</div>
      <div class="bivariate-legend">
        ${['H','M','L'].map(r =>
          ['L','M','H'].map(c =>
            `<div class="biv-cell" style="background:${COLORS.bivariate[r+c]}" title="${c}-Rice, ${r}-Corn"></div>`
          ).join('')
        ).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:#888;margin-top:2px"><span>Low Rice</span><span>High Rice</span></div>`;

  } else if (style === 'pie') {
    content.innerHTML = `
      <div class="legend-item"><span class="legend-color" style="background:#2d8c4e"></span>Rice Farms</div>
      <div class="legend-item"><span class="legend-color" style="background:#d4820a"></span>Corn Farms</div>
      <div style="font-size:10px;color:#888;margin-top:4px">Circle size ∝ total farms</div>`;

  } else if (['choropleth','gradient','proportional','graduated','ranked'].includes(style)) {
    const palette = getPaletteForVariable(variable);
    const allVals = getActiveFeatures().map(f => f.properties[variable]).filter(v=>v>0);
    if (allVals.length === 0) { content.innerHTML = '<div class="text-muted">No data</div>'; return; }

    const breaks = style === 'gradient'
      ? [Math.min(...allVals), ...palette.map((_,i) => Math.min(...allVals) + (Math.max(...allVals)-Math.min(...allVals))*i/(palette.length-1)), Math.max(...allVals)]
      : getClassBreaks(allVals, variable);

    if (style === 'proportional' || style === 'graduated') {
      [30,20,10,4].forEach(r => {
        content.innerHTML += `<div class="legend-item"><span class="legend-circle" style="width:${r*2}px;height:${r*2}px;background:${palette[2]}"></span>${r===30?'High':r===4?'Low':'Mid'}</div>`;
      });
    } else {
      for (let i = 0; i < palette.length; i++) {
        const lo = breaks[i] !== undefined ? Utils.fmt(Math.round(breaks[i])) : '0';
        const hi = breaks[i+1] !== undefined ? Utils.fmt(Math.round(breaks[i+1])) : '';
        content.innerHTML += `<div class="legend-item"><span class="legend-color" style="background:${palette[i]}"></span>${lo}${hi ? ' – '+hi : '+'}</div>`;
      }
    }
    content.innerHTML += `<div class="legend-item"><span class="legend-color" style="background:#e0e0e0"></span>No data / Zero</div>`;
  }
}

function getVariableLabel(v) {
  const labels = {
    rice_farmers: 'Rice Farms',
    corn_farmers: 'Corn Farms',
    total_farmers: 'Total Farms',
    rice_share_percent: 'Rice Share %',
    corn_share_percent: 'Corn Share %',
    rice_to_corn_ratio: 'Rice:Corn Ratio',
    corn_to_rice_ratio: 'Corn:Rice Ratio',
    dominant_crop: 'Dominant Crop',
    priority_class: 'Priority Class',
    data_quality: 'Data Quality',
  };
  return labels[v] || v;
}

// ====================================================================
// SECTION 15: FILTERS
// ====================================================================
function getFilteredFeatures() {
  const { province, municipality, barangay } = STATE.filters;
  return STATE.data.joined.filter(f => {
    const p = f.properties;
    if (province    && p._prov !== province)    return false;
    if (municipality && p._mun !== municipality) return false;
    if (barangay    && p._brgy !== barangay)    return false;
    return true;
  });
}

function getActiveFeatures() {
  if (STATE.view === 'barangay')    return getFilteredFeatures();
  if (STATE.view === 'municipality') return STATE.data.municipalSummary.map(m => ({ properties: m }));
  if (STATE.view === 'province')    return STATE.data.provinceSummary.map(p => ({ properties: p }));
  return [];
}

function populateFilters() {
  const provinces = [...new Set(STATE.data.joined.map(f => f.properties._prov))].sort();
  const provSel = document.getElementById('filter-province');
  provSel.innerHTML = '<option value="">— All Provinces —</option>';
  provinces.forEach(p => { provSel.innerHTML += `<option value="${p}">${p}</option>`; });
}

function updateMunicipalityFilter() {
  const prov = STATE.filters.province;
  const munSel = document.getElementById('filter-municipality');
  const munGroup = document.getElementById('fg-municipality');
  munSel.innerHTML = '<option value="">— All Municipalities —</option>';
  if (prov) {
    const muns = [...new Set(
      STATE.data.joined.filter(f => f.properties._prov === prov).map(f => f.properties._mun)
    )].sort();
    muns.forEach(m => { munSel.innerHTML += `<option value="${m}">${m}</option>`; });
    munGroup.style.display = 'block';
  }
}

function updateBarangayFilter() {
  const mun = STATE.filters.municipality;
  const brgySel = document.getElementById('filter-barangay');
  const brgyGroup = document.getElementById('fg-barangay');
  brgySel.innerHTML = '<option value="">— All Barangays —</option>';
  if (mun && STATE.view === 'barangay') {
    const brgys = [...new Set(
      STATE.data.joined.filter(f => f.properties._mun === mun).map(f => f.properties._brgy)
    )].sort();
    brgys.forEach(b => { brgySel.innerHTML += `<option value="${b}">${b}</option>`; });
    brgyGroup.style.display = 'block';
  } else {
    brgyGroup.style.display = STATE.view === 'barangay' ? 'block' : 'none';
  }
}

// ====================================================================
// SECTION 16: DASHBOARD
// ====================================================================
function updateDashboard() {
  const feats = getActiveFeatures();
  const props = feats.map(f => f.properties);

  const total = props.reduce((s,p) => s + (p.total_farmers||0), 0);
  const rice  = props.reduce((s,p) => s + (p.rice_farmers||0), 0);
  const corn  = props.reduce((s,p) => s + (p.corn_farmers||0), 0);
  const units = props.length;

  const riceDom  = props.filter(p => p.dominant_crop === 'Rice').length;
  const cornDom  = props.filter(p => p.dominant_crop === 'Corn').length;
  const balanced = props.filter(p => p.dominant_crop === 'Balanced').length;
  const noData   = props.filter(p => p.dominant_crop === 'No Data').length;

  const byRice  = [...props].sort((a,b) => (b.rice_farmers||0)-(a.rice_farmers||0));
  const byCorn  = [...props].sort((a,b) => (b.corn_farmers||0)-(a.corn_farmers||0));
  const byTotal = [...props].sort((a,b) => (b.total_farmers||0)-(a.total_farmers||0));

  const getLabel = (p) => p._brgy || p._mun || p._prov || '—';

  document.getElementById('dc-total').textContent  = Utils.fmt(total);
  document.getElementById('dc-rice').textContent   = Utils.fmt(rice);
  document.getElementById('dc-corn').textContent   = Utils.fmt(corn);
  document.getElementById('dc-units').textContent  = Utils.fmt(units);
  document.getElementById('dc-rice-dom').textContent  = Utils.fmt(riceDom);
  document.getElementById('dc-corn-dom').textContent  = Utils.fmt(cornDom);
  document.getElementById('dc-balanced').textContent  = Utils.fmt(balanced);
  document.getElementById('dc-nodata').textContent    = Utils.fmt(noData);

  const unitLabel = STATE.view === 'province' ? 'Provinces' : STATE.view === 'municipality' ? 'Municipalities' : 'Barangays';
  document.getElementById('dc-units-label').textContent = unitLabel;
  document.getElementById('dashboard-title').textContent = unitLabel + ' Summary';
  document.getElementById('table-title').textContent = unitLabel + ' Ranking';

  const hl = (p, extra) => {
    if (!p) return '—';
    const loc = [p._mun, p._prov].filter(Boolean).join(', ');
    return `<strong>${getLabel(p)}</strong>${loc ? '<br><small>' + loc + '</small>' : ''} <span class="text-muted">(${Utils.fmt(extra)})</span>`;
  };

  document.getElementById('hl-rice').innerHTML   = hl(byRice[0],  byRice[0]?.rice_farmers);
  document.getElementById('hl-corn').innerHTML   = hl(byCorn[0],  byCorn[0]?.corn_farmers);
  document.getElementById('hl-total').innerHTML  = hl(byTotal[0], byTotal[0]?.total_farmers);
  document.getElementById('hl-avg-rice').textContent  = units > 0 ? Utils.fmt(Math.round(rice/units)) : '—';
  document.getElementById('hl-avg-corn').textContent  = units > 0 ? Utils.fmt(Math.round(corn/units)) : '—';
}

// ====================================================================
// SECTION 17: RANKING TABLE
// ====================================================================
function updateTable() {
  const feats = getActiveFeatures();
  let props = feats.map(f => f.properties);

  // Apply table search
  if (STATE.tableSearch) {
    const q = STATE.tableSearch.toLowerCase();
    props = props.filter(p =>
      (p._brgy||'').toLowerCase().includes(q) ||
      (p._mun||'').toLowerCase().includes(q) ||
      (p._prov||'').toLowerCase().includes(q)
    );
  }

  // Sort
  props.sort((a,b) => {
    const av = a[STATE.sortCol]; const bv = b[STATE.sortCol];
    if (typeof av === 'number' && typeof bv === 'number') {
      return STATE.sortDir === 'asc' ? av-bv : bv-av;
    }
    return STATE.sortDir === 'asc'
      ? String(av||'').localeCompare(String(bv||''))
      : String(bv||'').localeCompare(String(av||''));
  });

  // Build headers
  const isBarangay = STATE.view === 'barangay';
  const isMun      = STATE.view === 'municipality';
  const isProv     = STATE.view === 'province';

  let headers = ['#', 'Name'];
  if (isBarangay || isMun) headers.push('Municipality');
  if (isBarangay || isMun || isProv) headers.push('Province');
  headers = headers.concat(['Rice', 'Corn', 'Total', 'Rice%', 'Corn%', 'Dominant', 'Priority']);

  const thead = document.getElementById('ranking-thead');
  const tbody = document.getElementById('ranking-tbody');
  thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  tbody.innerHTML = '';

  props.slice(0, 200).forEach((p, i) => {
    const rank = i + 1;
    const rankBadgeClass = rank <= 3 ? `rank-badge rank-${rank}` : 'rank-badge';
    const row = document.createElement('tr');
    let cells = [
      `<td><span class="${rankBadgeClass}">${rank}</span></td>`,
      `<td><strong>${p._brgy || p._mun || p._prov || '—'}</strong></td>`,
    ];
    if (isBarangay || isMun) cells.push(`<td>${p._mun||'—'}</td>`);
    if (!isProv) cells.push(`<td>${p._prov||'—'}</td>`);
    cells = cells.concat([
      `<td style="color:#2d8c4e;font-weight:600">${Utils.fmt(p.rice_farmers)}</td>`,
      `<td style="color:#d4820a;font-weight:600">${Utils.fmt(p.corn_farmers)}</td>`,
      `<td style="color:#2c5f8a;font-weight:700">${Utils.fmt(p.total_farmers)}</td>`,
      `<td>${Utils.fmtPct(p.rice_share_percent)}</td>`,
      `<td>${Utils.fmtPct(p.corn_share_percent)}</td>`,
      `<td><span class="dom-chip ${Utils.domClass(p.dominant_crop)}">${p.dominant_crop||'—'}</span></td>`,
      `<td><span class="pri-chip pri-${Utils.domPriority(p.priority_class)}">${p.priority_class||'Watchlist'}</span></td>`,
    ]);
    row.innerHTML = cells.join('');
    row.addEventListener('click', () => {
      // Zoom to feature on row click (barangay view only)
      if (STATE.view === 'barangay' && STATE.layers.barangay) {
        STATE.layers.barangay.eachLayer(layer => {
          const lp = layer.feature?.properties;
          if (lp && lp._brgy === p._brgy && lp._mun === p._mun) {
            STATE.map.fitBounds(layer.getBounds ? layer.getBounds() : STATE.map.getBounds(), { maxZoom:14 });
            layer.openPopup();
          }
        });
      }
    });
    tbody.appendChild(row);
  });

  if (props.length > 200) {
    const info = document.createElement('tr');
    info.innerHTML = `<td colspan="${headers.length}" style="text-align:center;color:#888;font-style:italic;padding:8px">Showing 200 of ${props.length} records. Use filters to narrow results.</td>`;
    tbody.appendChild(info);
  }
}

// ====================================================================
// SECTION 18: CHARTS
// ====================================================================
function updateChart() {
  const chartType = document.getElementById('chart-type').value;
  const feats = getActiveFeatures();
  const props = feats.map(f => f.properties);

  if (STATE.chart) STATE.chart.destroy();

  const ctx = document.getElementById('main-chart').getContext('2d');
  const getLabel = (p) => {
    if (STATE.view === 'province') return p._prov;
    if (STATE.view === 'municipality') return (p._mun||'').replace(/ City$/,' City').substring(0,14);
    return (p._brgy||'').substring(0,14);
  };

  let data, options, type;

  if (chartType.startsWith('top10')) {
    const field = chartType === 'top10-rice' ? 'rice_farmers' : chartType === 'top10-corn' ? 'corn_farmers' : 'total_farmers';
    const color = field === 'rice_farmers' ? '#2d8c4e' : field === 'corn_farmers' ? '#d4820a' : '#2c5f8a';
    const sorted = [...props].sort((a,b) => (b[field]||0)-(a[field]||0)).slice(0,10);
    type = 'bar';
    data = {
      labels: sorted.map(getLabel),
      datasets: [{ label: getVariableLabel(field), data: sorted.map(p => p[field]||0),
        backgroundColor: color, borderRadius:4 }],
    };
    options = { indexAxis:'y', plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ font:{size:10} } }, y:{ ticks:{font:{size:9}} } } };

  } else if (chartType === 'rice-corn-compare') {
    type = 'bar';
    const topProps = [...props].sort((a,b) => (b.total_farmers||0)-(a.total_farmers||0)).slice(0,10);
    data = {
      labels: topProps.map(getLabel),
      datasets: [
        { label:'Rice Farms', data: topProps.map(p=>p.rice_farmers||0), backgroundColor:'#2d8c4e', borderRadius:2 },
        { label:'Corn Farms', data: topProps.map(p=>p.corn_farmers||0), backgroundColor:'#d4820a', borderRadius:2 },
      ],
    };
    options = { indexAxis:'y', plugins:{ legend:{ position:'bottom', labels:{font:{size:9}} } }, scales:{ x:{ stacked:false, ticks:{font:{size:9}} }, y:{ ticks:{font:{size:9}} } } };

  } else if (chartType === 'dominant-breakdown') {
    type = 'doughnut';
    const counts = { Rice:0, Corn:0, Balanced:0, 'No Data':0 };
    props.forEach(p => { counts[p.dominant_crop||'No Data']++; });
    data = {
      labels: Object.keys(counts),
      datasets: [{ data: Object.values(counts), backgroundColor: ['#2d8c4e','#d4820a','#2c7bb6','#c8c8c8'], borderWidth:0 }],
    };
    options = { plugins:{ legend:{ position:'bottom', labels:{font:{size:10}} } } };

  } else if (chartType === 'priority-breakdown') {
    type = 'bar';
    const priorityOrder = ['Very High','High','Moderate','Low','Watchlist'];
    const counts = {};
    priorityOrder.forEach(k => counts[k] = 0);
    props.forEach(p => { if (counts[p.priority_class] !== undefined) counts[p.priority_class]++; });
    data = {
      labels: priorityOrder,
      datasets: [{ label:'Units', data: priorityOrder.map(k => counts[k]),
        backgroundColor: priorityOrder.map(k => COLORS.priority[k]||'#ccc'), borderRadius:4 }],
    };
    options = { plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{font:{size:10}} }, x:{ ticks:{font:{size:9}} } } };
  }

  STATE.chart = new Chart(ctx, {
    type, data,
    options: { responsive:true, maintainAspectRatio:false, animation:{ duration:400 }, ...options }
  });
}

// ====================================================================
// SECTION 19: VALIDATION PANEL
// ====================================================================
function updateValidationPanel() {
  const val    = STATE.data.validation;
  const joined = STATE.data.joined;
  const content = document.getElementById('validation-content');
  if (!val || !joined) return;

  const row = (label, value, cls='') =>
    `<div class="val-row"><span class="val-key">${label}</span><span class="val-val ${cls}">${value}</span></div>`;

  const matchPct = val.polygons > 0
    ? Math.round((val.joinedBoth + val.joinedRiceOnly + val.joinedCornOnly) / val.polygons * 100) : 0;
  const matchClass = matchPct >= 90 ? 'val-ok' : matchPct >= 60 ? 'val-warn' : 'val-err';

  // Build a key comparison sample for the debugger
  let debugSection = '';
  if (val.noMatch > 0 || val.unmatchedRice?.length > 0) {
    const sampleGeo = STATE.data.joined.find(f => f.properties.data_quality !== 'OK');
    const geoKey    = sampleGeo?.properties?._key || '(no sample)';
    const csvKey    = val.sampleCsvKey || '(no sample)';
    debugSection = `
      <div class="val-section" style="border-left:3px solid var(--p-very-high);padding-left:8px">
        <div class="val-section-title" style="color:var(--p-very-high)">🔍 Join Debugger — Key Mismatch Diagnosis</div>
        <div style="font-size:11px;margin-bottom:6px;color:var(--text-secondary)">
          The map joins GeoJSON barangays to CSV rows by matching normalized keys. If they don't match, farm data won't appear.
        </div>
        <div class="debug-key-compare">
          <div class="dk-label">GeoJSON normalized key (sample unmatched):</div>
          <div class="dk-key geo-key">${geoKey}</div>
          <div class="dk-label">CSV normalized key (sample row):</div>
          <div class="dk-key csv-key">${csvKey}</div>
        </div>
        <div style="font-size:11px;margin-top:8px;color:var(--text-secondary)">
          <strong>Fix options:</strong><br>
          1. Open <b>Upload Data → Field Mapping</b> and check each field name matches your actual columns.<br>
          2. Click <b>🔍 Auto-detect</b> in Field Mapping to re-detect field names from your files.<br>
          3. If your barangay file has PSGC codes, make sure the PSGC field names match in both GeoJSON and CSV.<br>
          4. Add corrections to the <code>nameCorrections</code> table in <code>script.js</code> for city naming variants (e.g. "CITY OF TUGUEGARAO" vs "TUGUEGARAO CITY").
        </div>
      </div>`;
  }

  content.innerHTML = `
    <div class="val-section">
      <div class="val-section-title">📊 Records Loaded</div>
      ${row('Barangay polygons', val.polygons.toLocaleString(), 'val-ok')}
      ${row('Rice farm records', (val.riceRecords||0).toLocaleString(), val.riceRecords > 0 ? 'val-ok' : 'val-err')}
      ${row('Corn farm records', (val.cornRecords||0).toLocaleString(), val.cornRecords > 0 ? 'val-ok' : 'val-err')}
    </div>
    <div class="val-section">
      <div class="val-section-title">🔗 Join Results</div>
      ${row('Match rate', matchPct + '%', matchClass)}
      ${row('✅ Joined (rice + corn)', val.joinedBoth.toLocaleString(), val.joinedBoth > 0 ? 'val-ok' : 'val-err')}
      ${row('⚠️ Rice data only', (val.joinedRiceOnly||0).toLocaleString(), val.joinedRiceOnly > 0 ? 'val-warn' : '')}
      ${row('⚠️ Corn data only', (val.joinedCornOnly||0).toLocaleString(), val.joinedCornOnly > 0 ? 'val-warn' : '')}
      ${row('❌ No match (both missing)', val.noMatch.toLocaleString(), val.noMatch > 0 ? 'val-err' : 'val-ok')}
    </div>
    <div class="val-section">
      <div class="val-section-title">🎯 Join Method Breakdown</div>
      ${row('Pass 1 — PSGC code match', (val.passStats?.code||0).toLocaleString(), val.passStats?.code > 0 ? 'val-ok' : '')}
      ${row('Pass 2 — Province+Mun+Brgy', (val.passStats?.full||0).toLocaleString(), val.passStats?.full > 0 ? 'val-ok' : '')}
      ${row('Pass 3 — Mun+Brgy only', (val.passStats?.munBrgy||0).toLocaleString(), val.passStats?.munBrgy > 0 ? 'val-warn' : '')}
      ${row('Pass 4 — Barangay name only', (val.passStats?.brgy||0).toLocaleString(), val.passStats?.brgy > 0 ? 'val-warn' : '')}
      ${row('Unmatched CSV rows (rice)', (val.unmatchedRice?.length||0).toLocaleString(), (val.unmatchedRice?.length||0) > 0 ? 'val-warn' : 'val-ok')}
      ${row('Unmatched CSV rows (corn)', (val.unmatchedCorn?.length||0).toLocaleString(), (val.unmatchedCorn?.length||0) > 0 ? 'val-warn' : 'val-ok')}
    </div>
    <div class="val-section">
      <div class="val-section-title">🏗️ Aggregation</div>
      ${row('Municipalities generated', (STATE.data.municipalSummary?.length||0).toLocaleString())}
      ${row('Provinces generated', (STATE.data.provinceSummary?.length||0).toLocaleString())}
    </div>
    ${debugSection}
    ${val.unmatchedRice?.length > 0 ? `<div class="val-section"><div class="val-section-title val-warn">⚠️ Unmatched Rice Rows (first 10)</div>${val.unmatchedRice.slice(0,10).map(s=>`<div class="val-unmatched-item">${s}</div>`).join('')}${val.unmatchedRice.length>10?`<div style="font-size:10px;color:#888">…and ${val.unmatchedRice.length-10} more</div>`:''}</div>` : ''}
    ${val.unmatchedCorn?.length > 0 ? `<div class="val-section"><div class="val-section-title val-warn">⚠️ Unmatched Corn Rows (first 10)</div>${val.unmatchedCorn.slice(0,10).map(s=>`<div class="val-unmatched-item">${s}</div>`).join('')}${val.unmatchedCorn.length>10?`<div style="font-size:10px;color:#888">…and ${val.unmatchedCorn.length-10} more</div>`:''}</div>` : ''}
    <div style="margin-top:8px">
      <button onclick="openUploadForFix()" class="btn-secondary full-width" style="background:var(--rice-light);border-color:var(--rice-color);color:var(--rice-color);font-weight:600">
        🔧 Open Field Mapping to Fix Join Issues
      </button>
    </div>
  `;
}

function openUploadForFix() {
  document.getElementById('upload-modal').classList.remove('hidden');
  // Switch to fields tab
  document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.modal-tab-body').forEach(b => b.classList.add('hidden'));
  document.querySelector('[data-tab="fields-tab"]').classList.add('active');
  document.getElementById('fields-tab').classList.remove('hidden');
}

// ====================================================================
// SECTION 20: INTERPRETATION
// ====================================================================
function updateInterpretation() {
  const el = document.getElementById('interpretation-text');
  const feats = getActiveFeatures();
  const props = feats.map(f => f.properties);
  if (props.length === 0) { el.innerHTML = '<em>No data available.</em>'; return; }

  const byRice  = [...props].sort((a,b) => (b.rice_farmers||0)-(a.rice_farmers||0));
  const byCorn  = [...props].sort((a,b) => (b.corn_farmers||0)-(a.corn_farmers||0));
  const byTotal = [...props].sort((a,b) => (b.total_farmers||0)-(a.total_farmers||0));
  const vhPriority = props.filter(p => p.priority_class === 'Very High').length;
  const getLabel = (p) => (p._brgy || p._mun || p._prov || '—') + (p._mun && p._prov ? ` (${p._mun}, ${p._prov})` : p._prov ? ` (${p._prov})` : '');

  el.innerHTML = `
    <div class="interp-section">
      <p>🌾 <strong>Top rice farm concentration:</strong> ${getLabel(byRice[0])} with <strong>${Utils.fmt(byRice[0]?.rice_farmers)}</strong> rice farms — the highest among ${props.length} ${STATE.view}-level units currently displayed.</p>
    </div>
    <div class="interp-section">
      <p>🌽 <strong>Top corn farmer concentration:</strong> ${getLabel(byCorn[0])} with <strong>${Utils.fmt(byCorn[0]?.corn_farmers)}</strong> corn farms.</p>
    </div>
    <div class="interp-section">
      <p>🏆 <strong>Highest combined farmers:</strong> ${getLabel(byTotal[0])} leads with <strong>${Utils.fmt(byTotal[0]?.total_farmers)}</strong> total rice and corn farms.</p>
    </div>
    <div class="interp-section">
      <p>📊 <strong>Priority overview:</strong> <strong>${vhPriority}</strong> unit(s) are classified as Very High Priority. There are ${props.filter(p=>p.dominant_crop==='Rice').length} rice-dominant, ${props.filter(p=>p.dominant_crop==='Corn').length} corn-dominant, and ${props.filter(p=>p.dominant_crop==='Balanced').length} balanced unit(s).</p>
    </div>
    ${props.filter(p=>p.data_quality!=='OK').length > 0 ? `
    <div class="interp-section" style="border-color:var(--corn-color)">
      <p>⚠️ <strong>Data gaps:</strong> <strong>${props.filter(p=>p.data_quality!=='OK').length}</strong> unit(s) have incomplete or missing farm data. These are flagged as Watchlist and should be verified with municipal/provincial counterparts.</p>
    </div>` : ''}
  `;
}

// ====================================================================
// SECTION 21: SEARCH
// ====================================================================
function setupSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = '';
    if (q.length < 2) { results.classList.add('hidden'); return; }

    const matches = [];
    if (STATE.view === 'barangay') {
      STATE.data.joined.forEach(feat => {
        const p = feat.properties;
        const text = [(p._brgy||''), (p._mun||''), (p._prov||'')].join(' ').toLowerCase();
        if (text.includes(q)) matches.push({ brgy:p._brgy, mun:p._mun, prov:p._prov, feat });
      });
    } else if (STATE.view === 'municipality') {
      STATE.data.municipalSummary.forEach(m => {
        const text = [(m._mun||''), (m._prov||'')].join(' ').toLowerCase();
        if (text.includes(q)) matches.push({ brgy:m._mun, mun:m._mun, prov:m._prov });
      });
    } else {
      STATE.data.provinceSummary.forEach(p => {
        if ((p._prov||'').toLowerCase().includes(q)) matches.push({ brgy:p._prov, mun:'', prov:p._prov });
      });
    }

    matches.slice(0,10).forEach(m => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.innerHTML = `<div class="sri-name">${m.brgy}</div><div class="sri-loc">${[m.mun, m.prov].filter(Boolean).join(', ')}</div>`;
      div.addEventListener('click', () => {
        results.classList.add('hidden');
        input.value = '';
        if (m.feat && STATE.view === 'barangay') {
          STATE.map.fitBounds(
            L.geoJSON(m.feat).getBounds(),
            { maxZoom: 14, padding: [40,40] }
          );
        }
        // Also set filters
        if (m.prov) {
          STATE.filters.province = m.prov;
          document.getElementById('filter-province').value = m.prov;
          updateMunicipalityFilter();
        }
      });
      results.appendChild(div);
    });

    results.classList.toggle('hidden', matches.length === 0);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) results.classList.add('hidden');
  });
}

// ====================================================================
// SECTION 22: EXPORT
// ====================================================================
function exportCSV() {
  const feats = getActiveFeatures();
  const props = feats.map(f => f.properties);
  const fields = ['_brgy','_mun','_prov','rice_farmers','corn_farmers','total_farmers',
    'rice_share_percent','corn_share_percent','rice_to_corn_ratio','corn_to_rice_ratio',
    'dominant_crop','priority_class','data_quality'];

  const header = ['Barangay','Municipality','Province','Rice Farms','Corn Farms','Total Farms',
    'Rice Share %','Corn Share %','Rice:Corn Ratio','Corn:Rice Ratio','Dominant Crop','Priority Class','Data Quality'];

  const rows = props.map(p => fields.map(f => {
    const v = p[f];
    if (typeof v === 'number') return isFinite(v) ? v.toFixed(2) : '';
    return v || '';
  }));

  const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const prefix = STATE.view === 'province' ? 'provincial_summary' : STATE.view === 'municipality' ? 'municipality_summary' : 'barangay';
  downloadFile(csv, `${prefix}_rice_corn_farmers_export.csv`, 'text/csv');
}

function exportGeoJSON() {
  const feats = STATE.view === 'barangay' ? getFilteredFeatures() : getActiveFeatures().map(f => ({
    type:'Feature', geometry:{ type:'Point', coordinates:[0,0] }, properties: f.properties
  }));
  const gj = { type:'FeatureCollection', features: feats };
  const prefix = STATE.view === 'province' ? 'provincial_summary' : STATE.view === 'municipality' ? 'municipality_summary' : 'barangay';
  downloadFile(JSON.stringify(gj, null, 2), `${prefix}_rice_corn_farmers.geojson`, 'application/json');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ====================================================================
// SECTION 23: COLLAPSIBLE PANELS
// ====================================================================
function setupCollapsibles() {
  document.querySelectorAll('.panel-header.collapsible').forEach(header => {
    const targetId = header.getAttribute('data-target');
    const body = document.getElementById(targetId);
    header.addEventListener('click', () => {
      const isCollapsed = body.classList.contains('collapsed');
      body.classList.toggle('collapsed', !isCollapsed);
      header.classList.toggle('collapsed', !isCollapsed);
    });
  });
}

// ====================================================================
// SECTION 24: EVENT LISTENERS
// ====================================================================
function setupEventListeners() {
  // View Level
  document.querySelectorAll('input[name="view-level"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      STATE.view = e.target.value;
      document.querySelectorAll('.view-level-option').forEach(o => o.classList.remove('active'));
      e.target.closest('.view-level-option').classList.add('active');

      // Adjust filter visibility
      const showMun  = STATE.view !== 'province';
      const showBrgy = STATE.view === 'barangay';
      document.getElementById('fg-municipality').style.display = showMun  ? 'block' : 'none';
      document.getElementById('fg-barangay').style.display     = showBrgy ? 'block' : 'none';

      STATE.breaks = {}; // Clear cached breaks
      renderMap();
    });
  });

  // Province filter
  document.getElementById('filter-province').addEventListener('change', (e) => {
    STATE.filters.province = e.target.value;
    STATE.filters.municipality = '';
    STATE.filters.barangay = '';
    document.getElementById('filter-municipality').value = '';
    document.getElementById('filter-barangay').value = '';
    updateMunicipalityFilter();
    updateBarangayFilter();
    STATE.breaks = {};
    renderMap();
  });

  // Municipality filter
  document.getElementById('filter-municipality').addEventListener('change', (e) => {
    STATE.filters.municipality = e.target.value;
    STATE.filters.barangay = '';
    document.getElementById('filter-barangay').value = '';
    updateBarangayFilter();
    STATE.breaks = {};
    renderMap();
  });

  // Barangay filter
  document.getElementById('filter-barangay').addEventListener('change', (e) => {
    STATE.filters.barangay = e.target.value;
    STATE.breaks = {};
    renderMap();
  });

  // Reset filters
  document.getElementById('reset-filters').addEventListener('click', () => {
    STATE.filters = { province:'', municipality:'', barangay:'' };
    document.getElementById('filter-province').value = '';
    document.getElementById('filter-municipality').value = '';
    document.getElementById('filter-barangay').value = '';
    updateMunicipalityFilter();
    updateBarangayFilter();
    STATE.breaks = {};
    renderMap();
  });

  // Map variable
  document.getElementById('map-variable').addEventListener('change', (e) => {
    STATE.variable = e.target.value;
    STATE.breaks = {};
    renderMap();
  });

  // Map style
  document.getElementById('map-style').addEventListener('change', (e) => {
    STATE.mapStyle = e.target.value;
    const showRanked    = e.target.value === 'ranked';
    const showDeviation = e.target.value === 'deviation';
    const showPriority  = e.target.value === 'priority' || e.target.value === 'choropleth';
    document.getElementById('ranked-options').style.display    = showRanked    ? 'block' : 'none';
    document.getElementById('deviation-options').style.display = showDeviation ? 'block' : 'none';
    STATE.breaks = {};
    renderMap();
  });

  // Classification
  document.getElementById('classification-method').addEventListener('change', (e) => {
    STATE.classification = e.target.value;
    STATE.breaks = {};
    renderMap();
  });

  // Ranked N
  document.getElementById('ranked-n').addEventListener('change', (e) => {
    STATE.rankedN = parseInt(e.target.value);
    renderMap();
  });

  // Deviation base
  document.getElementById('deviation-base').addEventListener('change', (e) => {
    STATE.deviationBase = e.target.value;
    renderMap();
  });

  // Priority variable
  document.getElementById('priority-variable').addEventListener('change', (e) => {
    STATE.priorityVariable = e.target.value;
    assignPriorityClasses(STATE.data.joined, e.target.value);
    buildMunicipalSummary();
    buildProvincialSummary();
    renderMap();
  });

  // Basemap buttons
  document.querySelectorAll('.basemap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const bm = btn.getAttribute('data-basemap');
      STATE.map.removeLayer(BASEMAPS[STATE.basemap]);
      STATE.basemap = bm;
      BASEMAPS[bm].addTo(STATE.map);
      document.querySelectorAll('.basemap-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Chart type
  document.getElementById('chart-type').addEventListener('change', () => updateChart());

  // Table search
  document.getElementById('table-search').addEventListener('input', (e) => {
    STATE.tableSearch = e.target.value;
    updateTable();
  });

  // Table sort direction toggle
  document.getElementById('table-sort-dir').addEventListener('click', () => {
    STATE.sortDir = STATE.sortDir === 'asc' ? 'desc' : 'asc';
    updateTable();
  });

  // Table sort column
  document.getElementById('table-sort-col').addEventListener('change', (e) => {
    STATE.sortCol = e.target.value;
    updateTable();
  });

  // Export
  document.getElementById('export-csv').addEventListener('click', exportCSV);
  document.getElementById('export-geojson').addEventListener('click', exportGeoJSON);
  document.getElementById('print-map').addEventListener('click', () => window.print());

  // Executive mode
  document.getElementById('exec-mode-toggle').addEventListener('click', () => {
    STATE.execMode = !STATE.execMode;
    document.body.classList.toggle('exec-mode', STATE.execMode);
    const btn = document.getElementById('exec-mode-toggle');
    btn.style.background = STATE.execMode ? 'rgba(255,255,0,0.2)' : '';
  });

  // Sidebar toggle
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar-left').classList.toggle('collapsed');
    document.getElementById('sidebar-right').classList.toggle('collapsed');
  });
}



// ====================================================================
// SECTION 25: MAIN ENTRY POINT
// ====================================================================

/*
  HOW DATA IS LOADED
  ─────────────────────────────────────────────────────────────────────
  Place your data files in the data/ folder:
    data/barangay_boundaries.geojson   (required)
    data/rice_farmers.csv              (required)
    data/corn_farmers.csv              (required)
    data/municipality_boundaries.geojson  (optional)
    data/province_boundaries.geojson      (optional)

  The map checks for these files on startup. If found, data loads
  automatically for all visitors — no dialogs, no prompts.

  If the files are not found, demo/synthetic data is shown instead.
  ─────────────────────────────────────────────────────────────────────
*/

function showToast(msg, type='ok', duration=4000) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'app-toast toast-' + type + ' toast-visible';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('toast-visible'), duration);
}

async function main() {
  try {
    Utils.setLoadMsg('Initializing map…', 5);

    initMap();
    setupCollapsibles();
    setupEventListeners();
    setupSearch();

    Utils.setLoadMsg('Loading barangay boundaries…', 15);

    // ── Load GeoJSON ──
    try {
      const r = await fetch(CONFIG.files.barangayGeoJSON);
      if (!r.ok) throw new Error('not found');
      STATE.data.geojson = await r.json();
      Utils.setLoadMsg(`Loaded ${STATE.data.geojson.features.length.toLocaleString()} barangay polygons`, 35);
    } catch(e) {
      console.warn('barangay_boundaries.geojson not found — using demo data');
      STATE.data.geojson = buildDemoGeoJSON();
      Utils.setLoadMsg('Using demo boundary data', 35);
    }

    // ── Load Rice CSV ──
    Utils.setLoadMsg('Loading rice farm data…', 50);
    try {
      const r = await fetch(CONFIG.files.riceFarmersCSV);
      if (!r.ok) throw new Error('not found');
      const txt = await r.text();
      STATE.data.riceCsv = Papa.parse(txt, { header: true, skipEmptyLines: true }).data;
      Utils.setLoadMsg(`Loaded ${STATE.data.riceCsv.length.toLocaleString()} rice records`, 60);
    } catch(e) {
      console.warn('rice_farmers.csv not found — using demo data');
      STATE.data.riceCsv = buildDemoRiceCSV(STATE.data.geojson);
    }

    // ── Load Corn CSV ──
    Utils.setLoadMsg('Loading corn farm data…', 65);
    try {
      const r = await fetch(CONFIG.files.cornFarmersCSV);
      if (!r.ok) throw new Error('not found');
      const txt = await r.text();
      STATE.data.cornCsv = Papa.parse(txt, { header: true, skipEmptyLines: true }).data;
      Utils.setLoadMsg(`Loaded ${STATE.data.cornCsv.length.toLocaleString()} corn records`, 72);
    } catch(e) {
      console.warn('corn_farmers.csv not found — using demo data');
      STATE.data.cornCsv = buildDemoCornCSV(STATE.data.geojson);
    }

    // ── Join & Process ──
    Utils.setLoadMsg('Joining and validating data…', 78);
    joinData();

    Utils.setLoadMsg('Building municipal and provincial summaries…', 88);
    buildMunicipalSummary();
    buildProvincialSummary();

    Utils.setLoadMsg('Rendering map…', 95);
    populateFilters();
    renderMap();

    Utils.hideLoading();
    document.getElementById('last-updated').textContent =
      'Updated: ' + CONFIG.meta.lastUpdated;

    // Join result toast
    const val = STATE.data.validation;
    const matchCount = (val.joinedBoth || 0) + (val.joinedRiceOnly || 0) + (val.joinedCornOnly || 0);
    const pct = val.polygons > 0 ? Math.round(matchCount / val.polygons * 100) : 0;
    if (pct < 50 && val.riceRecords > 0) {
      showToast(`⚠️ Only ${pct}% of barangays matched farm data. Check the Data Validation panel.`, 'warn', 9000);
    } else if (matchCount > 0) {
      showToast(`✅ ${matchCount.toLocaleString()} barangays loaded (${pct}% match rate)`, 'ok', 4000);
    }

    console.log('✅ Map ready.');
    console.log('Joined:', STATE.data.joined.length, '| Municipalities:', STATE.data.municipalSummary.length, '| Provinces:', STATE.data.provinceSummary.length);

  } catch(err) {
    console.error('Fatal map error:', err);
    Utils.setLoadMsg('❌ ' + err.message, 100);
    setTimeout(Utils.hideLoading, 5000);
  }
}

document.addEventListener('DOMContentLoaded', main);
