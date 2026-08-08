import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { getDocTypeLabel } from './docTypes';
import { GLOBAL_STYLES, Connector, ApproverCard } from './components';
import { APPROVERS } from './approvers';

// Formats a stored requiredBy { date, time, datetime } for display, and flags overdue.
function formatRequiredBy(requiredBy) {
  if (!requiredBy?.date) return null;
  const d = new Date(`${requiredBy.date}T${requiredBy.time || '00:00'}`);
  const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const label = requiredBy.time
    ? `${dateStr} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : dateStr;
  const overdue = requiredBy.datetime ? new Date(requiredBy.datetime).getTime() < Date.now() : false;
  return { label, overdue };
}

// Classifies one approval doc relative to a given approver email.
// Returns null if the email isn't actually part of this doc's chain.
function classifyApproval(data, trimmedEmail) {
  const approvers = data.approvers ?? [];
  const myIdx = approvers.findIndex((a) => a.email?.toLowerCase() === trimmedEmail);
  if (myIdx === -1) return null;

  const currentIdx = data.approvedCount ?? 0;
  const total = data.approverCount ?? approvers.length ?? 0;
  const isComplete = data.status === 'complete' || currentIdx >= total;

  let phase;
  if (isComplete) phase = 'complete';
  else if (myIdx < currentIdx) phase = 'approved_by_you'; // your step is done, waiting on others
  else if (myIdx === currentIdx) phase = 'action_needed'; // it's your turn right now
  else phase = 'waiting'; // hasn't reached you yet

  return { phase, myIdx };
}

// ─── Email login screen ──────────────────────────────────────────────────────
function EmailLoginScreen({ onFound }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLookup = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    // Verify the email belongs to a known approver
    const known = APPROVERS.find((a) => a.email.toLowerCase() === trimmed);
    if (!known) {
      setError('This email is not registered as an approver.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Pull every approval this person is part of, past or present, and
      // classify each relative to them. We fetch the whole collection and
      // filter client-side rather than querying by email, because approvers
      // live inside an array-of-maps field that Firestore can't query
      // directly without a denormalized array-of-emails field + index.
      const snap = await getDocs(collection(db, 'approvals'));

      const mine = [];
      snap.forEach((d) => {
        const data = d.data();
        const result = classifyApproval(data, trimmed);
        if (result) mine.push({ id: d.id, ...data, ...result });
      });

      if (mine.length === 0) {
        setError('No approvals found for this email address.');
        setLoading(false);
        return;
      }

      mine.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

      onFound({
        email: trimmed,
        name: known.name,
        title: known.title,
        approvals: mine,
      });
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background-tertiary)',
        padding: '2rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: '#EAF3DE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <i
              className="ti ti-user-check"
              style={{ fontSize: 24, color: '#3B6D11' }}
              aria-hidden="true"
            />
          </div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.08em',
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              margin: '0 0 8px',
            }}
          >
            Approver portal
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 6px' }}>
            Sign in to approve
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'var(--color-text-secondary)',
              margin: 0,
            }}
          >
            Enter your work email to see documents awaiting your approval.
          </p>
        </div>

        <div
          style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div>
            <label
              style={{
                fontSize: 12,
                color: 'var(--color-text-secondary)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Your work email
            </label>
            <input
              type="email"
              placeholder="you@yourcompany.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          {error && (
            <p
              style={{
                fontSize: 12,
                color: 'var(--color-text-danger)',
                margin: 0,
                animation: 'fadeIn 0.2s ease',
              }}
            >
              {error}
            </p>
          )}
          <button
            onClick={handleLookup}
            disabled={loading || !email.includes('@')}
            style={{
              padding: '10px 0',
              fontWeight: 500,
              fontSize: 14,
              cursor:
                loading || !email.includes('@') ? 'not-allowed' : 'pointer',
              opacity: loading || !email.includes('@') ? 0.4 : 1,
            }}
          >
            {loading ? 'Looking up…' : 'Find my approvals →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status badge helper ──────────────────────────────────────────────────────
function phaseMeta(phase) {
  switch (phase) {
    case 'action_needed':
      return { label: 'Needs your approval', bg: '#EAF3DE', color: '#27500A', border: '#97C459' };
    case 'waiting':
      return { label: 'Waiting on others', bg: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', border: 'var(--color-border-secondary)' };
    case 'approved_by_you':
      return { label: 'You approved · pending others', bg: '#E6F1FB', color: '#185FA5', border: '#B7D8F2' };
    case 'complete':
    default:
      return { label: 'Complete', bg: '#EAF3DE', color: '#27500A', border: '#97C459' };
  }
}

// ─── Approvals dashboard — every doc tied to this approver, past + present ──
function ApprovalsDashboard({ approver, approvals, onOpen, onSignOut }) {
  const sections = [
    { key: 'action_needed', title: 'Needs your approval', items: approvals.filter((a) => a.phase === 'action_needed') },
    { key: 'waiting', title: 'Waiting on others', items: approvals.filter((a) => a.phase === 'waiting') },
    { key: 'history', title: 'History', items: approvals.filter((a) => a.phase === 'approved_by_you' || a.phase === 'complete') },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--color-text-secondary)', textTransform: 'uppercase', margin: '0 0 6px' }}>
              Approver portal
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>Hi, {approver.name}</h1>
          </div>
          <button
            onClick={onSignOut}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 13, padding: 0 }}
          >
            Sign out
          </button>
        </div>

        {approvals.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No approvals found for this email.</p>
        )}

        {sections.map((section) =>
          section.items.length > 0 ? (
            <div key={section.key} style={{ marginBottom: '1.75rem' }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', margin: '0 0 10px' }}>
                {section.title} ({section.items.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {section.items.map((a) => {
                  const meta = phaseMeta(a.phase);
                  const due = formatRequiredBy(a.requiredBy);
                  return (
                    <div
                      key={a.id}
                      onClick={() => onOpen(a)}
                      style={{
                        background: 'var(--color-background-primary)',
                        border: '0.5px solid var(--color-border-tertiary)',
                        borderRadius: 'var(--border-radius-lg)',
                        padding: '12px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <i className="ti ti-file-type-pdf" style={{ fontSize: 18, color: '#E24B4A', flexShrink: 0 }} aria-hidden="true" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.fileName}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.submitter?.company} · {getDocTypeLabel(a.docType)} · from {a.submitter?.firstName} {a.submitter?.lastName}
                        </p>
                      </div>
                      {due && (
                        <span style={{ fontSize: 11, color: due.overdue ? '#B3261E' : 'var(--color-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {due.overdue ? 'Overdue' : `Due ${due.label}`}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '4px 9px',
                          borderRadius: 999,
                          background: meta.bg,
                          color: meta.color,
                          border: `1px solid ${meta.border}`,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {meta.label}
                      </span>
                      <i className="ti ti-chevron-right" style={{ fontSize: 14, color: 'var(--color-text-secondary)', flexShrink: 0 }} aria-hidden="true" />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

// ─── Single approval action view ─────────────────────────────────────────────
function ApprovalActionView({ approver, approval, onApproved, onBack }) {
  const [approving, setApproving] = useState(false);
  const [done, setDone] = useState(false);
  const [liveData, setLiveData] = useState(approval);

  // Listen to this doc in real time so the chain reflects any concurrent changes
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'approvals', approval.id), (snap) => {
      if (snap.exists()) setLiveData({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [approval.id]);

  const currentIdx = liveData.approvedCount ?? 0;
  const totalApprovers =
    liveData.approverCount ?? liveData.approvers?.length ?? 0;
  const isMyTurn =
    liveData.approvers?.[currentIdx]?.email?.toLowerCase() === approver.email;
  const allDone = liveData.status === 'complete' || currentIdx >= totalApprovers;

  const handleApprove = async () => {
    if (!isMyTurn || approving) return;
    setApproving(true);
    try {
      const newCount = currentIdx + 1;
      await updateDoc(doc(db, 'approvals', approval.id), {
        approvedCount: newCount,
        // Cloud Function watches for approvedCount changes and sends next email / completion email
        [`approverTimestamps.${currentIdx}`]: new Date().toISOString(),
        ...(newCount >= totalApprovers ? { status: 'complete' } : {}),
      });
      setDone(true);
      setTimeout(() => onApproved(), 1800);
    } catch (err) {
      console.error(err);
      setApproving(false);
    }
  };

  const getStatus = (i) => {
    if (i < currentIdx) return 'approved';
    if (i === currentIdx && !allDone) return 'active';
    return 'pending';
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--color-background-tertiary)',
      }}
    >
      {/* Left panel */}
      <div
        style={{
          width: 340,
          minWidth: 300,
          flexShrink: 0,
          borderRight: '0.5px solid var(--color-border-tertiary)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-background-primary)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '18px 18px 14px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px 2px 0',
              color: 'var(--color-text-secondary)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <i
              className="ti ti-arrow-left"
              style={{ fontSize: 14 }}
              aria-hidden="true"
            />{' '}
            Back
          </button>
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.08em',
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                margin: '0 0 2px',
              }}
            >
              Approval chain{liveData.docType ? ` · ${getDocTypeLabel(liveData.docType)}` : ''}
            </p>
            <h2 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
              {liveData.submitter?.company}
            </h2>
            {(() => {
              const due = formatRequiredBy(liveData.requiredBy);
              if (!due) return null;
              return (
                <p
                  style={{
                    fontSize: 11,
                    margin: '6px 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    color: due.overdue ? '#B3261E' : '#185FA5',
                    fontWeight: due.overdue ? 500 : 400,
                  }}
                >
                  <i
                    className={due.overdue ? 'ti ti-alert-triangle' : 'ti ti-clock'}
                    style={{ fontSize: 12 }}
                    aria-hidden="true"
                  />
                  {due.overdue ? 'Overdue since' : 'Due'} {due.label}
                </p>
              );
            })()}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px 8px' }}>
          {/* Submitter */}
          <ApproverCard
            name={`${liveData.submitter?.firstName} ${liveData.submitter?.lastName}`}
            role={liveData.submitter?.email}
            status="approved"
            isSubmitter
          />

          {/* Chain */}
          {(liveData.approvers ?? []).map((ap, i) => (
            <div key={i}>
              <Connector active={i <= currentIdx} approved={i < currentIdx} />
              <ApproverCard
                name={ap.name}
                role={ap.title}
                status={getStatus(i)}
              />
            </div>
          ))}

          {allDone && (
            <div
              style={{
                marginTop: 20,
                padding: '14px',
                background: '#EAF3DE',
                borderRadius: 'var(--border-radius-lg)',
                border: '1px solid #97C459',
                textAlign: 'center',
                animation: 'approvedPop 0.4s ease',
              }}
            >
              <i
                className="ti ti-circle-check"
                style={{
                  fontSize: 28,
                  color: '#3B6D11',
                  display: 'block',
                  marginBottom: 6,
                }}
                aria-hidden="true"
              />
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#27500A',
                  margin: '0 0 3px',
                }}
              >
                All approvals complete
              </p>
            </div>
          )}
        </div>

        {/* Approve button */}
        <div
          style={{
            padding: '14px',
            borderTop: '0.5px solid var(--color-border-tertiary)',
          }}
        >
          {allDone ? (
            <div
              style={{
                padding: '9px',
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}
            >
              This document is fully approved.
            </div>
          ) : !isMyTurn ? (
            <div
              style={{
                padding: '9px',
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}
            >
              Waiting for a previous approver.
            </div>
          ) : (
            <>
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-secondary)',
                  textAlign: 'center',
                  margin: '0 0 8px',
                }}
              >
                Approving as{' '}
                <strong style={{ color: 'var(--color-text-primary)' }}>
                  {approver.name}
                </strong>
              </p>
              <button
                onClick={handleApprove}
                disabled={approving || done}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontWeight: 500,
                  fontSize: 13,
                  background: done ? '#EAF3DE' : '#639922',
                  color: done ? '#27500A' : '#fff',
                  border: `1px solid ${done ? '#97C459' : '#3B6D11'}`,
                  borderRadius: 'var(--border-radius-md)',
                  cursor: approving || done ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                }}
              >
                {done ? (
                  <>
                    <i
                      className="ti ti-circle-check"
                      style={{ fontSize: 15 }}
                      aria-hidden="true"
                    />{' '}
                    Approved
                  </>
                ) : approving ? (
                  'Approving…'
                ) : (
                  <>
                    <i
                      className="ti ti-check"
                      style={{ fontSize: 15 }}
                      aria-hidden="true"
                    />{' '}
                    Approve document
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right panel — document details + PDF link */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            background: 'var(--color-background-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <i
            className="ti ti-file-type-pdf"
            style={{ fontSize: 18, color: '#E24B4A' }}
            aria-hidden="true"
          />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {liveData.fileName}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {liveData.fileSize
              ? (liveData.fileSize / 1024).toFixed(0) + ' KB'
              : ''}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: totalApprovers }, (_, i) => i).map((i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background:
                    i < currentIdx
                      ? '#639922'
                      : i === currentIdx && !allDone
                      ? '#97C459'
                      : 'var(--color-border-secondary)',
                  transition: 'background 0.4s ease',
                  animation:
                    i === currentIdx && !allDone
                      ? 'pulseDot 1s ease-in-out infinite'
                      : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Embedded PDF from Firebase Storage URL */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {liveData.pdfUrl ? (
            <iframe
              src={liveData.pdfUrl}
              title="Document to review"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--color-text-secondary)',
                fontSize: 13,
              }}
            >
              Loading document…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Read-only detail view — history & upcoming (not-yet-your-turn) items ──
function ApprovalDetailView({ approver, approval, onBack }) {
  const [liveData, setLiveData] = useState(approval);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'approvals', approval.id), (snap) => {
      if (snap.exists()) setLiveData({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [approval.id]);

  const currentIdx = liveData.approvedCount ?? 0;
  const totalApprovers = liveData.approverCount ?? liveData.approvers?.length ?? 0;
  const allDone = liveData.status === 'complete' || currentIdx >= totalApprovers;
  const myIdx = (liveData.approvers ?? []).findIndex((a) => a.email?.toLowerCase() === approver.email);
  const myTimestamp = myIdx > -1 ? liveData.approverTimestamps?.[myIdx] : null;

  const getStatus = (i) => {
    if (i < currentIdx) return 'approved';
    if (i === currentIdx && !allDone) return 'active';
    return 'pending';
  };

  let footerMessage;
  if (allDone) {
    footerMessage = 'This document is fully approved.';
  } else if (myIdx > -1 && myIdx < currentIdx) {
    footerMessage = myTimestamp
      ? `You approved this on ${new Date(myTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}. Waiting on later approvers.`
      : 'You approved this. Waiting on later approvers.';
  } else {
    footerMessage = "Waiting on earlier approvers — this hasn't reached you yet.";
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--color-background-tertiary)' }}>
      {/* Left panel */}
      <div
        style={{
          width: 340,
          minWidth: 300,
          flexShrink: 0,
          borderRight: '0.5px solid var(--color-border-tertiary)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-background-primary)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 18px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px 2px 0', color: 'var(--color-text-secondary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 14 }} aria-hidden="true" /> Back
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--color-text-secondary)', textTransform: 'uppercase', margin: '0 0 2px' }}>
              Approval chain{liveData.docType ? ` · ${getDocTypeLabel(liveData.docType)}` : ''}
            </p>
            <h2 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{liveData.submitter?.company}</h2>
            {(() => {
              const due = formatRequiredBy(liveData.requiredBy);
              if (!due) return null;
              return (
                <p
                  style={{
                    fontSize: 11,
                    margin: '6px 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    color: due.overdue ? '#B3261E' : '#185FA5',
                    fontWeight: due.overdue ? 500 : 400,
                  }}
                >
                  <i className={due.overdue ? 'ti ti-alert-triangle' : 'ti ti-clock'} style={{ fontSize: 12 }} aria-hidden="true" />
                  {due.overdue ? 'Overdue since' : 'Due'} {due.label}
                </p>
              );
            })()}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px 8px' }}>
          <ApproverCard
            name={`${liveData.submitter?.firstName} ${liveData.submitter?.lastName}`}
            role={liveData.submitter?.email}
            status="approved"
            isSubmitter
          />
          {(liveData.approvers ?? []).map((ap, i) => (
            <div key={i}>
              <Connector active={i <= currentIdx} approved={i < currentIdx} />
              <ApproverCard name={ap.name} role={ap.title} status={getStatus(i)} />
            </div>
          ))}
        </div>

        <div style={{ padding: '14px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ padding: '9px', textAlign: 'center', fontSize: 12, color: allDone ? '#27500A' : 'var(--color-text-secondary)' }}>
            {footerMessage}
          </div>
        </div>
      </div>

      {/* Right panel — document details + PDF, no approve action */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <i className="ti ti-file-type-pdf" style={{ fontSize: 18, color: '#E24B4A' }} aria-hidden="true" />
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {liveData.fileName}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {liveData.fileSize ? (liveData.fileSize / 1024).toFixed(0) + ' KB' : ''}
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {liveData.pdfUrl ? (
            <iframe src={liveData.pdfUrl} title="Document" style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)', fontSize: 13 }}>
              Loading document…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Approved confirmation screen ────────────────────────────────────────────
function ApprovedConfirmation({ approver, onBack }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background-tertiary)',
        padding: '2rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: '#EAF3DE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <i
            className="ti ti-circle-check"
            style={{ fontSize: 32, color: '#3B6D11' }}
            aria-hidden="true"
          />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 8px' }}>
          Approval recorded
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            margin: '0 0 28px',
            lineHeight: 1.6,
          }}
        >
          Your approval as <strong>{approver.name}</strong> has been submitted.
          The next approver in the chain will be notified automatically.
        </p>
        <button
          onClick={onBack}
          style={{ padding: '10px 32px', fontWeight: 500, fontSize: 14 }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Exported root component ─────────────────────────────────────────────────
export default function ApproverView() {
  const [step, setStep] = useState('login'); // "login" | "dashboard" | "action" | "detail" | "confirmed"
  const [approver, setApprover] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [selected, setSelected] = useState(null);

  const handleFound = ({ email, name, title, approvals }) => {
    setApprover({ email, name, title });
    setApprovals(approvals);
    setStep('dashboard');
  };

  const handleOpen = (item) => {
    setSelected(item);
    setStep(item.phase === 'action_needed' ? 'action' : 'detail');
  };

  return (
    <>
      <style>{GLOBAL_STYLES}</style>
      {step === 'login' && <EmailLoginScreen onFound={handleFound} />}
      {step === 'dashboard' && (
        <ApprovalsDashboard
          approver={approver}
          approvals={approvals}
          onOpen={handleOpen}
          onSignOut={() => {
            setStep('login');
            setApprover(null);
            setApprovals([]);
            setSelected(null);
          }}
        />
      )}
      {step === 'action' && (
        <ApprovalActionView
          approver={approver}
          approval={selected}
          onApproved={() => setStep('confirmed')}
          onBack={() => setStep('dashboard')}
        />
      )}
      {step === 'detail' && (
        <ApprovalDetailView approver={approver} approval={selected} onBack={() => setStep('dashboard')} />
      )}
      {step === 'confirmed' && (
        // Route back to login rather than the (now stale) dashboard so the
        // approvals list gets re-fetched with the fresh approvedCount/status.
        <ApprovedConfirmation approver={approver} onBack={() => setStep('login')} />
      )}
    </>
  );
}
