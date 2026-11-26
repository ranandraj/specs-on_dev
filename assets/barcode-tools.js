(function () {
  'use strict';

  try {
    if (location.pathname === '/' && /[?&]specsView=pos(?:[&#]|$)/.test(location.search)) {
      history.replaceState(null, '', '/pos' + (location.hash || ''));
    }
  } catch (e) {}

  var CFG = window.__SUPABASE_CONFIG__ || {};
  if (!CFG.url || !CFG.anonKey) {
    console.warn('[barcode-tools] Supabase config missing');
    return;
  }

  var API = CFG.url.replace(/\/$/, '') + '/rest/v1/products';
  var HEADERS = {
    apikey: CFG.anonKey,
    Authorization: 'Bearer ' + CFG.anonKey,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  var products = [];
  var lastScanned = '';
  var selected = new Set();
  var scanControls = null;
  var scanning = false;
  var nativeTimer = null;
  var scanHint = null;
  var inlineMode = false;
  var scanMode = 'billing';
  var labelSize = '20x15';
  var BLANK_KEY = 'specs.blankBarcodes';
  var blankCodes = [];
  var selectedCodes = new Set();
  var root, listEl, searchEl, labelListEl, labelPreviewEl, videoEl, scanStatusEl, startBtn, stopBtn;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function priceOf(p) {
    var v = p.offer_price != null && p.offer_price !== '' ? p.offer_price : p.price;
    var n = Number(v || 0);
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  function money2(p) {
    var v = p.offer_price != null && p.offer_price !== '' ? p.offer_price : p.price;
    return '₹' + Number(v || 0).toFixed(2);
  }

  function normCode(c) {
    return String(c == null ? '' : c).trim().toUpperCase();
  }

  function randomBlankCode() {
    var out = 'BC';
    var i, n;
    if (window.crypto && window.crypto.getRandomValues) {
      var vals = new Uint32Array(10);
      window.crypto.getRandomValues(vals);
      for (i = 0; i < vals.length; i++) out += String(vals[i] % 10);
    } else {
      for (i = 0; i < 10; i++) out += String(Math.floor(Math.random() * 10));
    }
    return out;
  }

  function loadBlankCodes() {
    try {
      var rows = JSON.parse(localStorage.getItem(BLANK_KEY) || '[]');
      blankCodes = Array.isArray(rows) ? rows.map(normCode).filter(function (c) { return /^BC\d{10}$/.test(c); }) : [];
    } catch (e) { blankCodes = []; }
  }

  function saveBlankCodes() {
    try { localStorage.setItem(BLANK_KEY, JSON.stringify(blankCodes)); } catch (e) {}
  }

  function removeBlankCode(code) {
    var c = normCode(code);
    var i = blankCodes.indexOf(c);
    if (i === -1) return;
    blankCodes.splice(i, 1);
    selectedCodes.delete(c);
    saveBlankCodes();
  }

  function releaseBlankCode(code) {
    var c = normCode(code);
    if (!/^BC\d{10}$/.test(c)) return;
    if (blankCodes.indexOf(c) === -1) blankCodes.push(c);
    saveBlankCodes();
  }

  async function generateBlankCodes(count) {
    count = Number(count);
    if (!Number.isInteger(count) || count < 1 || count > 5000) {
      toast('Enter a number from 1 to 5000', true);
      return;
    }
    try {
      if (!products.length) await loadProducts();
      var used = new Set();
      products.forEach(function (p) { if (p.barcode) used.add(normCode(p.barcode)); });
      blankCodes.forEach(function (c) { used.add(c); });
      var made = [];
      while (made.length < count) {
        var code = randomBlankCode();
        if (used.has(code)) continue;
        used.add(code);
        made.push(code);
      }
      blankCodes = blankCodes.concat(made);
      saveBlankCodes();
      selectedCodes.clear();
      renderGenerated(); renderLabels();
      toast('Generated ' + count + ' blank barcode(s) — no name or code printed');
      setPane('labels');
    } catch (e) { toast(e.message, true); }
  }

  function clearBlankCodes() {
    if (!blankCodes.length) { toast('No blank barcodes to clear', true); return; }
    if (!confirm('Clear ' + blankCodes.length + ' unused blank barcode(s)?')) return;
    blankCodes = [];
    selectedCodes.clear();
    saveBlankCodes();
    renderGenerated(); renderLabels();
    toast('Blank barcodes cleared');
  }

  function suggest(p, used) {
    var base = 'SP' + String(p.id).padStart(6, '0');
    if (!used || used.indexOf(base) === -1) return base;
    var i = 2;
    while (used.indexOf(base + '-' + i) !== -1) i++;
    return base + '-' + i;
  }

  async function api(path, opts) {
    var res = await fetch(API + (path || ''), Object.assign({ headers: HEADERS }, opts || {}));
    if (!res.ok) throw new Error((await res.text()).slice(0, 200));
    return res.status === 204 ? null : res.json();
  }

  async function loadProducts() {
    var rows = await api('?select=id,name,price,offer_price,barcode,sku&order=id&limit=2000');
    products = Array.isArray(rows) ? rows : [];
    return products;
  }

  async function saveBarcode(id, code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) throw new Error('Barcode cannot be empty');
    if (!/^[\x20-\x7E]{1,64}$/.test(code)) throw new Error('Barcode must be 1-64 printable characters');
    var dup = products.find(function (p) { return p.id !== id && p.barcode && p.barcode.trim().toUpperCase() === code; });
    if (dup) throw new Error('Already assigned to ' + dup.name);
    await api('?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ barcode: code }) });
    var p = products.find(function (x) { return x.id === id; });
    if (p) p.barcode = code;
  }

  function drawBarcodes(scope) {
    if (!window.JsBarcode) return;
    (scope || document).querySelectorAll('svg[data-barcode]').forEach(function (svg) {
      if (svg.getAttribute('data-drawn') === '1') return;
      try {
        JsBarcode(svg, svg.getAttribute('data-barcode'), {
          format: 'CODE128', displayValue: false, width: 2, height: 42,
          margin: 0, background: '#ffffff', lineColor: '#000000'
        });
        svg.setAttribute('data-drawn', '1');
      } catch (e) { /* invalid code: leave blank */ }
    });
  }

  function toast(msg, bad) {
    var t = document.getElementById('bc-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'bc-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = ''; }, 2600);
  }

  function renderAssign() {
    var q = (searchEl.value || '').trim().toLowerCase();
    var used = products.map(function (p) { return p.barcode || ''; }).filter(Boolean);
    var rows = products.filter(function (p) {
      return !q || (p.name || '').toLowerCase().indexOf(q) !== -1 ||
        String(p.barcode || '').toLowerCase().indexOf(q) !== -1 ||
        String(p.id).indexOf(q) !== -1;
    });
    listEl.innerHTML = rows.length ? rows.map(function (p) {
      return '<div class="bc-row" data-id="' + p.id + '">' +
        '<div class="bc-mini-wrap">' + (p.barcode ? '<svg data-barcode="' + esc(p.barcode) + '"></svg>' : '<span class="bc-none">—</span>') + '</div>' +
        '<div class="bc-info"><b>' + esc(p.name) + '</b><small>' + priceOf(p) + ' · ' +
        (p.barcode ? '<span class="bc-code">' + esc(p.barcode) + '</span>' : '<span class="bc-missing">No barcode</span>') + '</small></div>' +
        '<div class="bc-actions">' +
        '<button type="button" data-act="gen">' + (p.barcode ? 'Regenerate' : 'Generate') + '</button>' +
        '<button type="button" data-act="edit" class="bc-alt">Edit</button>' +
        '</div></div>';
    }).join('') : '<div class="bc-empty">No matching products.</div>';
    drawBarcodes(listEl);
  }

  function hasBarcode(p) {
    return !!(p && p.barcode && String(p.barcode).trim());
  }

  function renderUnassigned() {
    var select = root && root.querySelector('#bc-assign-product');
    if (!select) return;
    var free = products.filter(function (p) { return !hasBarcode(p); });
    select.innerHTML = free.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + ' — ' + money2(p) + '</option>';
    }).join('');
    var empty = root.querySelector('#bc-unassigned-empty');
    if (empty) empty.style.display = free.length ? 'none' : 'block';
    var confirm = root.querySelector('#bc-assign-confirm');
    if (confirm) confirm.disabled = !free.length;
    updateAssignedPrice();
  }

  function updateAssignedPrice() {
    var note = root && root.querySelector('#bc-assign-price');
    if (!note) return;
    var select = root.querySelector('#bc-assign-product');
    var p = select && products.find(function (x) { return String(x.id) === select.value; });
    note.textContent = p ? 'Saved inventory price: ' + money2(p) + '. No price entry needed.' : '';
  }

  async function generateMissing() {
    var used = products.map(function (p) { return p.barcode || ''; }).filter(Boolean);
    var missing = products.filter(function (p) { return !p.barcode || !p.barcode.trim(); });
    if (!missing.length) { toast('Every product already has a barcode'); return; }
    if (!confirm('Generate barcodes for ' + missing.length + ' product(s)?')) return;
    try {
      for (var i = 0; i < missing.length; i++) {
        var code = suggest(missing[i], used);
        used.push(code);
        await saveBarcode(missing[i].id, code);
      }
      renderAssign(); renderLabels();
      toast('Generated ' + missing.length + ' barcode(s)');
    } catch (e) { toast(e.message, true); }
  }

  function inlineEdit(row, p) {
    var info = row.querySelector('.bc-info');
    var old = info.innerHTML;
    info.innerHTML = '<b>' + esc(p.name) + '</b>' +
      '<input class="bc-input" value="' + esc(p.barcode || suggest(p)) + '" maxlength="32" />' +
      '<small>Code 128 · letters/numbers · use Remove barcode to clear</small>';
    var input = info.querySelector('input');
    input.focus(); input.select();
    var done = false;
    async function commit(save) {
      if (done) return; done = true;
      if (!save) { info.innerHTML = old; return; }
      try {
        await saveBarcode(p.id, input.value);
        renderAssign(); renderLabels(); toast('Barcode saved');
      } catch (e) { info.innerHTML = old; toast(e.message, true); }
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      if (e.key === 'Escape') { e.preventDefault(); commit(false); }
    });
    var acts = row.querySelector('.bc-actions');
    var oldActs = acts.innerHTML;
    acts.innerHTML = '<button type="button" data-act="save">Save</button>' +
      (p.barcode ? '<button type="button" data-act="remove" class="bc-danger">Remove barcode</button>' : '') +
      '<button type="button" data-act="cancel" class="bc-alt">Cancel</button>';
    acts.onclick = function (e) {
      e.stopPropagation();
      var a = e.target.getAttribute('data-act');
      if (a === 'save') commit(true);
      if (a === 'remove') removeBarcode(p);
      if (a === 'cancel') commit(false);
    };
    row._restore = function () { info.innerHTML = old; acts.innerHTML = oldActs; acts.onclick = null; };
  }

  async function removeBarcode(p) {
    var oldCode = normCode(p.barcode);
    if (!oldCode) { toast('This product has no barcode to remove', true); return; }
    if (!confirm('Remove barcode ' + oldCode + ' from ' + p.name + '?')) return;
    try {
      await api('?id=eq.' + encodeURIComponent(p.id), {
        method: 'PATCH', body: JSON.stringify({ barcode: null })
      });
      p.barcode = null;
      releaseBlankCode(oldCode);
      renderAssign(); renderLabels(); renderGenerated();
      toast(/^BC\d{10}$/.test(oldCode)
        ? 'Barcode removed — sticker is available again'
        : 'Barcode removed');
    } catch (e) { toast(e.message, true); }
  }

  function allLabelCodes() {
    return blankCodes.slice();
  }

  function chosenCodes() {
    var codes = allLabelCodes();
    if (!selectedCodes.size) return codes;
    return codes.filter(function (c) { return selectedCodes.has(c); });
  }

  function renderGenerated() {
    var host = root && root.querySelector('#bc-generated');
    if (!host) return;
    var preview = blankCodes.slice(0, 24);
    host.innerHTML = blankCodes.length
      ? '<p class="bc-note"><b>' + blankCodes.length + '</b> blank sticker(s) ready. Only the barcode will be printed. Scan a sticker later to label it.</p>' +
        '<div class="bc-gen-list">' + preview.map(function (code, i) {
          return '<div class="bc-gen-item"><small>#' + (i + 1) + '</small><svg data-barcode="' + esc(code) + '"></svg><span>' + esc(code) + '</span></div>';
        }).join('') + '</div>' +
        (blankCodes.length > preview.length ? '<p class="bc-note">Showing the first ' + preview.length + ' of ' + blankCodes.length + '.</p>' : '')
      : '<div class="bc-empty">No blank stickers yet. Enter a quantity and press Generate.</div>';
    drawBarcodes(host);
  }

  function renderLabels() {
    var codes = allLabelCodes();
    labelListEl.innerHTML = codes.length ? codes.map(function (code, i) {
      return '<label class="bc-check"><input type="checkbox" value="' + esc(code) + '"' + (selectedCodes.has(code) ? ' checked' : '') + ' /> ' +
        '<span>Sticker ' + (i + 1) + '</span><small>' + esc(code) + '</small></label>';
    }).join('') : '<div class="bc-empty">No blank stickers yet. Generate them first.</div>';
    drawLabels();
    renderGenerated();
  }

  function labelMarkup(code) {
    return '<div class="bc-label" data-code="' + esc(code) + '">' +
      '<svg class="bc-lbar" data-barcode="' + esc(code) + '"></svg>' +
      '</div>';
  }

  function drawLabels() {
    var all = chosenCodes();
    var shown = all.slice(0, 80);
    labelPreviewEl.className = 'bc-labels size-' + labelSize.replace('x', '-');
    labelPreviewEl.innerHTML = shown.map(labelMarkup).join('') +
      (all.length > shown.length ? '<div class="bc-preview-note">Preview shows ' + shown.length + ' of ' + all.length + '. Print includes all.</div>' : '') ||
      '<div class="bc-empty">Generate blank stickers first.</div>';
    drawBarcodes(labelPreviewEl);
  }

  function printLabels() {
    var list = chosenCodes();
    if (!list.length) { toast('Generate at least one blank barcode first', true); return; }
    if (!window.JsBarcode) { toast('Barcode renderer is not loaded', true); return; }
    var holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden';
    holder.innerHTML = list.map(function (code) {
      return '<svg class="bc-lbar" data-barcode="' + esc(code) + '"></svg>';
    }).join('');
    document.body.appendChild(holder);
    drawBarcodes(holder);
    var svgs = Array.prototype.map.call(holder.querySelectorAll('svg'), function (svg) { return svg.outerHTML; });
    document.body.removeChild(holder);
    var w = labelSize === '20x15' ? '20mm' : '15mm';
    var h = labelSize === '20x15' ? '15mm' : '20mm';
    var cols = labelSize === '20x15' ? 10 : 13;
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>Blank barcode stickers</title><style>' +
      '@page{size:A4;margin:5mm}body{margin:0;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.sheet{display:grid;grid-template-columns:repeat(' + cols + ',' + w + ');grid-auto-rows:' + h + ';gap:0}' +
      '.bc-label{width:' + w + ';height:' + h + ';box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0.2mm;border:0.2mm dotted #bbb;border-radius:1.2mm}' +
      '.bc-lbar{width:18mm;height:10mm;display:block;margin:0}' +
      '.size-15-20 .bc-lbar{width:13mm;height:15mm}' +
      '</style></head><body><div class="sheet size-' + labelSize.replace('x', '-') + '">' +
      list.map(function (code, i) {
        return '<div class="bc-label" data-code="' + esc(code) + '">' + (svgs[i] || '<svg class="bc-lbar"></svg>') + '</div>';
      }).join('') + '</div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>';
    var win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { toast('Allow pop-ups to print blank stickers', true); return; }
    win.document.open(); win.document.write(html); win.document.close();
  }

  function stopScan() {
    try { if (scanControls) scanControls.stop(); } catch (e) {}
    try { if (nativeTimer) clearInterval(nativeTimer); } catch (e) {}
    try { if (scanHint) clearTimeout(scanHint); } catch (e) {}
    scanControls = null; nativeTimer = null; scanHint = null; scanning = false;
    if (videoEl) videoEl.srcObject = null;
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (scanStatusEl) scanStatusEl.textContent = 'Camera off.';
  }

  function deliver(p) {
    window.dispatchEvent(new CustomEvent('specs:barcode-scanned', { detail: p }));
    toast('Added ' + p.name + ' · ' + priceOf(p));
  }

  function setPane(name) {
    root.querySelectorAll('.bc-tabs button').forEach(function (b) { b.classList.remove('active'); });
    root.querySelectorAll('.bc-pane').forEach(function (x) { x.classList.remove('active'); });
    var tab = root.querySelector('.bc-tabs button[data-tab="' + name + '"]');
    if (tab) tab.classList.add('active');
    var pane = root.querySelector('#bc-pane-' + name);
    if (pane) pane.classList.add('active');
  }

  function scanOnText() {
    return scanMode === 'assign'
      ? 'Assign scan on — only unlabelled barcodes are accepted.'
      : 'Billing scan on — labelled barcodes add to the bill.';
  }

  function clearScanError() {
    var el = root && root.querySelector('#bc-scanerror');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  function showScanError(msg) {
    var el = root && root.querySelector('#bc-scanerror');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    toast(msg, true);
  }

  function setScanMode(mode) {
    scanMode = mode === 'assign' ? 'assign' : 'billing';
    var billBtn = root && root.querySelector('#bc-mode-billing');
    var assignBtn = root && root.querySelector('#bc-mode-assign');
    if (billBtn) {
      billBtn.classList.toggle('active', scanMode === 'billing');
      billBtn.classList.toggle('bc-alt', scanMode !== 'billing');
    }
    if (assignBtn) {
      assignBtn.classList.toggle('active', scanMode === 'assign');
      assignBtn.classList.toggle('bc-alt', scanMode !== 'assign');
    }
    var desc = root && root.querySelector('#bc-scan-desc');
    if (desc) desc.textContent = scanMode === 'billing'
      ? 'Billing mode: only labelled barcodes are added to the bill. Unlabelled barcodes show an error.'
      : 'Assigning mode: only unlabelled barcodes are accepted. Labelled barcodes show an error.';
    clearScanError();
    if (scanStatusEl && !scanning) scanStatusEl.textContent = 'Camera off.';
  }

  function showUnknown(code) {
    lastScanned = String(code || '').trim();
    root.querySelector('#bc-unknown-code').textContent = lastScanned;
    showAssignArea();
    setPane('unknown');
  }

  function showAssignArea() {
    root.querySelector('#bc-assign-area').style.display = 'block';
    renderUnassigned();
  }

  async function assignLabel() {
    var id = Number(root.querySelector('#bc-assign-product').value);
    var prod = products.find(function (p) { return p.id === id; });
    if (!prod) { toast('Choose a product', true); return; }
    if (hasBarcode(prod)) { toast(prod.name + ' already has a barcode', true); return; }
    try {
      await saveBarcode(id, lastScanned);
      removeBlankCode(lastScanned);
      renderAssign(); renderLabels(); renderUnassigned();
      toast('Label saved for ' + prod.name + ' — scan it again in billing mode to add it');
      setPane('scan');
      if (!scanning) await startScan();
      else scanStatusEl.textContent = scanOnText();
    } catch (e) { toast(e.message, true); }
  }

  function handleScan(text) {
    var code = String(text || '').trim();
    var p = products.find(function (x) { return x.barcode && x.barcode.trim().toUpperCase() === code.toUpperCase(); });
    clearScanError();
    if (scanMode === 'billing') {
      if (!p) {
        stopScan();
        showScanError('Non-labeled barcode. Use Scan for assigning to label it first.');
        return;
      }
      sessionStorage.setItem('specs.pendingBarcodeProduct', JSON.stringify(p));
      stopScan();
      if (/^\/pos(\/|$)/.test(location.pathname)) deliver(p);
      else { toast('Adding ' + p.name + ' to bill…'); location.href = '/?specsView=pos'; }
      return;
    }
    if (p) {
      stopScan();
      showScanError('Barcode already labeled: ' + p.name + '. Use Scan for billing to add it.');
      return;
    }
    stopScan();
    showUnknown(code);
  }

  async function startScan() {
    if (!window.ZXingBrowser && !window.BarcodeDetector) { toast('Scanner not available in this browser', true); return; }
    startBtn.disabled = true; stopBtn.disabled = false;
    scanStatusEl.textContent = 'Starting camera…';
    try {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          var perm = await navigator.permissions.query({ name: 'camera' });
          if (perm.state === 'denied') {
            startBtn.disabled = false; stopBtn.disabled = true;
            scanStatusEl.textContent = 'Camera blocked — allow it in the address bar, or type the code below.';
            return;
          }
        } catch (e) {}
      }
      if (!products.length) await loadProducts();
      var usedNative = false;
      if (window.BarcodeDetector && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          var supported = [];
          if (typeof BarcodeDetector.getSupportedFormats === 'function') supported = await BarcodeDetector.getSupportedFormats();
          var wanted = supported.filter(function (f) { return /code_128|ean_13|ean_8|upc_a|upc_e|code_39|code_93|itf|qr_code/i.test(f); });
          var detector = new BarcodeDetector(wanted.length ? { formats: wanted } : undefined);
          var stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
          });
          videoEl.srcObject = stream;
          await videoEl.play();
          scanning = true; usedNative = true;
          nativeTimer = setInterval(async function () {
            if (!scanning) return;
            try {
              var codes = await detector.detect(videoEl);
              if (codes && codes.length) handleScan(codes[0].rawValue);
            } catch (e) {}
          }, 250);
          scanControls = { stop: function () {
            try { clearInterval(nativeTimer); } catch (e) {}
            nativeTimer = null;
            try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          }};
          scanStatusEl.textContent = scanOnText();
        } catch (e) { /* fall back to ZXing */ }
      }
      if (!usedNative) {
        var reader = new ZXingBrowser.BrowserMultiFormatReader();
        var devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
        var dev = devices.find(function (d) { return /back|rear|environment/i.test(d.label || ''); }) || devices[0];
        scanControls = await reader.decodeFromVideoDevice(dev && dev.deviceId ? dev.deviceId : null, videoEl, function (result, err) {
          if (result) handleScan(result.getText());
        });
        scanning = true;
        scanStatusEl.textContent = scanOnText();
      }
      if (scanHint) clearTimeout(scanHint);
      scanHint = setTimeout(function () {
        if (scanning) scanStatusEl.textContent = 'No code yet — hold closer, improve light, or type the code below.';
      }, 7000);
    } catch (e) {
      stopScan();
      var msg = e && e.name === 'NotAllowedError'
        ? 'Camera permission denied — allow it in the address bar, or type the code below.'
        : 'Camera error: ' + (e && e.message ? e.message : 'unknown') + ' — you can type the code below.';
      scanStatusEl.textContent = msg;
      toast('Camera unavailable — you can still type the barcode', true);
    }
  }

  function buildUI() {
    root = document.createElement('div');
    root.id = 'specs-barcode-root';
    root.innerHTML =
      '<style>' +
      '.bc-inline #bc-modal{position:static;display:block;background:transparent;padding:0}' +
      '.bc-inline .bc-box{width:100%;max-height:none;box-shadow:none;border:1px solid #ddd;border-radius:12px}' +
      '.bc-inline .bc-head{display:none}' +
      '#bc-modal{position:fixed;inset:0;z-index:9999;background:#0008;display:none;align-items:center;justify-content:center;padding:16px;font-family:Arial,sans-serif}' +
      '#bc-modal.open{display:flex}' +
      '.bc-box{background:#fff;width:min(980px,100%);max-height:92vh;overflow:auto;border-radius:14px;box-shadow:0 20px 60px #0006}' +
      '.bc-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #eee;background:#faf7f2}' +
      '.bc-head h2{margin:0;font-size:18px;color:#3b2a1a}' +
      '.bc-tabs{display:flex;gap:6px;padding:10px 18px 0}' +
      '.bc-tabs button{border:0;background:#efe8dd;color:#3b2a1a;padding:8px 14px;border-radius:8px 8px 0 0;cursor:pointer;font-weight:600;font-size:13px}' +
      '.bc-tabs button.active{background:#3b2a1a;color:#fff}' +
      '.bc-pane{display:none;padding:16px 18px 20px}.bc-pane.active{display:block}' +
      '.bc-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center}' +
      '.bc-toolbar input[type=search]{flex:1;min-width:200px;padding:9px 11px;border:1px solid #ccc;border-radius:8px;font-size:14px}' +
      '.bc-toolbar button,.bc-actions button{padding:8px 12px;border:1px solid #3b2a1a;background:#3b2a1a;color:#fff;border-radius:8px;cursor:pointer;font-size:12px}' +
      '.bc-toolbar button.bc-alt,.bc-actions button.bc-alt{background:#fff;color:#3b2a1a}' +
      '.bc-toolbar button:disabled{opacity:.45;cursor:not-allowed}' +
      '.bc-actions button.bc-danger{background:#fff;color:#9d0208;border-color:#9d0208}' +
      '.bc-row{display:flex;align-items:center;gap:12px;padding:9px;border:1px solid #eee;border-radius:10px;margin-bottom:7px}' +
      '.bc-mini-wrap{width:130px;flex:0 0 130px;text-align:center}.bc-mini-wrap svg{max-width:130px;height:42px}' +
      '.bc-none{color:#bbb;font-size:12px}.bc-info{flex:1;min-width:0}.bc-info b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bc-info small{color:#777;font-size:12px}' +
      '.bc-code{color:#2d6a4f;font-weight:600}.bc-missing{color:#c1121f;font-weight:600}.bc-input{width:100%;max-width:220px;padding:7px;border:1px solid #3b2a1a;border-radius:6px}' +
      '.bc-actions{display:flex;gap:6px;flex-wrap:wrap}' +
      '.bc-empty{padding:18px;color:#888;text-align:center;font-size:13px}' +
      '.bc-scanwrap{display:flex;gap:18px;flex-wrap:wrap}.bc-scanwrap video{width:340px;max-width:100%;height:230px;background:#111;border-radius:10px;object-fit:cover}.bc-scaninfo{flex:1;min-width:220px}' +
      '.bc-scaninfo p{font-size:13px;color:#555;line-height:1.5}' +
      '.bc-mode.active{background:#1b4332;color:#fff;border-color:#1b4332}' +
      '.bc-error{margin-top:8px;padding:9px 11px;border-radius:8px;background:#fff0f0;color:#9d0208;font-size:13px;font-weight:700;border:1px solid #ffc9c9}' +
      '.bc-unknown{background:#fff8ed;border:1px solid #f0d9b5;border-radius:12px;padding:16px}' +
      '.bc-unknown h3{margin:0 0 8px;color:#8a4b08;font-size:17px}' +
      '.bc-unknown-note{font-size:13px;color:#665;line-height:1.5}' +
      '.bc-scanned{font:600 14px Arial,sans-serif;color:#3b2a1a;background:#fff;border:1px dashed #c9a227;border-radius:8px;padding:10px;word-break:break-all}' +
      '.bc-toolbar input:not([type=search]){padding:9px 11px;border:1px solid #ccc;border-radius:8px;font-size:14px}' +
      '#bc-assign-area{display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap}' +
      '#bc-assign-product{padding:9px;border:1px solid #ccc;border-radius:8px;max-width:320px}' +
      '.bc-note{font-size:12px;color:#666;line-height:1.5;margin:6px 0}' +
      '.bc-gen-list{display:flex;flex-wrap:wrap;gap:8px;max-height:180px;overflow:auto}' +
      '.bc-gen-item{width:150px;border:1px solid #eee;border-radius:8px;padding:6px;text-align:center;font-size:10px;color:#555}' +
      '.bc-gen-item svg{display:block;width:130px;height:32px;margin:2px auto}.bc-gen-item span{display:block;font-family:monospace;word-break:break-all}' +
      '.bc-labelgrid{display:grid;grid-template-columns:260px 1fr;gap:16px}' +
      '.bc-checks{max-height:420px;overflow:auto;border:1px solid #eee;border-radius:10px;padding:8px}' +
      '.bc-check{display:flex;gap:6px;align-items:center;padding:4px 2px;font-size:13px;cursor:pointer}.bc-check span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bc-check small{color:#888;font-size:10px}' +
      '.bc-labels{display:flex;flex-wrap:wrap;gap:2mm;background:#f3f3f3;padding:8px;border-radius:10px;max-height:430px;overflow:auto}' +
      '.bc-label{width:20mm;height:15mm;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0.2mm;border:1px solid #ddd;border-radius:1.2mm;box-sizing:border-box}' +
      '.bc-labels.size-15-20 .bc-label{width:15mm;height:20mm}' +
      '.bc-lbar{width:18mm;height:10mm;display:block;margin:0}.bc-labels.size-15-20 .bc-lbar{width:13mm;height:15mm}' +
      '.bc-preview-note{width:100%;font-size:11px;color:#777;padding:6px;text-align:center}' +
      '#bc-toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);background:#1b4332;color:#fff;padding:10px 18px;border-radius:999px;z-index:10000;font:13px Arial,sans-serif;opacity:0;pointer-events:none;transition:.22s;box-shadow:0 8px 24px #0004;max-width:90vw;text-align:center}' +
      '#bc-toast.show{opacity:1;transform:translate(-50%,0)}#bc-toast.bad{background:#9d0208}' +
      '@media(max-width:700px){.bc-labelgrid{grid-template-columns:1fr}.bc-mini-wrap{display:none}}' +
      '</style>' +
      '<div id="bc-modal"><div class="bc-box">' +
      '<div class="bc-head"><h2>🏷️ Barcode Tools</h2><button type="button" id="bc-close" style="border:0;background:none;font-size:22px;cursor:pointer">×</button></div>' +
      '<div class="bc-tabs"><button type="button" data-tab="generate" class="active">Generate</button><button type="button" data-tab="assign">Assign</button><button type="button" data-tab="scan">Scan</button><button type="button" data-tab="labels">Labels</button></div>' +
      '<div class="bc-pane active" id="bc-pane-generate"><div class="bc-toolbar">' +
      '<label for="bc-qty" style="font-size:13px;font-weight:600">How many stickers?</label>' +
      '<input id="bc-qty" type="number" min="1" max="5000" value="100" style="width:100px" />' +
      '<button type="button" id="bc-generate">Generate random barcodes</button>' +
      '<button type="button" id="bc-clear" class="bc-alt">Clear unused</button></div>' +
      '<p class="bc-note">Creates blank Code 128 stickers with no product name and no code printed. Scan a sticker later to label it.</p>' +
      '<div id="bc-generated"></div></div>' +
      '<div class="bc-pane" id="bc-pane-assign"><div class="bc-toolbar">' +
      '<input id="bc-search" type="search" placeholder="Search product, ID or barcode" />' +
      '<button type="button" id="bc-genall">Generate all missing</button>' +
      '<button type="button" id="bc-refresh" class="bc-alt">Refresh</button></div><div id="bc-list"></div></div>' +
      '<div class="bc-pane" id="bc-pane-scan"><div class="bc-scanwrap">' +
      '<video id="bc-video" playsinline muted></video><div class="bc-scaninfo">' +
      '<h3>Scan with device camera</h3><p id="bc-scan-desc">Billing mode: only labelled barcodes are added to the bill. Unlabelled barcodes show an error.</p>' +
      '<div class="bc-toolbar"><button type="button" id="bc-mode-billing" class="bc-mode active">Scan for billing</button><button type="button" id="bc-mode-assign" class="bc-mode bc-alt">Scan for assigning</button></div>' +
      '<div class="bc-toolbar"><button type="button" id="bc-start">Start camera</button><button type="button" id="bc-stop" class="bc-alt" disabled>Stop</button></div>' +
      '<div class="bc-toolbar" style="margin-top:6px"><input id="bc-manual-code" placeholder="Or type / paste barcode here" /><button type="button" id="bc-manual-use">Use code</button></div>' +
      '<p id="bc-scanstatus">Camera off.</p><p id="bc-scanerror" class="bc-error" style="display:none"></p></div></div></div>' +
      '<div class="bc-pane" id="bc-pane-unknown"><div class="bc-unknown">' +
      '<h3>Label this barcode</h3>' +
      '<p class="bc-unknown-note">This barcode is not labelled yet. Choose the inventory product it belongs to and press Assign label. Its saved inventory price will be used when you scan it in billing mode.</p>' +
      '<p class="bc-scanned">Scanned: <b id="bc-unknown-code"></b></p>' +
      '<div id="bc-assign-area">' +
      '<div class="bc-toolbar"><select id="bc-assign-product"></select><button type="button" id="bc-assign-confirm">Assign label</button><button type="button" id="bc-unknown-cancel" class="bc-alt">Back to scan</button></div>' +
      '<p id="bc-assign-price" class="bc-note"></p>' +
      '<p id="bc-unassigned-empty" class="bc-empty" style="display:none">Every inventory product already has a barcode. Add the product to Inventory first, then scan this sticker again.</p>' +
      '</div>' +
      '</div></div>' +
      '<div class="bc-pane" id="bc-pane-labels"><div class="bc-toolbar">' +
      '<select id="bc-size"><option value="20x15" selected>20 × 15 mm (landscape)</option><option value="15x20">15 × 20 mm</option></select>' +
      '<button type="button" id="bc-selall">Select all</button><button type="button" id="bc-print">Print A4 stickers</button>' +
      '<span class="bc-note">Only the barcode is printed — no name, code or price. Scan a sticker to label it.</span></div>' +
      '<div class="bc-labelgrid"><div class="bc-checks" id="bc-label-list"></div><div class="bc-labels" id="bc-label-preview"></div></div></div>' +
      '</div></div>';
    document.body.appendChild(root);

    listEl = root.querySelector('#bc-list');
    searchEl = root.querySelector('#bc-search');
    labelListEl = root.querySelector('#bc-label-list');
    labelPreviewEl = root.querySelector('#bc-label-preview');
    videoEl = root.querySelector('#bc-video');
    scanStatusEl = root.querySelector('#bc-scanstatus');
    startBtn = root.querySelector('#bc-start');
    stopBtn = root.querySelector('#bc-stop');

    root.querySelector('#bc-close').onclick = close;
    root.querySelectorAll('.bc-tabs button').forEach(function (b) {
      b.onclick = function () {
        root.querySelectorAll('.bc-tabs button').forEach(function (x) { x.classList.remove('active'); });
        root.querySelectorAll('.bc-pane').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        root.querySelector('#bc-pane-' + b.getAttribute('data-tab')).classList.add('active');
        if (b.getAttribute('data-tab') === 'labels') drawLabels();
        if (b.getAttribute('data-tab') === 'generate') renderGenerated();
        if (b.getAttribute('data-tab') === 'scan' && scanning) scanStatusEl.textContent = scanOnText();
      };
    });
    searchEl.oninput = renderAssign;
    root.querySelector('#bc-generate').onclick = function () {
      generateBlankCodes(root.querySelector('#bc-qty').value);
    };
    root.querySelector('#bc-qty').onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); root.querySelector('#bc-generate').click(); }
    };
    root.querySelector('#bc-clear').onclick = clearBlankCodes;
    root.querySelector('#bc-refresh').onclick = async function () { await loadProducts(); renderAssign(); renderLabels(); toast('Products refreshed'); };
    root.querySelector('#bc-genall').onclick = generateMissing;
    startBtn.onclick = startScan;
    stopBtn.onclick = stopScan;
    var useManual = function () {
      var v = root.querySelector('#bc-manual-code').value.trim();
      if (!v) { toast('Enter a barcode first', true); return; }
      handleScan(v);
    };
    root.querySelector('#bc-manual-use').onclick = useManual;
    root.querySelector('#bc-manual-code').onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); useManual(); }
    };
    root.querySelector('#bc-mode-billing').onclick = function () { setScanMode('billing'); };
    root.querySelector('#bc-mode-assign').onclick = function () { setScanMode('assign'); };
    root.querySelector('#bc-assign-product').onchange = updateAssignedPrice;
    root.querySelector('#bc-assign-confirm').onclick = assignLabel;
    root.querySelector('#bc-unknown-cancel').onclick = async function () { setPane('scan'); if (!scanning) await startScan(); };
    root.querySelector('#bc-selall').onclick = function () {
      var codes = allLabelCodes();
      if (selectedCodes.size === codes.length) selectedCodes.clear();
      else codes.forEach(function (c) { selectedCodes.add(c); });
      renderLabels();
    };
    root.querySelector('#bc-size').onchange = function (e) { labelSize = e.target.value; drawLabels(); };
    root.querySelector('#bc-print').onclick = printLabels;

    listEl.onclick = function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var row = btn.closest('.bc-row');
      var p = products.find(function (x) { return String(x.id) === row.getAttribute('data-id'); });
      if (!p) return;
      var act = btn.getAttribute('data-act');
      if (act === 'gen' || act === 'save') {
        var used = products.map(function (x) { return x.barcode || ''; }).filter(Boolean).filter(function (c) { return c !== p.barcode; });
        saveBarcode(p.id, suggest(p, used)).then(function () {
          renderAssign(); renderLabels(); toast('Barcode saved');
        }).catch(function (err) { toast(err.message, true); });
      } else if (act === 'edit') inlineEdit(row, p);
    };
    labelListEl.onchange = function (e) {
      if (e.target.type !== 'checkbox') return;
      var code = normCode(e.target.value);
      if (e.target.checked) selectedCodes.add(code); else selectedCodes.delete(code);
      drawLabels();
    };

    window.addEventListener('beforeunload', stopScan);
  }

  async function open() {
    root.querySelector('#bc-modal').classList.add('open');
    try {
      await loadProducts();
      renderAssign(); renderLabels(); renderGenerated();
    } catch (e) { toast('Could not load products: ' + e.message, true); }
  }

  async function scanNow(mode) {
    await open();
    setScanMode(mode);
    setPane('scan');
    if (!scanning) await startScan();
  }

  function close() {
    if (inlineMode) return;
    stopScan();
    root.querySelector('#bc-modal').classList.remove('open');
  }

  function mountInline(host) {
    if (!host || !root) return;
    inlineMode = true;
    root.classList.add('bc-inline');
    if (root.parentNode !== host) host.appendChild(root);
    root.querySelector('#bc-modal').classList.add('open');
    renderGenerated();
    if (!products.length) {
      loadProducts().then(function () { renderAssign(); renderLabels(); }).catch(function () {});
    }
  }

  function unmountInline() {
    if (!inlineMode) return;
    stopScan();
    inlineMode = false;
    root.classList.remove('bc-inline');
    root.querySelector('#bc-modal').classList.remove('open');
    if (root.parentNode !== document.body) document.body.appendChild(root);
  }

  function boot() {
    loadBlankCodes();
    buildUI();
    var pending = sessionStorage.getItem('specs.pendingBarcodeProduct');
    if (pending && /^\/pos(\/|$)/.test(location.pathname)) {
      sessionStorage.removeItem('specs.pendingBarcodeProduct');
      try { deliver(JSON.parse(pending)); } catch (e) {}
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SpecsBarcode = {
    refresh: loadProducts, open: open,
    scan: function () { return scanNow('billing'); },
    scanBilling: function () { return scanNow('billing'); },
    scanAssign: function () { return scanNow('assign'); },
    setScanMode: setScanMode,
    handleCode: handleScan,
    mountInline: mountInline, unmountInline: unmountInline
  };
})();
