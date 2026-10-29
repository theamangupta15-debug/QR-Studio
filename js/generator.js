document.addEventListener('DOMContentLoaded', function() {
  var input = document.getElementById('qrText'),
      box = document.getElementById('qrBox'),
      msg = document.getElementById('msg'),
      dl = document.getElementById('downloadBtn'),
      copyBtn = document.getElementById('copyBtn'),
      fmts = document.querySelectorAll('input[name=fmt]'),
      text = '',
      debounceTimer = null;

  function fmt() {
    var checked = document.querySelector('input[name=fmt]:checked');
    return checked ? checked.value : 'png';
  }

  function label() {
    dl.innerHTML = '<i class="fa-solid fa-download"></i> Download ' + fmt().toUpperCase();
  }

  function api(size) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=0&data=' + encodeURIComponent(text);
  }

  function make() {
    var v = input.value.trim();
    if (!v) {
      msg.className = 'msg err';
      msg.textContent = 'Enter a link or some text first.';
      box.innerHTML = idle;
      dl.disabled = true;
      if (copyBtn) copyBtn.disabled = true;
      return;
    }

    // Skip regeneration if text hasn't changed
    if (v === text && box.querySelector('img')) return;

    text = v;
    msg.className = 'msg';
    msg.textContent = 'Creating your QR code…';
    dl.disabled = true;
    if (copyBtn) copyBtn.disabled = true;

    var img = new Image();
    img.alt = 'QR code for ' + v;
    img.onload = function() {
      box.innerHTML = '';
      box.appendChild(img);
      msg.className = 'msg ok';
      msg.textContent = 'Ready. Choose a format and download.';
      dl.disabled = false;
      if (copyBtn) copyBtn.disabled = false;
      if (window.QRHistory && typeof window.QRHistory.add === 'function') {
        QRHistory.add('generated', v);
      }
    };
    img.onerror = function() {
      msg.className = 'msg err';
      msg.textContent = 'Could not reach the QR service. Check your internet connection.';
    };
    img.src = api(400);
  }

  // Draw large QR code on canvas with white background
  function toCanvas() {
    return fetch(api(800))
      .then(function(r) { return r.blob(); })
      .then(function(blob) {
        return new Promise(function(resolve, reject) {
          var img = new Image(),
              u = URL.createObjectURL(blob);
          img.onload = function() {
            var pad = 60,
                c = document.createElement('canvas');
            c.width = c.height = 800 + pad * 2;
            var x = c.getContext('2d');
            x.fillStyle = '#fff';
            x.fillRect(0, 0, c.width, c.height);
            x.drawImage(img, pad, pad, 800, 800);
            URL.revokeObjectURL(u);
            resolve(c);
          };
          img.onerror = reject;
          img.src = u;
        });
      });
  }

  function save(href, name) {
    var a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
  }

  // Download Action
  dl.addEventListener('click', function() {
    var f = fmt();
    if (f === 'pdf' && !window.jspdf) {
      msg.className = 'msg err';
      msg.textContent = 'PDF tool did not load. Check your internet connection.';
      return;
    }

    msg.className = 'msg';
    msg.textContent = 'Preparing ' + f.toUpperCase() + '…';

    toCanvas().then(function(c) {
      if (f === 'png') {
        save(c.toDataURL('image/png'), 'qr-code.png');
      } else if (f === 'jpg') {
        save(c.toDataURL('image/jpeg', 0.95), 'qr-code.jpg');
      } else {
        var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
        var size = 100, x = (210 - size) / 2;
        pdf.addImage(c.toDataURL('image/png'), 'PNG', x, 40, size, size);
        pdf.setFontSize(11);
        var lines = pdf.splitTextToSize(text, 170);
        pdf.text(lines.slice(0, 4), 105, 150, { align: 'center' });
        pdf.save('qr-code.pdf');
      }
      msg.className = 'msg ok';
      msg.textContent = 'Saved as ' + f.toUpperCase() + '.';
    }).catch(function() {
      msg.className = 'msg err';
      msg.textContent = 'Could not save the file. Check your internet connection and try again.';
    });
  });

  // Optional: Copy Image to Clipboard
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      toCanvas().then(function(c) {
        c.toBlob(function(blob) {
          navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]).then(function() {
            var original = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            setTimeout(function() { copyBtn.innerHTML = original; }, 2000);
          });
        });
      }).catch(function() {
        msg.className = 'msg err';
        msg.textContent = 'Failed to copy image to clipboard.';
      });
    });
  }

  var idle = box.innerHTML;
  document.getElementById('clearBtn').addEventListener('click', function() {
    input.value = '';
    text = '';
    box.innerHTML = idle;
    dl.disabled = true;
    if (copyBtn) copyBtn.disabled = true;
    msg.className = 'msg';
    msg.textContent = '';
    input.focus();
  });

  // Real-time live debounce input listener
  input.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      if (input.value.trim().length > 0) {
        make();
      } else {
        text = '';
        box.innerHTML = idle;
        dl.disabled = true;
        if (copyBtn) copyBtn.disabled = true;
        msg.className = 'msg';
        msg.textContent = '';
      }
    }, 250);
  });

  document.addEventListener('qr-history-pick', function(e) {
    input.value = e.detail.text;
    make();
  });

  fmts.forEach(function(r) { r.addEventListener('change', label); });
  document.getElementById('genBtn').addEventListener('click', make);
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') make(); });
});