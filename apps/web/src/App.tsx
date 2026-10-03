import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  CreditCard,
  Download,
  Filter,
  Leaf,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { PublicUser, TransactionItem } from "@boss-bank/shared";
import { api, ApiError, type DashboardData, type TransactionPage } from "./api.js";

type Page = "overview" | "activity" | "admin";
type Overlay = "deposit" | "transfer" | null;

const formatWhole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const formatSsp = (minor: string | bigint) => {
  const value = BigInt(minor);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `SSP ${negative ? "-" : ""}${formatWhole.format(absolute / 100n)}.${String(absolute % 100n).padStart(2, "0")}`;
};

function amountToMinor(amount: string) {
  const match = /^(\d{1,16})(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new Error("Enter a valid amount with up to two decimal places.");
  const minor = BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (minor <= 0n) throw new Error("Amount must be greater than zero.");
  return minor.toString();
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(date));
}

function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [page, setPage] = useState<Page>("overview");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);

  async function loadDashboard() {
    const [me, data] = await Promise.all([
      api<{ user: PublicUser }>("/auth/me"),
      api<DashboardData>("/dashboard"),
    ]);
    setUser(me.user);
    setDashboard(data);
  }

  useEffect(() => {
    loadDashboard().catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    setDashboard(null);
    setPage("overview");
  }

  async function afterMoneyMovement(message: string) {
    setOverlay(null);
    setNotice(message);
    await loadDashboard();
    if (page === "activity") window.dispatchEvent(new Event("boss-bank-refresh-activity"));
  }

  if (loading) return <div className="boot-screen"><div className="brand-mark"><Command size={20} /></div><span>Opening your wallet</span></div>;
  if (!user) return <AuthScreen onLogin={(nextUser) => { setUser(nextUser); loadDashboard().catch(() => setUser(null)); }} />;

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={(next) => { setPage(next); setMobileNav(false); }} user={user} onLogout={logout} mobileOpen={mobileNav} />
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" title="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Menu size={19} /></button>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{page === "overview" ? "Overview" : page === "activity" ? "Activity" : "Administration"}</strong></div>
          <div className="topbar-right">
            <span className="env-pill"><span /> Development wallet</span>
            <button className="icon-button notification-button" title="Notifications"><Bell size={18} /><i /></button>
            <button className="profile-chip" onClick={() => setNotice("Signed in as " + user.email)}><span className="avatar">{initials(user.name)}</span><span className="profile-name">{user.name.split(" ")[0]}</span><ChevronDown size={14} /></button>
          </div>
        </header>

        <div className="content-wrap">
          {page === "overview" && dashboard && <Overview user={user} dashboard={dashboard} openOverlay={setOverlay} navigate={setPage} />}
          {page === "activity" && <ActivityPage />}
          {page === "admin" && user.role === "ADMIN" && <AdminPage />}
          {page === "admin" && user.role !== "ADMIN" && <section className="empty-state"><ShieldCheck size={28} /><h2>Admin access required</h2><p>This area is reserved for administrators.</p></section>}
        </div>
      </main>

      {overlay && <MoneyModal type={overlay} close={() => setOverlay(null)} user={user} onSuccess={afterMoneyMovement} />}
      {notice && <div className="toast"><span className="toast-check"><Check size={15} /></span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  );
}

function Sidebar({ page, setPage, user, onLogout, mobileOpen }: { page: Page; setPage: (page: Page) => void; user: PublicUser; onLogout: () => void; mobileOpen: boolean }) {
  return <>
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <a className="brand-lockup" href="#overview" onClick={(event) => { event.preventDefault(); setPage("overview"); }}><span className="brand-mark"><Command size={19} /></span><span>boss<span className="brand-light">bank</span></span><span className="brand-dot">.</span></a>
      <div className="side-label">MENU</div>
      <nav className="side-nav" aria-label="Main navigation">
        <NavButton active={page === "overview"} onClick={() => setPage("overview")} icon={<Command size={18} />} label="Overview" />
        <NavButton active={page === "activity"} onClick={() => setPage("activity")} icon={<ArrowLeftRight size={18} />} label="Activity" />
        {user.role === "ADMIN" && <NavButton active={page === "admin"} onClick={() => setPage("admin")} icon={<Users size={18} />} label="Administration" />}
      </nav>
      <div className="sidebar-bottom">
        <div className="support-card"><div className="support-icon"><CircleHelp size={17} /></div><strong>Need a hand?</strong><span>We’re here when you need us.</span><button onClick={() => window.open("mailto:support@bossbank.local")}>Get support <ArrowRight size={14} /></button></div>
        <div className="side-account"><span className="avatar avatar-small">{initials(user.name)}</span><div className="side-account-copy"><strong>{user.name}</strong><span>{user.role === "ADMIN" ? "Administrator" : "Member account"}</span></div><button className="icon-button side-logout" title="Sign out" onClick={onLogout}><LogOut size={17} /></button></div>
      </div>
    </aside>
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setPage(page)} />}
  </>;
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button className={`nav-item ${active ? "nav-item-active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{active && <span className="nav-active-dot" />}</button>;
}

function Overview({ user, dashboard, openOverlay, navigate }: { user: PublicUser; dashboard: DashboardData; openOverlay: (overlay: Overlay) => void; navigate: (page: Page) => void }) {
  const thisMonth = new Intl.DateTimeFormat("en", { month: "long" }).format(new Date());
  return <div className="page page-overview">
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR MONEY, IN VIEW</div><h1>Good morning, {firstName(user.name)}<span className="heading-period">.</span></h1><p>A little clarity goes a long way. Here’s your wallet at a glance.</p></div><div className="heading-date"><Clock3 size={15} /> {new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</div></div>

    <section className="hero-grid">
      <div className="balance-panel">
        <div className="balance-top"><div className="balance-label"><span className="balance-icon"><Wallet size={16} /></span> TOTAL WALLET BALANCE</div><button className="text-button balance-menu" title="Wallet details" onClick={() => navigator.clipboard?.writeText(user.accountNumber)}><MoreHorizontal size={21} /></button></div>
        <div className="balance-amount">{formatSsp(dashboard.balanceMinor)}</div>
        <div className="account-line"><span>SSP wallet</span><span className="account-divider" /><button onClick={() => navigator.clipboard?.writeText(user.accountNumber)} title="Copy account number">{user.accountNumber} <Download size={13} /></button><span className="copy-hint">Copy account number</span></div>
        <div className="balance-bottom"><span><span className="live-dot" /> Updated just now</span><span className="balance-note">Available to transfer</span></div>
        <div className="balance-orbit orbit-one" /><div className="balance-orbit orbit-two" />
      </div>
      <div className="action-panel">
        <div className="panel-overline">QUICK ACTIONS</div>
        <div className="action-buttons">
          <button className="action-tile action-primary" onClick={() => openOverlay("transfer")}><span className="action-icon"><Send size={18} /></span><span><strong>Send money</strong><small>To a Boss Bank account</small></span><ArrowRight className="action-arrow" size={16} /></button>
          {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEVELOPMENT_DEPOSITS === "true") && <button className="action-tile" onClick={() => openOverlay("deposit")}><span className="action-icon action-icon-light"><Plus size={20} /></span><span><strong>Add funds</strong><small>Development deposit</small></span><ArrowRight className="action-arrow" size={16} /></button>}
          <button className="action-tile" onClick={() => navigate("activity")}><span className="action-icon action-icon-light"><ArrowLeftRight size={18} /></span><span><strong>View activity</strong><small>Your complete history</small></span><ArrowRight className="action-arrow" size={16} /></button>
        </div>
        <div className="action-footnote"><ShieldCheck size={14} /> Transfers are recorded securely</div>
      </div>
    </section>

    <section className="stat-row" aria-label="This month at a glance">
      <StatCard label="MONEY IN" amount={dashboard.moneyInMinor} detail={`Received in ${thisMonth}`} icon={<ArrowDownLeft size={17} />} variant="mint" />
      <StatCard label="MONEY OUT" amount={dashboard.moneyOutMinor} detail={`Sent in ${thisMonth}`} icon={<ArrowUpRight size={17} />} variant="peach" />
      <div className="stat-note"><div className="stat-note-icon"><Sparkles size={16} /></div><div><strong>Keep it intentional.</strong><span>Your wallet is looking good. Every SSP is accounted for.</span></div></div>
    </section>

    <section className="dashboard-columns">
      <div className="section-column">
        <div className="section-head"><div><h2>Cash flow</h2><p>Your wallet activity over the last 6 months</p></div><span className="chart-legend"><i className="legend-in" /> In <i className="legend-out" /> Out</span></div>
        <CashFlowChart chart={dashboard.chart} />
      </div>
      <div className="section-column categories-column">
        <div className="section-head"><div><h2>Where it goes</h2><p>Your spending, by category</p></div><button className="subtle-icon" title="Categories"><SlidersHorizontal size={16} /></button></div>
        <CategoryBreakdown categories={dashboard.categories} />
      </div>
    </section>

    <section className="transactions-section">
      <div className="section-head transactions-heading"><div><h2>Recent activity</h2><p>The latest from your SSP wallet</p></div><button className="view-all" onClick={() => navigate("activity")}>All activity <ArrowRight size={15} /></button></div>
      {dashboard.recent.length ? <TransactionList transactions={dashboard.recent} /> : <EmptyTransactions />}
    </section>
    <footer className="page-footer"><span><Leaf size={14} /> Built for everyday clarity</span><span>Boss Bank · Development wallet</span></footer>
  </div>;
}

function StatCard({ label, amount, detail, icon, variant }: { label: string; amount: string; detail: string; icon: ReactNode; variant: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${variant}`}>{icon}</span></div><strong>{formatSsp(amount)}</strong><small>{detail}</small></div>;
}

function CashFlowChart({ chart }: { chart: DashboardData["chart"] }) {
  const max = chart.reduce((largest, month) => {
    const candidate = [BigInt(month.inMinor), BigInt(month.outMinor)].reduce((a, b) => a > b ? a : b, 0n);
    return candidate > largest ? candidate : largest;
  }, 0n);
  return <div className="cash-chart" aria-label="Monthly incoming and outgoing wallet amounts">
    <div className="chart-scale"><span>{formatSsp(max)}</span><span>{formatSsp(max / 2n)}</span><span>SSP 0.00</span></div>
    <div className="chart-plot">{chart.map((month) => {
      const inHeight = max > 0n ? Number(BigInt(month.inMinor) * 100n / max) : 0;
      const outHeight = max > 0n ? Number(BigInt(month.outMinor) * 100n / max) : 0;
      return <div className="chart-month" key={month.label}><div className="chart-bars"><div className="bar-pair"><span className="chart-bar bar-in" style={{ height: `${Math.max(inHeight, month.inMinor === "0" ? 0 : 3)}%` }} title={`In ${formatSsp(month.inMinor)}`} /><span className="chart-bar bar-out" style={{ height: `${Math.max(outHeight, month.outMinor === "0" ? 0 : 3)}%` }} title={`Out ${formatSsp(month.outMinor)}`} /></div></div><span className="month-label">{month.label}</span></div>;
    })}</div>
  </div>;
}

const categoryColors = ["#347562", "#d9865b", "#d4b667", "#7a9c87", "#a8aaa0"];

function CategoryBreakdown({ categories }: { categories: DashboardData["categories"] }) {
  const total = categories.reduce((sum, category) => sum + BigInt(category.amountMinor), 0n);
  let accumulated = 0;
  const segments = categories.map((category, index) => {
    const slice = total ? Number(BigInt(category.amountMinor) * 10000n / total) / 100 : 0;
    const segment = `${categoryColors[index % categoryColors.length]} ${accumulated}% ${accumulated + slice}%`;
    accumulated += slice;
    return segment;
  });
  return <div className="category-content">
    <div className="donut-wrap"><div className="donut" style={{ background: segments.length ? `conic-gradient(${segments.join(", ")})` : "conic-gradient(#e8e9e1 0 100%)" }}><div className="donut-center"><strong>{categories.length}</strong><span>categories</span></div></div></div>
    <div className="category-list">{categories.length ? categories.map((category, index) => <div className="category-row" key={category.name}><span className="category-swatch" style={{ backgroundColor: categoryColors[index % categoryColors.length] }} /><span className="category-name">{category.name}</span><strong>{formatSsp(category.amountMinor)}</strong></div>) : <p className="no-categories">Spending categories will appear after your first transfer.</p>}</div>
  </div>;
}

function TransactionList({ transactions }: { transactions: TransactionItem[] }) {
  return <div className="transaction-list">{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</div>;
}

function TransactionRow({ transaction }: { transaction: TransactionItem }) {
  const incoming = transaction.direction === "in";
  return <div className="transaction-row"><span className={`transaction-icon ${incoming ? "transaction-in" : "transaction-out"}`}>{incoming ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</span><div className="transaction-primary"><strong>{transaction.memo || (incoming ? "Money received" : "Transfer sent")}</strong><small>{incoming ? "From" : "To"} {transaction.counterparty}{transaction.category ? <span className="transaction-category"> · {transaction.category}</span> : null}</small></div><span className="transaction-date">{shortDate(transaction.createdAt)}</span><strong className={`transaction-amount ${incoming ? "amount-in" : ""}`}>{incoming ? "+" : "−"}{formatSsp(transaction.amountMinor)}</strong><span className="status-check"><Check size={13} /></span></div>;
}

function EmptyTransactions() {
  return <div className="empty-transactions"><span><ArrowLeftRight size={19} /></span><strong>Nothing moving yet</strong><p>Once you make a deposit or transfer, it’ll show up here.</p></div>;
}

function ActivityPage() {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [direction, setDirection] = useState("");
  const [sort, setSort] = useState("newest");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    const params = new URLSearchParams({ sort, limit: "50" });
    if (query.trim()) params.set("search", query.trim());
    if (kind) params.set("kind", kind);
    if (direction) params.set("direction", direction);
    try {
      const result = await api<TransactionPage>(`/transactions?${params}`);
      setTransactions(result.transactions);
      setError("");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Activity could not be loaded");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, [kind, direction, sort]);
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("boss-bank-refresh-activity", handler);
    return () => window.removeEventListener("boss-bank-refresh-activity", handler);
  }, [kind, direction, sort, query]);

  return <div className="page activity-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> THE FULL PICTURE</div><h1>Activity<span className="heading-period">.</span></h1><p>Every transfer and development deposit, all in one place.</p></div><button className="export-button" onClick={() => downloadCsv(transactions)}><Download size={16} /> Export CSV</button></div>
    <div className="activity-toolbar"><form className="search-box" onSubmit={(event) => { event.preventDefault(); void load(); }}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, account or note" aria-label="Search transactions" /><button type="submit" className="search-submit" title="Search"><ArrowRight size={15} /></button></form><label className="select-filter"><Filter size={15} /><select value={direction} onChange={(event) => setDirection(event.target.value)} aria-label="Filter by direction"><option value="">All activity</option><option value="in">Money in</option><option value="out">Money out</option></select></label><label className="select-filter"><CreditCard size={15} /><select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Filter by type"><option value="">All types</option><option value="TRANSFER">Transfers</option><option value="DEPOSIT">Deposits</option></select></label><label className="select-filter"><SlidersHorizontal size={15} /><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort activity"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount-high">Amount: high to low</option><option value="amount-low">Amount: low to high</option></select></label></div>
    <div className="activity-summary"><span>{busy ? "Loading activity…" : `${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"}`}</span><span><ShieldCheck size={14} /> Secure ledger</span></div>
    <section className="activity-table"><div className="activity-table-head"><span>TRANSACTION</span><span>DATE</span><span>TYPE</span><span>AMOUNT</span><span>STATUS</span></div>{error ? <div className="inline-error">{error}</div> : busy ? <div className="loading-row">Loading your activity…</div> : transactions.length ? transactions.map((transaction) => <div className="activity-table-row" key={transaction.id}><div className="activity-table-transaction"><span className={`transaction-icon ${transaction.direction === "in" ? "transaction-in" : "transaction-out"}`}>{transaction.direction === "in" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div><strong>{transaction.memo || (transaction.direction === "in" ? "Money received" : "Transfer sent")}</strong><small>{transaction.counterparty}{transaction.accountNumber ? ` · ${transaction.accountNumber}` : ""}</small></div></div><span className="table-date">{shortDate(transaction.createdAt)}</span><span className="type-pill">{transaction.kind === "DEPOSIT" ? "Deposit" : transaction.category ?? "Transfer"}</span><strong className={`table-amount ${transaction.direction === "in" ? "amount-in" : ""}`}>{transaction.direction === "in" ? "+" : "−"}{formatSsp(transaction.amountMinor)}</strong><span className="complete-status"><Check size={13} /> Complete</span></div>) : <div className="activity-empty"><ArrowLeftRight size={22} /><strong>No activity found</strong><span>Try adjusting the search or filters.</span></div>}</section>
    <p className="activity-disclaimer"><ShieldCheck size={14} /> This is a development wallet. Activity is simulated and does not move real money.</p>
  </div>;
}

function AdminPage() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [wallets, setWallets] = useState<Array<{ id: string; accountNumber: string; balanceMinor: string; currency: string; user: { name: string; email: string; status: string } }>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    try {
      const [userResponse, walletResponse] = await Promise.all([api<{ users: PublicUser[] }>("/admin/users"), api<{ wallets: typeof wallets }>("/admin/wallets")]);
      setUsers(userResponse.users);
      setWallets(walletResponse.wallets);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Admin data could not be loaded");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);
  async function setStatus(user: PublicUser, status: "ACTIVE" | "SUSPENDED") {
    try {
      await api(`/admin/users/${user.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Status could not be changed");
    }
  }
  return <div className="page admin-page"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> OPERATIONS</div><h1>Administration<span className="heading-period">.</span></h1><p>Member access and wallet balances across Boss Bank.</p></div><span className="admin-badge"><ShieldCheck size={15} /> ADMIN VIEW</span></div>
    {error && <div className="inline-error">{error}</div>}
    <div className="admin-stats"><div><span>MEMBERS</span><strong>{loading ? "—" : users.length}</strong><small>Registered accounts</small></div><div><span>ACTIVE WALLETS</span><strong>{loading ? "—" : wallets.length}</strong><small>One per member</small></div><div><span>IN CIRCULATION</span><strong>{loading ? "—" : formatSsp(wallets.reduce((sum, wallet) => sum + BigInt(wallet.balanceMinor), 0n))}</strong><small>Aggregate SSP balance</small></div></div>
    <section className="admin-table-wrap"><div className="admin-table-title"><div><h2>Members</h2><p>Manage wallet access and account status</p></div><span>{users.length} total</span></div><div className="admin-table-head"><span>MEMBER</span><span>ACCOUNT</span><span>WALLET BALANCE</span><span>STATUS</span><span>ACTION</span></div>{loading ? <div className="loading-row">Loading members…</div> : users.map((member) => <div className="admin-table-row" key={member.id}><div className="admin-member"><span className="avatar avatar-small">{initials(member.name)}</span><div><strong>{member.name}</strong><small>{member.email}</small></div></div><span className="mono-number">{member.accountNumber}</span><strong>{formatSsp(member.balanceMinor)}</strong><span className={`member-status ${member.status === "ACTIVE" ? "status-active" : "status-suspended"}`}><i /> {member.status === "ACTIVE" ? "Active" : "Suspended"}</span><button className={`member-action ${member.status === "ACTIVE" ? "suspend-action" : "activate-action"}`} onClick={() => void setStatus(member, member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")}>{member.status === "ACTIVE" ? "Suspend" : "Reactivate"}</button></div>)}</section>
    <p className="activity-disclaimer"><ShieldCheck size={14} /> All account status changes are recorded in the audit log. Wallet balances are read-only here.</p>
  </div>;
}

function MoneyModal({ type, close, user, onSuccess }: { type: Exclude<Overlay, null>; close: () => void; user: PublicUser; onSuccess: (message: string) => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [category, setCategory] = useState("Other");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isDeposit = type === "deposit";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const amountMinor = amountToMinor(amount);
      if (isDeposit) {
        await api("/wallet/deposits", { method: "POST", body: JSON.stringify({ amountMinor, memo: memo.trim() || "Development deposit" }) });
        await onSuccess("Development deposit added to your wallet");
      } else {
        await api("/transfers", { method: "POST", body: JSON.stringify({ accountNumber: accountNumber.trim().toUpperCase(), amountMinor, memo: memo.trim() || undefined, category }) });
        await onSuccess("Transfer sent successfully");
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "The request could not be completed");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") close(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="money-modal" role="dialog" aria-modal="true" aria-labelledby="money-modal-title"><div className="modal-top"><span className={`modal-icon ${isDeposit ? "modal-deposit-icon" : "modal-transfer-icon"}`}>{isDeposit ? <Plus size={19} /> : <Send size={18} />}</span><button className="icon-button" title="Close" onClick={close}><X size={19} /></button></div><div className="modal-eyebrow">{isDeposit ? "DEVELOPMENT MODE" : "SECURE TRANSFER"}</div><h2 id="money-modal-title">{isDeposit ? "Add funds" : "Send money"}</h2><p>{isDeposit ? "Simulate a deposit to your SSP wallet. No real funds are involved." : "Send SSP instantly to another Boss Bank wallet."}</p><div className="modal-balance"><span>Available balance</span><strong>{formatSsp(user.balanceMinor)}</strong></div><form onSubmit={submit}>
    {!isDeposit && <label className="field-label">Recipient account number<input autoFocus value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.toUpperCase())} placeholder="BB0000000000" maxLength={12} autoComplete="off" required /><small>12 characters, starting with BB</small></label>}
    <label className="field-label">Amount<div className="amount-input-wrap"><span>SSP</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" autoFocus={isDeposit} required /><small>SSP</small></div></label>
    {!isDeposit && <label className="field-label">Spending category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Other</option><option>Home</option><option>Food</option><option>Transport</option><option>Family</option></select></label>}
    <label className="field-label">Note <span className="optional-label">OPTIONAL</span><input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder={isDeposit ? "What is this deposit for?" : "Add a note for this transfer"} maxLength={140} /></label>
    {error && <div className="form-error">{error}</div>}
    <button className="modal-submit" type="submit" disabled={submitting}>{submitting ? "Processing…" : isDeposit ? "Add development funds" : "Review and send"}<ArrowRight size={16} /></button>
  </form><div className="modal-security"><ShieldCheck size={14} /> Encrypted and recorded in your ledger</div></section></div>;
}

function AuthScreen({ onLogin }: { onLogin: (user: PublicUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { name, email, password };
      const result = await api<{ user: PublicUser }>(path, { method: "POST", body: JSON.stringify(body) });
      onLogin(result.user);
    } catch (issue) {
      const validation = issue instanceof ApiError && issue.code === "VALIDATION_ERROR";
      setError(validation && mode === "register" ? "Use a name with at least 2 characters and a password with at least 10 characters." : issue instanceof Error ? issue.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page"><div className="auth-left"><div className="auth-brand"><span className="brand-mark"><Command size={19} /></span><span>boss<span className="brand-light">bank</span></span><span className="brand-dot">.</span></div><div className="auth-story"><div className="eyebrow"><span className="eyebrow-line" /> A CLEARER KIND OF BANKING</div><h1>Your money.<br /><em>Your move.</em></h1><p>A thoughtful little wallet for the things that matter. Keep your SSP close, clear, and completely in your hands.</p><div className="auth-points"><span><span><BadgeCheck size={16} /></span> Made for real life</span><span><span><ShieldCheck size={16} /></span> Private by design</span></div></div><div className="auth-left-bottom"><span>INDEPENDENT BY DESIGN</span><span>01 — 03</span></div><div className="auth-stamp"><Leaf size={23} /><span>Made to<br />move with you</span></div></div><div className="auth-right"><div className="auth-panel"><div className="auth-panel-top"><span>{mode === "login" ? "WELCOME BACK" : "A GOOD PLACE TO START"}</span><div className="auth-steps"><i className="step-on" /><i /><i /></div></div><h2>{mode === "login" ? "Sign in to your wallet" : "Create your wallet"}</h2><p>{mode === "login" ? "Your next chapter starts right where you left it." : "One account. One SSP wallet. Set up in a moment."}</p><form onSubmit={submit} className="auth-form">
      {mode === "register" && <label className="field-label">Your name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Amara Deng" autoComplete="name" required minLength={2} maxLength={80} /></label>}
      <label className="field-label">Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required maxLength={254} /></label>
      <label className="field-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "login" ? "Enter your password" : "At least 10 characters"} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 10} maxLength={128} /></label>
      {error && <div className="form-error">{error}</div>}
      <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Just a moment…" : mode === "login" ? "Sign in" : "Create wallet"}<ArrowRight size={16} /></button>
    </form><div className="auth-switch">{mode === "login" ? "New to Boss Bank?" : "Already have an account?"}<button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create a wallet" : "Sign in"}</button></div><div className="auth-fineprint"><ShieldCheck size={14} /> A development-only digital wallet. No real money moves here.</div></div><div className="auth-footer"><span>© 2026 BOSS BANK</span><span>PRIVACY&nbsp;&nbsp; · &nbsp;&nbsp;TERMS</span></div></div></main>;
}

function downloadCsv(transactions: TransactionItem[]) {
  const rows = [["Date", "Direction", "Type", "Counterparty", "Account", "Category", "Memo", "Amount (minor units)"]];
  transactions.forEach((transaction) => rows.push([transaction.createdAt, transaction.direction, transaction.kind, transaction.counterparty, transaction.accountNumber ?? "", transaction.category ?? "", transaction.memo ?? "", transaction.amountMinor]));
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "boss-bank-activity.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

export default App;