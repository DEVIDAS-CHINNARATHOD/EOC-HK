import React, { useEffect, useMemo, useState } from "react";

function resolveApiBase() {
  const rawBase = import.meta.env.VITE_API_BASE || "";
  if (import.meta.env.PROD && !rawBase.trim()) {
    throw new Error("VITE_API_BASE must be set for production builds.");
  }

  return rawBase.endsWith("/") ? rawBase.slice(0, -1) : rawBase;
}

const API_BASE = resolveApiBase();

function apiUrl(path) {
  if (!API_BASE) {
    return path;
  }

  if (path.startsWith("http")) {
    return path;
  }

  const trimmedBase = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
  if (path === trimmedBase || path.startsWith(`${trimmedBase}/`)) {
    return path;
  }

  if (trimmedBase === "/api" && path.startsWith("/api")) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

async function requestJson(path, { method = "GET", body, isFormData = false } = {}) {
  const headers = {};

  if (body && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (_error) {
    throw new Error("Backend is not reachable. Please make sure the server is running.");
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(payload?.message || "Request failed");
    error.status = response.status;
    throw error;
  }

  return payload;
}

function formatWhen(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatFileSize(size) {
  if (!size) {
    return "";
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getInitials(name = "EOC") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function LoadingView({ label }) {
  return (
    <div className="loading-screen">
      <div className="loading-card">
        <span className="loading-mark" aria-hidden="true" />
        <h1>{label}</h1>
        <p>Syncing the workspace.</p>
      </div>
    </div>
  );
}

function EmptyState({ title, message }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

function StatusChip({ tone = "neutral", children }) {
  return <span className={`status-chip ${tone}`}>{children}</span>;
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CircularSummary({ circular, compact = false }) {
  const summary = circular.deliverySummary ?? {};
  const attachmentName = circular.attachment?.fileName;
  const attachmentSize = formatFileSize(circular.attachment?.fileSize);
  const attachmentUrl = circular.attachment?.hasStoredFile
    ? apiUrl(circular.attachment.viewUrl || `/api/circulars/${circular.id}/attachment`)
    : "";

  return (
    <article className={compact ? "list-row compact-row" : "list-row"}>
      <div className="row-main">
        <div>
          <h3>{circular.title}</h3>
          <p>
            {circular.cellName} - {formatWhen(circular.createdAt)}
          </p>
        </div>
        {circular.description && !compact ? <p className="row-description">{circular.description}</p> : null}
        {attachmentName ? (
          <span className="attachment-line">
            {attachmentName}
            {attachmentSize ? ` (${attachmentSize})` : ""}
          </span>
        ) : null}
        {attachmentName && !compact ? (
          <div className="attachment-actions">
            {attachmentUrl ? (
              <a className="secondary-btn compact-btn" href={attachmentUrl} target="_blank" rel="noreferrer">
                View PDF
              </a>
            ) : (
              <span className="unavailable-chip">PDF not stored for this older circular</span>
            )}
          </div>
        ) : null}
      </div>
      <div className="row-meta" aria-label="Delivery summary">
        <StatusChip>{summary.total ?? 0} recipients</StatusChip>
        <StatusChip tone="success">{summary.read ?? 0} read</StatusChip>
        <StatusChip tone="warning">{summary.unread ?? 0} unread</StatusChip>
        {!compact ? <StatusChip tone="info">{summary.sent ?? 0} sent</StatusChip> : null}
      </div>
    </article>
  );
}

function MemberRow({ member }) {
  return (
    <div className="member-row">
      <span className="avatar" aria-hidden="true">
        {getInitials(member.name)}
      </span>
      <div>
        <strong>{member.name}</strong>
        <span>{member.designation || member.role}</span>
      </div>
      <a href={`mailto:${member.email}`}>{member.email}</a>
    </div>
  );
}

export default function App() {
  const [bootstrap, setBootstrap] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [composeForm, setComposeForm] = useState({ title: "", description: "", cellId: "" });
  const [composeFile, setComposeFile] = useState(null);
  const [composeStatus, setComposeStatus] = useState({ error: "", success: "" });
  const [composeLoading, setComposeLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState({ error: "", message: "" });
  const [fileInputVersion, setFileInputVersion] = useState(0);

  const user = bootstrap?.user ?? null;
  const isAdmin = user?.role === "Admin";
  const dashboard = bootstrap?.dashboard ?? {};
  const cells = bootstrap?.cells ?? [];
  const recentCirculars = dashboard.recentCirculars ?? [];
  const allCirculars = bootstrap?.circulars ?? [];
  const membersDirectory = bootstrap?.membersDirectory ?? [];

  const recipientGroup = useMemo(() => {
    if (!composeForm.cellId) {
      return null;
    }

    return membersDirectory.find((entry) => entry.id === composeForm.cellId);
  }, [membersDirectory, composeForm.cellId]);

  const selectedCell = useMemo(
    () => cells.find((cell) => cell.id === composeForm.cellId) ?? null,
    [cells, composeForm.cellId],
  );

  const navItems = useMemo(
    () => [
      { id: "dashboard", label: "Dashboard", marker: "D" },
      { id: "circulars", label: "Circulars", marker: "C" },
      ...(isAdmin ? [{ id: "compose", label: "Send Circular", marker: "S" }] : []),
    ],
    [isAdmin],
  );

  const viewMeta = {
    dashboard: {
      label: "Dashboard",
      title: dashboard.heroTitle || "EOC Workspace",
      subtitle: isAdmin
        ? "A clear view of cells, recipients, and recent circular movement."
        : "Latest circulars and updates for your cell.",
    },
    circulars: {
      label: "Circulars",
      title: "Circular History",
      subtitle: "Sent circulars with delivery and read status.",
    },
    compose: {
      label: "Compose",
      title: "Send Circular",
      subtitle: selectedCell
        ? `${selectedCell.name} recipient list is ready.`
        : "Choose a cell before sending.",
    },
  }[activeView];

  useEffect(() => {
    const loadBootstrap = async () => {
      setLoading(true);
      setAuthError("");

      try {
        const payload = await requestJson("/api/bootstrap");
        setBootstrap(payload);
        setLastSyncedAt(new Date().toISOString());
        if (!composeForm.cellId && payload.cells?.length) {
          setComposeForm((prev) => ({ ...prev, cellId: payload.cells[0].id }));
        }
      } catch (error) {
        setAuthError(error.message || "Unable to load your workspace.");
      } finally {
        setLoading(false);
      }
    };

    loadBootstrap();
  }, []);

  useEffect(() => {
    if (!isAdmin && activeView === "compose") {
      setActiveView("dashboard");
    }
  }, [activeView, isAdmin]);

  useEffect(() => {
    if (!composeForm.cellId && cells.length && isAdmin) {
      setComposeForm((prev) => ({ ...prev, cellId: cells[0].id }));
    }
  }, [cells, composeForm.cellId, isAdmin]);

  const handleComposeChange = (event) => {
    const { name, value } = event.target;
    setComposeForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleComposeFileChange = async (event) => {
    const file = event.target.files?.[0] ?? null;
    setComposeFile(file);
    setAnalysisStatus({ error: "", message: "" });

    if (!file) {
      return;
    }

    if (file.type && file.type !== "application/pdf") {
      setComposeFile(null);
      setFileInputVersion((version) => version + 1);
      setAnalysisStatus({ error: "Only PDF circular attachments are supported.", message: "" });
      return;
    }

    setAnalysisLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await requestJson("/api/circulars/analyze", {
        method: "POST",
        body: formData,
        isFormData: true,
      });

      setComposeForm((prev) => ({
        ...prev,
        title: result.title || prev.title,
        description: result.description || prev.description,
        cellId: result.cellId || prev.cellId,
      }));

      const sourceLabel =
        result.source === "groq-vision"
          ? "Groq OCR"
          : result.source === "groq"
            ? "Groq"
            : "local scan";
      const cellLabel = result.cellName ? ` Matched ${result.cellName}.` : "";
      const warning = result.warning ? ` ${result.warning}` : "";
      setAnalysisStatus({
        error: "",
        message: `Auto-filled from ${sourceLabel}.${cellLabel}${warning}`,
      });
    } catch (error) {
      setAnalysisStatus({
        error: error.message || "Unable to auto-fill from this PDF.",
        message: "",
      });
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleComposeSubmit = async (event) => {
    event.preventDefault();
    setComposeStatus({ error: "", success: "" });
    setComposeLoading(true);

    try {
      const formData = new FormData();
      formData.append("title", composeForm.title.trim());
      formData.append("description", composeForm.description.trim());
      formData.append("cellId", composeForm.cellId);
      if (composeFile) {
        formData.append("file", composeFile);
      }

      await requestJson("/api/circulars", {
        method: "POST",
        body: formData,
        isFormData: true,
      });

      const payload = await requestJson("/api/bootstrap");
      setBootstrap(payload);
      setLastSyncedAt(new Date().toISOString());
      setComposeForm((prev) => ({ ...prev, title: "", description: "" }));
      setComposeFile(null);
      setFileInputVersion((version) => version + 1);
      setAnalysisStatus({ error: "", message: "" });
      setComposeStatus({ error: "", success: "Circular sent and queued for delivery." });
    } catch (error) {
      setComposeStatus({ error: error.message || "Unable to send the circular.", success: "" });
    } finally {
      setComposeLoading(false);
    }
  };

  if (!bootstrap) {
    if (loading) {
      return <LoadingView label="Loading workspace" />;
    }

    return (
      <div className="loading-screen">
        <div className="loading-card">
          <span className="loading-mark error" aria-hidden="true" />
          <h1>Unable to load workspace</h1>
          <p>{authError || "Please refresh and try again."}</p>
        </div>
      </div>
    );
  }

  const canSendCircular =
    isAdmin &&
    Boolean(composeForm.cellId) &&
    Boolean(composeForm.title.trim()) &&
    Boolean(composeForm.description.trim()) &&
    !analysisLoading &&
    !composeLoading;
  const directoryPreview = membersDirectory.slice(0, 6);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            EH
          </span>
          <div>
            <h1>EOC Hub</h1>
            <p>Equal Opportunity Cell</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-btn${activeView === item.id ? " active" : ""}`}
              onClick={() => setActiveView(item.id)}
              type="button"
            >
              <span aria-hidden="true">{item.marker}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="user-card">
          <span className="avatar large" aria-hidden="true">
            {getInitials(user?.name)}
          </span>
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.role}</span>
            <span>{user?.cellName || "All cells"}</span>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <span className="section-label">{viewMeta.label}</span>
            <h2>{viewMeta.title}</h2>
            <p>{viewMeta.subtitle}</p>
          </div>
          <div className="topbar-actions">
            {isAdmin ? (
              <button className="secondary-btn" type="button" onClick={() => setActiveView("compose")}>
                New circular
              </button>
            ) : null}
            <span className="sync-pill">Synced {formatWhen(lastSyncedAt)}</span>
          </div>
        </header>

        {authError ? <div className="alert">{authError}</div> : null}

        {activeView === "dashboard" ? (
          <section className="page-stack">
            <div className="stats-grid">
              {(dashboard.stats || []).map((stat) => (
                <StatCard key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </div>

            <div className="dashboard-grid">
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <span className="section-label">Recent</span>
                    <h3>Latest circulars</h3>
                  </div>
                  <button className="text-btn" type="button" onClick={() => setActiveView("circulars")}>
                    View all
                  </button>
                </div>

                <div className="list-stack">
                  {recentCirculars.length ? (
                    recentCirculars.map((circular) => (
                      <CircularSummary key={circular.id} circular={circular} compact />
                    ))
                  ) : (
                    <EmptyState
                      title="No circulars yet"
                      message="Sent circulars will appear here with delivery status."
                    />
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-header">
                  <div>
                    <span className="section-label">Directory</span>
                    <h3>Cells snapshot</h3>
                  </div>
                  <StatusChip tone="info">{membersDirectory.length} cells</StatusChip>
                </div>

                <div className="cell-list">
                  {directoryPreview.map((cell) => (
                    <div key={cell.id} className="cell-row">
                      <div>
                        <strong>{cell.name}</strong>
                        <span>{cell.members.length} members</span>
                      </div>
                      <span className="mini-count">{cell.members.length}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {!isAdmin ? (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <span className="section-label">Access</span>
                    <h3>Admin-only actions</h3>
                  </div>
                </div>
                <p className="muted">
                  Circular uploads are available only to admins. Your account stays focused on
                  cell-specific circulars, meetings, and notifications.
                </p>
              </section>
            ) : null}
          </section>
        ) : null}

        {activeView === "circulars" ? (
          <section className="page-stack">
            <div className="section-heading">
              <div>
                <span className="section-label">Records</span>
                <h3>All circulars</h3>
              </div>
              <StatusChip>{allCirculars.length} total</StatusChip>
            </div>

            <div className="list-stack">
              {allCirculars.length ? (
                allCirculars.map((circular) => (
                  <CircularSummary key={circular.id} circular={circular} />
                ))
              ) : (
                <section className="panel">
                  <EmptyState
                    title="No circulars available"
                    message="Once a circular is sent, it will be listed here."
                  />
                </section>
              )}
            </div>
          </section>
        ) : null}

        {activeView === "compose" && isAdmin ? (
          <section className="compose-grid">
            <form className="panel form-panel" onSubmit={handleComposeSubmit}>
              <div className="panel-header">
                <div>
                  <span className="section-label">Message</span>
                  <h3>Circular details</h3>
                </div>
              </div>

              {composeStatus.error ? <div className="alert">{composeStatus.error}</div> : null}
              {composeStatus.success ? <div className="success-banner">{composeStatus.success}</div> : null}

              <label className="field">
                <span>Circular title</span>
                <input
                  className="input"
                  name="title"
                  value={composeForm.title}
                  onChange={handleComposeChange}
                  placeholder="Enter a clear subject"
                  required
                />
              </label>

              <label className="field">
                <span>Description</span>
                <textarea
                  className="input input-area"
                  name="description"
                  value={composeForm.description}
                  onChange={handleComposeChange}
                  placeholder="Write the message recipients should read"
                  required
                />
              </label>

              <label className="field">
                <span>Target cell</span>
                <select
                  className="input"
                  name="cellId"
                  value={composeForm.cellId}
                  onChange={handleComposeChange}
                  required
                >
                  {cells.map((cell) => (
                    <option key={cell.id} value={cell.id}>
                      {cell.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="file-drop">
                <span>PDF attachment</span>
                <input
                  key={fileInputVersion}
                  type="file"
                  accept="application/pdf"
                  disabled={analysisLoading || composeLoading}
                  onChange={handleComposeFileChange}
                />
                <strong>
                  {analysisLoading ? "Reading circular..." : composeFile?.name || "Optional PDF"}
                </strong>
              </label>

              {analysisStatus.error ? <div className="alert">{analysisStatus.error}</div> : null}
              {analysisStatus.message ? (
                <div className="info-banner">{analysisStatus.message}</div>
              ) : null}

              <div className="form-actions">
                {composeFile ? (
                  <button
                    className="secondary-btn"
                    type="button"
                    disabled={analysisLoading}
                    onClick={() => {
                      setComposeFile(null);
                      setFileInputVersion((version) => version + 1);
                      setAnalysisStatus({ error: "", message: "" });
                    }}
                  >
                    Remove PDF
                  </button>
                ) : null}
                <button className="primary-btn" type="submit" disabled={!canSendCircular}>
                  {analysisLoading ? "Preparing..." : composeLoading ? "Sending..." : "Send circular"}
                </button>
              </div>
            </form>

            <aside className="panel preview-panel">
              <div className="panel-header">
                <div>
                  <span className="section-label">Recipients</span>
                  <h3>{recipientGroup ? recipientGroup.name : "Select a cell"}</h3>
                </div>
                <StatusChip tone="info">{recipientGroup?.members?.length ?? 0} people</StatusChip>
              </div>

              <div className="recipient-preview-list">
                {recipientGroup?.members?.length ? (
                  recipientGroup.members.map((member) => <MemberRow key={member.id} member={member} />)
                ) : (
                  <EmptyState
                    title="No recipients"
                    message="Choose another cell or add members before sending."
                  />
                )}
              </div>
            </aside>
          </section>
        ) : null}
      </main>
    </div>
  );
}
