import { useEffect, useMemo, useState } from 'react';
import { api } from './api';


type User = {
  id: string;
  role: 'ADMIN' | 'STOREKEEPER' | 'TEACHER';
  email: string;
  name: string;
  departmentId?: string | null;
  isActive?: boolean;
};

type AuthResponse = { token: string; user: User };
type StockRow = {
  itemId: string; itemCode: string; itemName: string; unit: string;
  type: 'CONSUMABLE' | 'RETURNABLE'; availableQty: number;
  lowStockThreshold: number; isLowStock: boolean;
};
type RequestRow = {
  id: string; status: string; notes?: string;
  requester: { name: string };
  lines: Array<{ item: { name: string }; quantityRequested: number }>;
};
type IssueRow = {
  id: string; issuedAt: string; issuedBy: { name: string };
  lines: Array<{
    id: string; item: { name: string }; quantityIssued: number;
    quantityReturned: number; dueDate?: string; isOverdue: boolean;
  }>;
};
type Department = { id: string; name: string };
type LimitRule = {
  id: string; name: string; period: 'WEEKLY' | 'MONTHLY' | 'TERM';
  maxQuantity: number;
  item?: { id: string; name: string; code: string } | null;
  user?: { id: string; name: string; email: string } | null;
};

const tabsByRole: Record<User['role'], { id: string; icon: string }[]> = {
  ADMIN: [
    { id: 'Stock', icon: '📦' },
    { id: 'Requests', icon: '📋' },
    { id: 'Issues', icon: '📤' },
    { id: 'Returns', icon: '↩️' },
    { id: 'Items', icon: '🏷️' },
    { id: 'Imports', icon: '📥' },
    { id: 'Adjustments', icon: '⚖️' },
    { id: 'Users & Departments', icon: '👥' },
    { id: 'Limits', icon: '🚦' },
    { id: 'Reports', icon: '📊' },
  ],
  STOREKEEPER: [
    { id: 'Stock', icon: '📦' },
    { id: 'Requests', icon: '📋' },
    { id: 'Issues', icon: '📤' },
    { id: 'Returns', icon: '↩️' },
    { id: 'Items', icon: '🏷️' },
    { id: 'Imports', icon: '📥' },
    { id: 'Adjustments', icon: '⚖️' },
    { id: 'Reports', icon: '📊' },
  ],
  TEACHER: [
    { id: 'Stock', icon: '📦' },
    { id: 'My Requests', icon: '📋' },
    { id: 'My Issues', icon: '📤' },
  ],
};

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    SUBMITTED: 'badge badge-info',
    APPROVED: 'badge badge-success',
    REJECTED: 'badge badge-danger',
    PARTIALLY_ISSUED: 'badge badge-warning',
    FULLY_ISSUED: 'badge badge-purple',
    DRAFT: 'badge badge-info',
  };
  return <span className={map[status] ?? 'badge badge-info'}>{status.replace('_', ' ')}</span>;
};

export const App = () => {
  const [email, setEmail] = useState('teacher@school.local');
  const [password, setPassword] = useState('Teacher@123');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [limitRules, setLimitRules] = useState<LimitRule[]>([]);
  const [activeTab, setActiveTab] = useState('Stock');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  // Check localStorage for token on app load
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Form state
  const [requestItemId, setRequestItemId] = useState('');
  const [requestQty, setRequestQty] = useState(1);
  const [requestNote, setRequestNote] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('pcs');
  const [itemInitialStock, setItemInitialStock] = useState(0);
  const [itemType, setItemType] = useState<'CONSUMABLE' | 'RETURNABLE'>('CONSUMABLE');
  const [importFileName, setImportFileName] = useState('sample.csv');
  const [importType, setImportType] = useState<'opening' | 'invoice'>('invoice');
  const [csvData, setCsvData] = useState('');
  const [issueRequestId, setIssueRequestId] = useState('');
  const [issueOverrideReason, setIssueOverrideReason] = useState('');
  const [returnIssueId, setReturnIssueId] = useState('');
  const [returnIssueLineId, setReturnIssueLineId] = useState('');
  const [returnQty, setReturnQty] = useState(1);
  const [returnCondition, setReturnCondition] = useState<'GOOD' | 'DAMAGED' | 'LOST'>('GOOD');
  const [returnReason, setReturnReason] = useState('');
  const [adjustItemId, setAdjustItemId] = useState('');
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustOverrideReason, setAdjustOverrideReason] = useState('');
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<User['role']>('TEACHER');
  const [newUserDepartmentId, setNewUserDepartmentId] = useState('');
  const [mappedUserId, setMappedUserId] = useState('');
  const [mappedDepartmentId, setMappedDepartmentId] = useState('');
  const [limitName, setLimitName] = useState('Teacher monthly cap');
  const [limitUserId, setLimitUserId] = useState('');
  const [limitItemId, setLimitItemId] = useState('');
  const [limitMaxQuantity, setLimitMaxQuantity] = useState(20);
  const [limitPeriod, setLimitPeriod] = useState<'WEEKLY' | 'MONTHLY' | 'TERM'>('MONTHLY');
  const [reportData, setReportData] = useState<unknown[]>([]);

  const tabs = useMemo(() => (user ? tabsByRole[user.role] : []), [user]);

  const notify = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  };

  const loadData = async () => {
    if (!token || !user) return;
    try {
      const [stockData, requestData, issueData] = await Promise.all([
        api<StockRow[]>('/inventory/stock', { token }),
        api<RequestRow[]>('/requests', { token }),
        api<IssueRow[]>('/issues', { token }),
      ]);
      setStock(stockData);
      setRequests(requestData);
      setIssues(issueData);

      if (user.role === 'ADMIN') {
        const [userData, departmentData, rules] = await Promise.all([
          api<User[]>('/users', { token }),
          api<Department[]>('/departments', { token }),
          api<LimitRule[]>('/limits', { token }),
        ]);
        setUsers(userData);
        setDepartments(departmentData);
        setLimitRules(rules);
      } else if (user.role === 'STOREKEEPER') {
        const departmentData = await api<Department[]>('/departments', { token });
        setDepartments(departmentData);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to load data', 'error');
    }
  };

  useEffect(() => { loadData(); }, [token, user?.role]);

  const login = async () => {
    try {
      const data = await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setActiveTab('Stock');
      notify(`Welcome, ${data.user.name}!`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Login failed', 'error');
    }
  };

  const submitRequest = async () => {
    if (!token || !requestItemId) return;
    try {
      await api('/requests', { token, method: 'POST', body: { notes: requestNote, lines: [{ itemId: requestItemId, quantityRequested: requestQty }] } });
      setRequestNote(''); setRequestQty(1);
      await loadData();
      notify('Request submitted successfully', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Request failed', 'error');
    }
  };

  const decideRequest = async (requestId: string, approved: boolean) => {
    if (!token) return;
    try {
      await api(`/requests/${requestId}/decision`, { token, method: 'POST', body: { approved, notes: approved ? 'Approved' : 'Rejected' } });
      await loadData();
      notify(`Request ${approved ? 'approved' : 'rejected'}`, approved ? 'success' : 'error');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Decision failed', 'error');
    }
  };

  const createItem = async () => {
    if (!token) return;
    try {
      await api('/items', { token, method: 'POST', body: { code: itemCode, name: itemName, unit: itemUnit, type: itemType, lowStockThreshold: 5, initialStock: itemInitialStock } });
      setItemCode(''); setItemName(''); setItemInitialStock(0);
      await loadData();
      notify('Item created successfully', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Item creation failed', 'error');
    }
  };

  const submitImport = async () => {
    if (!token || !csvData) return;
    try {
      await api(importType === 'opening' ? '/imports/opening-stock' : '/imports/invoice-stock', { token, method: 'POST', body: { fileName: importFileName, csvData } });
      await loadData();
      notify('Import processed successfully', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Import failed', 'error');
    }
  };

  const createIssueFromRequest = async () => {
    if (!token || !issueRequestId) return;
    try {
      await api('/issues', { token, method: 'POST', body: { requestId: issueRequestId, notes: 'Issued from dashboard', overrideReason: issueOverrideReason || undefined } });
      setIssueRequestId(''); setIssueOverrideReason('');
      await loadData();
      notify('Issue created successfully', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Issue failed', 'error');
    }
  };

  const processReturn = async () => {
    if (!token || !returnIssueId || !returnIssueLineId) return;
    try {
      await api('/returns', { token, method: 'POST', body: { issueId: returnIssueId, lines: [{ issueLineId: returnIssueLineId, quantity: returnQty, condition: returnCondition, note: returnReason || undefined }] } });
      setReturnIssueId(''); setReturnIssueLineId(''); setReturnQty(1); setReturnCondition('GOOD'); setReturnReason('');
      await loadData();
      notify('Return processed successfully', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Return failed', 'error');
    }
  };

  const createAdjustment = async () => {
    if (!token || !adjustItemId || adjustQty === 0 || !adjustReason) return;
    try {
      await api('/inventory/adjustments', { token, method: 'POST', body: { itemId: adjustItemId, quantityDelta: adjustQty, reason: adjustReason, overrideReason: adjustOverrideReason || undefined } });
      setAdjustQty(0); setAdjustReason(''); setAdjustOverrideReason('');
      await loadData();
      notify('Adjustment posted', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Adjustment failed', 'error');
    }
  };

  const createDepartment = async () => {
    if (!token || !newDepartmentName) return;
    try {
      await api('/departments', { token, method: 'POST', body: { name: newDepartmentName } });
      setNewDepartmentName('');
      await loadData();
      notify('Department created', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Department creation failed', 'error');
    }
  };

  const createUser = async () => {
    if (!token || !newUserEmail || !newUserPassword || !newUserName) return;
    try {
      await api('/users', { token, method: 'POST', body: { email: newUserEmail, password: newUserPassword, name: newUserName, role: newUserRole, departmentId: newUserDepartmentId || undefined } });
      setNewUserEmail(''); setNewUserPassword(''); setNewUserName('');
      await loadData();
      notify('User created', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'User creation failed', 'error');
    }
  };

  const updateUserDepartment = async () => {
    if (!token || !mappedUserId) return;
    try {
      await api(`/users/${mappedUserId}`, { token, method: 'PATCH', body: { departmentId: mappedDepartmentId || null } });
      await loadData();
      notify('User mapping updated', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Update failed', 'error');
    }
  };

  const createLimit = async () => {
    if (!token || !limitName || !limitMaxQuantity) return;
    try {
      await api('/limits', { token, method: 'POST', body: { name: limitName, userId: limitUserId || null, itemId: limitItemId || null, maxQuantity: limitMaxQuantity, period: limitPeriod } });
      await loadData();
      notify('Limit rule created', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Limit creation failed', 'error');
    }
  };

  const loadReport = async (path: string) => {
    if (!token) return;
    try {
      const data = await api<unknown[]>(path, { token });
      setReportData(data);
      notify('Report loaded', 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Report failed', 'error');
    }
  };

  // ─── LOGIN PAGE ──────────────────────────────────────────────────────────
  if (!token || !user) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">S</div>
          <h1>Fore School</h1>
          <p>Inventory & store management system</p>
          <div className="login-form">
            <div className="form-group">
              <label htmlFor="login-email">Email address</label>
              <input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@school.local" />
            </div>
            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button id="login-btn" className="primary" onClick={login} style={{ marginTop: '0.5rem' }}>Sign in →</button>
          </div>
          <small>Test accounts: admin@school.local / Admin@123 · storekeeper@school.local / Store@123 · teacher@school.local / Teacher@123</small>
        </div>
        {message && (
          <div className="toast-container">
            <div className="toast">
              <div className="toast-indicator" style={{ backgroundColor: messageType === 'error' ? '#ef4444' : messageType === 'success' ? '#10b981' : '#6366f1' }} />
              {message}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── MAIN DASHBOARD ──────────────────────────────────────────────────────
  const lowStockCount = stock.filter(s => s.isLowStock).length;
  const pendingRequests = requests.filter(r => r.status === 'SUBMITTED').length;
  const overdueIssues = issues.flatMap(i => i.lines).filter(l => l.isOverdue).length;

  return (
    <div className="app-layout">
      {/* ─── SIDEBAR ─── */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon">S</div>
          <span className="logo-text">Fore School</span>
        </div>

        <nav className="sidebar-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              id={`nav-${tab.id.toLowerCase().replace(/\s+/g, '-').replace('&', 'and')}`}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <span className="nav-text">{tab.id}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-card">
            <div className="avatar">{user.name.charAt(0)}</div>
            <div className="user-info">
              <span className="profile-name">{user.name}</span>
              <span className="profile-role">{user.role}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <div className="main-wrapper">
        <header className="header">
          <div className="page-title-section">
            <h1>{activeTab}</h1>
          </div>
          <div className="header-actions">
            <button id="header-refresh-btn" className="secondary" onClick={loadData}>↻ Refresh</button>
            <button id="header-logout-btn" className="danger" onClick={() => {
              setToken(null);
              setUser(null);
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              setStock([]);
              setRequests([]);
              setIssues([]);
              setUsers([]);
              setDepartments([]);
            }}>Logout</button>
          </div>
        </header>

        <div className="content-container">

          {/* ─── STOCK TAB ─── */}
          {activeTab === 'Stock' && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-title">Total Items</span>
                  <span className="stat-value">{stock.length}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-title">Low Stock Alerts</span>
                  <span className="stat-value">{lowStockCount}</span>
                  {lowStockCount > 0 && <span className="stat-indicator indicator-red">⚠ Alert</span>}
                </div>
                <div className="stat-card">
                  <span className="stat-title">Pending Requests</span>
                  <span className="stat-value">{pendingRequests}</span>
                  {pendingRequests > 0 && <span className="stat-indicator indicator-yellow">Pending</span>}
                </div>
                <div className="stat-card">
                  <span className="stat-title">Overdue Issues</span>
                  <span className="stat-value">{overdueIssues}</span>
                  {overdueIssues > 0 && <span className="stat-indicator indicator-red">Overdue</span>}
                </div>
              </div>

              <div className="card">
                <div className="card-header-row">
                  <h2>Current Stock</h2>
                  <span className="badge badge-info">{stock.length} items</span>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Available Qty</th>
                        <th>Threshold</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stock.length === 0
                        ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No stock data. Import or add items first.</td></tr>
                        : stock.map(row => (
                          <tr key={row.itemId}>
                            <td><code style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>{row.itemCode}</code></td>
                            <td style={{ fontWeight: 600 }}>{row.itemName}</td>
                            <td><span className={`badge ${row.type === 'CONSUMABLE' ? 'badge-info' : 'badge-purple'}`}>{row.type}</span></td>
                            <td>{row.availableQty} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{row.unit}</span></td>
                            <td style={{ color: 'var(--text-secondary)' }}>{row.lowStockThreshold}</td>
                            <td>{row.isLowStock ? <span className="badge badge-danger">Low Stock</span> : <span className="badge badge-success">OK</span>}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>

                {user.role === 'TEACHER' && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <h2 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Submit a Request</h2>
                    <div className="inline-form">
                      <div className="form-group">
                        <label>Item</label>
                        <select id="request-item-select" value={requestItemId} onChange={e => setRequestItemId(e.target.value)}>
                          <option value="">Select an item…</option>
                          {stock.map(row => <option key={row.itemId} value={row.itemId}>{row.itemCode} — {row.itemName}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ maxWidth: 100 }}>
                        <label>Qty</label>
                        <input id="request-qty" type="number" min={1} value={requestQty} onChange={e => setRequestQty(Number(e.target.value))} />
                      </div>
                      <div className="form-group">
                        <label>Note</label>
                        <input id="request-note" placeholder="Optional note…" value={requestNote} onChange={e => setRequestNote(e.target.value)} />
                      </div>
                      <div className="form-group" style={{ justifyContent: 'flex-end', minWidth: 'auto' }}>
                        <label>&nbsp;</label>
                        <button id="submit-request-btn" className="primary" onClick={submitRequest}>Submit Request</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ─── REQUESTS TAB ─── */}
          {(activeTab === 'Requests' || activeTab === 'My Requests') && (
            <div className="card">
              <div className="card-header-row">
                <h2>{activeTab}</h2>
                <span className="badge badge-warning">{pendingRequests} pending</span>
              </div>
              <ul className="requests-list">
                {requests.length === 0
                  ? <li style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No requests yet.</li>
                  : requests.map(req => (
                    <li key={req.id} className="request-item">
                      <div className="request-main">
                        <div className="request-meta">
                          <span className="request-id">#{req.id.slice(0, 8)}</span>
                          <span className="request-requester">{req.requester.name}</span>
                          {statusBadge(req.status)}
                        </div>
                        <div className="request-lines">
                          {req.lines.map(l => `${l.item.name} (×${l.quantityRequested})`).join(' · ')}
                        </div>
                        {req.notes && <div className="request-notes">"{req.notes}"</div>}
                      </div>
                      {(user.role === 'ADMIN' || user.role === 'STOREKEEPER') && req.status === 'SUBMITTED' && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                          <button id={`approve-${req.id}`} className="primary" onClick={() => decideRequest(req.id, true)}>✓ Approve</button>
                          <button id={`reject-${req.id}`} className="danger" onClick={() => decideRequest(req.id, false)}>✗ Reject</button>
                        </div>
                      )}
                    </li>
                  ))
                }
              </ul>
            </div>
          )}

          {/* ─── ISSUES TAB ─── */}
          {activeTab === 'Issues' && (
            <div className="grid-2col">
              <div className="card">
                <div className="card-header-row"><h2>Issue from Request</h2></div>
                <div className="stack-form">
                  <div className="form-group">
                    <label>Approved Request ID</label>
                    <input id="issue-request-id" value={issueRequestId} onChange={e => setIssueRequestId(e.target.value)} placeholder="Paste request ID…" />
                  </div>
                  <div className="form-group">
                    <label>Override Reason <span style={{ color: 'var(--text-muted)' }}>(Admin only, optional)</span></label>
                    <input id="issue-override-reason" value={issueOverrideReason} onChange={e => setIssueOverrideReason(e.target.value)} placeholder="Override reason…" />
                  </div>
                  <button id="create-issue-btn" className="primary" onClick={createIssueFromRequest}>📤 Issue from Request</button>
                </div>
              </div>

              <div className="card">
                <div className="card-header-row"><h2>Recent Issues</h2></div>
                <ul className="requests-list">
                  {issues.length === 0
                    ? <li style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No issues yet.</li>
                    : issues.slice(0, 5).map(issue => (
                      <li key={issue.id} className="request-item">
                        <div className="request-main">
                          <div className="request-meta">
                            <span className="request-id">#{issue.id.slice(0, 8)}</span>
                            <span className="request-requester">{new Date(issue.issuedAt).toLocaleDateString()}</span>
                          </div>
                          <div className="request-lines">
                            {issue.lines.map(l => `${l.item.name}: ${l.quantityIssued} issued / ${l.quantityReturned} returned`).join(' · ')}
                          </div>
                          {issue.lines.some(l => l.isOverdue) && <span className="badge badge-danger">Overdue</span>}
                        </div>
                      </li>
                    ))
                  }
                </ul>
              </div>
            </div>
          )}

          {/* ─── MY ISSUES TAB ─── */}
          {activeTab === 'My Issues' && (
            <div className="card">
              <div className="card-header-row"><h2>My Issued Items</h2></div>
              <ul className="requests-list">
                {issues.length === 0
                  ? <li style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No issues yet.</li>
                  : issues.map(issue => (
                    <li key={issue.id} className="request-item">
                      <div className="request-main">
                        <div className="request-meta">
                          <span className="request-id">#{issue.id.slice(0, 8)}</span>
                          <span className="request-requester">{new Date(issue.issuedAt).toLocaleDateString()}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>by {issue.issuedBy.name}</span>
                        </div>
                        {issue.lines.map(l => (
                          <div key={l.id} className="request-lines" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {l.item.name} — {l.quantityIssued} issued / {l.quantityReturned} returned
                            {l.isOverdue && <span className="badge badge-danger">OVERDUE</span>}
                            {l.dueDate && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Due: {new Date(l.dueDate).toLocaleDateString()}</span>}
                          </div>
                        ))}
                      </div>
                    </li>
                  ))
                }
              </ul>
            </div>
          )}

          {/* ─── RETURNS TAB ─── */}
          {activeTab === 'Returns' && (
            <div className="card" style={{ maxWidth: 600 }}>
              <div className="card-header-row"><h2>Return Desk</h2></div>
              <div className="stack-form">
                <div className="form-group">
                  <label>Issue ID</label>
                  <input id="return-issue-id" value={returnIssueId} onChange={e => setReturnIssueId(e.target.value)} placeholder="Paste issue ID…" />
                </div>
                <div className="form-group">
                  <label>Issue Line ID</label>
                  <input id="return-issue-line-id" value={returnIssueLineId} onChange={e => setReturnIssueLineId(e.target.value)} placeholder="Paste issue line ID…" />
                </div>
                <div className="inline-form">
                  <div className="form-group" style={{ maxWidth: 120 }}>
                    <label>Quantity</label>
                    <input id="return-qty" type="number" min={1} value={returnQty} onChange={e => setReturnQty(Number(e.target.value))} />
                  </div>
                  <div className="form-group">
                    <label>Condition</label>
                    <select id="return-condition" value={returnCondition} onChange={e => setReturnCondition(e.target.value as 'GOOD' | 'DAMAGED' | 'LOST')}>
                      <option value="GOOD">Good</option>
                      <option value="DAMAGED">Damaged</option>
                      <option value="LOST">Lost</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Reason <span style={{ color: 'var(--text-muted)' }}>(required for Damaged/Lost)</span></label>
                  <input id="return-reason" value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="Reason…" />
                </div>
                <button id="process-return-btn" className="primary" onClick={processReturn}>↩ Process Return</button>
              </div>
            </div>
          )}

          {/* ─── ITEMS TAB ─── */}
          {activeTab === 'Items' && (
            <div className="card" style={{ maxWidth: 600 }}>
              <div className="card-header-row"><h2>Create New Item</h2></div>
              <div className="stack-form">
                <div className="inline-form">
                  <div className="form-group">
                    <label>Item Code</label>
                    <input id="item-code" placeholder="e.g. CHALK-001" value={itemCode} onChange={e => setItemCode(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Item Name</label>
                    <input id="item-name" placeholder="e.g. White Chalk Box" value={itemName} onChange={e => setItemName(e.target.value)} />
                  </div>
                </div>
                <div className="inline-form">
                  <div className="form-group">
                    <label>Unit</label>
                    <input id="item-unit" placeholder="e.g. pcs, box, kg" value={itemUnit} onChange={e => setItemUnit(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Initial Stock</label>
                    <input id="item-initial-stock" type="number" min={0} value={itemInitialStock} onChange={e => setItemInitialStock(Number(e.target.value))} />
                  </div>
                  <div className="form-group">
                    <label>Type</label>
                    <select id="item-type" value={itemType} onChange={e => setItemType(e.target.value as 'CONSUMABLE' | 'RETURNABLE')}>
                      <option value="CONSUMABLE">Consumable</option>
                      <option value="RETURNABLE">Returnable</option>
                    </select>
                  </div>
                </div>
                <button id="create-item-btn" className="primary" onClick={createItem}>🏷️ Create Item</button>
              </div>
            </div>
          )}

          {/* ─── IMPORTS TAB ─── */}
          {activeTab === 'Imports' && (
            <div className="card">
              <div className="card-header-row"><h2>CSV Stock Import</h2></div>
              <div className="stack-form">
                <div className="inline-form">
                  <div className="form-group">
                    <label>Import Type</label>
                    <select id="import-type" value={importType} onChange={e => setImportType(e.target.value as 'opening' | 'invoice')}>
                      <option value="invoice">Invoice stock-in</option>
                      <option value="opening">Opening stock (one-time)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>File Name</label>
                    <input id="import-filename" value={importFileName} onChange={e => setImportFileName(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Paste CSV Data</label>
                  <textarea id="import-csv-data" value={csvData} onChange={e => setCsvData(e.target.value)} placeholder={importType === 'invoice' ? 'invoice_no,invoice_date,supplier_name,item_code,item_name,qty,unit_price' : 'item_code,item_name,qty,unit,type'} rows={8} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                </div>
                <button id="submit-import-btn" className="primary" onClick={submitImport}>📥 Import CSV</button>
              </div>
            </div>
          )}

          {/* ─── ADJUSTMENTS TAB ─── */}
          {activeTab === 'Adjustments' && (
            <div className="card" style={{ maxWidth: 600 }}>
              <div className="card-header-row"><h2>Stock Adjustment</h2></div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                Positive delta adds stock; negative delta removes stock. Reason is mandatory.
              </p>
              <div className="stack-form">
                <div className="form-group">
                  <label>Item</label>
                  <select id="adjust-item-select" value={adjustItemId} onChange={e => setAdjustItemId(e.target.value)}>
                    <option value="">Select an item…</option>
                    {stock.map(row => <option key={row.itemId} value={row.itemId}>{row.itemCode} — {row.itemName}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity Delta</label>
                  <input id="adjust-qty" type="number" value={adjustQty} onChange={e => setAdjustQty(Number(e.target.value))} placeholder="e.g. -5 or +10" />
                </div>
                <div className="form-group">
                  <label>Reason</label>
                  <input id="adjust-reason" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. Physical count correction" />
                </div>
                <div className="form-group">
                  <label>Admin Override Reason <span style={{ color: 'var(--text-muted)' }}>(if needed)</span></label>
                  <input id="adjust-override-reason" value={adjustOverrideReason} onChange={e => setAdjustOverrideReason(e.target.value)} placeholder="Override reason…" />
                </div>
                <button id="post-adjustment-btn" className="primary" onClick={createAdjustment}>⚖️ Post Adjustment</button>
              </div>
            </div>
          )}

          {/* ─── USERS & DEPARTMENTS TAB ─── */}
          {activeTab === 'Users & Departments' && (
            <div className="grid-2col">
              <div>
                <div className="card">
                  <div className="card-header-row"><h2>Departments</h2></div>
                  <div className="inline-form" style={{ marginBottom: '1.25rem' }}>
                    <div className="form-group">
                      <label>Department Name</label>
                      <input id="dept-name" value={newDepartmentName} onChange={e => setNewDepartmentName(e.target.value)} placeholder="e.g. Physics" />
                    </div>
                    <div className="form-group" style={{ justifyContent: 'flex-end', minWidth: 'auto' }}>
                      <label>&nbsp;</label>
                      <button id="create-dept-btn" className="primary" onClick={createDepartment}>+ Add</button>
                    </div>
                  </div>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {departments.map(d => (
                      <li key={d.id} style={{ padding: '0.6rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8, fontSize: '0.875rem', border: '1px solid var(--border-color)' }}>
                        🏛 {d.name}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="card">
                  <div className="card-header-row"><h2>Department Mapping</h2></div>
                  <div className="stack-form">
                    <div className="form-group">
                      <label>User</label>
                      <select id="map-user-select" value={mappedUserId} onChange={e => setMappedUserId(e.target.value)}>
                        <option value="">Select a user…</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Department</label>
                      <select id="map-dept-select" value={mappedDepartmentId} onChange={e => setMappedDepartmentId(e.target.value)}>
                        <option value="">No department</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <button id="update-mapping-btn" className="primary" onClick={updateUserDepartment}>Update Mapping</button>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header-row"><h2>Create User</h2></div>
                <div className="stack-form">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input id="new-user-name" value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="Jane Smith" />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input id="new-user-email" type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="jane@school.local" />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input id="new-user-password" type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="••••••••" />
                  </div>
                  <div className="inline-form">
                    <div className="form-group">
                      <label>Role</label>
                      <select id="new-user-role" value={newUserRole} onChange={e => setNewUserRole(e.target.value as User['role'])}>
                        <option value="ADMIN">Admin</option>
                        <option value="STOREKEEPER">Storekeeper</option>
                        <option value="TEACHER">Teacher</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Department</label>
                      <select id="new-user-dept" value={newUserDepartmentId} onChange={e => setNewUserDepartmentId(e.target.value)}>
                        <option value="">No department</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <button id="create-user-btn" className="primary" onClick={createUser}>👤 Create User</button>
                </div>

                <div className="table-wrapper" style={{ marginTop: '1.5rem' }}>
                  <table>
                    <thead>
                      <tr><th>Name</th><th>Role</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 600 }}>{u.name}<br /><span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.email}</span></td>
                          <td><span className={`badge ${u.role === 'ADMIN' ? 'badge-danger' : u.role === 'STOREKEEPER' ? 'badge-warning' : 'badge-info'}`}>{u.role}</span></td>
                          <td><span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── LIMITS TAB ─── */}
          {activeTab === 'Limits' && (
            <div className="grid-2col">
              <div className="card">
                <div className="card-header-row"><h2>Create Limit Rule</h2></div>
                <div className="stack-form">
                  <div className="form-group">
                    <label>Rule Name</label>
                    <input id="limit-name" value={limitName} onChange={e => setLimitName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Applies to User <span style={{ color: 'var(--text-muted)' }}>(optional — blank = all users)</span></label>
                    <select id="limit-user-select" value={limitUserId} onChange={e => setLimitUserId(e.target.value)}>
                      <option value="">All users</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Applies to Item <span style={{ color: 'var(--text-muted)' }}>(optional — blank = all items)</span></label>
                    <select id="limit-item-select" value={limitItemId} onChange={e => setLimitItemId(e.target.value)}>
                      <option value="">All items</option>
                      {stock.map(row => <option key={row.itemId} value={row.itemId}>{row.itemCode} — {row.itemName}</option>)}
                    </select>
                  </div>
                  <div className="inline-form">
                    <div className="form-group">
                      <label>Max Quantity</label>
                      <input id="limit-max-qty" type="number" min={1} value={limitMaxQuantity} onChange={e => setLimitMaxQuantity(Number(e.target.value))} />
                    </div>
                    <div className="form-group">
                      <label>Period</label>
                      <select id="limit-period-select" value={limitPeriod} onChange={e => setLimitPeriod(e.target.value as 'WEEKLY' | 'MONTHLY' | 'TERM')}>
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                        <option value="TERM">Term</option>
                      </select>
                    </div>
                  </div>
                  <button id="create-limit-btn" className="primary" onClick={createLimit}>🚦 Create Rule</button>
                </div>
              </div>

              <div className="card">
                <div className="card-header-row"><h2>Active Rules</h2></div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>Name</th><th>Period</th><th>Max</th><th>User</th><th>Item</th></tr>
                    </thead>
                    <tbody>
                      {limitRules.length === 0
                        ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No limit rules yet.</td></tr>
                        : limitRules.map(rule => (
                          <tr key={rule.id}>
                            <td style={{ fontWeight: 600 }}>{rule.name}</td>
                            <td><span className="badge badge-info">{rule.period}</span></td>
                            <td>{rule.maxQuantity}</td>
                            <td>{rule.user ? rule.user.name : <span style={{ color: 'var(--text-muted)' }}>All users</span>}</td>
                            <td>{rule.item ? `${rule.item.code}` : <span style={{ color: 'var(--text-muted)' }}>All items</span>}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── REPORTS TAB ─── */}
          {activeTab === 'Reports' && (
            <div className="card">
              <div className="card-header-row"><h2>Reports</h2></div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <button id="report-current-stock" onClick={() => loadReport('/reports/current-stock')}>📦 Current Stock</button>
                <button id="report-low-stock" onClick={() => loadReport('/reports/low-stock')}>⚠ Low Stock</button>
                <button id="report-user-issued" onClick={() => loadReport('/reports/user-wise-issued')}>👤 User-wise Issued</button>
                <button id="report-dept-consumption" onClick={() => loadReport('/reports/department-wise-consumption')}>🏛 Dept. Consumption</button>
                <button id="report-monthly-usage" onClick={() => loadReport('/reports/monthly-usage-loss')}>📅 Monthly Usage/Loss</button>
              </div>
              {reportData.length > 0 && (
                <pre className="report-pre">{JSON.stringify(reportData, null, 2)}</pre>
              )}
              {reportData.length === 0 && (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Select a report to view data.</p>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ─── TOAST ─── */}
      {message && (
        <div className="toast-container">
          <div className="toast">
            <div className="toast-indicator" style={{ backgroundColor: messageType === 'error' ? '#ef4444' : messageType === 'success' ? '#10b981' : '#6366f1' }} />
            {message}
          </div>
        </div>
      )}
    </div>
  );
};
