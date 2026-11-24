(function () {
  'use strict';

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
  var labelSize = '20x15';
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
        '<button type="button" data-act="label" class="bc-alt">Label</button>' +
        '</div></div>';
    }).join('') : '<div class="bc-empty">No matching products.</div>';
    drawBarcodes(listEl);
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
    info.innerHTML = '<input class="bc-input" value="' + esc(p.barcode || suggest(p)) + '" maxlength="32" />' +
      '<small>Code 128 · letters/numbers</small>';
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
    acts.innerHTML = '<button type="button" data-act="save">Save</button><button type="button" data-act="cancel" class="bc-alt">Cancel</button>';
    acts.onclick = function (e) {
      e.stopPropagation();
      var a = e.target.getAttribute('data-act');
      if (a === 'save') commit(true);
      if (a === 'cancel') commit(false);
    };
    row._restore = function () { info.innerHTML = old; acts.innerHTML = oldActs; acts.onclick = null; };
  }

  function renderLabels() {
    var assigned = products.filter(function (p) { return p.barcode && p.barcode.trim(); });
    labelListEl.innerHTML = assigned.length ? assigned.map(function (p) {
      return '<label class="bc-check"><input type="checkbox" value="' + p.id + '"' + (selected.has(p.id) ? ' checked' : '') + ' /> ' +
        '<span>' + esc(p.name) + '</span><small>' + esc(p.barcode) + '</small></label>';
    }).join('') : '<div class="bc-empty">No barcodes assigned yet.</div>';
    drawLabels();
  }

  function chosenProducts() {
    if (selected.size) return products.filter(function (p) { return selected.has(p.id) && p.barcode; });
    return products.filter(function (p) { return p.barcode && p.barcode.trim(); });
  }

  function labelMarkup(p) {
    return '<div class="bc-label" data-code="' + esc(p.barcode) + '">' +
      '<div class="bc-lname">' + esc(p.name) + '</div>' +
      '<svg class="bc-lbar" data-barcode="' + esc(p.barcode) + '"></svg>' +
      '<div class="bc-lprice">' + money2(p) + '</div>' +
      '</div>';
  }

  function drawLabels() {
    labelPreviewEl.className = 'bc-labels size-' + labelSize.replace('x', '-');
    labelPreviewEl.innerHTML = chosenProducts().map(labelMarkup).join('') ||
      '<div class="bc-empty">Select products on the left.</div>';
    drawBarcodes(labelPreviewEl);
  }

  function printLabels() {
    var list = chosenProducts();
    if (!list.length) { toast('Select at least one product', true); return; }
    labelPreviewEl.querySelectorAll('svg[data-barcode]').forEach(drawOne);
    function drawOne(svg) {
      if (svg.getAttribute('data-drawn') === '1') return;
      try {
        JsBarcode(svg, svg.getAttribute('data-barcode'), {
          format: 'CODE128', displayValue: false, width: 2, height: 42, margin: 0
        });
        svg.setAttribute('data-drawn', '1');
      } catch (e) {}
    }
    var w = labelSize === '20x15' ? '20mm' : '15mm';
    var h = labelSize === '20x15' ? '15mm' : '20mm';
    var cols = labelSize === '20x15' ? 10 : 13;
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>Barcode labels</title><style>' +
      '@page{size:A4;margin:5mm}body{margin:0;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.sheet{display:grid;grid-template-columns:repeat(' + cols + ',' + w + ');grid-auto-rows:' + h + ';gap:0}' +
      '.bc-label{width:' + w + ';height:' + h + ';box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;overflow:hidden;text-align:center;padding:0.3mm 0.5mm;border:0.2mm dotted #bbb}' +
      '.bc-lname{font-size:5.2pt;line-height:1;margin:0;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 0.4mm}' +
      '.bc-lbar{width:17mm;height:7.5mm;display:block;margin:0}' +
      '.bc-lprice{font-size:7pt;font-weight:bold;line-height:1;margin:0.2mm 0 0}' +
      '.size-15-20 .bc-lbar{width:13mm;height:10mm}' +
      '</style></head><body><div class="sheet size-' + labelSize.replace('x', '-') + '">' +
      list.map(function (p) {
        var svg = labelPreviewEl.querySelector('svg[data-barcode="' + CSS.escape(p.barcode) + '"]');
        return '<div class="bc-label"><div class="bc-lname">' + esc(p.name) + '</div>' +
          (svg ? svg.outerHTML : '<svg class="bc-lbar"></svg>') +
          '<div class="bc-lprice">' + money2(p) + '</div></div>';
      }).join('') + '</div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>';
    var win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { toast('Allow pop-ups to print labels', true); return; }
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

  function showUnknown(code) {
    lastScanned = String(code || '').trim();
    root.querySelector('#bc-unknown-code').textContent = lastScanned;
    root.querySelector('#bc-unknown-name').value = lastScanned;
    root.querySelector('#bc-unknown-price').value = '';
    root.querySelector('#bc-assign-area').style.display = 'none';
    setPane('unknown');
  }

  function toggleAssignArea() {
    var area = root.querySelector('#bc-assign-area');
    if (area.style.display !== 'none') { area.style.display = 'none'; return; }
    root.querySelector('#bc-assign-product').innerHTML = products.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
    }).join('');
    area.style.display = 'block';
  }

  async function finishUnknown(mode) {
    var name = root.querySelector('#bc-unknown-name').value.trim() || lastScanned;
    var price = Number(root.querySelector('#bc-unknown-price').value);
    if (!(price > 0)) { toast('Enter a price greater than 0', true); return; }
    try {
      if (mode === 'manual') {
        deliver({ id: 'barcode-' + lastScanned, name: name, price: price, offer_price: null, barcode: lastScanned });
      } else if (mode === 'new') {
        var rows = await api('', {
          method: 'POST',
          body: JSON.stringify({
            name: name, category: 'Uncategorized', price: price, barcode: lastScanned,
            is_active: true, unit: '1pc', base_quantity: 1, unit_type: 'unit', unit_label: 'pc'
          })
        });
        var created = Array.isArray(rows) ? rows[0] : rows;
        products.push(created);
        deliver(created);
        renderAssign(); renderLabels();
      } else if (mode === 'assign') {
        var id = Number(root.querySelector('#bc-assign-product').value);
        if (!id) { toast('Choose a product', true); return; }
        await saveBarcode(id, lastScanned);
        var prod = products.find(function (p) { return p.id === id; });
        deliver(prod);
        renderAssign(); renderLabels();
      }
      setPane('scan');
      if (!scanning) await startScan();
    } catch (e) { toast(e.message, true); }
  }

  function handleScan(text) {
    var code = String(text || '').trim();
    var p = products.find(function (x) { return x.barcode && x.barcode.trim().toUpperCase() === code.toUpperCase(); });
    if (!p) { showUnknown(code); return; }
    sessionStorage.setItem('specs.pendingBarcodeProduct', JSON.stringify(p));
    stopScan();
    if (/^\/pos(\/|$)/.test(location.pathname)) deliver(p);
    else { toast('Opening billing panel…'); location.href = '/pos'; }
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
          scanStatusEl.textContent = 'Camera on (fast scanner) — point at a barcode.';
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
        scanStatusEl.textContent = 'Camera on — point at a barcode.';
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
      '#bc-fab{position:fixed;right:18px;bottom:18px;z-index:9998;background:#3b2a1a;color:#fff;border:0;border-radius:999px;padding:12px 18px;font:600 13px Arial,sans-serif;box-shadow:0 6px 18px #0004;cursor:pointer}' +
      '#bc-fab:hover{background:#5a4128}' +
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
      '.bc-row{display:flex;align-items:center;gap:12px;padding:9px;border:1px solid #eee;border-radius:10px;margin-bottom:7px}' +
      '.bc-mini-wrap{width:130px;flex:0 0 130px;text-align:center}.bc-mini-wrap svg{max-width:130px;height:42px}' +
      '.bc-none{color:#bbb;font-size:12px}.bc-info{flex:1;min-width:0}.bc-info b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bc-info small{color:#777;font-size:12px}' +
      '.bc-code{color:#2d6a4f;font-weight:600}.bc-missing{color:#c1121f;font-weight:600}.bc-input{width:100%;max-width:220px;padding:7px;border:1px solid #3b2a1a;border-radius:6px}' +
      '.bc-actions{display:flex;gap:6px;flex-wrap:wrap}' +
      '.bc-empty{padding:18px;color:#888;text-align:center;font-size:13px}' +
      '.bc-scanwrap{display:flex;gap:18px;flex-wrap:wrap}.bc-scanwrap video{width:340px;max-width:100%;height:230px;background:#111;border-radius:10px;object-fit:cover}.bc-scaninfo{flex:1;min-width:220px}' +
      '.bc-scaninfo p{font-size:13px;color:#555;line-height:1.5}' +
      '.bc-unknown{background:#fff8ed;border:1px solid #f0d9b5;border-radius:12px;padding:16px}' +
      '.bc-unknown h3{margin:0 0 8px;color:#8a4b08;font-size:17px}' +
      '.bc-unknown-note{font-size:13px;color:#665;line-height:1.5}' +
      '.bc-scanned{font:600 14px Arial,sans-serif;color:#3b2a1a;background:#fff;border:1px dashed #c9a227;border-radius:8px;padding:10px;word-break:break-all}' +
      '.bc-toolbar input:not([type=search]){padding:9px 11px;border:1px solid #ccc;border-radius:8px;font-size:14px}' +
      '#bc-assign-area{display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap}' +
      '#bc-assign-product{padding:9px;border:1px solid #ccc;border-radius:8px;max-width:320px}' +
      '.bc-labelgrid{display:grid;grid-template-columns:260px 1fr;gap:16px}' +
      '.bc-checks{max-height:420px;overflow:auto;border:1px solid #eee;border-radius:10px;padding:8px}' +
      '.bc-check{display:flex;gap:6px;align-items:center;padding:4px 2px;font-size:13px;cursor:pointer}.bc-check span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bc-check small{color:#888;font-size:10px}' +
      '.bc-labels{display:flex;flex-wrap:wrap;gap:2mm;background:#f3f3f3;padding:8px;border-radius:10px;max-height:430px;overflow:auto}' +
      '.bc-label{width:20mm;height:15mm;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;overflow:hidden;text-align:center;padding:0.3mm 0.5mm;border:1px solid #ddd;box-sizing:border-box}' +
      '.bc-labels.size-15-20 .bc-label{width:15mm;height:20mm}' +
      '.bc-lname{font-size:5.2pt;line-height:1;margin:0;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.bc-lbar{width:17mm;height:7.5mm;display:block;margin:0}.bc-labels.size-15-20 .bc-lbar{width:13mm;height:10mm}' +
      '.bc-lprice{font-size:7pt;font-weight:bold;line-height:1;margin:0.2mm 0 0}' +
      '#bc-toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);background:#1b4332;color:#fff;padding:10px 18px;border-radius:999px;z-index:10000;font:13px Arial,sans-serif;opacity:0;pointer-events:none;transition:.22s;box-shadow:0 8px 24px #0004;max-width:90vw;text-align:center}' +
      '#bc-toast.show{opacity:1;transform:translate(-50%,0)}#bc-toast.bad{background:#9d0208}' +
      '@media(max-width:700px){.bc-labelgrid{grid-template-columns:1fr}.bc-mini-wrap{display:none}}' +
      '</style>' +
      '<button id="bc-fab" type="button" title="Assign barcodes, scan with camera, print labels">⌖ Barcode Tools</button>' +
      '<div id="bc-modal"><div class="bc-box">' +
      '<div class="bc-head"><h2>🏷️ Barcode Tools</h2><button type="button" id="bc-close" style="border:0;background:none;font-size:22px;cursor:pointer">×</button></div>' +
      '<div class="bc-tabs"><button type="button" data-tab="assign" class="active">Assign</button><button type="button" data-tab="scan">Scan</button><button type="button" data-tab="labels">Labels</button></div>' +
      '<div class="bc-pane active" id="bc-pane-assign"><div class="bc-toolbar">' +
      '<input id="bc-search" type="search" placeholder="Search product, ID or barcode" />' +
      '<button type="button" id="bc-genall">Generate all missing</button>' +
      '<button type="button" id="bc-refresh" class="bc-alt">Refresh</button></div><div id="bc-list"></div></div>' +
      '<div class="bc-pane" id="bc-pane-scan"><div class="bc-scanwrap">' +
      '<video id="bc-video" playsinline muted></video><div class="bc-scaninfo">' +
      '<h3>Scan with device camera</h3><p>The camera reads Code 128, EAN/UPC and other common barcodes. Known codes add the item instantly; unknown codes can still be billed or attached to a product.</p>' +
      '<div class="bc-toolbar"><button type="button" id="bc-start">Start camera</button><button type="button" id="bc-stop" class="bc-alt" disabled>Stop</button></div>' +
      '<div class="bc-toolbar" style="margin-top:6px"><input id="bc-manual-code" placeholder="Or type / paste barcode here" /><button type="button" id="bc-manual-use">Use code</button></div>' +
      '<p id="bc-scanstatus">Camera off.</p></div></div></div>' +
      '<div class="bc-pane" id="bc-pane-unknown"><div class="bc-unknown">' +
      '<h3>Barcode not found in catalog</h3>' +
      '<p class="bc-unknown-note">This code can still be billed. Enter a name and price, save it as a new product, or attach it to an existing one.</p>' +
      '<p class="bc-scanned">Scanned: <b id="bc-unknown-code"></b></p>' +
      '<div class="bc-toolbar"><input id="bc-unknown-name" placeholder="Item name" /><input id="bc-unknown-price" type="number" min="0" step="0.01" placeholder="Price ₹" /></div>' +
      '<div class="bc-toolbar"><button type="button" id="bc-add-manual">Add to cart only</button><button type="button" id="bc-save-product">Save as product & add</button><button type="button" id="bc-assign-existing" class="bc-alt">Assign to existing product</button><button type="button" id="bc-unknown-cancel" class="bc-alt">Back to scan</button></div>' +
      '<div id="bc-assign-area" style="display:none"><select id="bc-assign-product"></select><button type="button" id="bc-assign-confirm">Assign & add</button></div>' +
      '</div></div>' +
      '<div class="bc-pane" id="bc-pane-labels"><div class="bc-toolbar">' +
      '<select id="bc-size"><option value="20x15" selected>20 × 15 mm (landscape)</option><option value="15x20">15 × 20 mm</option></select>' +
      '<button type="button" id="bc-selall">Select all</button><button type="button" id="bc-print">Print A4 labels</button>' +
      '<span style="font-size:12px;color:#777">Price is printed below every barcode</span></div>' +
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

    root.querySelector('#bc-fab').onclick = open;
    root.querySelector('#bc-close').onclick = close;
    root.querySelectorAll('.bc-tabs button').forEach(function (b) {
      b.onclick = function () {
        root.querySelectorAll('.bc-tabs button').forEach(function (x) { x.classList.remove('active'); });
        root.querySelectorAll('.bc-pane').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        root.querySelector('#bc-pane-' + b.getAttribute('data-tab')).classList.add('active');
        if (b.getAttribute('data-tab') === 'labels') drawLabels();
        if (b.getAttribute('data-tab') === 'scan' && scanning) scanStatusEl.textContent = 'Camera on — point at a barcode.';
      };
    });
    searchEl.oninput = renderAssign;
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
    root.querySelector('#bc-add-manual').onclick = function () { finishUnknown('manual'); };
    root.querySelector('#bc-save-product').onclick = function () { finishUnknown('new'); };
    root.querySelector('#bc-assign-existing').onclick = toggleAssignArea;
    root.querySelector('#bc-assign-confirm').onclick = function () { finishUnknown('assign'); };
    root.querySelector('#bc-unknown-cancel').onclick = async function () { setPane('scan'); if (!scanning) await startScan(); };
    root.querySelector('#bc-selall').onclick = function () {
      var assigned = products.filter(function (p) { return p.barcode; });
      if (selected.size === assigned.length) selected.clear();
      else assigned.forEach(function (p) { selected.add(p.id); });
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
      else if (act === 'label') {
        selected.add(p.id); renderLabels();
        root.querySelector('.bc-tabs button[data-tab="labels"]').click();
      }
    };
    labelListEl.onchange = function (e) {
      if (e.target.type !== 'checkbox') return;
      var id = Number(e.target.value);
      if (e.target.checked) selected.add(id); else selected.delete(id);
      drawLabels();
    };

    window.addEventListener('beforeunload', stopScan);
  }

  async function open() {
    root.querySelector('#bc-modal').classList.add('open');
    try {
      await loadProducts();
      renderAssign(); renderLabels();
    } catch (e) { toast('Could not load products: ' + e.message, true); }
  }

  async function scanNow() {
    await open();
    setPane('scan');
    if (!scanning) await startScan();
  }

  function close() {
    stopScan();
    root.querySelector('#bc-modal').classList.remove('open');
  }

  function boot() {
    buildUI();
    var pending = sessionStorage.getItem('specs.pendingBarcodeProduct');
    if (pending && /^\/pos(\/|$)/.test(location.pathname)) {
      sessionStorage.removeItem('specs.pendingBarcodeProduct');
      try { deliver(JSON.parse(pending)); } catch (e) {}
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SpecsBarcode = { refresh: loadProducts, open: open, scan: scanNow, handleCode: handleScan };
})();
