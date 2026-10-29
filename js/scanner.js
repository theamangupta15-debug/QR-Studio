document.addEventListener('DOMContentLoaded', function() {
  var file = document.getElementById('file'),
      drop = document.getElementById('drop'),
      out = document.getElementById('result'),
      msg = document.getElementById('msg'),
      copyBtn = document.getElementById('copyBtn'),
      openBtn = document.getElementById('openBtn'),
      clearBtn = document.getElementById('clearBtn'),
      modeCamera = document.getElementById('modeCamera'),
      modeUpload = document.getElementById('modeUpload'),
      cameraContainer = document.getElementById('cameraContainer'),
      cameraFallback = document.getElementById('cameraFallback'),
      video = document.getElementById('video');

  var idle = drop.innerHTML,
      link = null,
      MAX_PAGES = 10,
      stream = null,
      cameraAnimId = null,
      videoCanvas = document.createElement('canvas');

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  function toLink(s) {
    s = (s || '').trim();
    if (!s || /\s/.test(s)) return null;
    try {
      var u = new URL(s);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch (e) {}
    if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([\/?#]\S*)?$/i.test(s)) {
      try { return new URL('https://' + s).href; } catch (e) {}
    }
    return null;
  }

  function say(cls, t) {
    msg.className = 'msg ' + cls;
    msg.textContent = t;
  }

  function decode(c) {
    var d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    return jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
  }

  function preview(c) {
    drop.innerHTML = '';
    var p = new Image();
    p.alt = 'Scanned file preview';
    p.src = c.toDataURL('image/png');
    drop.appendChild(p);
  }

  function handleSuccess(data) {
    out.value = data;
    link = toLink(data);
    copyBtn.disabled = false;
    openBtn.disabled = !link;

    if (window.QRHistory && typeof window.QRHistory.add === 'function') {
      QRHistory.add('scanned', data);
    }

    say('ok', link ? 'QR code read. It contains a website link.' : 'QR code read. It contains text, not a website link.');
  }

  function done(code, c) {
    if (c) preview(c);
    if (code) {
      handleSuccess(code.data);
    } else {
      out.value = '';
      link = null;
      copyBtn.disabled = openBtn.disabled = true;
      say('err', 'No QR code found. Try a sharper, closer file.');
    }
  }

  function reset() {
    drop.innerHTML = idle;
    out.value = '';
    link = null;
    copyBtn.disabled = openBtn.disabled = true;
    msg.className = 'msg';
    msg.textContent = '';
    file.value = '';
  }

  function scanImage(f) {
    var img = new Image(),
        u = URL.createObjectURL(f);
    img.onload = function() {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(u);
      done(decode(c), c);
    };
    img.onerror = function() {
      say('err', 'That file is not a readable image.');
    };
    img.src = u;
  }

  function scanPdf(f) {
    if (!window.pdfjsLib) {
      say('err', 'PDF reader did not load. Check your internet connection.');
      return;
    }
    say('', 'Reading PDF…');
    f.arrayBuffer().then(function(buf) {
      return pdfjsLib.getDocument({ data: buf }).promise;
    }).then(function(pdf) {
      var total = Math.min(pdf.numPages, MAX_PAGES),
          first = null;
      function page(n) {
        if (n > total) return done(null, first);
        return pdf.getPage(n).then(function(pg) {
          var vp = pg.getViewport({ scale: 2 }),
              c = document.createElement('canvas');
          c.width = vp.width;
          c.height = vp.height;
          return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function() {
            if (!first) first = c;
            var code = decode(c);
            if (code) return done(code, c);
            return page(n + 1);
          });
        });
      }
      return page(1);
    }).catch(function() {
      say('err', 'Could not read this PDF. It may be damaged or password protected.');
    });
  }

  function scan(f) {
    if (!f) return;
    var name = (f.name || '').toLowerCase();
    var isPdf = f.type === 'application/pdf' || name.endsWith('.pdf');
    var isImg = f.type === 'image/png' || f.type === 'image/jpeg' || /\.(png|jpe?g)$/.test(name);
    if (!isPdf && !isImg) {
      say('err', 'Unsupported file. Use a JPG, PNG or PDF.');
      return;
    }
    if (isPdf) scanPdf(f); else scanImage(f);
  }

  // --- Robust Camera Control ---
  function startCamera() {
    stopCamera();
    cameraFallback.style.display = 'none';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraFallback.style.display = 'flex';
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(function(s) {
      stream = s;
      video.srcObject = s;
      video.setAttribute('playsinline', true);
      video.play();
      requestAnimationFrame(tickCamera);
    }).catch(function() {
      cameraFallback.style.display = 'flex';
    });
  }

  function stopCamera() {
    // 1. Cancel RAF processing loop
    if (cameraAnimId) {
      cancelAnimationFrame(cameraAnimId);
      cameraAnimId = null;
    }
    // 2. Shut off each hardware camera track immediately
    if (stream) {
      stream.getTracks().forEach(function(track) {
        track.stop();
      });
      stream = null;
    }
    // 3. Clear video element source
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  function tickCamera() {
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      videoCanvas.width = video.videoWidth;
      videoCanvas.height = video.videoHeight;
      var ctx = videoCanvas.getContext('2d');
      ctx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);
      var code = decode(videoCanvas);

      if (code && code.data) {
        if (out.value !== code.data) {
          handleSuccess(code.data);
        }
      }
    }
    cameraAnimId = requestAnimationFrame(tickCamera);
  }

  // Mode Switchers
  if (modeCamera && modeUpload) {
    modeCamera.addEventListener('click', function() {
      modeCamera.classList.add('active');
      modeCamera.setAttribute('aria-selected', 'true');
      modeUpload.classList.remove('active');
      modeUpload.setAttribute('aria-selected', 'false');

      drop.style.display = 'none';
      cameraContainer.style.display = 'flex';
      startCamera();
    });

    modeUpload.addEventListener('click', function() {
      modeUpload.classList.add('active');
      modeUpload.setAttribute('aria-selected', 'true');
      modeCamera.classList.remove('active');
      modeCamera.setAttribute('aria-selected', 'false');

      cameraContainer.style.display = 'none';
      drop.style.display = 'grid';
      stopCamera(); // Turn off camera when switching back to upload
    });
  }

  // Turn off camera when switching between pages/nav links (Generator / Home / etc.)
  document.querySelectorAll('nav a, header a').forEach(function(linkEl) {
    linkEl.addEventListener('click', stopCamera);
  });

  // Turn off camera when user changes browser tabs or minimizes window
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      stopCamera();
    } else {
      // Re-engage camera only if the camera tab is currently selected
      if (modeCamera && modeCamera.classList.contains('active')) {
        startCamera();
      }
    }
  });

  // Turn off camera on page exit or unload
  window.addEventListener('pagehide', stopCamera);
  window.addEventListener('beforeunload', stopCamera);

  // Global Clipboard (Ctrl+V) Image Paste
  window.addEventListener('paste', function(e) {
    var items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;

    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        var blob = items[i].getAsFile();
        if (blob) {
          if (modeUpload && !modeUpload.classList.contains('active')) {
            modeUpload.click();
          }
          scan(blob);
          e.preventDefault();
          break;
        }
      }
    }
  });

  // Drop zone events
  file.addEventListener('change', function() { scan(file.files[0]); });
  drop.addEventListener('dragover', function(e) { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function() { drop.classList.remove('over'); });
  drop.addEventListener('drop', function(e) {
    e.preventDefault();
    drop.classList.remove('over');
    scan(e.dataTransfer.files[0]);
  });

  // Action buttons
  copyBtn.addEventListener('click', function() {
    navigator.clipboard.writeText(out.value).then(function() {
      say('ok', 'Copied.');
    }, function() {
      out.select();
      say('err', 'Could not copy automatically. The text is selected, press Ctrl+C.');
    });
  });

  openBtn.addEventListener('click', function() {
    if (!link) {
      say('err', 'This QR code does not contain a website link.');
      return;
    }
    window.open(link, '_blank', 'noopener');
  });

  clearBtn.addEventListener('click', reset);
});

// Native subtle beep chime using Web Audio API (no audio file download required)
  function playScanSound() {
    try {
      var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();

      osc.type = 'sine';
      // Crisp two-tone chime
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.08); // A5

      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.23);
    } catch (e) {
      // AudioContext unavailable or blocked by autoplay policy
    }
  }

  // Visual, Audio, and Haptic confirmation trigger
  function triggerScanFeedback() {
    // 1. Audio chime
    playScanSound();

    // 2. Hardware vibration (on Android / mobile devices)
    if (navigator.vibrate) {
      navigator.vibrate(120);
    }

    // 3. Viewfinder visual indicator flash
    var target = document.querySelector('.scan-target');
    if (target) {
      target.classList.remove('scan-success-anim');
      void target.offsetWidth; // Force CSS reflow to re-trigger animation
      target.classList.add('scan-success-anim');
      setTimeout(function() {
        target.classList.remove('scan-success-anim');
      }, 700);
    }
  }

function handleSuccess(data) {
    out.value = data;
    link = toLink(data);
    copyBtn.disabled = false;
    openBtn.disabled = !link;

    // Trigger instant visual, sound, and haptic indicator
    triggerScanFeedback();

    if (window.QRHistory && typeof window.QRHistory.add === 'function') {
      QRHistory.add('scanned', data);
    }

    say('ok', link ? '✓ QR code captured! Website link ready.' : '✓ QR code captured! Plain text ready.');
  }