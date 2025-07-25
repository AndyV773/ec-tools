let data = { shuffled: "", key: [] };

// error message
function showError(message) {
  const msg = document.getElementById("error-msg");
  msg.textContent = message;
  msg.style.display = "block";
  setTimeout(() => (msg.style.display = "none"), 3000);
}

// random number for files
function randomNumber(max = 9999) {
    const date = Date.now().toString().slice(0, 6);
    const rand = Math.floor(Math.random() * max);
    return date + rand;
}

const fileId = randomNumber();

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
function handleUpload(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        fileInput = new Uint8Array(e.target.result);
        document.getElementById("file-info").textContent = `File: ${file.name}, Type: ${file.type || "unknown"}, Size: ${formatBytes(file.size)}`;
        updateViews(fileInput);
    };
    reader.readAsArrayBuffer(file);
}

// will add bias strangth at later date const rand = Math.pow(Math.random(), biasStrength);
function randomizer(allChar) {
  const rand = Math.random() * Math.random(); // bias toward lower numbers

  if (allChar) {
    return Math.floor(rand * (0x10ffff + 1));
  } else {
    return Math.floor(rand * 800) + 1;
  }
}

// function to shuffle the text using randomizer returning shuffled and key data
async function shuffleData() {
  data = { shuffled: "", key: [] };
  const input = document.getElementById("input-text").value;
  const allChar = document.getElementById("all-char").checked;
  showLoader(true);
  if (maybeShowLoader(input)) {
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      const codePoint = char.codePointAt(0);

      let rotation, shuffledData;

      do {
        rotation = randomizer(allChar);
        shuffledData = codePoint + rotation;
      } while (
        shuffledData < 0 ||
        shuffledData > 0x10ffff ||
        (shuffledData >= 0xd800 && shuffledData <= 0xdfff)
      );

      data.shuffled += String.fromCodePoint(shuffledData);
      data.key.push(rotation);
    }

    data.key = data.key.join(",");

    document.getElementById("shuffled-data").value = data.shuffled;
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

// skip encryption moving data to download point
async function skipEnc() {
  if (maybeShowLoader(data.shuffled || data.key)) {
    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    const skip = document.getElementById("skip-enc").checked;
    document.getElementById("data-output").value = "";
    document.getElementById("key-output").value = "";
    document.getElementById("qr-data").innerHTML = "";
    document.getElementById("qr-key").innerHTML = "";
    setDataCorrectionLevel();
    setKeyCorrectionLevel();
    // Manually update byte count after changing textarea values
    updateByteCount();

    if (skip && data.shuffled && data.key) {
      document.getElementById("data-output").value = data.shuffled;
      document.getElementById("key-output").value = data.key;
      setDataCorrectionLevel();
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
function compress(input) {
  return pako.deflate(input);
}

// compress and encrypt data
async function encryptData() {
  data.shuffled = compress(data.shuffled);
  const pw = document.getElementById("pw-data").value;
  if (!data.shuffled || !pw ) return showError("Password required to encrypt.");
  
  if (maybeShowLoader(data.shuffled)) {
    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000)); 
  }

  try {
    data.shuffled = await aesEncrypt(data.shuffled, pw);
    document.getElementById("enc-data").value = data.shuffled;
    document.getElementById("data-output").value = data.shuffled;
    setDataCorrectionLevel();
  } catch (err) {
    showError("Encryption failed: " + err.message);
  }
  // Manually update byte count after changing textarea values
  updateByteCount();
  showLoader(false);
}


// compress and encrypt key 
async function encryptKey() {
  data.key = compress(data.key);
  const pw = document.getElementById("pw-key").value;
  if (!data.key || !pw) return showError("Password required to encrypt.");

  if (maybeShowLoader(data.key)) {
    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  try {
    data.key = await aesEncrypt(data.key, pw);
    document.getElementById("enc-key").value = data.key;
    document.getElementById("key-output").value = data.key;
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

// updates bytes count
function updateByteCount() {
  //input
  const inputText = document.getElementById("input-text").value;
  document.getElementById("text-byte-count").textContent = getByteLength(inputText);
  
  // data
  const data = document.getElementById("shuffled-data").value;
  const encD = document.getElementById("enc-data").value;
  const dOut = document.getElementById("data-output").value;
  document.getElementById("shuffled-byte-count").textContent = getByteLength(data);
  document.getElementById("enc-data-byte-count").textContent = getByteLength(encD);
  document.getElementById("data-byte-count").textContent = getByteLength(dOut);
  
  // key
  const key = document.getElementById("rotation-key").value;
  const encK = document.getElementById("enc-key").value;
  const kOut = document.getElementById("key-output").value;
  document.getElementById("rotation-byte-count").textContent = getByteLength(key);
  document.getElementById("enc-key-byte-count").textContent = getByteLength(encK);
  document.getElementById("key-byte-count").textContent = getByteLength(kOut);
}

// set information for data if qr generation is accepted
function setDataCorrectionLevel() {
  const dOut = getByteLength(document.getElementById("data-output").value);
  const label = document.getElementById("qr-error-level-data");
  const dDwn = document.getElementById("data-dwn");
  const dQr = document.getElementById("data-qr-gen");

  if (dOut === 0) {
    label.innerText = "No data";
    label.dataset.value = "";
    dDwn.classList.add("hidden");
    dQr.classList.add("hidden");
    document.getElementById("download-qr-data").classList.add("hidden");
  } else if (dOut <= 1270) {
    label.innerText = "High (H) - max 1270 B";
    label.dataset.value = "H";
    dDwn.classList.remove("hidden");
    dQr.classList.remove("hidden");
  } else if (dOut > 1270 && dOut <= 1660) {
    label.innerText = "Quartile (Q) - max 1660 B";
    label.dataset.value = "Q";
    dDwn.classList.remove("hidden");
    dQr.classList.remove("hidden");
  } else if (dOut > 1660 && dOut <= 2300) {
    label.innerText = "Medium (M) - max 2300 B";
    label.dataset.value = "M";
    dDwn.classList.remove("hidden");
    dQr.classList.remove("hidden");
  } else if (dOut > 2300 && dOut <= 2950) {
    label.innerText = "Low (L) - max 2950 B";
    label.dataset.value = "L";
    dDwn.classList.remove("hidden");
    dQr.classList.remove("hidden");
  } else {
    label.innerText = "Data too large for QR max 2950 B";
    label.dataset.value = "";
    dDwn.classList.remove("hidden");
    dQr.classList.add("hidden");
    document.getElementById("download-qr-data").classList.add("hidden");
  }
  
}

// set information for key if qr generation is accepted
function setKeyCorrectionLevel() {
  const kOut = getByteLength(document.getElementById("key-output").value);
  const label = document.getElementById("qr-error-level-key");
  const kDwn = document.getElementById("key-dwn");
  const kQr = document.getElementById("key-qr-gen");

  if (kOut === 0) {
    label.innerText = "No data";
    label.dataset.value = "";
    kDwn.classList.add("hidden");
    kQr.classList.add("hidden");
    document.getElementById("download-qr-key").classList.add("hidden");
  } else if (kOut <= 1270) {
    label.innerText = "High (H) - max 1270 B";
    label.dataset.value = "H";
    kDwn.classList.remove("hidden");
    kQr.classList.remove("hidden");
  } else if (kOut > 1270 && kOut <= 1660) {
    label.innerText = "Quartile (Q) - max 1660 B";
    label.dataset.value = "Q";
    kDwn.classList.remove("hidden");
    kQr.classList.remove("hidden");
  } else if (kOut > 1660 && kOut <= 2300) {
    label.innerText = "Medium (M) - max 2300 B";
    label.dataset.value = "M";
    kDwn.classList.remove("hidden");
    kQr.classList.remove("hidden");
  } else if (kOut > 2300 && kOut <= 2950) {
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

// generate qr code for data
function generateQRCodeData() {
  const encD = data.shuffled;
  const level = document.getElementById("qr-error-level-data").dataset.value;

  if (!encD) return showError("Encrypted values are missing.");
  const qrD = document.getElementById("qr-data");
  // Clear previous
  qrD.innerHTML = "";

  // Generate data QR
  QRCode.toCanvas(encD, {
    errorCorrectionLevel: level,
    margin: 1,
    scale: 8 // Automatically adjusts size based on content
  }, (err, canvas) => {
    if (err) return showError("Data QR generation error: " + err.message);
    qrD.appendChild(canvas);
    document.getElementById("download-qr-data").classList.remove("hidden");
  });
}

// generate qr code for key
function generateQRCodeKey() {
  const encK = data.key;
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



// download qr code
function downloadQR(containerid, name) {
  const canvas = document.querySelector(`#${containerid} canvas`);
  if (!canvas) return showError("QR code not generated yet.");
  const link = document.createElement("a");
  link.href = canvas.toDataURL();
  link.download = `${name}${fileId}.png`;
  link.click();
}

// download as .txt
async function downloadTextFile(name, content) {
  showLoader(true);
  if (maybeShowLoader(content)) {
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${name}${fileId}.txt`;;
    link.click();
    URL.revokeObjectURL(link.href);
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
  // file upload event listener calls handle file function
  document.getElementById("file-input").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) {
      return;
    } else {
      handleUpload(file);
    }
  });

  // Input text area: update byte count on input
  document.getElementById("input-text").addEventListener("input", updateByteCount);

  // Shuffle button: call shuffle data on click
  document.getElementById("shuffle").addEventListener("click", shuffleData);

  // skip encryption
  document.getElementById("skip-enc").addEventListener("change", skipEnc);
  
  // Textareas: oninput calls updateByteCount
  document.getElementById("shuffled-data").addEventListener("input", updateByteCount);
  document.getElementById("rotation-key").addEventListener("input", updateByteCount);
  document.getElementById("enc-data").addEventListener("input", updateByteCount);
  document.getElementById("enc-key").addEventListener("input", updateByteCount);

  // Buttons: onclick calls respective encrypt functions
  document.getElementById("enc-data-btn").addEventListener("click", encryptData);
  document.getElementById("enc-key-btn").addEventListener("click", encryptKey);

  // For key
  document.getElementById("key-output").addEventListener("input", () => {
    updateByteCount();
    setKeyCorrectionLevel();
  });

  // For data
  document.getElementById("data-output").addEventListener("input", () => {
    updateByteCount();
    setDataCorrectionLevel();
  });

  // generate qr code
  document.getElementById("data-qr-gen").addEventListener("click", generateQRCodeData);
  document.getElementById("key-qr-gen").addEventListener("click", generateQRCodeKey);
  
  // download .txt 
  document.getElementById("data-txt").addEventListener("click", () => {
    downloadTextFile('data', data.shuffled);
  });
  document.getElementById("key-txt").addEventListener("click", () => {
    downloadTextFile('key', data.key);
  });

  // download qr
  document.querySelector("#download-qr-data button").addEventListener("click", () => {
    downloadQR("qr-data", "data");
  });
  document.querySelector("#download-qr-key button").addEventListener("click", () => {
    downloadQR("qr-key", "key");
  });

  // Initialize byte count
  updateByteCount();
});