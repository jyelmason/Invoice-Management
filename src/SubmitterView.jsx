import { useState, useRef, useEffect } from "react";
import { collection, addDoc, onSnapshot, serverTimestamp, doc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { APPROVERS } from "./approvers";
import { GLOBAL_STYLES, Connector, ApproverCard } from "./components";

// ─── Step 1: Submitter info + file upload ────────────────────────────────────
function UserInfoStep({ onNext }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", company: "" });
  const [file, setFile] = useState(null);
  const [dragOver, setDrag] = useState(false);
  const fileRef = useRef();

  const valid = form.firstName.trim() && form.lastName.trim() &&
    form.email.includes("@") && form.company.trim() && file;

  const handleFile = f => { if (f?.type === "application/pdf") setFile(f); };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.08em", color: "var(--color-text-secondary)", textTransform: "uppercase", margin: "0 0 8px" }}>Document Approval</p>
          <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 6px" }}>Who is submitting?</h1>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>Your details will be attached to the document for approvers to reference.</p>
        </div>
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[["First name", "Alex", "firstName"], ["Last name", "Rivera", "lastName"]].map(([label, ph, key]) => (
              <div key={key}>
                <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>{label}</label>
                <input placeholder={ph} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" placeholder="alex@company.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Company</label>
            <input placeholder="Your company name" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>PDF document</label>
            <div
              onClick={() => fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
              style={{ border: `1.5px dashed ${dragOver ? "#378ADD" : "var(--color-border-secondary)"}`, borderRadius: "var(--border-radius-md)", padding: "1.25rem", textAlign: "center", cursor: "pointer", background: dragOver ? "var(--color-background-info)" : "var(--color-background-secondary)" }}
            >
              <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
              {file ? (
                <div>
                  <i className="ti ti-file-type-pdf" style={{ fontSize: 24, color: "#E24B4A", display: "block", marginBottom: 6 }} aria-hidden="true" />
                  <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 2px" }}>{file.name}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{(file.size / 1024).toFixed(0)} KB · click to change</p>
                </div>
              ) : (
                <div>
                  <i className="ti ti-upload" style={{ fontSize: 24, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }} aria-hidden="true" />
                  <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 2px" }}>Drop your PDF here</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>or click to browse</p>
                </div>
              )}
            </div>
          </div>
          <button onClick={() => valid && onNext({ ...form, file })} disabled={!valid} style={{ marginTop: 4, padding: "10px 0", fontWeight: 500, fontSize: 14, cursor: valid ? "pointer" : "not-allowed", opacity: valid ? 1 : 0.4 }}>
            Continue to approvals →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Pick approvers + upload to Firebase ─────────────────────────────
function ApproverSelectStep({ submitter, onSubmitted }) {
  const [selections, setSelections] = useState(["", "", ""]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState("");
  const allSelected = selections.every(Boolean);

  const handleSubmit = async () => {
    if (!allSelected || uploading) return;
    setUploading(true);
    setError("");
  
    try {
      console.log("Step 1: Starting upload...");
      console.log("File:", submitter.file.name, submitter.file.size, submitter.file.type);
      console.log("Storage bucket:", storage.app.options.storageBucket);
  
      const storageRef = ref(storage, `pdfs/${Date.now()}_${submitter.file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, submitter.file);
  
      const pdfUrl = await new Promise((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          snap => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            console.log("Upload progress:", pct + "%");
            setUploadPct(pct);
          },
          err => {
            console.error("Upload FAILED:", err.code, err.message);
            reject(err);
          },
          async () => {
            console.log("Step 2: Upload complete, getting URL...");
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            console.log("Step 3: Got URL:", url);
            resolve(url);
          }
        );
      });
  
      console.log("Step 4: Saving to Firestore...");
      const chosenApprovers = selections.map(sel => {
        const found = APPROVERS.find(a => `${a.name} — ${a.title}` === sel);
        return { name: found.name, title: found.title, email: found.email };
      });
  
      const docRef = await addDoc(collection(db, "approvals"), {
        submitter: {
          firstName: submitter.firstName,
          lastName: submitter.lastName,
          email: submitter.email,
          company: submitter.company,
        },
        approvers: chosenApprovers,
        approvedCount: 0,
        pdfUrl,
        fileName: submitter.file.name,
        fileSize: submitter.file.size,
        status: "pending",
        createdAt: serverTimestamp(),
      });
  
      console.log("Step 5: Firestore doc created:", docRef.id);
      onSubmitted(docRef.id);
  
    } catch (err) {
      console.error("FULL ERROR:", err.code, err.message, err);
      setError(`Error: ${err.message}`);
      setUploading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.08em", color: "var(--color-text-secondary)", textTransform: "uppercase", margin: "0 0 8px" }}>Document Approval</p>
          <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 6px" }}>Choose approvers</h1>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>Select three people to review this document. Each will be emailed in sequence.</p>
        </div>
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Submitter summary card */}
          <div style={{ padding: "10px 14px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: "#185FA5", flexShrink: 0 }}>
              {submitter.firstName[0]}{submitter.lastName[0]}
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{submitter.firstName} {submitter.lastName}</p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>{submitter.company} · {submitter.file.name}</p>
            </div>
          </div>

          {[0, 1, 2].map(i => (
            <div key={i}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Approver {i + 1}</label>
              <div style={{ border: `1px solid ${selections[i] ? "#97C459" : "var(--color-border-secondary)"}`, borderRadius: "var(--border-radius-md)", overflow: "hidden" }}>
                <select
                  value={selections[i]}
                  onChange={e => { const n = [...selections]; n[i] = e.target.value; setSelections(n); }}
                  style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: "none", background: "transparent", color: selections[i] ? "var(--color-text-primary)" : "var(--color-text-secondary)", cursor: "pointer", outline: "none" }}
                >
                  <option value="">Select approver…</option>
                  {APPROVERS
                    .filter(a => !selections.includes(`${a.name} — ${a.title}`) || selections[i] === `${a.name} — ${a.title}`)
                    .map(a => {
                      const val = `${a.name} — ${a.title}`;
                      return <option key={val} value={val}>{a.name} — {a.title}</option>;
                    })}
                </select>
              </div>
              {selections[i] && (
                <div style={{ marginTop: 5, padding: "7px 12px", background: "#EAF3DE", borderRadius: "var(--border-radius-md)", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#C0DD97", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500, color: "#3B6D11", flexShrink: 0 }}>
                    {selections[i].split(" ").map(w => w[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, margin: 0, color: "#27500A" }}>{selections[i].split(" — ")[0]}</p>
                    <p style={{ fontSize: 10, color: "#3B6D11", margin: 0 }}>
                      {APPROVERS.find(a => `${a.name} — ${a.title}` === selections[i])?.email}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {error && <p style={{ fontSize: 12, color: "var(--color-text-danger)", margin: 0 }}>{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!allSelected || uploading}
            style={{ marginTop: 4, padding: "10px 0", fontWeight: 500, fontSize: 14, cursor: allSelected && !uploading ? "pointer" : "not-allowed", opacity: allSelected && !uploading ? 1 : 0.4 }}
          >
            {uploading ? (uploadPct < 100 ? `Uploading… ${uploadPct}%` : "Saving…") : "Submit for approval →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Live chain — reads pdfUrl from Firestore (Firebase Storage URL) ─
function LiveChainView({ docId, submitter, onDone }) {
  const [approvedCount, setApprovedCount] = useState(0);
  const [approvers, setApprovers] = useState([]);
  const [docStatus, setDocStatus] = useState("pending");
  const [pdfUrl, setPdfUrl] = useState(null); // set from Firestore, works on Vercel

  useEffect(() => {
    if (!docId) return;
    const unsub = onSnapshot(doc(db, "approvals", docId), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      setApprovedCount(data.approvedCount ?? 0);
      setApprovers(data.approvers ?? []);
      setDocStatus(data.status ?? "pending");
      if (data.pdfUrl) setPdfUrl(data.pdfUrl); // permanent Firebase Storage URL
    });
    return () => unsub();
  }, [docId]);

  const allDone = docStatus === "complete" || approvedCount >= 3;

  const getStatus = i => {
    if (i < approvedCount) return "approved";
    if (i === approvedCount && !allDone) return "active";
    return "pending";
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--color-background-tertiary)" }}>
      {/* Left panel — approval chain */}
      <div style={{ width: 340, minWidth: 300, flexShrink: 0, borderRight: "0.5px solid var(--color-border-tertiary)", display: "flex", flexDirection: "column", background: "var(--color-background-primary)", overflow: "hidden" }}>
        <div style={{ padding: "18px 18px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", color: "var(--color-text-secondary)", textTransform: "uppercase", margin: "0 0 3px" }}>Approval chain</p>
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{submitter.company}</h2>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 14px 8px" }}>
          <ApproverCard name={`${submitter.firstName} ${submitter.lastName}`} role={submitter.email} status="approved" isSubmitter />

          {approvers.map((ap, i) => (
            <div key={i}>
              <Connector active={i <= approvedCount} approved={i < approvedCount} />
              <ApproverCard name={ap.name} role={ap.title} status={getStatus(i)} />
            </div>
          ))}

          {allDone && (
            <div style={{ marginTop: 20, padding: "14px", background: "#EAF3DE", borderRadius: "var(--border-radius-lg)", border: "1px solid #97C459", textAlign: "center", animation: "approvedPop 0.4s ease" }}>
              <i className="ti ti-circle-check" style={{ fontSize: 28, color: "#3B6D11", display: "block", marginBottom: 6 }} aria-hidden="true" />
              <p style={{ fontSize: 13, fontWeight: 500, color: "#27500A", margin: "0 0 3px" }}>All approvals complete</p>
              <p style={{ fontSize: 11, color: "#3B6D11", margin: 0 }}>A confirmation has been sent to {submitter.email}</p>
            </div>
          )}
        </div>

        <div style={{ padding: "14px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
          {allDone ? (
            <button onClick={onDone} style={{ width: "100%", padding: "9px", fontWeight: 500, fontSize: 13, background: "#EAF3DE", color: "#27500A", border: "1px solid #97C459", borderRadius: "var(--border-radius-md)", cursor: "pointer" }}>
              <i className="ti ti-circle-check" style={{ marginRight: 6, fontSize: 14, verticalAlign: "-2px" }} aria-hidden="true" />
              Close document
            </button>
          ) : (
            <div style={{ padding: "9px", textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#97C459", animation: "pulseDot 1s ease-in-out infinite" }} />
                Approval {Math.min(approvedCount + 1, 3)} of 3 in progress…
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel — PDF from Firebase Storage URL */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", display: "flex", alignItems: "center", gap: 12 }}>
          <i className="ti ti-file-type-pdf" style={{ fontSize: 18, color: "#E24B4A" }} aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{submitter.file?.name}</span>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{submitter.file ? (submitter.file.size / 1024).toFixed(0) + " KB" : ""}</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < approvedCount ? "#639922" : i === approvedCount && !allDone ? "#97C459" : "var(--color-border-secondary)", transition: "background 0.4s ease", animation: i === approvedCount && !allDone ? "pulseDot 1s ease-in-out infinite" : "none" }} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          {pdfUrl
            ? <iframe src={pdfUrl} title="PDF preview" style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
            : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-secondary)", fontSize: 13, flexDirection: "column", gap: 8 }}>
                <i className="ti ti-loader" style={{ fontSize: 28, opacity: 0.4 }} aria-hidden="true" />
                Loading document…
              </div>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────
function SuccessScreen({ submitter, onClose }) {
  const name = `${submitter.firstName} ${submitter.lastName}`;
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#EAF3DE", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <i className="ti ti-circle-check" style={{ fontSize: 32, color: "#3B6D11" }} aria-hidden="true" />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 500, margin: "0 0 8px" }}>Document approved</h1>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 32px", lineHeight: 1.6 }}>
          <strong>{submitter.file?.name}</strong> has been fully approved on behalf of {name} at {submitter.company}. A confirmation has been sent to {submitter.email}.
        </p>
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: 24, textAlign: "left" }}>
          {[["Submitted by", name], ["Company", submitter.company], ["Email", submitter.email], ["File", submitter.file?.name]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 13 }}>
              <span style={{ color: "var(--color-text-secondary)" }}>{k}</span>
              <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ padding: "10px 32px", fontWeight: 500, fontSize: 14 }}>Close</button>
      </div>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────
export default function SubmitterView() {
  const [step, setStep] = useState("info");
  const [submitter, setSubmitter] = useState(null);
  const [docId, setDocId] = useState(null);

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      {step === "info" && <UserInfoStep onNext={data => { setSubmitter(data); setStep("select"); }} />}
      {step === "select" && <ApproverSelectStep submitter={submitter} onSubmitted={id => { setDocId(id); setStep("chain"); }} />}
      {step === "chain" && <LiveChainView docId={docId} submitter={submitter} onDone={() => setStep("done")} />}
      {step === "done" && <SuccessScreen submitter={submitter} onClose={() => { setStep("info"); setSubmitter(null); setDocId(null); }} />}
    </>
  );
}