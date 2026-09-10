/**
 * wasm-a11y Main UI Application Controller
 * Provides a two-pane Before/After storytelling architecture matching the desktop suite:
 * - Left Pane: 1. Before: Original Documents
 * - Center Bridge: Remediation Flow ("✨ Fix & Audit ➔")
 * - Right Pane: 2. After: Remediated Files & Reports
 * - Modal Dialog: In-App Report Viewer (matching ReportViewerDialog)
 */

// DOM Elements: Left Pane (Before)
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const browseBtn = document.getElementById("browse-btn");
const clearBtn = document.getElementById("clear-btn");
const beforeFileView = document.getElementById("before-file-view");
const loadedFilename = document.getElementById("loaded-filename");
const loadedFilesize = document.getElementById("loaded-filesize");
const loadedStatusBadge = document.getElementById("loaded-status-badge");
const beforeFindingsPreview = document.getElementById("before-findings-preview");

// DOM Elements: Center Bridge
const btnRemediatePrimary = document.getElementById("btn-remediate-primary");
const chkAutofix = document.getElementById("chk-autofix");
const progressBar = document.getElementById("progress-bar");
const progressStatus = document.getElementById("progress-status");

// DOM Elements: Right Pane (After)
const afterEmptyState = document.getElementById("after-empty-state");
const afterResultsView = document.getElementById("after-results-view");
const afterFilename = document.getElementById("after-filename");
const afterFilesize = document.getElementById("after-filesize");
const afterScoreBadge = document.getElementById("after-score-badge");
const statFixed = document.getElementById("stat-fixed");
const statActions = document.getElementById("stat-actions");
const downloadRemediatedBtn = document.getElementById("download-remediated-btn");
const viewReportBtn = document.getElementById("view-report-btn");
const downloadReportBtn = document.getElementById("download-report-btn");

// DOM Elements: Modal Report Dialog
const reportDialog = document.getElementById("report-dialog");
const reportDialogBody = document.getElementById("report-dialog-body");
const closeDialogBtn = document.getElementById("close-dialog-btn");
const dialogCloseBottomBtn = document.getElementById("dialog-close-bottom-btn");
const dialogDownloadReportBtn = document.getElementById("dialog-download-report-btn");

// Screen Reader Announcer
const a11yAnnouncer = document.getElementById("a11y-announcer");

// Application State
let worker = null;
let currentFile = null;
let currentFileData = null; // ArrayBuffer
let currentRemediatedBlob = null;
let currentRemediatedFilename = "";
let currentReportHtml = "";

function announce(message) {
  if (a11yAnnouncer) {
    a11yAnnouncer.textContent = message;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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

function handleFileSelected(file) {
  if (!file) return;

  const validExts = [".docx", ".pptx", ".xlsx", ".pdf"];
  const isSupported = validExts.some((ext) => file.name.toLowerCase().endsWith(ext));

  if (!isSupported) {
    alert("Please select a supported document (.docx, .pptx, .xlsx, or .pdf)");
    return;
  }

  currentFile = file;

  const reader = new FileReader();
  reader.onload = () => {
    currentFileData = reader.result;

    // Update Left Pane
    dropzone.classList.add("is-hidden");
    dropzone.style.display = "none";
    beforeFileView.classList.remove("is-hidden");
    beforeFileView.style.display = "flex";

    loadedFilename.textContent = file.name;
    loadedFilesize.textContent = formatBytes(file.size);
    loadedStatusBadge.textContent = "Ready to remediate";
    clearBtn.disabled = false;

    // Update Center Bridge
    btnRemediatePrimary.disabled = false;
    updateStatus("Document loaded. Ready to remediate.");
    announce(`Document ${file.name} loaded. Click Fix & Audit in center bridge.`);
  };

  reader.onerror = () => {
    handleError("Failed to read file from disk.");
  };

  reader.readAsArrayBuffer(file);
}

function clearLoadedFile() {
  currentFile = null;
  currentFileData = null;
  if (currentRemediatedBlob) {
    URL.revokeObjectURL(currentRemediatedBlob);
    currentRemediatedBlob = null;
  }
  fileInput.value = "";

  // Reset Left Pane
  beforeFileView.classList.add("is-hidden");
  beforeFileView.style.display = "none";
  dropzone.classList.remove("is-hidden");
  dropzone.style.display = "";
  clearBtn.disabled = true;

  // Reset Center Bridge
  btnRemediatePrimary.disabled = true;
  progressBar.classList.add("is-hidden");
  progressBar.style.display = "none";
  updateStatus("Ready");

  // Reset Right Pane
  afterResultsView.classList.add("is-hidden");
  afterResultsView.style.display = "none";
  afterEmptyState.classList.remove("is-hidden");
  afterEmptyState.style.display = "flex";

  announce("Selection cleared. Ready for next document.");
}

function startRemediation() {
  if (!currentFile || !currentFileData) return;

  initWorker();

  btnRemediatePrimary.disabled = true;
  clearBtn.disabled = true;
  progressBar.classList.remove("is-hidden");
  progressBar.style.display = "block";
  progressBar.removeAttribute("value"); // indeterminate progress
  updateStatus(`Remediating ${currentFile.name}...`);

  // Clone buffer so currentFileData is preserved
  const bufferCopy = currentFileData.slice(0);

  worker.postMessage(
    {
      action: "PROCESS",
      fileName: currentFile.name,
      fileData: bufferCopy,
      autofix: chkAutofix.checked
    },
    [bufferCopy]
  );
}

function handleSuccess({ fileName, results, outputBytes }) {
  progressBar.classList.add("is-hidden");
  progressBar.style.display = "none";
  btnRemediatePrimary.disabled = currentFile === null;
  clearBtn.disabled = currentFile === null;
  updateStatus("✅ Complete");

  const { before, after, html_report } = results;
  currentReportHtml = html_report || "";

  // Derive filenames and extension
  const ext = fileName.split(".").pop();
  const baseName = fileName.substring(0, fileName.lastIndexOf("."));
  currentRemediatedFilename = `${baseName}_remediated.${ext}`;

  // Update Right Pane
  afterEmptyState.classList.add("is-hidden");
  afterEmptyState.style.display = "none";
  afterResultsView.classList.remove("is-hidden");
  afterResultsView.style.display = "flex";

  afterFilename.textContent = currentRemediatedFilename;

  // Calculate metrics
  const totalOriginal = before?.summary?.total || 0;
  const remaining = after?.summary?.total || 0;
  const resolved = Math.max(0, totalOriginal - remaining);
  const pct = totalOriginal > 0 ? ((resolved / totalOriginal) * 100).toFixed(1) : 100.0;

  statFixed.textContent = resolved;
  statActions.textContent = remaining;
  afterScoreBadge.textContent = `${pct}% Score`;

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
    afterFilesize.textContent = formatBytes(outputBytes.byteLength);
    downloadRemediatedBtn.disabled = false;
  } else {
    afterFilesize.textContent = "Audit report generated";
    downloadRemediatedBtn.disabled = true;
  }

  announce(`Remediation complete. ${resolved} barriers resolved, ${remaining} actions remaining.`);
}

function handleError(errorMessage) {
  progressBar.classList.add("is-hidden");
  progressBar.style.display = "none";
  btnRemediatePrimary.disabled = currentFile === null;
  clearBtn.disabled = currentFile === null;
  updateStatus(`⚠️ Error: ${errorMessage}`);
  announce(`Error: ${errorMessage}`);
  console.warn("WASM-a11y:", errorMessage);
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openReportDialog() {
  if (!currentReportHtml) return;
  reportDialogBody.innerHTML = currentReportHtml;
  if (typeof reportDialog.showModal === "function") {
    reportDialog.showModal();
  } else {
    reportDialog.setAttribute("open", "");
  }
}

function closeReportDialog() {
  if (typeof reportDialog.close === "function") {
    reportDialog.close();
  } else {
    reportDialog.removeAttribute("open");
  }
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
    handleFileSelected(dt.files[0]);
  }
});

browseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFileSelected(e.target.files[0]);
  }
});

clearBtn.addEventListener("click", clearLoadedFile);
btnRemediatePrimary.addEventListener("click", startRemediation);

// Action buttons
downloadRemediatedBtn.addEventListener("click", () => {
  if (currentRemediatedBlob) {
    downloadFile(currentRemediatedBlob, currentRemediatedFilename);
  }
});

viewReportBtn.addEventListener("click", openReportDialog);
closeDialogBtn.addEventListener("click", closeReportDialog);
dialogCloseBottomBtn.addEventListener("click", closeReportDialog);

downloadReportBtn.addEventListener("click", () => {
  if (currentReportHtml) {
    const blob = new Blob([currentReportHtml], { type: "text/html" });
    downloadFile(blob, `accessibility_report_${Date.now()}.html`);
  }
});

dialogDownloadReportBtn.addEventListener("click", () => {
  if (currentReportHtml) {
    const blob = new Blob([currentReportHtml], { type: "text/html" });
    downloadFile(blob, `accessibility_report_${Date.now()}.html`);
  }
});

// Initialize background worker and service worker on load
window.addEventListener("DOMContentLoaded", () => {
  initWorker();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("ServiceWorker registration skipped or failed:", err);
    });
  }
});
