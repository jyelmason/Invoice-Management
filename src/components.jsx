// ─── Shared visual components ────────────────────────────────────────────────

export const GLOBAL_STYLES = `
  @keyframes pulseArrow {
    0%, 100% { opacity: 1; transform: translateY(0); }
    50% { opacity: 0.55; transform: translateY(3px); }
  }
  @keyframes flowDash {
    0% { stroke-dashoffset: 24; }
    100% { stroke-dashoffset: 0; }
  }
  @keyframes approvedPop {
    0% { transform: scale(0.96); opacity: 0.7; }
    60% { transform: scale(1.03); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulseDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.75); }
  }
`;

export function Connector({ active, approved }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        margin: '2px 0',
      }}
    >
      <svg
        width="20"
        height="52"
        viewBox="0 0 20 52"
        style={{ overflow: 'visible' }}
      >
        <line
          x1="10"
          y1="0"
          x2="10"
          y2="34"
          stroke={
            active || approved ? '#97C459' : 'var(--color-border-secondary)'
          }
          strokeWidth={active || approved ? 2 : 1.5}
          strokeDasharray={active && !approved ? '5 4' : 'none'}
          style={
            active && !approved
              ? { animation: 'flowDash 0.5s linear infinite' }
              : {}
          }
        />
        <polygon
          points="10,44 5,34 15,34"
          fill={active || approved ? '#639922' : '#B4B2A9'}
          style={
            active && !approved
              ? { animation: 'pulseArrow 1s ease-in-out infinite' }
              : {}
          }
        />
      </svg>
    </div>
  );
}

export function ApproverCard({ name, role, status, isSubmitter }) {
  const approved = status === 'approved';
  const active = status === 'active';

  const bg = isSubmitter
    ? 'var(--color-background-secondary)'
    : approved
    ? '#EAF3DE'
    : 'var(--color-background-primary)';
  const border = isSubmitter
    ? 'var(--color-border-secondary)'
    : approved || active
    ? '#97C459'
    : 'var(--color-border-tertiary)';
  const avBg = isSubmitter
    ? '#E6F1FB'
    : approved
    ? '#C0DD97'
    : active
    ? '#EAF3DE'
    : 'var(--color-background-secondary)';
  const avCol = isSubmitter
    ? '#185FA5'
    : approved || active
    ? '#3B6D11'
    : 'var(--color-text-secondary)';
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');

  return (
    <div
      style={{
        background: bg,
        border: `${active ? '1.5px' : '0.5px'} solid ${border}`,
        borderRadius: 'var(--border-radius-lg)',
        padding: '10px 14px',
        width: '100%',
        boxSizing: 'border-box',
        transition: 'all 0.3s ease',
        boxShadow: active ? '0 0 0 3px rgba(99,153,34,0.12)' : 'none',
        animation: approved && !isSubmitter ? 'approvedPop 0.35s ease' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: avBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 500,
            color: avCol,
            flexShrink: 0,
            transition: 'all 0.3s ease',
          }}
        >
          {approved && !isSubmitter ? (
            <i
              className="ti ti-check"
              style={{ fontSize: 15 }}
              aria-hidden="true"
            />
          ) : (
            initials
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              margin: 0,
              color: 'var(--color-text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </p>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              margin: 0,
            }}
          >
            {role}
          </p>
        </div>
        <div style={{ flexShrink: 0 }}>
          {isSubmitter && (
            <span
              style={{
                fontSize: 10,
                color: '#185FA5',
                background: '#E6F1FB',
                padding: '2px 7px',
                borderRadius: 99,
              }}
            >
              Submitter
            </span>
          )}
          {approved && !isSubmitter && (
            <span
              style={{
                fontSize: 10,
                color: '#3B6D11',
                background: '#C0DD97',
                padding: '2px 7px',
                borderRadius: 99,
              }}
            >
              Approved
            </span>
          )}
          {active && (
            <span
              style={{
                fontSize: 10,
                color: '#3B6D11',
                background: '#EAF3DE',
                padding: '2px 7px',
                borderRadius: 99,
                animation: 'pulseDot 1.5s ease-in-out infinite',
              }}
            >
              Awaiting
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
