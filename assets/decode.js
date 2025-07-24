function showError(message) {
  const msg = document.getElementById("error-msg");
  msg.textContent = message;
  msg.style.display = "block";
  setTimeout(() => (msg.style.display = "none"), 3000);
}

let currentOutputId = null;
let videoStream = null;

function startScanner(outputId) {
  currentOutputId = outputId;

  const video = document.getElementById("qr-video");
  
  if (videoStream) {
    // stop previous stream if any
    videoStream.getTracks().forEach(track => track.stop());
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then((stream) => {
      videoStream = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", true);
      video.play();
      scanQR();
    })
    .catch((err) => {
      showError("Camera access error: " + err.message);
    });
}

function scanQR() {
  const video = document.getElementById("qr-video");

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height);

    if (code && currentOutputId) {
      document.getElementById(currentOutputId).value = code.data;
      // Optionally, stop scanning once a QR code is found
      // videoStream.getTracks().forEach(track => track.stop());
      // return;
    }
  }
  requestAnimationFrame(scanQR);
}

function decodedValue(type, value) {
  if (type === "unicode") {
    document.getElementById("unicode-input").value = value;
  } else {
    document.getElementById("key-input").value = value;
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
}

function handleUpload(event, type) {
  const file = event.target.files[0];
  if (!file) return showError("No file selected.");

  const isImage = file.type.startsWith("image/");
  const isText = file.type === "text/plain";

  const reader = new FileReader();

  reader.onload = function (e) {
    if (isImage) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        if (code) {
          decodedValue(type, code.data);
        } else {
          showError("QR code not detected.");
        }
      };
      img.src = e.target.result;
    } else if (isText) {
      const text = e.target.result.trim();
      decodedValue(type, text);
    } else {
      showError("Unsupported file type. Please upload an image or .txt file.");
    }
  };

  if (isImage) {
    reader.readAsDataURL(file);
  } else if (isText) {
    reader.readAsText(file);
  } else {
    showError("Only image and .txt files are allowed.");
  }
}

// AES Decrypt
async function aesDecrypt(base64, password) {
  const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const ciphertext = data.slice(28);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Uint8Array(decrypted); // raw bytes
}

// Step 1: Decrypt Unicode
async function decryptUnicode() {
  const input = document.getElementById("unicode-input").value;
  const pw = document.getElementById("pw-unicode").value;
  if (!input || !pw) return showError("Encrypted Unicode and password are required.");
  try {
    const decryptedBytes = await aesDecrypt(input, pw);
    const decompressed = pako.inflate(decryptedBytes, { to: "string" });
    document.getElementById("unicode-base64").value = decompressed;
  } catch (err) {
    showError("Unicode decryption failed: " + err.message);
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
}

// Step 2: Decrypt Key
async function decryptKey() {
  const input = document.getElementById("key-input").value;
  const pw = document.getElementById("pw-key").value;
  if (!input || !pw) return showError("Encrypted Key and password are required.");
  try {
    const decryptedBytes = await aesDecrypt(input, pw);
    const decompressed = pako.inflate(decryptedBytes, { to: "string" });
    document.getElementById("key-base64").value = decompressed;
  } catch (err) {
    showError("Key decryption failed: " + err.message);
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
}

function recoverOriginal() {
  try {
    const chars = document.getElementById("unicode-base64").value;
    const rotations = document.getElementById("key-base64").value.split(".").map(Number);
    let result = "", i = 0;
    for (const ch of chars) {
      let scrambledCode = ch.codePointAt(0);
      let rot = rotations[i++] ?? 0;
      let originalCode = (scrambledCode - rot + 0x10ffff) % 0x10ffff;

      result += String.fromCodePoint(originalCode);
      
    }
    document.getElementById("file-code").textContent = result;
    const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
    // const bytes = new TextEncoder().encode(result);
    const ext = detectFileExtension(bytes);
    document.getElementById("detected-ext").textContent =
    "Detected file type: ." + ext;
  } catch (err) {
    showError("Recovery of original text failed.");
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
}

// Detect file type from magic numbers
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

// Save file from base64 string
function saveFile() {
  const base64 = document.getElementById("file-code").textContent;
  const byteArray = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ext = detectFileExtension(byteArray);
  const blob = new Blob([byteArray]);
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `restored.${ext}`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

// Optional: trigger save after recovery
function saveFilet() {
  recoverOriginal(); // Run unscramble first
  const base64 = document.getElementById("file-code").textContent;
  saveFileFromBase64(base64);
}

function getByteLength(str) {
  return new TextEncoder().encode(str).length;
}

function updateByteCount() {
  const inputU = document.getElementById("unicode-input").value;
  const inputK = document.getElementById("key-input").value;
  const encU = document.getElementById("unicode-base64").value;
  const encK = document.getElementById("key-base64").value;
  const byte = document.getElementById("file-code").value;
  document.getElementById("unicode-byte-count").textContent = getByteLength(inputU);
  document.getElementById("key-byte-count").textContent = getByteLength(inputK);
  document.getElementById("enc-unicode-byte-count").textContent = getByteLength(encU);
  document.getElementById("enc-key-byte-count").textContent = getByteLength(encK);
  document.getElementById("byte-count").textContent = getByteLength(byte);
}