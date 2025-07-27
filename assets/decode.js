let data = { shuffled: "", key: [] },
  result = "";

// error message
function showError(message) {
  const msg = document.getElementById("error-msg");
  msg.textContent = message;
  msg.style.display = "block";
  setTimeout(() => (msg.style.display = "none"), 3000);
}

// copy message
function showSuccess(message) {
  const msg = document.getElementById("success-msg");
  msg.textContent = message;
  msg.style.display = "block";
  setTimeout(() => (msg.style.display = "none"), 3000);
}

// show loader and loading text
function showLoader(show = true) {
    document.querySelector(".loader-overlay").classList.toggle("hidden", !show);
}

function maybeShowLoader(input) {
  const threshold = 50000; // 50,000 characters
  if (input.length > threshold) {
    showLoader(true);
    return true;
  }
  return false;
}

// random number for files
function randomNumber(max = 9999) {
    const date = Date.now().toString().slice(0, 6);
    const rand = Math.floor(Math.random() * max);
    return date + rand;
}

const fileId = randomNumber();

let currentOutputId = null;
let videoStream = null;

// starts video scanner for qr
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

// scans for qr code
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
      // stop scanning once a QR code is found
      videoStream.getTracks().forEach(track => track.stop());
      return;
    }
  }
  requestAnimationFrame(scanQR);
}

// upload helper function 
function decodedValue(type, value) {
  if (type === "data") {
    data.shuffled = value;
    document.getElementById("data-input").value = data.shuffled;
  } else {
    data.key = value;
    document.getElementById("key-input").value = data.key;
  }
  skipDec()
  // Manually update byte count after changing textarea values
  updateByteCount();
}

// upload file handler
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
        const info = jsQR(imageData.data, canvas.width, canvas.height);
        if (info) {
          decodedValue(type, info.data);
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

// skip decryption moving data to unshuffle point
async function skipDec() {
  if (maybeShowLoader(data.shuffled || data.key)) {
    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    const skip = document.getElementById("skip-dec").checked;
    const outputSection = document.querySelectorAll("#final-output > button");
    const unshuffleBtn = outputSection[0];
    unshuffleBtn.classList.add("hidden");
    document.getElementById("data-base64").value = "";
    document.getElementById("key-base64").value = "";
    
    // Manually update byte count after changing textarea values
    updateByteCount();

    if (skip && data.shuffled && data.key) {
      document.getElementById("data-base64").value = data.shuffled;
      document.getElementById("key-base64").value = data.key;
      
      // Manually update byte count after changing textarea values
      updateByteCount();
      unshuffleBtn.classList.remove("hidden");
    } 
  } catch (err) {
    showError("Error skipping decryption." + err.message)
  } finally {
    showLoader(false);
  }
}

// AES gcm Decryption
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

// Step 1: Decrypt data
async function decryptData() {
  const pw = document.getElementById("pw-data").value;
  const outputSection = document.querySelectorAll("#final-output > button");
  const unshuffleBtn = outputSection[0];
  if (!data.shuffled || !pw) return showError("Encrypted data and password are required.");
  if (maybeShowLoader(data.shuffled)) {
    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    const decryptedBytes = await aesDecrypt(data.shuffled, pw);
    const decompressed = pako.inflate(decryptedBytes, { to: "string" });
    data.shuffled = decompressed;
    document.getElementById("data-base64").value = data.shuffled;
    unshuffleBtn.classList.remove("hidden");
    showSuccess("Decryption Complete!");
  } catch (err) {
    showError("data decryption failed: " + err.message);
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
  showLoader(false);
}

// Step 2: Decrypt Key
async function decryptKey() {
  const pw = document.getElementById("pw-key").value;
  const outputSection = document.querySelectorAll("#final-output > button");
  const unshuffleBtn = outputSection[0];
  if (!data.key || !pw) return showError("Encrypted Key and password are required.");
  if (maybeShowLoader(data.key)) {
    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    const decryptedBytes = await aesDecrypt(data.key, pw);
    const decompressed = pako.inflate(decryptedBytes, { to: "string" });
    data.key = decompressed;
    document.getElementById("key-base64").value = data.key;
    unshuffleBtn.classList.remove("hidden");
    showSuccess("Decryption Complete!");
  } catch (err) {
    showError("Key decryption failed: " + err.message);
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
  showLoader(false);
}

// Detects file type if no result returns txt
async function detectFileExtension(bytes) {
  const hex = [...bytes.slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  if (hex.startsWith("504B0304")) {
    try {
      const zip = await JSZip.loadAsync(bytes);
      const fileNames = Object.keys(zip.files);

      if (fileNames.some(name => name.startsWith("word/"))) return "docx";
      if (fileNames.some(name => name.startsWith("xl/"))) return "xlsx";
      if (fileNames.some(name => name.startsWith("ppt/"))) return "pptx";
      
      return "zip";
    } catch (e) {
      return "zip";
    }
  }

  // Known binary file signatures
  if (hex.startsWith("89504E47")) return "png";
  if (hex.startsWith("FFD8FF")) return "jpg";
  if (hex.startsWith("25504446")) return "pdf";
  if (hex.startsWith("47494638")) return "gif";
  if (hex.includes("66747970")) return "mp4";
  if (hex.startsWith("52494646")) return "wav";
  if (hex.startsWith("000001BA")) return "mpg";
  
  // Check for binary (non-printable control characters)
  const isBinary = bytes.slice(0, 512).some(
    (b) =>
      b < 0x09 || (b > 0x0D && b < 0x20) || b > 0x7E
  );

  if (isBinary) return "bin";

  // Otherwise, decode as normal text and guess
  const text = new TextDecoder().decode(bytes.slice(0, 1024)).trim();

  if (text.startsWith("{") || text.startsWith("[")) return "json";
  if (text.includes(",") && text.match(/\n|;/)) return "csv";

  return "txt";
}

// takes data and key and returns undhuffled data
async function unshuffle() {
  showLoader(true);
  if (maybeShowLoader(data.shuffled || data.key)) {
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  const detectExt = document.getElementById("detected-ext");
  const outputSection = document.querySelectorAll("#final-output > button");
  const saveBtn = outputSection[1];
  try {
    const inputData = data.shuffled; 
    const key = data.key.split(",").map(Number);
    let i = 0;
    for (const char of inputData) {
      let shuffledData = char.codePointAt(0);
      let rotations = key[i++] ?? 0;
      let output = (shuffledData - rotations + 0x10ffff) % 0x10ffff;
      result += String.fromCodePoint(output);
    }

    try {
      document.getElementById("result").textContent = result;
      const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
      const ext = await detectFileExtension(bytes);
      if (ext != "bin") result = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
      detectExt.dataset.value = ext;
      detectExt.textContent = "Detected file type: ." + ext;
      saveBtn.classList.remove("hidden");
      showSuccess("Data Unshuffled!");
    } catch (decodeErr) {
      detectExt.dataset.value = "txt";
      detectExt.textContent = "File type not detected. Save as .txt?";
      document.getElementById("result").textContent = result;
      saveBtn.classList.remove("hidden");
      showSuccess("Data Unshuffled!");
    }


  } catch (err) {
    showError("Recovery failed.");
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
  showLoader(false)
}

// text encoder helper
function getByteLength(str) {
  return new TextEncoder().encode(str).length;
}

// updates bytes count
function updateByteCount() {
  // data
  const dInput = document.getElementById("data-input").value;
  const encD = document.getElementById("data-base64").value;
  document.getElementById("data-byte-count").textContent = getByteLength(dInput);
  document.getElementById("enc-data-byte-count").textContent = getByteLength(encD);
  
  // key
  const kInput = document.getElementById("key-input").value;
  const encK = document.getElementById("key-base64").value;
  document.getElementById("key-byte-count").textContent = getByteLength(kInput);
  document.getElementById("enc-key-byte-count").textContent = getByteLength(encK);

  // result
  const byte = document.getElementById("result").value;
  document.getElementById("byte-count").textContent = getByteLength(byte);
}

// Save file from base64 string
async function saveFile() {
  if (maybeShowLoader(result)) {
    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    const ext = document.getElementById("detected-ext").dataset.value;
    const blob = new Blob([result], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `file${fileId}.${ext}`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  } catch (err) {
    showError("Error saving file." + err.message);
  } finally {
    showLoader(false);
  }
}

// copy function
function copyData(selector) {
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
            showSuccess("Copied!");
            setTimeout(() => {
              button.textContent = "Copy";
              button.classList.remove("active");
            }, 1500);
          })
          .catch(() => {
            showError("Failed to copy.");
          });
      } else {
        showError("Nothing found to copy.");
      }
    });
  });
}

// load dom content and add event listeners
document.addEventListener("DOMContentLoaded", () => {
  copyData(".copy-block button");
  // section: upload 
  const dataUpload = document.getElementById("data-upload");
  const keyUpload = document.getElementById("key-upload");
  if (dataUpload) {
    dataUpload.addEventListener("change", (e) => handleUpload(e, "data"));
  }
  if (keyUpload) {
    keyUpload.addEventListener("change", (e) => handleUpload(e, "key"));
  }

  // skip decryption
  document.getElementById("skip-dec").addEventListener("change", skipDec);

  // Add input listeners for byte count
  ["data-input", "key-input", "data-base64", "key-base64", "result"].forEach((id) => {
    const textarea = document.getElementById(id);
    if (textarea) {
      textarea.addEventListener("input", updateByteCount);
    }
  });

  // Section: Decrypt
  const [decryptDataBtn, decryptKeyBtn] = document.querySelectorAll("#decrypt > button");
  decryptDataBtn.addEventListener("click", decryptData);
  decryptKeyBtn.addEventListener("click", decryptKey);


  // Section: Final Output
  const [unshuffleBtn, saveBtn] = document.querySelectorAll("#final-output > button");
  unshuffleBtn.addEventListener("click", unshuffle);
  saveBtn.addEventListener("click", saveFile);
  

  // Initialize byte count
  updateByteCount();
});

