/**
 * wasm-a11y Background Web Worker
 * Manages Pyodide CPython WebAssembly runtime, in-memory virtual filesystem,
 * and document audit/remediation pipelines with zero server egress.
 */

// Pyodide CDN loader
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js");

let pyodideInstance = null;
let isInitialized = false;
let initPromise = null;

async function initializeWorker() {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    self.postMessage({ type: "STATUS", message: "Starting WebAssembly Python runtime..." });
    
    pyodideInstance = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/"
    });

    self.postMessage({ type: "STATUS", message: "Loading core C extensions (lxml, pyyaml, pillow)..." });
    await pyodideInstance.loadPackage(["micropip", "lxml", "pyyaml", "pillow"]);

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
      "engine_a11y-0.4.1-py3-none-any.whl",
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
  })();

  return initPromise;
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
import os
import sys

ext = "${ext}"
in_path = "${inPath}"
out_path = "${outPath}"

try:
    from engine_a11y.reports.md import render_md
    from engine_a11y.reports.html import render_html

    if ext == "docx":
        import docx_a11y.audit as docx_audit
        import docx_a11y.remediate as docx_rem
        from engine_a11y.profile import get_docx_profile as get_profile
        audit_fn = docx_audit.audit_file
        rem_fn = docx_rem.remediate_document
    elif ext == "pptx":
        import pptx_a11y.audit as pptx_audit
        import pptx_a11y.remediate as pptx_rem
        from engine_a11y.profile import get_pptx_profile as get_profile
        audit_fn = pptx_audit.audit_file
        rem_fn = pptx_rem.remediate_presentation
    elif ext == "xlsx":
        import xlsx_a11y.audit as xlsx_audit
        import xlsx_a11y.remediate as xlsx_rem
        from engine_a11y.profile import get_xlsx_profile as get_profile
        audit_fn = xlsx_audit.audit_file
        rem_fn = xlsx_rem.remediate_file
    elif ext == "pdf":
        from engine_a11y.profile import get_pdf_profile as get_profile
        # Pure Python PDF audit & remediation bridge using pypdf
        import os
        import logging
        import warnings
        logging.getLogger("pypdf").setLevel(logging.ERROR)
        warnings.filterwarnings("ignore", module="pypdf")
        import pypdf
        from pypdf.generic import NameObject, TextStringObject, DictionaryObject, BooleanObject

        def audit_pdf_findings(reader):
            has_title = bool(reader.metadata and reader.metadata.title)
            has_lang = bool(reader.trailer.get("/Root", {}).get("/Lang"))
            has_mark_info = bool(reader.trailer.get("/Root", {}).get("/MarkInfo", {}).get("/Marked"))

            f_list = []
            if not has_title:
                f_list.append({
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
                f_list.append({
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
                f_list.append({
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
            return f_list

        reader = pypdf.PdfReader(in_path)
        before_findings = audit_pdf_findings(reader)
        before_res = {
            "file": "${fileName}",
            "sha256": "in-memory-wasm",
            "summary": {
                "total": len(before_findings),
                "blocking": sum(1 for f in before_findings if f.get("severity") in ("critical", "serious")),
                "pass": len(before_findings) == 0
            },
            "findings": before_findings
        }

        # Attempt remediation if requested
        writer = pypdf.PdfWriter()
        for p in reader.pages:
            writer.add_page(p)
        if reader.metadata:
            writer.add_metadata(reader.metadata)

        has_title = bool(reader.metadata and reader.metadata.title)
        has_lang = bool(reader.trailer.get("/Root", {}).get("/Lang"))
        has_mark_info = bool(reader.trailer.get("/Root", {}).get("/MarkInfo", {}).get("/Marked"))
        has_struct_tree = bool(reader.trailer.get("/Root", {}).get("/StructTreeRoot"))

        fixes = []
        if not has_title:
            base_title = os.path.splitext(os.path.basename(in_path))[0].replace("-", " ").replace("_", " ").title()
            writer.add_metadata({NameObject("/Title"): TextStringObject(base_title)})
            fixes.append("pdf-doc-title")

        if not has_lang:
            writer.root_object.update({
                NameObject("/Lang"): TextStringObject("en-US")
            })
            fixes.append("pdf-doc-lang")

        if not has_mark_info and has_struct_tree:
            writer.root_object.update({
                NameObject("/MarkInfo"): DictionaryObject({
                    NameObject("/Marked"): BooleanObject(True)
                })
            })
            fixes.append("pdf-doc-markinfo")

        if fixes:
            with open(out_path, "wb") as f_out:
                writer.write(f_out)
            r_after = pypdf.PdfReader(out_path)
            after_findings = audit_pdf_findings(r_after)
            after_res = {
                "file": f"{os.path.splitext('${fileName}')[0]}_remediated.pdf",
                "sha256": "in-memory-wasm",
                "summary": {
                    "total": len(after_findings),
                    "blocking": sum(1 for f in after_findings if f.get("severity") in ("critical", "serious")),
                    "pass": len(after_findings) == 0
                },
                "findings": after_findings
            }
            rem_res = {"remediated": True, "fixes_applied": fixes}
            has_output_file = True
        else:
            after_res = before_res
            rem_res = {"remediated": False, "reason": "No automated fixes applicable (human action required)"}
            has_output_file = False
    else:
        raise ValueError(f"Unsupported document format: {ext}")

    if ext != "pdf":
        before_res = audit_fn(in_path)
        before_res["file"] = "${fileName}"
        if "findings" in before_res:
            before_res["findings"] = [f.to_dict() if hasattr(f, "to_dict") else f for f in before_res["findings"]]
        rem_res = rem_fn(in_path, out_path)
        after_res = audit_fn(out_path)
        after_res["file"] = f"{os.path.splitext('${fileName}')[0]}_remediated.{ext}"
        if "findings" in after_res:
            after_res["findings"] = [f.to_dict() if hasattr(f, "to_dict") else f for f in after_res["findings"]]
        has_output_file = True

    md_report = render_md(before_res, after_result=after_res, profile=get_profile())
    html_report = render_html(md_report)

    output = {
        "success": True,
        "before": before_res,
        "after": after_res,
        "remediation": rem_res,
        "md_report": md_report,
        "html_report": html_report,
        "has_output_file": has_output_file
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
