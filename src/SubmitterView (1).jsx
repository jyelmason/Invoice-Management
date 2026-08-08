import { useState, useRef, useEffect } from "react";
import { collection, addDoc, onSnapshot, serverTimestamp, doc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { COMPANIES } from "./companies";
import { DOC_TYPES, getApproverCount, getDocTypeLabel } from "./docTypes";
import { getPresetChain } from "./approvalChains";
import { GLOBAL_STYLES, Connector, ApproverCard } from "./components";

// ─── Required-by date helpers ────────────────────────────────────────────────
// Builds the Firestore-friendly payload from the raw form fields.
// `date`/`time` are kept as plain strings (easy to re-populate an <input>),
// and `datetime` is an ISO string for sorting/queries (defaults to end-of-day
// when only a date was given, since a deadline with no time means "by end of day").
function buildRequiredBy(dueDate, dueTime) {
  if (!dueDate) return null;
  const datetime = dueTime
    ? new Date(`${dueDate}T${dueTime}`).toISOString()
    : new Date(`${dueDate}T23:59:59`).toISOString();
  return { date: dueDate, time: dueTime || null, datetime };
}

// Formats a requiredBy object for display, e.g. "Fri, Aug 21" or "Fri, Aug 21 at 3:00 PM".
function formatRequiredBy(requiredBy) {
  if (!requiredBy?.date) return null;
  const d = new Date(`${requiredBy.date}T${requiredBy.time || "00:00"}`);
  const dateStr = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (!requiredBy.time) return dateStr;
  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dateStr} at ${timeStr}`;
}

// ─── Step 1: Submitter info + file upload form ───────────────────────────────
function UserInfoStep({ onNext }) {
  const [form, setForm]     = useState({ firstName: "", lastName: "", email: "", company: "", docType: "", dueDate: "", dueTime: "" });
  const [file, setFile]     = useState(null);
  const [dragOver, setDrag] = useState(false);
  const fileRef             = useRef();

  const valid =
    form.firstName.trim() && form.lastName.trim() &&
    form.email.includes("@") && form.company && form.docType && file;

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
            {[["First name","Alex","firstName"],["Last name","Rivera","lastName"]].map(([label,ph,key]) => (
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Company</label>
              <select value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} style={{ width: "100%", boxSizing: "border-box" }}>
                <option value="">Select company…</option>
                {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Document type</label>
              <select value={form.docType} onChange={e => setForm(f => ({ ...f, docType: e.target.value }))} style={{ width: "100%", boxSizing: "border-box" }}>
                <option value="">Select type…</option>
                {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
              Required approval by <span style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}>(optional)</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input
                type="date"
                value={form.dueDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value, dueTime: e.target.value ? f.dueTime : "" }))}
                style={{ width: "100%", boxSizing: "border-box" }}
              />
              <input
                type="time"
                value={form.dueTime}
                disabled={!form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueTime: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", opacity: form.dueDate ? 1 : 0.5, cursor: form.dueDate ? "text" : "not-allowed" }}
              />
            </div>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "6px 0 0" }}>
              {form.dueDate
                ? "Approvers will see this deadline on the document."
                : "Set a date if this needs to be approved by a specific day. Time is optional."}
            </p>
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

// ─── Step 2: Review preset chain + submit ───────────────────────────────────
function ApproverSelectStep({ submitter, onSubmitted }) {
  const approverCount = getApproverCount(submitter.docType);
  const presetChain   = getPresetChain(submitter.company, submitter.docType);
  const chainReady    = presetChain.length === approverCount;

  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError]         = useState("");

  const handleSubmit = async () => {
    if (!chainReady || uploading) return;
    setUploading(true);
    setError("");

    try {
      const storageRef  = ref(storage, `pdfs/${Date.now()}_${submitter.file.name}`);
      const uploadTask  = uploadBytesResumable(storageRef, submitter.file);

      const pdfUrl = await new Promise((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          snap => setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
        );
      });

      const chosenApprovers = presetChain.map(a => ({
        name: a.name, title: a.title, email: a.email,
      }));

      const docRef = await addDoc(collection(db, "approvals"), {
        submitter: {
          firstName: submitter.firstName,
          lastName:  submitter.lastName,
          email:     submitter.email,
          company:   submitter.company,
        },
        docType:       submitter.docType,
        approverCount,
        approvers:     chosenApprovers,
        approvedCount: 0,
        requiredBy:    buildRequiredBy(submitter.dueDate, submitter.dueTime),
        pdfUrl,
        fileName:      submitter.file.name,
        fileSize:      submitter.file.size,
        status:        "pending",
        createdAt:     serverTimestamp(),
      });

      onSubmitted(docRef.id);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
      setUploading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-tertiary)", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.08em", color: "var(--color-text-secondary)", textTransform: "uppercase", margin: "0 0 8px" }}>Document Approval</p>
          <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 6px" }}>Approval chain</h1>
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>
            {submitter.company}'s standard chain for {getDocTypeLabel(submitter.docType).toLowerCase()}s — {approverCount} approver{approverCount === 1 ? "" : "s"}, notified in order.
          </p>
        </div>

        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: "10px 14px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#E6F1FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: "#185FA5", flexShrink: 0 }}>
              {submitter.firstName[0]}{submitter.lastName[0]}
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{submitter.firstName} {submitter.lastName}</p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>
                {submitter.company} · {getDocTypeLabel(submitter.docType)} · {submitter.file.name}
              </p>
            </div>
          </div>

          {submitter.dueDate && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#185FA5" }}>
              <i className="ti ti-clock" style={{ fontSize: 14 }} aria-hidden="true" />
              Required approval by {formatRequiredBy(buildRequiredBy(submitter.dueDate, submitter.dueTime))}
            </div>
          )}

          {chainReady ? (
            <div>
              {presetChain.map((a, i) => (
                <div key={a.email}>
                  {i > 0 && <Connector active={i === 0} approved={false} />}
                  <ApproverCard name={a.name} role={a.title} status={i === 0 ? "active" : "pending"} />
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--color-text-danger)", margin: 0 }}>
              No approval chain is configured for {submitter.company} — {getDocTypeLabel(submitter.docType)}s.
              Please contact an administrator to set one up before submitting.
            </p>
          )}

          {error && <p style={{ fontSize: 12, color: "var(--color-text-danger)", margin: 0 }}>{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!chainReady || uploading}
            style={{ marginTop: 4, padding: "10px 0", fontWeight: 500, fontSize: 14, cursor: chainReady && !uploading ? "pointer" : "not-allowed", opacity: chainReady && !uploading ? 1 : 0.4 }}
          >
            {uploading
              ? uploadPct < 100 ? `Uploading… ${uploadPct}%` : "Saving…"
              : "Submit for approval →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Live chain progress view ───────────────────────────────────────
function LiveChainView({ docId, submitter, onDone }) {
  const [approvedCount, setApprovedCount] = useState(0);
  const [approvers, setApprovers]         = useState([]);
  const [approverCount, setApproverCount] = useState(getApproverCount(submitter?.docType));
  const [docStatus, setDocStatus]         = useState("pending");
  const pdfUrl                            = useRef(null);

  if (!pdfUrl.current && submitter?.file) pdfUrl.current = URL.createObjectURL(submitter.file);

  useEffect(() => {
    if (!docId) return;
    const unsub = onSnapshot(doc(db, "approvals", docId), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      setApprovedCount(data.approvedCount ?? 0);
      setApprovers(data.approvers ?? []);
      setApproverCount(data.approverCount ?? data.approvers?.length ?? approverCount);
      setDocStatus(data.status ?? "pending");
    });
    return () => unsub();
  }, [docId]);

  const allDone = docStatus === "complete" || approvedCount >= approverCount;

  const getStatus = i => {
    if (i < approvedCount) return "approved";
    if (i === approvedCount && !allDone) return "active";
    return "pending";
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--color-background-tertiary)" }}>
      <div style={{ width: 340, minWidth: 300, flexShrink: 0, borderRight: "0.5px solid var(--color-border-tertiary)", display: "flex", flexDirection: "column", background: "var(--color-background-primary)", overflow: "hidden" }}>
        <div style={{ padding: "18px 18px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", color: "var(--color-text-secondary)", textTransform: "uppercase", margin: "0 0 3px" }}>Approval chain · {getDocTypeLabel(submitter.docType)}</p>
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{submitter.company}</h2>
          {submitter.dueDate && (
            <p style={{ fontSize: 11, color: "#185FA5", margin: "6px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
              <i className="ti ti-clock" style={{ fontSize: 12 }} aria-hidden="true" />
              Due {formatRequiredBy(buildRequiredBy(submitter.dueDate, submitter.dueTime))}
            </p>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 14px 8px" }}>
          <ApproverCard
            name={`${submitter.firstName} ${submitter.lastName}`}
            role={submitter.email}
            status="approved"
            isSubmitter
          />

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
            <button onClick={onDone} style={{ width: "100%", padding: "9px", fontWeight: 500, fontSize: 13, background: "#EAF3DE", color: "#27500A", border: "1px solid #97C459", borderRadius: "var(--border-radius-md)", cursor: "pointer", animation: "fadeIn 0.3s ease" }}>
              <i className="ti ti-circle-check" style={{ marginRight: 6, fontSize: 14, verticalAlign: "-2px" }} aria-hidden="true" />
              Close document
            </button>
          ) : (
            <div style={{ padding: "9px", textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#97C459", animation: "pulseDot 1s ease-in-out infinite" }} />
                Approval {Math.min(approvedCount + 1, approverCount)} of {approverCount} in progress…
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", display: "flex", alignItems: "center", gap: 12 }}>
          <i className="ti ti-file-type-pdf" style={{ fontSize: 18, color: "#E24B4A" }} aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{submitter.file?.name}</span>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{submitter.file ? (submitter.file.size / 1024).toFixed(0) + " KB" : ""}</span>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: approverCount }, (_, i) => i).map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < approvedCount ? "#639922" : i === approvedCount && !allDone ? "#97C459" : "var(--color-border-secondary)", transition: "background 0.4s ease", animation: i === approvedCount && !allDone ? "pulseDot 1s ease-in-out infinite" : "none" }} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          {pdfUrl.current
            ? <iframe src={pdfUrl.current} title="PDF preview" style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
            : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-secondary)", fontSize: 13 }}>PDF preview unavailable after page reload</div>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Success screen ──────────────────────────────────────────────────────────
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
          {[["Submitted by", name], ["Company", submitter.company], ["Document type", getDocTypeLabel(submitter.docType)], ["Email", submitter.email], ["File", submitter.file?.name], ...(submitter.dueDate ? [["Required by", formatRequiredBy(buildRequiredBy(submitter.dueDate, submitter.dueTime))]] : [])].map(([k, v]) => (
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

// ─── Exported root component ─────────────────────────────────────────────────
export default function SubmitterView() {
  const [step, setStep]           = useState("info");
  const [submitter, setSubmitter] = useState(null);
  const [docId, setDocId]         = useState(null);

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      {step === "info" && (
        <UserInfoStep onNext={data => { setSubmitter(data); setStep("select"); }} />
      )}
      {step === "select" && (
        <ApproverSelectStep
          submitter={submitter}
          onSubmitted={id => { setDocId(id); setStep("chain"); }}
        />
      )}
      {step === "chain" && (
        <LiveChainView
          docId={docId}
          submitter={submitter}
          onDone={() => setStep("done")}
        />
      )}
      {step === "done" && (
        <SuccessScreen
          submitter={submitter}
          onClose={() => { setStep("info"); setSubmitter(null); setDocId(null); }}
        />
      )}
    </>
  );
}
