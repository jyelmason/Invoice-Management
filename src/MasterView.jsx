import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Login from './Login';

import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { GLOBAL_STYLES, Connector, ApproverCard } from './components';
import { getDocTypeLabel } from './docTypes';

// Formats a stored requiredBy { date, time, datetime } for display, flags overdue.
function formatRequiredBy(requiredBy) {
  if (!requiredBy?.date) return null;
  const d = new Date(`${requiredBy.date}T${requiredBy.time || '00:00'}`);
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const label = requiredBy.time
    ? `${dateStr} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : dateStr;
  const overdue = requiredBy.datetime ? new Date(requiredBy.datetime).getTime() < Date.now() : false;
  return { label, overdue };
}

// Classifies a doc's overall state for the master list.
function classify(data) {
  const approvers = data.approvers ?? [];
  const currentIdx = data.approvedCount ?? 0;
  const total = data.approverCount ?? approvers.length ?? 0;

  if (total === 0) return { phase: 'broken', waitingOn: null };
  if (data.status === 'complete' || currentIdx >= total) return { phase: 'complete', waitingOn: null };
  return { phase: 'pending', waitingOn: approvers[currentIdx] ?? null };
}

function phaseMeta(phase) {
  switch (phase) {
    case 'complete':
      return { label: 'Complete', bg: '#EAF3DE', color: '#27500A', border: '#97C459' };
    case 'broken':
      return { label: 'No chain configured', bg: '#FBE9E7', color: '#B3261E', border: '#E8A6A0' };
    case 'pending':
    default:
      return { label: 'Pending', bg: '#E6F1FB', color: '#185FA5', border: '#B7D8F2' };
  }
}

function DocRow({ doc, expanded, onToggle }) {
  const { phase, waitingOn } = classify(doc);
  const meta = phaseMeta(phase);
  const due = formatRequiredBy(doc.requiredBy);
  const currentIdx = doc.approvedCount ?? 0;
  const createdDate = doc.createdAt?.toDate ? doc.createdAt.toDate() : null;

  const getStatus = (i) => {
    if (i < currentIdx) return 'approved';
    if (i === currentIdx && phase === 'pending') return 'active';
    return 'pending';
  };

  return (
    <div
      style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-lg)',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggle}
        style={{
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
            {doc.fileName}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.submitter?.company} · {getDocTypeLabel(doc.docType)} · from {doc.submitter?.firstName} {doc.submitter?.lastName}
            {createdDate ? ` · ${createdDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
          </p>
        </div>
        {due && (
          <span style={{ fontSize: 11, color: due.overdue ? '#B3261E' : 'var(--color-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {due.overdue ? 'Overdue' : `Due ${due.label}`}
          </span>
        )}
        {phase === 'pending' && waitingOn && (
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            waiting on {waitingOn.name}
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
        <i
          className={expanded ? 'ti ti-chevron-up' : 'ti ti-chevron-down'}
          style={{ fontSize: 14, color: 'var(--color-text-secondary)', flexShrink: 0 }}
          aria-hidden="true"
        />
      </div>

      {expanded && (
        <div style={{ padding: '4px 14px 16px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ paddingTop: 12 }}>
            <ApproverCard
              name={`${doc.submitter?.firstName ?? ''} ${doc.submitter?.lastName ?? ''}`}
              role={doc.submitter?.email}
              status="approved"
              isSubmitter
            />
            {(doc.approvers ?? []).map((ap, i) => (
              <div key={i}>
                <Connector active={i <= currentIdx} approved={i < currentIdx} />
                <ApproverCard name={ap.name} role={ap.title} status={getStatus(i)} />
              </div>
            ))}
          </div>

          {phase === 'pending' && waitingOn?.email && (
            <a
              href={`mailto:${waitingOn.email}?subject=${encodeURIComponent(
                `Reminder: approval needed for "${doc.fileName}"`
              )}&body=${encodeURIComponent(
                `Hi ${waitingOn.name},\n\nJust following up — "${doc.fileName}" from ${doc.submitter?.company} is waiting on your approval.\n\nThanks!`
              )}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 12,
                fontSize: 12,
                color: '#185FA5',
                textDecoration: 'none',
              }}
            >
              <i className="ti ti-mail" style={{ fontSize: 13 }} aria-hidden="true" />
              Email {waitingOn.name} ({waitingOn.email})
            </a>
          )}

          {phase === 'broken' && (
            <p style={{ fontSize: 12, color: '#B3261E', margin: '12px 0 0' }}>
              No approver chain resolved for this company/document type combination — check approvalChains.js and approvers.js.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MasterView() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all'); // all | proposal | invoice
  const [statusFilter, setStatusFilter] = useState('all'); // all | pending | complete
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'approvals'), (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      setDocs(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const [user, setUser] = useState(undefined); // undefined = checking, null = logged out

useEffect(() => {
  const unsub = onAuthStateChanged(auth, setUser);
  return () => unsub();
}, []);

if (user === undefined) return null; // or a loading spinner
if (user === null) return <Login onSuccess={() => {}} />; // onAuthStateChanged will re-fire automatically

  const filtered = docs.filter((d) => {
    if (typeFilter !== 'all' && d.docType !== typeFilter) return false;
    if (statusFilter !== 'all') {
      const { phase } = classify(d);
      if (statusFilter === 'pending' && phase === 'complete') return false;
      if (statusFilter === 'complete' && phase !== 'complete') return false;
    }
    return true;
  });

  const pendingCount = docs.filter((d) => classify(d).phase === 'pending').length;
  const completeCount = docs.filter((d) => classify(d).phase === 'complete').length;

  const FilterPill = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      style={{
        fontSize: 12,
        padding: '5px 12px',
        borderRadius: 999,
        border: `1px solid ${active ? '#378ADD' : 'var(--color-border-tertiary)'}`,
        background: active ? '#E6F1FB' : 'var(--color-background-primary)',
        color: active ? '#185FA5' : 'var(--color-text-secondary)',
        cursor: 'pointer',
        fontWeight: active ? 500 : 400,
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', padding: '2rem' }}>
      <style>{GLOBAL_STYLES}</style>
      <div style={{ width: '100%', maxWidth: 780, margin: '0 auto' }}>
        <p style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--color-text-secondary)', textTransform: 'uppercase', margin: '0 0 6px' }}>
          Document approval
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 500, margin: '0 0 4px' }}>All invoices &amp; proposals</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 20px' }}>
          {pendingCount} pending · {completeCount} complete · {docs.length} total
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <FilterPill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All types</FilterPill>
          <FilterPill active={typeFilter === 'proposal'} onClick={() => setTypeFilter('proposal')}>Proposals</FilterPill>
          <FilterPill active={typeFilter === 'invoice'} onClick={() => setTypeFilter('invoice')}>Invoices</FilterPill>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All statuses</FilterPill>
          <FilterPill active={statusFilter === 'pending'} onClick={() => setStatusFilter('pending')}>Pending</FilterPill>
          <FilterPill active={statusFilter === 'complete'} onClick={() => setStatusFilter('complete')}>Complete</FilterPill>
        </div>

        {loading && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No documents match this filter.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              expanded={expandedId === doc.id}
              onToggle={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
