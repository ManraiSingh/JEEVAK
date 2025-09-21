
import React, { useState, useRef, useEffect } from "react";
import "./style.css";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  LabelList,
  Cell,
} from "recharts";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const BACKEND_URL = "http://192.168.211.89:5175";
const GALLERY_KEY = "jeevak_gallery_v1"; // localStorage key for gallery

const MARINE_KEYWORDS = [
  "marine", "ocean", "sea", "phytoplankton", "zooplankton", "plankton", "algae", "diatom", "copepod",
  "rotifer", "microalgae", "bloom", "red tide", "planktonic", "ocean health", "chlorophyll", "salinity", "turbidity"
];

const isMarineRelated = (text) => {
  if (!text) return false;
  const t = text.toLowerCase();
  return MARINE_KEYWORDS.some(k => t.includes(k));
};

export default function Dashboard() {
  // refs
  const inputRef = useRef();
  const chatInputRef = useRef();
  const dashboardRef = useRef();

  // detection/upload state
  const [uploaded, setUploaded] = useState(null); // { url, name, dataUrl? }
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState({ phytoplankton: 0, zooplankton: 0, bacteria: 0, fungus: 0 });
  const [detections, setDetections] = useState({});
  const [messages, setMessages] = useState([{ from: "bot", text: "Hello — upload a sample image to begin analysis or ask about marine organisms and ocean health." }]);
  const [uiError, setUiError] = useState(null);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // gallery / view state
  const [view, setView] = useState("dashboard"); 
  const [gallery, setGallery] = useState([]); // array of { id, name, dataUrl, ts }
  const [selectedForCompare, setSelectedForCompare] = useState([]); 
  const [fullscreenImage, setFullscreenImage] = useState(null); 

  // load gallery from localStorage on mount
  useEffect(() => {
    const raw = localStorage.getItem(GALLERY_KEY);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        setGallery(arr || []);
      } catch (e) {
        console.warn("Failed to parse gallery:", e);
      }
    }
  }, []);

  // keep chat scrolled
  useEffect(() => {
    const el = document.querySelector('.chat-history');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoadingChat]);

  // Utility: save gallery to localStorage
  const persistGallery = (arr) => {
    setGallery(arr);
    try { localStorage.setItem(GALLERY_KEY, JSON.stringify(arr)); } catch (e) { console.error("Persist gallery failed", e); }
  };

  // Helper to create an ID
  const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // convert File to dataURL
  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });


  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUiError(null);
    const objectUrl = URL.createObjectURL(file);
    setUploaded({ url: objectUrl, name: file.name });

  

    // send to backend
    const form = new FormData();
    form.append("file", file);
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/predict`, { method: "POST", body: form });
      const rawText = await res.text().catch(() => "<unreadable body>");
      console.log(">>> Response status:", res.status);
      if (!res.ok) {
        setUiError(`Server error ${res.status}: ${rawText}`);
        setLoading(false);
        return;
      }
      let json = null;
      try { json = rawText ? JSON.parse(rawText) : null; } catch (err) {
        setUiError("Server returned non-JSON. See console for raw output.");
        setLoading(false);
        return;
      }
      setLoading(false);
      const rawCounts = json.counts_raw || json.counts || {};
      const agg = json.counts_agg || aggregateCounts(rawCounts);
      setDetections(rawCounts);
      setCounts(agg);
      if (json.annotated_image_url) {
  setUploaded({ url: json.annotated_image_url, name: file.name });

  try {
    const imgRes = await fetch(json.annotated_image_url);
    const blob = await imgRes.blob();
    const reader = new FileReader();
    reader.onloadend = () => {
      addToGallery({ name: file.name + " (detected)", dataUrl: reader.result, auto: true });
    };
    reader.readAsDataURL(blob);
  } catch (err) {
    console.error("Could not fetch annotated image:", err);
  }
}

      console.log("Parsed JSON:", json);
    } catch (err) {
      setLoading(false);
      console.error("Upload failed:", err);
      setUiError("Network error: " + String(err));
    }
  };

  // bucket helpers (copied from original)
  const speciesToBucket = (s) => {
    if (!s) return "other";
    s = s.toLowerCase();
    const phyto = new Set(["chlorella","euglena","diatom","cyanobacteria","nannochloropsis"]);
    const zoo = new Set(["rotifer","asplanchna","copepod","daphnia","leptodora"]);
    if (phyto.has(s)) return "phytoplankton";
    if (zoo.has(s)) return "zooplankton";
    if (s.includes("bacteria")) return "bacteria";
    if (s.includes("fungus") || s.includes("yeast")) return "fungus";
    return "other";
  };
  const aggregateCounts = (raw) => {
    const agg = { phytoplankton: 0, zooplankton: 0, bacteria: 0, fungus: 0 };
    Object.entries(raw || {}).forEach(([cls, val]) => {
      const b = speciesToBucket(cls);
      if (b in agg) agg[b] += Number(val || 0);
    });
    return agg;
  };

  // ----------------- Gallery functions -----------------
  const addToGallery = ({ name, dataUrl, auto = false }) => {
    const item = { id: makeId(), name: name || "image", dataUrl, ts: Date.now(), autoSaved: !!auto };
    const arr = [item, ...gallery].slice(0, 200); // cap at 200 entries
    persistGallery(arr);
  };

  const removeFromGallery = (id) => {
    const arr = gallery.filter(g => g.id !== id);
    persistGallery(arr);
    setSelectedForCompare(s => s.filter(x => x !== id));
  };

  const toggleSelectForCompare = (id) => {
    setSelectedForCompare(s => {
      if (s.includes(id)) return s.filter(x => x !== id);
      if (s.length >= 2) return [id]; 
      return [...s, id];
    });
  };

  const openFullscreen = (dataUrl) => setFullscreenImage(dataUrl);

  const clearFullscreen = () => setFullscreenImage(null);

  const openGalleryPage = () => {
    setView("gallery");
    setSelectedForCompare([]);
  };

  const closeGalleryPage = () => {
    setView("dashboard");
    setSelectedForCompare([]);
  };

  // ---------------- Export helpers (kept from your file) ----------------
  const captureCanvas = async () => {
    const el = dashboardRef.current || document.body;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false });
    return canvas;
  };

  const capturePdf = async () => {
    const canvas = await captureCanvas();
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: "a4" });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

    const imgW = canvas.width;
    const imgH = canvas.height;
    const scale = Math.min(pdfW / imgW, pdfH / imgH);
    const renderW = imgW * scale;
    const renderH = imgH * scale;
    const marginX = (pdfW - renderW) / 2;
    const marginY = (pdfH - renderH) / 2;

    pdf.addImage(imgData, "PNG", marginX, marginY, renderW, renderH);
    return pdf;
  };

  const capturePngBlob = async () => {
    const canvas = await captureCanvas();
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png", 0.95));
  };

  const handleShare = async () => {
    try {
      const pdf = await capturePdf();
      const pdfBlob = pdf.output("blob");

      if (navigator.canShare && navigator.canShare({ files: [new File([pdfBlob], "dashboard-report.pdf", { type: "application/pdf" })] })) {
        const file = new File([pdfBlob], "dashboard-report.pdf", { type: "application/pdf" });
        await navigator.share({ title: "Dashboard report", text: "Detected organisms report (exported from dashboard)", files: [file] });
        return;
      }
      if (navigator.share) {
        const u = URL.createObjectURL(pdfBlob);
        try { await navigator.share({ title: "Dashboard report", text: "Open to download", url: u }); URL.revokeObjectURL(u); return; }
        catch (err) { URL.revokeObjectURL(u); }
      }
      pdf.save("dashboard-report.pdf");
    } catch (err) {
      console.error("PDF export failed:", err);
      try {
        const pngBlob = await capturePngBlob();
        if (navigator.canShare && navigator.canShare({ files: [new File([pngBlob], "dashboard.png", { type: "image/png" })] })) {
          const file = new File([pngBlob], "dashboard.png", { type: "image/png" });
          await navigator.share({ title: "Dashboard screenshot", text: "Screenshot of dashboard", files: [file] });
          return;
        }
        const url = URL.createObjectURL(pngBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "dashboard-screenshot.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err2) {
        console.error("PNG fallback failed:", err2);
        alert("Export failed. Check console.");
      }
    }
  };

  // --- Chat send  ---

const sendChat = async (text) => {
  if (!text || !text.trim()) return;
  setMessages(m => [...m, { from: 'user', text }]);
  setMessages(m => [...m, { from: 'bot', text: "Contacting server for a real answer..." }]);
  setIsLoadingChat(true);

  try {
    // Attempt the backend call (no local fallback unless network fails)
    console.log("[sendChat] POST", `${BACKEND_URL}/chat`, { text });
    const resp = await fetch(`${BACKEND_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    // always read raw text so we can inspect what server returned
    const raw = await resp.text().catch(() => "<failed-to-read-body>");
    console.log("[sendChat] status:", resp.status, "raw body:", raw);

    if (!resp.ok) {
      // show server error & raw body in UI so you can see what's wrong
      setMessages(m => [...m, { from: 'bot', text: `Server error ${resp.status}: ${raw}` }]);
      setIsLoadingChat(false);
      return;
    }

    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn("[sendChat] server returned non-JSON. Using raw text as answer.");
      setMessages(m => [...m, { from: 'bot', text: `API (raw): ${raw}` }]);
      setIsLoadingChat(false);
      return;
    }

    // Extract reply from many possible shapes
    const replyCandidates = [
      parsed.reply,
      parsed.answer,
      parsed.text,
      parsed.message,
      parsed.message?.content,
      parsed.data?.answer,
      parsed.data?.text,
      (parsed.choices && Array.isArray(parsed.choices) && parsed.choices[0]?.text),
      (parsed.choices && Array.isArray(parsed.choices) && parsed.choices[0]?.message?.content),
      (typeof parsed === 'string' ? parsed : null)
    ];

    const reply = replyCandidates.find(r => r !== undefined && r !== null && String(r).trim() !== "");

    if (reply) {
      setMessages(m => [...m, { from: 'bot', text: String(reply) }]);
      setIsLoadingChat(false);
      return;
    }

    const keys = Array.isArray(parsed) ? `[array of length ${parsed.length}]` : Object.keys(parsed).join(", ");
    setMessages(m => [...m, { from: 'bot', text: `Server JSON received but no reply field found. Keys: ${keys}. Full JSON: ${JSON.stringify(parsed)}` }]);
  } catch (err) {
    console.error("[sendChat] network / unexpected error:", err);
    setMessages(m => [...m, { from: 'bot', text: `Network or unexpected error calling API: ${String(err)}` }]);
  } finally {
    setIsLoadingChat(false);
  }
};




  // --- species graph data ---
  const TOP_N = 8;
  const speciesGraphData = Object.entries(detections || {})
    .filter(([_, v]) => Number(v) > 0)
    .map(([species, v]) => ({ name: species.replace(/_/g, ' '), value: Number(v), species }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N);

  // ---------------- Render ----------------
  if (view === "gallery") {
    return (
      <div className="app gallery-page" style={{ minHeight: "100vh", padding: 20 }}>
        <header className="header">
          <div className="brand">
                <img src="/logo.png" alt="JEEVAK logo" style={{ height: 40 }} />

             <h1>JEEVAK — Gallery</h1>
            </div>
          <div className="header-actions">
            <button onClick={() => { closeGalleryPage(); }} className="choose-btn">⬅ Back</button>
            <div style={{ width: 12 }} />
            <button onClick={() => { if (uploaded?.dataUrl) addToGallery({ name: uploaded.name, dataUrl: uploaded.dataUrl }); alert("Saved current upload to gallery"); }} className="choose-btn">Save current upload</button>
            <div style={{ width: 12 }} />
            <button onClick={() => { setSelectedForCompare([]); setFullscreenImage(null); }} className="choose-btn">Clear selection</button>
          </div>
        </header>

        <main style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: "#666" }}>{gallery.length} images saved</div>
            <div style={{ flex: 1 }} />
            <button
              className="choose-btn"
              onClick={() => {
                if (selectedForCompare.length === 0) { alert("Select one or two images from thumbnails to compare/view."); return; }
                if (selectedForCompare.length === 1) {
                  const item = gallery.find(g => g.id === selectedForCompare[0]);
                  if (item) openFullscreen(item.dataUrl);
                } else {
                }
              }}
            >
              {selectedForCompare.length === 2 ? "Compare selected" : selectedForCompare.length === 1 ? "View selected" : "Select to compare"}
            </button>
          </div>

          {/* Thumbnails grid */}
          <div className="gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {gallery.length === 0 && <div style={{ color: '#999' }}>No images in gallery yet — upload and save images to build history.</div>}
            {gallery.map(item => (
              <div key={item.id} className={`gallery-thumb ${selectedForCompare.includes(item.id) ? 'selected' : ''}`} style={{ border: '1px solid #ddd', padding: 8, borderRadius: 8, position: 'relative', background: '#fff' }}>
                <img src={item.dataUrl} alt={item.name} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }} onClick={() => toggleSelectForCompare(item.id)} />
                <div style={{ marginTop: 6, fontSize: 12, color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{item.name}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button title="Open fullscreen" onClick={() => openFullscreen(item.dataUrl)} className="tiny-btn">🔍</button>
                    <button title="Delete" onClick={() => { if (confirm("Delete this image from gallery?")) removeFromGallery(item.id); }} className="tiny-btn">🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Compare / Fullscreen area */}
          <div style={{ marginTop: 18 }}>
            {selectedForCompare.length === 2 && (() => {
              const [aId, bId] = selectedForCompare;
              const a = gallery.find(g => g.id === aId);
              const b = gallery.find(g => g.id === bId);
              if (!a || !b) return <div style={{ color: '#900' }}>Selected images not found.</div>;
              return (
                <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                  <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 8 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>{a.name}</div>
                    <img src={a.dataUrl} alt={a.name} style={{ width: '100%', height: 420, objectFit: 'contain', background: '#f8f8f8' }} />
                  </div>
                  <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 8 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>{b.name}</div>
                    <img src={b.dataUrl} alt={b.name} style={{ width: '100%', height: 420, objectFit: 'contain', background: '#f8f8f8' }} />
                  </div>
                </div>
              );
            })()}

            {fullscreenImage && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 13 }}>Fullscreen view</div>
                  <button onClick={() => clearFullscreen()} className="choose-btn">Close</button>
                </div>
                <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
                  <img src={fullscreenImage} alt="fullscreen" style={{ width: '100%', height: 640, objectFit: 'contain' }} />
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // --- Default dashboard view (main app) ---
  return (
    <div className="app" style={{ minHeight: "100vh" }} ref={dashboardRef}>
      <header className="header">
        <div className="brand">
          <img src="/logo.png" alt="JEEVAK logo" />
          <h1>JEEVAK</h1></div>
        <div className="header-actions">
          <button className="upload-btn" onClick={() => inputRef.current && inputRef.current.click()}>⬆ Upload</button>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
            // intercept to store dataUrl before backend send (for saving)
            const f = e.target.files?.[0];
            if (f) {
              try {
                const dataUrl = await fileToDataUrl(f);
                // save the dataUrl inside uploaded for "Save current upload" button
                setUploaded({ url: URL.createObjectURL(f), name: f.name, dataUrl });
              } catch (err) { console.warn(err); }
            }
            handleFile(e);
          }} />

          <button className="share-btn" onClick={handleShare} title="Share or download a PDF/PNG of the dashboard">📤 Share / Export</button>
          <div className="meta">Session</div>
        </div>
      </header>

      <main className="main-grid">
        <section className="left-col">
          <div className="image-panel card">
            <div className="image-panel-inner">
              {uploaded ? (
                <img className="microscope-image" src={uploaded.url} alt={uploaded.name} />
              ) : (
                <div className="placeholder">
                  <div className="placeholder-rect" />
                  <div className="upload-controls">
                    <button className="choose-btn" onClick={() => inputRef.current && inputRef.current.click()}>Choose file</button>
                  </div>
                </div>
              )}
            </div>
            {loading && <div style={{ color: "white", marginTop: 10 }}>Processing image…</div>}
            {uiError && <div style={{ marginTop: 10, color: "#ffc0c0", background: "#2b1a1a", padding: 8, borderRadius: 6 }}>{uiError}</div>}
          </div>

          <div className="lower-row">
            <div className="chat-card">
              <h2 className="chat-heading">Chatbot</h2>
              <div className="chatbot-card">
                <div className="chat-history" style={{ minHeight: 120 }}>
                  {messages.map((m, i) => <div key={i} className={`msg ${m.from}`} style={{ padding: 6, whiteSpace: 'pre-wrap' }}>{m.text}</div>)}
                  {isLoadingChat && <div className="msg bot" style={{ padding: 6 }}>Thinking...</div>}
                </div>
                <div className="chat-input" style={{ display: "flex", gap: 8 }}>
                  <input ref={chatInputRef} placeholder="Ask about marine organisms, plankton, ocean health..." onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); sendChat(ev.target.value); ev.target.value = ''; } }} />
                  <button onClick={() => { const el = chatInputRef.current; if (!el) return; const t = el.value; el.value = ''; sendChat(t); }} className="send-btn">▶</button>
                </div>
              </div>
            </div>

            {/* --- Replaced REPORT card with Gallery card --- */}
            <div className="report-card">
              <div className="report-card-inner" style={{ cursor: 'pointer' }} onClick={() => openGalleryPage()}>
                <h2>GALLERY</h2>
                <p className="report-text">OPEN YOUR PAST UPLOADS / COMPARE</p>
                <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>{gallery.length} images</div>
              </div>
            </div>
          </div>
        </section>

        <aside className="right-col">
          <div className="summary-panel card">
            <h3>Summary</h3>

            {/* dynamic species-level summary */}
            <div className="counts" style={{ marginBottom: 12 }}>
              {Object.entries(detections || {}).filter(([_, val]) => Number(val) > 0).sort((a, b) => Number(b[1]) - Number(a[1])).map(([species, val]) => {
                const bucket = speciesToBucket(species);
                return (
                  <div className="count-row species-row" key={species} style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className={`species-dot ${bucket}`} aria-hidden="true" />
                      <div className="count-label" style={{ textTransform: 'capitalize' }}>{species.replace(/_/g, ' ')}</div>
                    </div>
                    <div className="count-num species-count">{val}</div>
                  </div>
                );
              })}
              {Object.entries(detections || {}).filter(([_, v]) => Number(v) > 0).length === 0 && <div style={{ color: '#999' }}>No organisms detected yet</div>}
            </div>

            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={speciesGraphData}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={160} />
                  <Tooltip />
                  <Bar dataKey="value">
                    {speciesGraphData.map((entry, i) => (<Cell key={`cell-${i}`} fill={entry.fill} />))}
                    <LabelList dataKey="value" position="right" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* <div className="detected-list" style={{ marginTop: 12 }}>
              <h4>Detected Organisms</h4>
              <ul>
                {Object.entries(detections).length === 0 ? <li style={{ color: "#999" }}>No organisms detected yet</li> : Object.entries(detections).map(([cls, val]) => <li key={cls}><strong>{cls}</strong>: {val}</li>)}
              </ul>
            </div> */}
          </div>
        </aside>
      </main>
    </div>
  );
}

