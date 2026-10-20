// The photo field on the add and edit camp forms. Progressive enhancement:
// without JavaScript (or in an old browser) photos are sent as chosen and the
// server's checks apply, and they remain the real limit either way.
// When photos are chosen this script:
// - shows a small preview of each, with its name and size;
// - shrinks any photo over 1600 px on its long side, or over the size limit,
//   to at most 1600 px (JPEG, or WebP for a WebP), so an ordinary phone photo
//   fits; the new copy carries no location or camera details;
// - explains a problem before anything is sent (too many photos, a file that
//   is not JPG, PNG or WebP, a photo still too large), through the field's
//   custom validity, which public/js/forms.js shows next to the field.
(function () {
  "use strict";

  var MAX_SIDE = 1600;
  var TYPES = ["image/jpeg", "image/png", "image/webp"];
  var input = document.querySelector('input[type="file"][data-resize]');
  if (!input || typeof DataTransfer === "undefined" || !HTMLCanvasElement.prototype.toBlob) {
    return;
  }

  var form = input.form;
  var maxFiles = Number(input.getAttribute("data-max-files"));
  var maxBytes = Number(input.getAttribute("data-max-bytes")) || 1468006;
  var status = document.getElementById("image-status");
  var previews = document.getElementById("image-previews");
  var submit = form && form.querySelector('button:not([type="button"])');
  var oneDecimal = new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 1 });
  var previewUrls = [];
  var busy = false;

  function sizeText(bytes) {
    if (bytes >= 1024 * 1024) return oneDecimal.format(bytes / (1024 * 1024)) + " MB";
    return Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function say(text) {
    if (status) status.textContent = text;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        resolve({ img: img, url: url });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("This file could not be read as a photo."));
      };
      img.src = url;
    });
  }

  function encode(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(resolve, type, quality);
    });
  }

  // A copy of the photo at most MAX_SIDE px on its long side and under
  // maxBytes, or the original when it already fits.
  async function shrink(file) {
    var loaded = await loadImage(file);
    var img = loaded.img;
    URL.revokeObjectURL(loaded.url);
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    if (Math.max(w, h) <= MAX_SIDE && file.size <= maxBytes) return file;

    var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    var ctx = canvas.getContext("2d");
    // A transparent PNG becomes a JPEG: give it a white background, not black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    var type = file.type === "image/webp" ? "image/webp" : "image/jpeg";
    var blob = null;
    var qualities = [0.85, 0.75, 0.6];
    for (var i = 0; i < qualities.length; i++) {
      blob = await encode(canvas, type, qualities[i]);
      if (blob && blob.type !== type) {
        type = "image/jpeg"; // this browser cannot write WebP
        blob = await encode(canvas, type, qualities[i]);
      }
      if (blob && blob.size <= maxBytes) break;
    }
    if (!blob) return file;
    var name = file.name.replace(/\.[^.]+$/, "") + (type === "image/webp" ? ".webp" : ".jpg");
    return new File([blob], name, { type: type, lastModified: Date.now() });
  }

  function showPreviews(files) {
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
    if (!previews) return;
    previews.textContent = "";
    files.forEach(function (file) {
      var url = URL.createObjectURL(file);
      previewUrls.push(url);
      var item = document.createElement("li");
      var img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.width = 150;
      img.height = 100;
      var caption = document.createElement("span");
      caption.textContent = file.name + ", " + sizeText(file.size);
      item.appendChild(img);
      item.appendChild(caption);
      previews.appendChild(item);
    });
    previews.hidden = files.length === 0;
  }

  function setBusy(on) {
    busy = on;
    if (submit) submit.disabled = on;
  }

  input.addEventListener("change", async function () {
    var chosen = Array.prototype.slice.call(input.files || []);
    input.setCustomValidity("");
    showPreviews([]);
    if (!chosen.length) {
      say("");
      return;
    }
    if (maxFiles >= 0 && chosen.length > maxFiles) {
      var limit =
        maxFiles === 0
          ? "This camp has no room for more photos. Remove one first."
          : "Choose up to " + maxFiles + (maxFiles === 1 ? " photo." : " photos.");
      input.setCustomValidity(limit);
      say(limit);
      return;
    }
    var wrongType = chosen.filter(function (f) {
      return TYPES.indexOf(f.type) === -1;
    });
    if (wrongType.length) {
      var msg = wrongType[0].name + " isn't a JPG, PNG or WebP photo.";
      input.setCustomValidity(msg);
      say(msg);
      return;
    }

    setBusy(true);
    say("Preparing your photos…");
    try {
      var ready = [];
      for (var i = 0; i < chosen.length; i++) ready.push(await shrink(chosen[i]));
      var tooBig = ready.filter(function (f) {
        return f.size > maxBytes;
      });
      if (tooBig.length) {
        var big =
          tooBig[0].name + " is still over " + sizeText(maxBytes) + ". Try a smaller photo.";
        input.setCustomValidity(big);
        say(big);
        return;
      }
      var list = new DataTransfer();
      ready.forEach(function (f) {
        list.items.add(f);
      });
      input.files = list.files;
      showPreviews(ready);
      var total = ready.reduce(function (sum, f) {
        return sum + f.size;
      }, 0);
      say(
        (ready.length === 1 ? "1 photo" : ready.length + " photos") +
          " ready to upload (" +
          sizeText(total) +
          ").",
      );
    } catch (err) {
      input.setCustomValidity(err.message);
      say(err.message);
    } finally {
      setBusy(false);
    }
  });

  // Never send while photos are still being prepared.
  if (form) {
    form.addEventListener(
      "submit",
      function (event) {
        if (busy) {
          event.preventDefault();
          event.stopImmediatePropagation();
          say("Still preparing your photos. Try again in a moment.");
        }
      },
      true,
    );
  }
})();
