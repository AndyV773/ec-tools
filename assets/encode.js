let data = { shuffled: "", key: [] };

// error message
function showError(message) {
  const msg = document.getElementById("error-msg");
  msg.textContent = message;
  msg.style.display = "block";
  setTimeout(() => (msg.style.display = "none"), 3000);
}

// show loader and loading text
function showLoader(show = true) {
    document.querySelector(".loader-overlay").classList.toggle("hidden", !show);
}

function maybeShowLoader(text) {
  const threshold = 50000; // 50,000 characters
  if (text.length > threshold) {
    showLoader(true);
    return true;
  }
  return false;
}


// file size helper
function formatBytes(bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Bytes";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

// Update text preview from file
function updateViews(fileInput) {
  let binary = "";
  for (let i = 0; i < fileInput.length; i++) {
    binary += String.fromCharCode(fileInput[i]);
  }
  const base64 = btoa(binary);
  document.getElementById("input-text").value = base64;
  // Manually update byte count after changing textarea values
  updateByteCount();
}

// upload file handler
function handleFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        fileInput = new Uint8Array(e.target.result);
        document.getElementById("file-info").textContent = `File: ${file.name}, Type: ${file.type || "unknown"}, Size: ${formatBytes(file.size)}`;
        updateViews(fileInput);
    };
    reader.readAsArrayBuffer(file);
}


function randomizer(allChar) {
  const randProduct = Math.random() * Math.random(); // bias toward lower numbers

  if (allChar) {
    return Math.floor(randProduct * (0x10ffff + 1));
  } else {
    return Math.floor(randProduct * 800) + 1;
  }
}

async function scrambleText() {
  showLoader(true);
  data = { shuffled: "", key: [] };
  const input = document.getElementById("input-text").value;
  const allChar = document.getElementById("all-char").checked;
  if (maybeShowLoader(input)) {
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const code = char.codePointAt(0);

      let randCode, shuffledCode;

      do {
        randCode = randomizer(allChar);
        shuffledCode = code + randCode;
      } while (
        shuffledCode < 0 ||
        shuffledCode > 0x10ffff ||
        (shuffledCode >= 0xd800 && shuffledCode <= 0xdfff)
      );

      data.shuffled += String.fromCodePoint(shuffledCode);
      data.key.push(randCode);
    }

    data.key = data.key.join(".");

    document.getElementById("scrambled-unicode").value = data.shuffled;
    document.getElementById("rotation-key").value = data.key;
    // Manually update byte count after changing textarea values
    updateByteCount();
    skipEnc();
  } catch (err) {
    showError("Something went wrong." + err.message);
  } finally {
    showLoader(false);
  }
}

async function skipEnc() {
  if (maybeShowLoader(data.key)) {
    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    const skip = document.getElementById("skip-enc").checked;
    document.getElementById("input-unicode").value = "";
    document.getElementById("input-key").value = "";
    document.getElementById("qr-unicode").innerHTML = "";
    document.getElementById("qr-key").innerHTML = "";
    setUnicodeCorrectionLevel();
    setKeyCorrectionLevel();
    // Manually update byte count after changing textarea values
    updateByteCount();

    if (skip && data.shuffled && data.key) {
      document.getElementById("input-unicode").value = data.shuffled;
      document.getElementById("input-key").value = data.key;
      setUnicodeCorrectionLevel();
      setKeyCorrectionLevel();
      // Manually update byte count after changing textarea values
      updateByteCount();
    }
  } catch (err) {
    showError("Error skipping encryption." + err.message)
  } finally {
    showLoader(false);
  }
}


// aes gcm encryption
async function aesEncrypt(data, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const dataBuffer = (typeof data === "string") ? enc.encode(data) : data;
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, dataBuffer);

  // Combine salt + iv + encrypted
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  // Convert to base64 safely
  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  return toBase64(combined);
}

// pako compression helper
function compress(text) {
  return pako.deflate(text);
}

// compress and encrypt unicode
async function encryptUnicode() {
  if (maybeShowLoader(data.shuffled)) {
    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000)); 
  }
  data.shuffled = compress(data.shuffled);
  const pwU = document.getElementById("pw-unicode").value;
  
  if (!data.shuffled || !pwU ) return showError("Password required to encrypt.");

  try {
    data.shuffled = await aesEncrypt(data.shuffled, pwU);
    document.getElementById("enc-unicode").value = data.shuffled;
    document.getElementById("input-unicode").value = data.shuffled;
    setUnicodeCorrectionLevel();
  } catch (err) {
    showError("Encryption failed: " + err.message);
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
  showLoader(false);
}


// compress and encrypt key 
async function encryptKey() {
  if (maybeShowLoader(data.key)) {
    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  data.key = compress(data.key);
  const pwK = document.getElementById("pw-key").value;

  if (!data.key || !pwK) return showError("Password required to encrypt.");

  try {
    data.key = await aesEncrypt(data.key, pwK);
    document.getElementById("enc-key").value = data.key;
    document.getElementById("input-key").value = data.key;
    setKeyCorrectionLevel();
  } catch (err) {
    showError("Encryption failed: " + err.message);
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
  showLoader(false);
}

// text encoder helper
function getByteLength(str) {
  return new TextEncoder().encode(str).length;
}

function updateByteCount() {
  const inputText = document.getElementById("input-text").value;
  const code = document.getElementById("scrambled-unicode").value;
  const key = document.getElementById("rotation-key").value;
  const encU = document.getElementById("enc-unicode").value;
  const encK = document.getElementById("enc-key").value;
  const inputU = document.getElementById("input-unicode").value;
  const inputK = document.getElementById("input-key").value;
  document.getElementById("text-byte-count").textContent = getByteLength(inputText);
  document.getElementById("scrambled-byte-count").textContent = getByteLength(code);
  document.getElementById("rotation-byte-count").textContent = getByteLength(key);
  document.getElementById("enc-unicode-byte-count").textContent = getByteLength(encU);
  document.getElementById("enc-key-byte-count").textContent = getByteLength(encK);
  document.getElementById("unicode-byte-count").textContent = getByteLength(inputU);
  document.getElementById("key-byte-count").textContent = getByteLength(inputK);
}

function setUnicodeCorrectionLevel() {
  const uInput = getByteLength(document.getElementById("input-unicode").value);
  const label = document.getElementById("qr-error-level-unicode");
  const uDwn = document.getElementById("uni-dwn");
  const uQr = document.getElementById("unicode-qr-gen");

  if (uInput === 0) {
    label.innerText = "No data";
    label.dataset.value = "";
    uDwn.classList.add("hidden");
    uQr.classList.add("hidden");
    document.getElementById("download-qr-unicode").classList.add("hidden");
  } else if (uInput <= 1270) {
    label.innerText = "High (H) - max 1270 B";
    label.dataset.value = "H";
    uDwn.classList.remove("hidden");
    uQr.classList.remove("hidden");
  } else if (uInput > 1270 && uInput <= 1660) {
    label.innerText = "Quartile (Q) - max 1660 B";
    label.dataset.value = "Q";
    uDwn.classList.remove("hidden");
    uQr.classList.remove("hidden");
  } else if (uInput > 1660 && uInput <= 2300) {
    label.innerText = "Medium (M) - max 2300 B";
    label.dataset.value = "M";
    uDwn.classList.remove("hidden");
    uQr.classList.remove("hidden");
  } else if (uInput > 2300 && uInput <= 2950) {
    label.innerText = "Low (L) - max 2950 B";
    label.dataset.value = "L";
    uDwn.classList.remove("hidden");
    uQr.classList.remove("hidden");
  } else {
    label.innerText = "Data too large for QR max 2950 B";
    label.dataset.value = "";
    uDwn.classList.remove("hidden");
    uQr.classList.add("hidden");
    document.getElementById("download-qr-unicode").classList.add("hidden");
  }
  
}

function setKeyCorrectionLevel() {
  const keyInput = getByteLength(document.getElementById("input-key").value);
  const label = document.getElementById("qr-error-level-key");
  const kDwn = document.getElementById("key-dwn");
  const kQr = document.getElementById("key-qr-gen");

  if (keyInput === 0) {
    label.innerText = "No data";
    label.dataset.value = "";
    kDwn.classList.add("hidden");
    kQr.classList.add("hidden");
    document.getElementById("download-qr-key").classList.add("hidden");
  } else if (keyInput <= 1270) {
    label.innerText = "High (H) - max 1270 B";
    label.dataset.value = "H";
    kDwn.classList.remove("hidden");
    kQr.classList.remove("hidden");
  } else if (keyInput > 1270 && keyInput <= 1660) {
    label.innerText = "Quartile (Q) - max 1660 B";
    label.dataset.value = "Q";
    kDwn.classList.remove("hidden");
    kQr.classList.remove("hidden");
  } else if (keyInput > 1660 && keyInput <= 2300) {
    label.innerText = "Medium (M) - max 2300 B";
    label.dataset.value = "M";
    kDwn.classList.remove("hidden");
    kQr.classList.remove("hidden");
  } else if (keyInput > 2300 && keyInput <= 2950) {
    label.innerText = "Low (L) - max 2950 B";
    label.dataset.value = "L";
    kDwn.classList.remove("hidden");
    kQr.classList.remove("hidden");
  } else {
    label.innerText = "Data too large for QR max 2950 B";
    label.dataset.value = "";
    kDwn.classList.remove("hidden");
    kQr.classList.add("hidden");
    document.getElementById("download-qr-key").classList.add("hidden");
  }
}


function generateQRCodeUnicode() {
  const encU = data.shuffled;
  const level = document.getElementById("qr-error-level-unicode").dataset.value;

  if (!encU) return showError("Encrypted values are missing.");
  const qrU = document.getElementById("qr-unicode");
  // Clear previous
  qrU.innerHTML = "";

  // Generate Unicode QR
  QRCode.toCanvas(encU, {
    errorCorrectionLevel: level,
    margin: 1,
    scale: 8 // Automatically adjusts size based on content
  }, (err, canvas) => {
    if (err) return showError("Unicode QR generation error: " + err.message);
    qrU.appendChild(canvas);
    document.getElementById("download-qr-unicode").classList.remove("hidden");
  });
}

function generateQRCodeKey() {
  const encK = document.getElementById("input-key").value;
  const level = document.getElementById("qr-error-level-key").dataset.value;

  if (!encK) return showError("Encrypted values are missing.");
  const qrK = document.getElementById("qr-key");
  // Clear previous
  qrK.innerHTML = "";

  // Generate Key QR
  QRCode.toCanvas(encK, {
    errorCorrectionLevel: level,
    margin: 1,
    scale: 8
  }, (err, canvas) => {
    if (err) return showError("Key QR generation error: " + err.message);
    qrK.appendChild(canvas);
    document.getElementById("download-qr-key").classList.remove("hidden");
  });
}

// random number for files
function randomNumber(max = 9999) {
    return Math.floor(Math.random() * max);
}

const date = Date.now().toString().slice(0, 6);
const id = date + randomNumber();

// download qr code
function downloadQR(containerId, label) {
  const canvas = document.querySelector(`#${containerId} canvas`);
  if (!canvas) return showError("QR code not generated yet.");
  const link = document.createElement("a");
  link.href = canvas.toDataURL();
  link.download = `${label}${id}.png`;
  link.click();
}

// download as .txt
async function downloadTextFile(filename, text) {
  showLoader(true);
  if (maybeShowLoader(text)) {
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}${id}.txt`;;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    showError("Error saving file." + err.message);
  } finally {
    showLoader(false);
  }
}

function copyCode(selector) {
  const buttons = document.querySelectorAll(selector);

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const parent = button.closest(".copy-block");
      const textarea = parent?.previousElementSibling;

      if (textarea && textarea.tagName === "TEXTAREA") {
        textarea.select();
        textarea.setSelectionRange(0, 99999); // Mobile support

        navigator.clipboard.writeText(textarea.value)
          .then(() => {
            button.textContent = "Copied!";
            button.classList.add("active");
            setTimeout(() => {
              button.textContent = "Copy";
              button.classList.remove("active");
            }, 1500);
          })
          .catch(() => {
            showError("Failed to copy text.");
          });
      } else {
        showError("No textarea found to copy.");
      }
    });
  });
}


document.addEventListener("DOMContentLoaded", () => {
  copyCode(".copy-block button");
  // file upload event listener calls handle file function
  document.getElementById("file-input").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) {
      return;
    } else {
      handleFile(file);
    }
  });

  // For input-key
  document.getElementById("input-key").addEventListener("input", () => {
    updateByteCount();
    setKeyCorrectionLevel();
  });

  // For input-unicode
  document.getElementById("input-unicode").addEventListener("input", () => {
    updateByteCount();
    setUnicodeCorrectionLevel();
  });

  // Input text area: update byte count on input
  document.getElementById("input-text").addEventListener("input", updateByteCount);

  // Scramble button: call scrambleText on click
  document.getElementById("shuffle").addEventListener("click", scrambleText);

  // skip encryption
  document.getElementById("skip-enc").addEventListener("change", skipEnc);
  
  // Textareas: oninput calls updateByteCount
  document.getElementById("scrambled-unicode").addEventListener("input", updateByteCount);
  document.getElementById("rotation-key").addEventListener("input", updateByteCount);
  document.getElementById("enc-unicode").addEventListener("input", updateByteCount);
  document.getElementById("enc-key").addEventListener("input", updateByteCount);

  // Buttons: onclick calls respective encrypt functions
  document.getElementById("enc-uni-btn").addEventListener("click", encryptUnicode);
  document.getElementById("enc-key-btn").addEventListener("click", encryptKey);

  // generate qr code
  document.getElementById("unicode-qr-gen").addEventListener("click", generateQRCodeUnicode);
  document.getElementById("key-qr-gen").addEventListener("click", generateQRCodeKey);
  
  // download .txt and qr code 
  document.getElementById("unicode-txt").addEventListener("click", () => {
    downloadTextFile('unicode', data.shuffled);
  });
  document.getElementById("key-txt").addEventListener("click", () => {
    downloadTextFile('key', data.key);
  });
  document.querySelector("#download-qr-unicode button").addEventListener("click", () => {
    downloadQR("qr-unicode", "unicode");
  });
  document.querySelector("#download-qr-key button").addEventListener("click", () => {
    downloadQR("qr-key", "key");
  });
});