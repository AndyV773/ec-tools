let data = { shuffled: "", key: [] },
    fileInput = null;

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

// text encoder helper
function getByteLength(str) {
    return new TextEncoder().encode(str).length;
}

// updates bytes count
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
function handleUpload(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        fileInput = new Uint8Array(e.target.result);
        document.getElementById("file-info").textContent = `File: ${file.name}, Type: ${file.type || "unknown"}, Size: ${formatBytes(file.size)}`;
    };
    reader.readAsArrayBuffer(file);
}

// random helper for shuffler
function randomizer(allChar) {
    const rand = Math.random() * Math.random(); // bias toward lower numbers

    if (allChar) {
        return Math.floor(rand * (0x10ffff + 1));
    } else {
        return Math.floor(rand * 800) + 1;
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

// download as .txt
async function downloadTextFile(name, content) {
    if (maybeShowLoader(content)) {
        showLoader(true);
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

// qr code generator
function generateQRCode(data, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    QRCode.toCanvas(data, { errorCorrectionLevel: "M", scale: 6 }, (err, canvas) => {
        if (err) return showError("QR error", err);
        container.appendChild(canvas);
    });
}

// download qr code as .png
function downloadQR(containerId, name) {
    const canvas = document.querySelector(`#${containerId} canvas`);
    if (!canvas) return showError("QR code not generated.");
    const link = document.createElement("a");
    link.href = canvas.toDataURL();
    link.download = `${name}${fileId}.png`;
    link.click();
}

// handle encryption and generate
async function process() {
    data = { shuffled: "", key: [] };
    const pwD = document.getElementById("pw-data").value;
    const pwK = document.getElementById("pw-key").value;
    const allChar = document.getElementById("all-char").checked;
    
    let rawInput = "";
    if (fileInput) {
        rawInput = btoa(String.fromCharCode(...fileInput));
    } else {
        const text = document.getElementById("text-input").value;
        if (!text) return showError("No input provided.");
        rawInput = text;
    }

    if (!pwD || !pwK) {
        return showError("Please enter a password.");
    }

    showLoader(true);
    // Give the browser time to repaint the loader
    await new Promise(resolve => setTimeout(resolve, 2000));

    // shuffles data randomly using randomizer
    try {
        for (let i = 0; i < rawInput.length; i++) {
            const codePoint = rawInput.codePointAt(i);
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

        data.shuffled = compress(data.shuffled);
        data.key = compress(data.key.join(","));

    } catch (err) {
        showError("Encryption failed: " + err.message);        
    }

    // encryts data useing aes and returns txt and qr
    try {
        data.shuffled = await aesEncrypt(data.shuffled, pwD);
        data.key = await aesEncrypt(data.key, pwK);
        document.getElementById("output-actions").classList.remove("hidden");

        if (data.shuffled.length < 2000) {
            generateQRCode(data.shuffled, "qr-data");
            document.getElementById("qr-button-data").classList.remove("hidden");
        }

        if (data.key.length < 2000) {
            generateQRCode(data.key, "qr-key");
            document.getElementById("qr-button-key").classList.remove("hidden");
        }
    } catch (err) {
        showError("Encryption failed: " + err.message);
    }

    showLoader(false);
}

// load dom content and add event listeners
document.addEventListener("DOMContentLoaded", () => {
    // file upload event listener calls handle file function
    document.getElementById("file-input").addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (!file) {
            return;
        } else {
            handleUpload(file);
        }
    })
    
    document.getElementById("text-input")?.addEventListener("click", () => {
        updateByteCount();
    });

    document.getElementById("process")?.addEventListener("click", () => {
        process();
    });
    
    document.getElementById("qr-button-data")?.addEventListener("click", () => {
        downloadQR("qr-data", "data");
    });

    document.getElementById("download-data")?.addEventListener("click", () => {
        downloadTextFile("data", data.shuffled);
    });

    document.getElementById("qr-button-key")?.addEventListener("click", () => {
        downloadQR("qr-key", "key");
    });

    document.getElementById("download-key")?.addEventListener("click", () => {
        downloadTextFile("key", data.key);
    });
});