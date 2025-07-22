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
const base64 = btoa(String.fromCharCode(...bytes));
document.getElementById("input-text").value = base64;

const ext = detectFileExtension(bytes);
document.getElementById("detected-ext").textContent =
    "Detected file type: ." + ext;
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