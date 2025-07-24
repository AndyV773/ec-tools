let data = { shuffled: "", key: [] },
fileInput = null,
encryptedUnicode,
encryptedKey;

// error message
function showError(message) {
  const msg = document.getElementById("error-msg");
  msg.textContent = message;
  msg.style.display = "block";
  setTimeout(() => (msg.style.display = "none"), 3000);
}

// show loader and loading text
function showLoader(show = true) {
    document.getElementById("loader").classList.toggle("hidden", !show);
    document.getElementById("loader-text").style.display = show ? "block" : "none";
}

// random number for files
function randomNumber(max = 9999) {
    return Math.floor(Math.random() * max);
}

const date = Date.now().toString().slice(0, 6);
const id = date + randomNumber();

function getByteLength(str) {
    return new TextEncoder().encode(str).length;
}

function updateByteCount() {
    const input = document.getElementById("text-input").value;
    document.getElementById("byte-count").textContent = getByteLength(input);
}

// file size helper
function formatBytes(bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Bytes";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
}

// upload file handler
function handleFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        fileInput = new Uint8Array(e.target.result);
        document.getElementById("file-info").textContent = `File: ${file.name}, Type: ${file.type || "unknown"}, Size: ${formatBytes(file.size)}`;
    };
    reader.readAsArrayBuffer(file);
}

// random helper for shuffler
function randomizer(allChar) {
    const randProduct = Math.random() * Math.random(); // bias toward lower numbers

    if (allChar) {
        return Math.floor(randProduct * (0x10ffff + 1));
    } else {
        return Math.floor(randProduct * 800) + 1;
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

    const dataBuffer = typeof data === "string" ? enc.encode(data) : data;
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, dataBuffer);

    // Combine salt + iv + encrypted
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    // Convert to base64 safely
    function toBase64(bytes) {
        let binary = "";
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

// download as .txt file
    function downloadTextFile(name, content) {
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}${id}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// qr code generator
function generateQRCode(data, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    QRCode.toCanvas(data, { errorCorrectionLevel: "M", scale: 6 }, (err, canvas) => {
        if (err) return console.error("QR error", err);
        container.appendChild(canvas);
    });
}

// download qr code as .png
function downloadQR(containerId, label) {
    const canvas = document.querySelector(`#${containerId} canvas`);
    if (!canvas) return showError("QR code not generated.");
    const link = document.createElement("a");
    link.href = canvas.toDataURL();
    link.download = `${label}${id}.png`;
    link.click();
}

// handle encryption and generate
async function process() {
    showLoader(true);
    data = { shuffled: "", key: [] };
    const pwU = document.getElementById("pw-code").value;
    const pwK = document.getElementById("pw-key").value;
    const allChar = document.getElementById("all-char").checked;
    if (!pwU || !pwK) {
        showLoader(false);
        return alert("Please enter a password.");
    }

    let rawInput = "";
    if (fileInput) {
        rawInput = btoa(String.fromCharCode(...fileInput));
    } else {
        const text = document.getElementById("text-input").value;
        if (!text) return alert("No input provided.");
        rawInput = text;
    }

    // shuffles unicode randomly using randomizer
    for (let i = 0; i < rawInput.length; i++) {
        const code = rawInput.codePointAt(i);
        let randCode, shuffledCode;

        do {
        randCode = randomizer(allChar);
        shuffledCode = code + randCode;
        } while (shuffledCode < 0 || shuffledCode > 0x10ffff || (shuffledCode >= 0xd800 && shuffledCode <= 0xdfff));

        data.shuffled += String.fromCodePoint(shuffledCode);
        data.key.push(randCode);
    }

    const compUnicode = compress(data.shuffled);
    const compKey = compress(data.key.join("."));

    try {
        encryptedUnicode = await aesEncrypt(compUnicode, pwU);
        encryptedKey = await aesEncrypt(compKey, pwK);
        document.getElementById("output-actions").classList.remove("hidden");

        if (encryptedUnicode.length < 2000) {
        generateQRCode(encryptedUnicode, "qr-unicode");
        document.getElementById("qr-button-unicode").classList.remove("hidden");
        }

        if (encryptedKey.length < 2000) {
        generateQRCode(encryptedKey, "qr-key");
        document.getElementById("qr-button-key").classList.remove("hidden");
        }
    } catch (err) {
        alert("Encryption failed: " + err.message);
    }

    showLoader(false);
}

// file upload event listener calls handle file function
document.getElementById("file-input").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) {
        return;
    } else {
        handleFile(file);
    }
});