/**
 * wasm-a11y Background Web Worker
 * Manages Pyodide CPython WebAssembly runtime, in-memory virtual filesystem,
 * and document audit/remediation pipelines with zero server egress.
 */

// Pyodide CDN loader
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js");

let pyodideInstance = null;
let isInitialized = false;

async function initializeWorker() {
  if (isInitialized) return;

  self.postMessage({ type: "STATUS", message: "Starting WebAssembly Python runtime..." });
  
  pyodideInstance = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/"
  });

  self.postMessage({ type: "STATUS", message: "Loading core XML and C extensions (lxml, pyyaml)..." });
  await pyodideInstance.loadPackage(["micropip", "lxml", "pyyaml"]);

  self.postMessage({ type: "STATUS", message: "Installing wasm-a11y studio engine wheels..." });
  
  // Dynamically resolve base URL for wheels relative to worker script
  // Handles root domains, localhost, and GitHub Pages subpaths (e.g. /wasm-a11y/)
  const baseUrl = new URL("../wheels/", self.location.href).href;
  const wheelFiles = [
    "typing_extensions-4.16.0-py3-none-any.whl",
    "et_xmlfile-2.0.0-py3-none-any.whl",
    "xlsxwriter-3.2.9-py3-none-any.whl",
    "wcag_contrast_ratio-0.9-py3-none-any.whl",
    "markdown-3.10.3-py3-none-any.whl",
    "openpyxl-3.1.5-py2.py3-none-any.whl",
    "pypdf-6.18.0-py3-none-any.whl",
    "python_docx_ng-2.1.0-py3-none-any.whl",
    "python_pptx-1.0.2-py3-none-any.whl",
    "engine_a11y-0.4.0-py3-none-any.whl",
    "docx_a11y-0.5.0-py3-none-any.whl",
    "pptx_a11y-0.5.0-py3-none-any.whl",
    "xlsx_a11y-0.1.0-py3-none-any.whl"
  ];

  for (const file of wheelFiles) {
    const url = new URL(file, baseUrl).href;
    self.postMessage({ type: "STATUS", message: `Installing ${file}...` });
    await pyodideInstance.runPythonAsync(`
import micropip
await micropip.install('${url}', deps=False)
    `);
  }

  await pyodideInstance.runPythonAsync(`
import logging
import warnings
logging.getLogger("pypdf").setLevel(logging.ERROR)
warnings.filterwarnings("ignore", module="pypdf")
  `);

  isInitialized = true;
  self.postMessage({ type: "READY" });
}

self.onmessage = async (e) => {
  const data = e.data || {};
  const { action, fileData, fileName } = data;

  if (action === "INIT") {
    try {
      await initializeWorker();
    } catch (err) {
      self.postMessage({ type: "ERROR", error: err.message || String(err) });
    }
    return;
  }

  if (action === "PROCESS") {
    try {
      if (!isInitialized) {
        await initializeWorker();
      }

      self.postMessage({ type: "STATUS", message: `Analyzing ${fileName} in WebAssembly...` });

      const ext = fileName.split(".").pop().toLowerCase();
      const inPath = `/tmp/input_${Date.now()}.${ext}`;
      const outPath = `/tmp/output_${Date.now()}.${ext}`;

      // Write user bytes into Emscripten virtual memory FS
      pyodideInstance.FS.writeFile(inPath, new Uint8Array(fileData));

      self.postMessage({ type: "STATUS", message: `Auditing and remediating ${ext.toUpperCase()} structure...` });

      // Python execution wrapper
      const pyScript = `
import json
import sys

ext = "${ext}"
in_path = "${inPath}"
out_path = "${outPath}"

try:
    from engine_a11y.reports.md import render_md
    from engine_a11y.reports.html import render_html

    if ext == "docx":
        import docx_a11y.audit as audit_mod
        import docx_a11y.remediate as rem_mod
        from engine_a11y.profile import get_docx_profile as get_profile
    elif ext == "pptx":
        import pptx_a11y.audit as audit_mod
        import pptx_a11y.remediate as rem_mod
        from engine_a11y.profile import get_pptx_profile as get_profile
    elif ext == "xlsx":
        import xlsx_a11y.audit as audit_mod
        import xlsx_a11y.remediate as rem_mod
        from engine_a11y.profile import get_xlsx_profile as get_profile
    elif ext == "pdf":
        from engine_a11y.profile import get_pdf_profile as get_profile
        # Pure Python PDF audit bridge using pypdf
        import logging
        import warnings
        logging.getLogger("pypdf").setLevel(logging.ERROR)
        warnings.filterwarnings("ignore", module="pypdf")
        import pypdf
        reader = pypdf.PdfReader(in_path)
        has_title = bool(reader.metadata and reader.metadata.title)
        has_lang = bool(reader.trailer.get("/Root", {}).get("/Lang"))
        has_mark_info = bool(reader.trailer.get("/Root", {}).get("/MarkInfo", {}).get("/Marked"))
        
        findings = []
        if not has_title:
            findings.append({
                "rule_id": "pdf-doc-title",
                "severity": "serious",
                "description": "Document title is missing from metadata dictionary",
                "sc": "2.4.2",
                "wcag_sc": "2.4.2",
                "element_id": "trailer/Info",
                "page_or_sheet": "Catalog",
                "location": "Catalog > Metadata",
                "disability_impact": "Screen reader users cannot determine document topic.",
                "why_unfixable": "Automated tools cannot infer an accurate, descriptive title reflecting document intent.",
                "fix": "Set a clear, concise title in Document Properties.",
                "remediation_status": "remaining"
            })
        if not has_lang:
            findings.append({
                "rule_id": "pdf-doc-lang",
                "severity": "critical",
                "description": "Document natural language (/Lang) is not declared",
                "sc": "3.1.1",
                "wcag_sc": "3.1.1",
                "element_id": "trailer/Root/Lang",
                "page_or_sheet": "Catalog",
                "location": "Catalog > /Root > /Lang",
                "disability_impact": "Text-to-speech synthesizers cannot select appropriate pronunciation engine.",
                "why_unfixable": "Language selection requires identifying primary language of human communication.",
                "fix": "Specify natural language (e.g., 'en-US') in Document Catalog.",
                "remediation_status": "remaining"
            })
        if not has_mark_info:
            findings.append({
                "rule_id": "pdf-doc-markinfo",
                "severity": "critical",
                "description": "Document is not tagged (/MarkInfo /Marked missing or false)",
                "sc": "1.3.1",
                "wcag_sc": "1.3.1",
                "element_id": "trailer/Root/MarkInfo",
                "page_or_sheet": "Catalog",
                "location": "Catalog > /Root > /MarkInfo",
                "disability_impact": "Assistive technology cannot determine logical structure or reading flow.",
                "why_unfixable": "Full tagging requires reconstructing the logical structure tree and reading order.",
                "fix": "Export with tags enabled from source authoring tool or tag structure elements.",
                "remediation_status": "remaining"
            })

        before_res = {
            "file": "${fileName}",
            "sha256": "in-memory-wasm",
            "summary": {
                "total": len(findings),
                "blocking": sum(1 for f in findings if f.get("severity") in ("critical", "serious")),
                "pass": len(findings) == 0
            },
            "findings": findings
        }
        after_res = before_res
        rem_res = {"remediated": False, "reason": "Pure WASM PDF preview"}
    else:
        raise ValueError(f"Unsupported document format: {ext}")

    if ext != "pdf":
        before_res = audit_mod.audit(in_path)
        rem_res = rem_mod.remediate(in_path, out_path)
        after_res = audit_mod.audit(out_path)

    md_report = render_md(before_res, after_result=after_res, profile=get_profile())
    html_report = render_html(md_report)

    output = {
        "success": True,
        "before": before_res,
        "after": after_res,
        "remediation": rem_res,
        "md_report": md_report,
        "html_report": html_report,
        "has_output_file": (ext != "pdf")
    }
except Exception as exc:
    output = {
        "success": False,
        "error": f"{type(exc).__name__}: {str(exc)}"
    }

json.dumps(output)
      `;

      const resultJson = await pyodideInstance.runPythonAsync(pyScript);
      const parsed = JSON.parse(resultJson);

      if (!parsed.success) {
        throw new Error(parsed.error || "Document analysis failed");
      }

      let outputBytes = null;
      if (parsed.has_output_file) {
        try {
          outputBytes = pyodideInstance.FS.readFile(outPath);
        } catch (readErr) {
          console.warn("Could not read output file:", readErr);
        }
      }

      // Cleanup virtual memory
      try {
        pyodideInstance.FS.unlink(inPath);
        if (parsed.has_output_file) {
          pyodideInstance.FS.unlink(outPath);
        }
      } catch (cleanupErr) {
        // ignore
      }

      self.postMessage(
        {
          type: "SUCCESS",
          fileName,
          results: parsed,
          outputBytes
        },
        outputBytes ? [outputBytes.buffer] : []
      );
    } catch (err) {
      self.postMessage({ type: "ERROR", error: err.message || String(err) });
    }
  }
};
