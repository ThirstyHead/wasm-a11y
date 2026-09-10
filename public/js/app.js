/**
 * wasm-a11y Main UI Application Controller
 * Handles drag-and-drop, UI state transitions, worker messaging,
 * accessible keyboard interactions, and in-memory file downloads.
 */

// DOM Elements
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const browseBtn = document.getElementById("browse-btn");

const processingSection = document.getElementById("processing-section");
const progressBar = document.getElementById("progress-bar");
const progressStatus = document.getElementById("progress-status");

const resultsSection = document.getElementById("results-section");
const scorecardContainer = document.getElementById("scorecard-container");
const fixesContainer = document.getElementById("fixes-container");
const checklistContainer = document.getElementById("checklist-container");
const reportPreviewContainer = document.getElementById("report-preview-container");

const downloadRemediatedBtn = document.getElementById("download-remediated-btn");
const downloadReportBtn = document.getElementById("download-report-btn");
const resetBtn = document.getElementById("reset-btn");
const a11yAnnouncer = document.getElementById("a11y-announcer");

// State
let worker = null;
let currentRemediatedBlob = null;
let currentRemediatedFilename = "";
let currentReportHtml = "";

function announce(message) {
  if (a11yAnnouncer) {
    a11yAnnouncer.textContent = message;
  }
}

function initWorker() {
  if (worker) return;
  worker = new Worker("js/worker.js");

  worker.onmessage = (e) => {
    const data = e.data || {};
    switch (data.type) {
      case "STATUS":
        updateStatus(data.message);
        break;
      case "READY":
        updateStatus("WebAssembly engine ready.");
        break;
      case "SUCCESS":
        handleSuccess(data);
        break;
      case "ERROR":
        handleError(data.error);
        break;
      default:
        break;
    }
  };

  worker.postMessage({ action: "INIT" });
}

function updateStatus(message) {
  if (progressStatus) progressStatus.textContent = message;
  announce(message);
}

function showProcessing(fileName) {
  dropzone.parentElement.classList.add("is-hidden");
  resultsSection.classList.add("is-hidden");
  processingSection.classList.remove("is-hidden");
  progressBar.removeAttribute("value"); // indeterminate spinner
  updateStatus(`Processing ${fileName} locally in WebAssembly...`);
}

function showResults() {
  processingSection.classList.add("is-hidden");
  resultsSection.classList.remove("is-hidden");
  dropzone.parentElement.classList.add("is-hidden");
  resultsSection.scrollIntoView({ behavior: "smooth" });
}

function resetStudio() {
  if (currentRemediatedBlob) {
    URL.revokeObjectURL(currentRemediatedBlob);
    currentRemediatedBlob = null;
  }
  fileInput.value = "";
  scorecardContainer.innerHTML = "";
  fixesContainer.innerHTML = "";
  checklistContainer.innerHTML = "";
  reportPreviewContainer.innerHTML = "";
  
  resultsSection.classList.add("is-hidden");
  processingSection.classList.add("is-hidden");
  dropzone.parentElement.classList.remove("is-hidden");
  announce("Document studio reset. Ready for next file.");
  dropzone.focus();
}

function handleSuccess({ fileName, results, outputBytes }) {
  showResults();
  announce(`Audit and remediation complete for ${fileName}`);

  const { before, after, html_report, md_report } = results;
  currentReportHtml = html_report;

  // Extract extension & filenames
  const ext = fileName.split(".").pop();
  const baseName = fileName.substring(0, fileName.lastIndexOf("."));
  currentRemediatedFilename = `${baseName}_remediated.${ext}`;

  // Remediated file download setup
  if (outputBytes && outputBytes.length > 0) {
    const mimeTypes = {
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pdf: "application/pdf"
    };
    const mimeType = mimeTypes[ext.toLowerCase()] || "application/octet-stream";
    currentRemediatedBlob = new Blob([outputBytes], { type: mimeType });
    downloadRemediatedBtn.disabled = false;
    downloadRemediatedBtn.classList.remove("is-disabled");
  } else {
    downloadRemediatedBtn.disabled = true;
    downloadRemediatedBtn.classList.add("is-disabled");
  }

  // Render Scorecard Banner
  const totalOriginal = before?.summary?.total || 0;
  const remaining = after?.summary?.total || 0;
  const resolved = Math.max(0, totalOriginal - remaining);
  const pct = totalOriginal > 0 ? ((resolved / totalOriginal) * 100).toFixed(1) : 100.0;

  scorecardContainer.innerHTML = `
    <div class="m-scorecard-banner" role="region" aria-label="Remediation Summary Scorecard">
      <h3 style="margin-top: 0;">🚀 Document Remediation Scorecard</h3>
      <p>
        <strong>${resolved} of ${totalOriginal} barriers resolved (${pct}% improvement)</strong>.
        ${remaining > 0 ? `<strong>${remaining}</strong> action(s) remain for human author review.` : "All automated accessibility checks passed!"}
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Count</th>
            <th scope="col">Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Original Barriers Detected</th>
            <td><strong>${totalOriginal}</strong></td>
            <td>Total barriers found in original document</td>
          </tr>
          <tr>
            <th scope="row">Automatically Fixed & Incorporated</th>
            <td><span class="m-badge m-badge--resolved">${resolved}</span></td>
            <td>Resolved automatically in the remediated output file</td>
          </tr>
          <tr>
            <th scope="row">Remaining Human Actions</th>
            <td><span class="m-badge m-badge--action">${remaining}</span></td>
            <td>Requires editorial or visual author intent</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // Render Report Preview (Sanitized / Framework-Free)
  reportPreviewContainer.innerHTML = `
    <h3>Detailed Audit Report</h3>
    <div class="report-content" style="max-height: 500px; overflow-y: auto; padding: 1rem; border: 1px solid var(--color-border); border-radius: var(--border-radius);">
      ${html_report}
    </div>
  `;
}

function handleError(errorMessage) {
  processingSection.classList.add("is-hidden");
  dropzone.parentElement.classList.remove("is-hidden");
  announce(`Error: ${errorMessage}`);
  alert(`Document processing error: ${errorMessage}`);
}

function processFile(file) {
  if (!file) return;

  const validExts = [".docx", ".pptx", ".xlsx", ".pdf"];
  const fileName = file.name;
  const isSupported = validExts.some((ext) => fileName.toLowerCase().endsWith(ext));

  if (!isSupported) {
    alert("Please select a supported document file (.docx, .pptx, .xlsx, or .pdf)");
    return;
  }

  showProcessing(fileName);

  const reader = new FileReader();
  reader.onload = () => {
    const arrayBuffer = reader.result;
    initWorker();
    worker.postMessage(
      {
        action: "PROCESS",
        fileName,
        fileData: arrayBuffer
      },
      [arrayBuffer] // Transferable for zero-copy
    );
  };
  reader.onerror = () => {
    handleError("Failed to read local file into memory.");
  };
  reader.readAsArrayBuffer(file);
}

// Event Listeners: Drag & Drop
["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove("is-dragover");
  });
});

dropzone.addEventListener("drop", (e) => {
  const dt = e.dataTransfer;
  if (dt && dt.files && dt.files.length > 0) {
    processFile(dt.files[0]);
  }
});

browseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files.length > 0) {
    processFile(e.target.files[0]);
  }
});

// Downloads
downloadRemediatedBtn.addEventListener("click", () => {
  if (!currentRemediatedBlob) return;
  const url = URL.createObjectURL(currentRemediatedBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = currentRemediatedFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

downloadReportBtn.addEventListener("click", () => {
  if (!currentReportHtml) return;
  const blob = new Blob([currentReportHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `accessibility_report_${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

resetBtn.addEventListener("click", resetStudio);

// Initialize background worker and service worker on page load
window.addEventListener("DOMContentLoaded", () => {
  initWorker();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("ServiceWorker registration skipped or failed:", err);
    });
  }
});
