let scrambled = "", rotations = [];

// Handle file upload
document.getElementById("file-input").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
  currentBytes = new Uint8Array(e.target.result);
  isShuffled = false;
  updateViews(currentBytes);
  };
  reader.readAsArrayBuffer(file);
});

// Update text preview
function updateViews(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  document.getElementById("input-text").value = base64;

  const ext = detectFileExtension(bytes);
  document.getElementById("detected-ext").textContent =
      "Detected file type: ." + ext;
  // Manually update byte count after changing textarea values
  updateByteCount();
}

function detectFileExtension(bytes) {
  const hex = [...bytes.slice(0, 8)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

  if (hex.startsWith("89504E47")) return "png";
  if (hex.startsWith("FFD8FF")) return "jpg";
  if (hex.startsWith("25504446")) return "pdf";
  if (hex.startsWith("504B0304")) return "zip";
  if (hex.startsWith("47494638")) return "gif";
  if (hex.includes("66747970")) return "mp4";
  if (hex.startsWith("52494646")) return "wav";
  if (hex.startsWith("000001BA")) return "mpg";

  return "bin";
}

// error message
function showError(message) {
  const msg = document.getElementById("error-msg");
  msg.textContent = message;
  msg.style.display = "block";
  setTimeout(() => (msg.style.display = "none"), 3000);
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
  const input = document.getElementById("input-text").value;
  const allChar = document.getElementById("all-char").checked;
  const progress = document.getElementById("progress-bar");
  const label = document.getElementById("progress-label");

  const total = input.length;
  progress.max = 100;
  progress.value = 0;
  label.textContent = "0%";

  let nextUpdate = 2; // Next percentage to update at

  for (let i = 0; i < total; i++) {
    const char = input[i];
    const code = char.codePointAt(0);

    let randCode, scrambledCode;

    do {
      randCode = randomizer(allChar);
      scrambledCode = code + randCode;
    } while (
      scrambledCode < 0 ||
      scrambledCode > 0x10ffff ||
      (scrambledCode >= 0xd800 && scrambledCode <= 0xdfff) // avoid surrogates
    );

    scrambled += String.fromCodePoint(scrambledCode);
    rotations.push(randCode);
  
    const percent = Math.floor((i / total) * 100);

    if (percent >= nextUpdate) {
      progress.value = percent;
      label.textContent = `${percent}%`;
      nextUpdate += 2;
      await new Promise((resolve) => setTimeout(resolve, 0)); // Yield to browser
    }
  }

  document.getElementById("scrambled-unicode").value = scrambled;
  document.getElementById("rotation-key").value = rotations.join(".");

  progress.value = 100;
  label.textContent = "100%";
  
  // Manually update byte count after changing textarea values
  updateByteCount();
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

// pako text compression
function compress(text) {
  return pako.deflate(text);
}

// compress and encrypt unicode
async function encryptUnicode() {
  const unicode = compress(document.getElementById("scrambled-unicode").value);
  const pwU = document.getElementById("pw-unicode").value;
  
  if (!unicode || !pwU ) return showError("Password required to encrypt.");

  try {
    document.getElementById("enc-unicode").value = await aesEncrypt(unicode, pwU);
  } catch (err) {
    showError("Encryption failed: " + err.message);
    console.log(err)
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
}


// compress and encrypt key 
async function encryptKey() {
  const key = compress(document.getElementById("rotation-key").value);
  const pwK = document.getElementById("pw-key").value;

  if (!key || !pwK) return showError("Password required to encrypt.");

  try {
    document.getElementById("enc-key").value = await aesEncrypt(key, pwK);
  } catch (err) {
    showError("Encryption failed: " + err.message);
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
}

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


function generateQRCodeUnicode() {
  const encU = document.getElementById("input-unicode").value;
  const level = document.getElementById("qr-error-level-unicode").value;

  if (!encU) return showError("Encrypted values are missing.");

  const qrU = document.getElementById("qr-unicode");

  // Clear previous
  qrU.innerHTML = "";

  // Generate Unicode QR
  QRCode.toCanvas(encU, {
    errorCorrectionLevel: level, // can adjust L, M, Q, H
    margin: 1,
    scale: 8 // Automatically adjusts size based on content
  }, (err, canvas) => {
    if (err) return showError("Unicode QR generation error: " + err.message);
    qrU.appendChild(canvas);
  });
}

function generateQRCodeKey() {
  const encK = document.getElementById("input-key").value;
  const level = document.getElementById("qr-error-level-key").value;

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
  });
}

function randomSmallNumber(max = 9999) {
  return Math.floor(Math.random() * max);
}
const id = Date.now().toString(36) + "_" + randomSmallNumber(1000);

// download qr code
function downloadQR(containerId, label) {
  const canvas = document.querySelector(`#${containerId} canvas`);
  if (!canvas) return showError("QR code not generated yet.");
  const link = document.createElement("a");
  link.href = canvas.toDataURL();
  link.download = `${label}_${id}.png`;
  link.click();
}

// download as .txt
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${id}.txt`;;
  link.click();
  URL.revokeObjectURL(link.href);
}
