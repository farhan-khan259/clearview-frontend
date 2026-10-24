import React, { useState, useEffect, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ClipboardList,
  Wallet,
  Receipt,
  BarChart3,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  ChevronRight,
  Eye,
  LogOut,
  RefreshCw,
  WifiOff,
  Printer,
  X,
  Check,
  Clock,
  Stethoscope,
  ShieldCheck,
  Download,
  AlertCircle,
  Menu,
  ArrowLeft,
  SlidersHorizontal,
} from "lucide-react";
import {
  type Patient,
  type Visit,
  type Payment,
  type Expense,
  type Fee,
  type PrintConfig,
  type Entity,
  can,
  pkr,
  dayInPKT,
  newId,
  patientNumber,
  applicableFee,
  defaultPrint,
  totals,
  charge,
  received,
  statuses,
  schemas,
} from "@clearview/shared";
import * as store from "./store";
import { printPatient } from "./print";
import "./style.css";
const today = () => dayInPKT(new Date());
const now = () => new Date().toISOString();
const dateLabel = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi",
  });
const timeLabel = (d: string) =>
  new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  });
const initials = (s: string) =>
  s
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
let notify: (s: string) => void = () => {};
const act = async (fn: () => Promise<any>) => {
  try {
    await fn();
  } catch (e: any) {
    notify(e.message);
  }
};
function Field({ label, children }: any) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({
  title = "No records yet",
  detail = "Records will appear here as your clinic starts its day.",
  action,
}: any) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <ClipboardList size={27} />
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
function Badge({ status }: any) {
  return (
    <span className={"badge " + status}>{status.replaceAll("_", " ")}</span>
  );
}
function Modal({ title, children, onClose, wide = false }: any) {
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function App() {
  const vault = useSyncExternalStore(store.subscribe, store.getVault);
  const [page, setPage] = useState("Overview"),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<any>(null),
    [profile, setProfile] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [mobileNav, setMobileNav] = useState(false);
  const [from, setFrom] = useState(today()),
    [to, setTo] = useState(today());
  notify = setToast;
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (vault) void store.sync();
  }, [!!vault]);
  if (!vault)
    return (
      <>
        <Login />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </>
    );
  const user = vault.user,
    financial = can(user, "financial"),
    clinical = can(user, "clinical"),
    expenseAllowed = can(user, "expenses");
  const rows = (e: Entity) =>
    vault.rows
      .filter((r) => r.entity === e)
      .map((r) => ({ ...r.data, version: r.version }));
  const patients = rows("patients") as Patient[],
    visits = rows("visits") as Visit[],
    payments = rows("payments") as Payment[],
    expenses = rows("expenses") as Expense[],
    fees = rows("fees") as Fee[];
  const print = (rows("settings")[0] || defaultPrint) as PrintConfig;
  const name = (id: string) =>
    patients.find((p) => p.id === id)?.name || "Patient unavailable";
  const pv = (v: Visit) => patients.find((p) => p.id === v.patientId);
  const range = (d: string) => dayInPKT(d) >= from && dayInPKT(d) <= to;
  const periodVisits = visits.filter((v) => range(v.scheduledAt));
  const periodPayments = payments.filter((p) => range(p.createdAt));
  const periodExpenses = expenses.filter((e) => e.date >= from && e.date <= to);
  const summary = totals(periodVisits, periodPayments, periodExpenses);
  const waiting = periodVisits.filter((v) => v.status === "waiting"),
    inRoom = periodVisits.filter((v) => v.status === "in_consultation");
  const completed = periodVisits.filter((v) => v.status === "completed");
  const nav = [
    ["Overview", LayoutDashboard],
    ["Patients", Users],
    ["Appointments", CalendarDays],
    ["Consultations", Stethoscope],
    ...(financial ? [["Payments", Wallet]] : []),
    ...(expenseAllowed ? [["Expenses", Receipt]] : []),
    ["Reports", BarChart3],
    ["Settings", Settings],
  ] as any[];
  const navigate = (p: string) => {
    setPage(p);
    setProfile(null);
    setQuery("");
    setMobileNav(false);
  };
  async function saveVisit(v: any) {
    const parsed = schemas.visits.parse({
      fee: 0,
      discount: 0,
      waived: false,
      ...v,
    });
    await store.save("visits", parsed);
    setModal(null);
    setToast("Visit saved on this device");
  }
  const statusVisit = (v: Visit, status: Visit["status"]) =>
    act(async () => {
      if (status === "cancelled") {
        setModal({ kind: "cancel", visit: v });
        return;
      }
      await saveVisit({ ...v, status });
    });
  const printRecord = (p: Patient, date?: string) => {
    try {
      printPatient(p, print, date);
    } catch (e: any) {
      setToast(e.message);
    }
  };
  const openVisit = (v: Visit) => setModal({ kind: "consult", visit: v });
  function visitTable(list: Visit[], compact = false) {
    return !list.length ? (
      <Empty
        title="Your schedule is clear"
        detail="Add a walk-in or schedule a visit to get started."
        action={
          <button
            className="btn secondary"
            onClick={() => setModal({ kind: "visit" })}
          >
            <Plus size={15} /> Add appointment
          </button>
        }
      />
    ) : (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>{compact ? "Time" : "Appointment"}</th>
              <th>Visit type</th>
              <th>Status</th>
              <th className="align-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {list
              .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
              .map((v) => (
                <tr key={v.id}>
                  <td>
                    <button
                      className="patient-link"
                      onClick={() => {
                        setProfile(v.patientId);
                        setPage("Patients");
                      }}
                    >
                      <span className="avatar">
                        {initials(name(v.patientId))}
                      </span>
                      <span>
                        <strong>{name(v.patientId)}</strong>
                        <small>{pv(v)?.patientNumber.slice(0, 15)}…</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    {!compact && <small>{dateLabel(v.scheduledAt)}</small>}
                    <span>{timeLabel(v.scheduledAt)}</span>
                  </td>
                  <td>
                    <span className={"type " + v.type}>
                      {v.type === "new" ? "New patient" : "Follow-up"}
                    </span>
                  </td>
                  <td>
                    <Badge status={v.status} />
                  </td>
                  <td className="align-right">
                    <div className="row-actions">
                      {["scheduled", "waiting"].includes(v.status) && (
                        <button
                          className="text-btn"
                          onClick={() => statusVisit(v, "in_consultation")}
                        >
                          Start <ArrowUpRight size={14} />
                        </button>
                      )}
                      {v.status === "in_consultation" && (
                        <button
                          className="text-btn"
                          onClick={() => openVisit(v)}
                        >
                          Open <ChevronRight size={14} />
                        </button>
                      )}
                      {v.status === "completed" && (
                        <button
                          className="text-btn"
                          onClick={() => openVisit(v)}
                        >
                          View <ChevronRight size={14} />
                        </button>
                      )}
                      <button
                        aria-label="More visit options"
                        className="icon-btn"
                        onClick={() => setModal({ kind: "visit", visit: v })}
                      >
                        <SlidersHorizontal size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  }
  const filtered = patients.filter((p) =>
    [p.name, p.patientNumber, p.phone].some((x) =>
      x.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  return (
    <div className="app-shell">
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="brand-mark">
            <Eye size={25} />
          </span>
          <div>
            clearview<span>EYE CLINIC WORKSPACE</span>
          </div>
        </div>
        <div className="clinic-card">
          <div className="clinic-avatar">AQ</div>
          <div>
            <strong>Dr. Afzal Qadir</strong>
            <small>Private practice · Peshawar</small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => navigate(label)}
            >
              <Icon size={19} />
              {label}
              {label === "Appointments" && waiting.length > 0 && (
                <em>{waiting.length}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note">
            <ShieldCheck size={19} />
            <div>
              Private by design<small>Encrypted records on this device</small>
            </div>
          </div>
          <button className="account" onClick={() => act(() => store.lock())}>
            <span className="avatar dark">{initials(user.name)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.role === "doctor" ? "Doctor" : "Attendant"}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {mobileNav && (
        <div className="nav-backdrop" onClick={() => setMobileNav(false)} />
      )}
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn hamburger"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={21} />
            </button>
            Workspace <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <button
              className={"sync-pill " + (vault.outbox.length ? "pending" : "")}
              onClick={() => setModal({ kind: "sync" })}
            >
              {!navigator.onLine ? (
                <WifiOff size={14} />
              ) : (
                <span className="online-dot" />
              )}
              {!navigator.onLine
                ? "Offline"
                : vault.outbox.length
                  ? `${vault.outbox.length} pending`
                  : "Connected"}
              <RefreshCw
                size={13}
                className={store.isSyncing() ? "spin" : ""}
              />
            </button>
            <span className="top-date">
              {new Date().toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Asia/Karachi",
              })}
            </span>
            <span className="avatar small">{initials(user.name)}</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Overview"
                  ? "YOUR CLINIC, AT A GLANCE"
                  : "CLEARVIEW WORKSPACE"}
              </div>
              <h1>
                {profile
                  ? "Patient profile"
                  : page === "Overview"
                    ? "A clearer view of your day."
                    : page}
              </h1>
              <p>
                {page === "Overview"
                  ? `Welcome back, ${user.role === "doctor" ? "Doctor" : user.name}. Here’s what’s happening at your clinic.`
                  : (
                      {
                        Patients:
                          "Every patient. Every visit. One continuous record.",
                        Appointments:
                          "Keep your schedule and patient queue moving.",
                        Consultations:
                          "Clinical records, thoughtfully organized.",
                        Payments:
                          "Track receipts, refunds and outstanding balances.",
                        Expenses: "Keep a clear record of clinic spending.",
                        Reports:
                          "Understand your clinic through accurate records.",
                        Settings: "Make this workspace work for your practice.",
                      } as any
                    )[page]}
              </p>
            </div>
            <div className="heading-actions">
              {page === "Patients" ? (
                <button
                  className="btn"
                  onClick={() => setModal({ kind: "patient" })}
                >
                  <Plus size={17} />
                  Register patient
                </button>
              ) : ["Overview", "Appointments"].includes(page) ? (
                <>
                  <button
                    className="btn secondary"
                    onClick={() => setModal({ kind: "patient" })}
                  >
                    <Users size={16} /> Register patient
                  </button>
                  <button
                    className="btn"
                    onClick={() => setModal({ kind: "visit" })}
                  >
                    <Plus size={17} /> New visit
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {store.syncError && (
            <div className="notice">
              <AlertCircle size={17} />
              {store.syncError}
              <button
                className="text-btn"
                onClick={() => act(() => store.sync())}
              >
                Retry sync
              </button>
            </div>
          )}
          {[
            "Overview",
            "Appointments",
            "Consultations",
            "Reports",
            "Payments",
            "Expenses",
          ].includes(page) && (
            <div className="date-toolbar">
              <div className="segmented">
                {["Today", "Tomorrow", "This week"].map((label, i) => (
                  <button
                    key={label}
                    className={
                      i === 0 && from === today() && to === today()
                        ? "selected"
                        : ""
                    }
                    onClick={() => {
                      const d = new Date(today() + "T00:00:00+05:00");
                      if (i === 1) d.setDate(d.getDate() + 1);
                      setFrom(dayInPKT(d));
                      if (i === 2) d.setDate(d.getDate() + 6);
                      setTo(dayInPKT(d));
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="date-inputs">
                <CalendarDays size={15} />
                <input
                  aria-label="From date"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    if (e.target.value > to) setTo(e.target.value);
                  }}
                />
                <span>—</span>
                <input
                  aria-label="To date"
                  type="date"
                  min={from}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="stat-grid">
                <Stat
                  label="Completed consultations"
                  value={completed.length}
                  icon={Stethoscope}
                  detail={`${periodVisits.filter((v) => v.type === "new" && v.status === "completed").length} new · ${periodVisits.filter((v) => v.type === "follow_up" && v.status === "completed").length} follow-up`}
                  color="teal"
                />
                <Stat
                  label="Patients in queue"
                  value={waiting.length}
                  icon={Users}
                  detail={`${inRoom.length} currently in consultation`}
                  color="blue"
                />
                {financial ? (
                  <>
                    <Stat
                      label="Collected revenue"
                      value={pkr(summary.collected)}
                      icon={Wallet}
                      detail="Payments received, less refunds"
                      color="purple"
                    />
                    <Stat
                      label={
                        expenseAllowed
                          ? "Operating profit"
                          : "Outstanding balance"
                      }
                      value={pkr(
                        expenseAllowed
                          ? summary.profit
                          : totals(visits, payments, []).outstanding,
                      )}
                      icon={BarChart3}
                      detail={
                        expenseAllowed
                          ? `${pkr(summary.expenses)} recorded expenses`
                          : "All recorded completed visits"
                      }
                      color="amber"
                    />
                  </>
                ) : (
                  <>
                    <Stat
                      label="New registrations"
                      value={patients.filter((p) => range(p.createdAt)).length}
                      icon={Users}
                      detail="Permanent patient profiles"
                      color="purple"
                    />
                    <Stat
                      label="Scheduled appointments"
                      value={
                        periodVisits.filter((v) => v.status === "scheduled")
                          .length
                      }
                      icon={CalendarDays}
                      detail="Appointments awaiting arrival"
                      color="amber"
                    />
                  </>
                )}
              </div>
              <div className="dashboard-grid">
                <section className="panel appointments-panel">
                  <div className="panel-header">
                    <div>
                      <h2>
                        Patient queue{" "}
                        <span className="count">{periodVisits.length}</span>
                      </h2>
                      <p>A little structure for a smoother clinic day.</p>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => navigate("Appointments")}
                    >
                      View schedule <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="tabs">
                    <button className="active">
                      All visits <span>{periodVisits.length}</span>
                    </button>
                    <span className="muted">
                      {waiting.length} waiting · {inRoom.length} in consultation
                    </span>
                  </div>
                  {visitTable(periodVisits.slice(0, 8), true)}
                </section>
                <aside className="right-panels">
                  <section className="day-card">
                    <div className="day-card-icon">
                      <Eye size={25} />
                    </div>
                    <span>CARE STARTS WITH CLARITY</span>
                    <h2>
                      More time for
                      <br />
                      your patients.
                    </h2>
                    <p>
                      Find a record, prepare a paper,
                      <br />
                      and keep your clinic moving.
                    </p>
                    <button onClick={() => navigate("Patients")}>
                      Find a patient <ArrowUpRight size={17} />
                    </button>
                    <div className="decor-ring one" />
                    <div className="decor-ring two" />
                  </section>
                  <section className="panel day-summary">
                    <h3>Day in numbers</h3>
                    {[
                      [
                        "New registrations",
                        patients.filter((p) => range(p.createdAt)).length,
                      ],
                      [
                        "Scheduled",
                        periodVisits.filter((v) => v.status === "scheduled")
                          .length,
                      ],
                      [
                        "Cancelled",
                        periodVisits.filter((v) => v.status === "cancelled")
                          .length,
                      ],
                      [
                        "No-show",
                        periodVisits.filter((v) => v.status === "no_show")
                          .length,
                      ],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </section>
                </aside>
              </div>
              <div className="bottom-note">
                <ShieldCheck size={14} /> Independent private-practice software.
                Not developed, approved or integrated with HMC.
              </div>
            </>
          )}
          {page === "Patients" && !profile && (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>
                    Patient directory{" "}
                    <span className="count">{patients.length}</span>
                  </h2>
                  <p>Search an existing record before registering a patient.</p>
                </div>
                <SearchInput query={query} setQuery={setQuery} />
              </div>
              {!filtered.length ? (
                <Empty
                  title={
                    query
                      ? "No matching patients"
                      : "Your patient directory starts here"
                  }
                  detail="Register a patient once. Use their permanent number for every future visit."
                  action={
                    <button
                      className="btn"
                      onClick={() => setModal({ kind: "patient" })}
                    >
                      <Plus size={16} />
                      Register patient
                    </button>
                  }
                />
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Patient number</th>
                        <th>Age / sex</th>
                        <th>Address</th>
                        <th>Last visit</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <button
                              className="patient-link"
                              onClick={() => setProfile(p.id)}
                            >
                              <span className="avatar">{initials(p.name)}</span>
                              <span>
                                <strong>{p.name}</strong>
                                <small>{p.phone || "No phone recorded"}</small>
                              </span>
                            </button>
                          </td>
                          <td>
                            <code title={p.patientNumber}>
                              {p.patientNumber.slice(0, 15)}…
                            </code>
                          </td>
                          <td>
                            {p.age} /{" "}
                            {p.gender === "unspecified" ? "—" : p.gender}
                          </td>
                          <td>{p.address}</td>
                          <td>
                            {visits
                              .filter((v) => v.patientId === p.id)
                              .sort((a, b) =>
                                b.scheduledAt.localeCompare(a.scheduledAt),
                              )[0]
                              ? dateLabel(
                                  visits
                                    .filter((v) => v.patientId === p.id)
                                    .sort((a, b) =>
                                      b.scheduledAt.localeCompare(
                                        a.scheduledAt,
                                      ),
                                    )[0].scheduledAt,
                                )
                              : "—"}
                          </td>
                          <td>
                            <button
                              className="icon-btn"
                              aria-label="Open patient"
                              onClick={() => setProfile(p.id)}
                            >
                              <ChevronRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {page === "Patients" &&
            profile &&
            (() => {
              const p = patients.find((p) => p.id === profile);
              if (!p) return <Empty />;
              const history = visits.filter((v) => v.patientId === p.id);
              return (
                <>
                  <button
                    className="text-btn back"
                    onClick={() => setProfile(null)}
                  >
                    <ArrowLeft size={15} /> All patients
                  </button>
                  <section className="panel profile-card">
                    <span className="avatar large">{initials(p.name)}</span>
                    <div>
                      <h2>{p.name}</h2>
                      <p>
                        {p.age} years · {p.gender} · {p.address}
                      </p>
                      <code>{p.patientNumber}</code>
                      <p>{p.phone || "No phone recorded"}</p>
                    </div>
                    <div className="profile-actions">
                      <button
                        className="btn secondary"
                        onClick={() =>
                          setModal({ kind: "patient", patient: p })
                        }
                      >
                        Edit details
                      </button>
                      <button
                        className="btn secondary"
                        onClick={() => printRecord(p)}
                      >
                        <Printer size={16} />
                        Print paper
                      </button>
                      <button
                        className="btn"
                        onClick={() => setModal({ kind: "visit", patient: p })}
                      >
                        <Plus size={16} />
                        Repeat visit
                      </button>
                    </div>
                  </section>
                  {financial && (
                    <div className="stat-grid three">
                      <Stat
                        label="Total billed"
                        value={pkr(history.reduce((s, v) => s + charge(v), 0))}
                        icon={Receipt}
                      />
                      <Stat
                        label="Net received"
                        value={pkr(
                          payments
                            .filter((x) =>
                              history.some((v) => v.id === x.visitId),
                            )
                            .reduce((s, p) => s + received(p), 0),
                        )}
                        icon={Wallet}
                      />
                      <Stat
                        label="Visit count"
                        value={history.length}
                        icon={CalendarDays}
                      />
                    </div>
                  )}
                  <section className="panel">
                    <div className="panel-header">
                      <h2>Visit & medical history</h2>
                    </div>
                    {visitTable(history)}
                  </section>
                </>
              );
            })()}
          {page === "Appointments" && (
            <section className="panel">
              <div className="panel-header">
                <h2>Appointments & walk-ins</h2>
                <SearchInput query={query} setQuery={setQuery} />
              </div>
              {visitTable(
                periodVisits.filter(
                  (v) =>
                    name(v.patientId)
                      .toLowerCase()
                      .includes(query.toLowerCase()) ||
                    pv(v)?.patientNumber.includes(query),
                ),
              )}
            </section>
          )}
          {page === "Consultations" && (
            <>
              <section className="panel">
                <div className="panel-header">
                  <h2>Consultations</h2>
                  <span className="muted">Clinical notes are optional</span>
                </div>
                {visitTable(
                  periodVisits.filter((v) =>
                    ["in_consultation", "completed"].includes(v.status),
                  ),
                )}
              </section>
              <section className="panel spaced">
                <div className="panel-header">
                  <h2>Upcoming & overdue follow-ups</h2>
                </div>
                {visits.filter((v) => v.clinical?.followUpDate).length ? (
                  <div className="list">
                    {visits
                      .filter((v) => v.clinical?.followUpDate)
                      .sort((a, b) =>
                        a.clinical!.followUpDate!.localeCompare(
                          b.clinical!.followUpDate!,
                        ),
                      )
                      .map((v) => (
                        <div key={v.id}>
                          <strong>{name(v.patientId)}</strong>
                          <span>{v.clinical!.followUpDate}</span>
                          <Badge
                            status={
                              v.clinical!.followUpDate! < today()
                                ? "overdue"
                                : "scheduled"
                            }
                          />
                          <button
                            className="text-btn"
                            onClick={() =>
                              setModal({ kind: "visit", patient: pv(v) })
                            }
                          >
                            Schedule
                          </button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <Empty title="No follow-ups recorded" />
                )}
              </section>
            </>
          )}
          {page === "Payments" && financial && (
            <>
              <div className="stat-grid three">
                <Stat
                  label="Fees charged"
                  value={pkr(summary.charged)}
                  icon={Receipt}
                />
                <Stat
                  label="Net collected"
                  value={pkr(summary.collected)}
                  icon={Wallet}
                />
                <Stat
                  label="Outstanding (all visits)"
                  value={pkr(totals(visits, payments, []).outstanding)}
                  icon={Clock}
                />
              </div>
              <section className="panel">
                <div className="panel-header">
                  <h2>Payment ledger</h2>
                  <button
                    className="btn"
                    onClick={() => setModal({ kind: "payment" })}
                  >
                    <Plus size={16} />
                    Record payment / refund
                  </button>
                </div>
                {periodPayments.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Patient</th>
                          <th>Date</th>
                          <th>Method</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {periodPayments.map((p) => (
                          <tr key={p.id}>
                            <td>
                              {name(
                                visits.find((v) => v.id === p.visitId)
                                  ?.patientId || "",
                              )}
                            </td>
                            <td>{dateLabel(p.createdAt)}</td>
                            <td>{p.method}</td>
                            <td>
                              <Badge status={p.kind} />
                            </td>
                            <td>{pkr(received(p))}</td>
                            <td>
                              <button
                                className="text-btn"
                                onClick={() =>
                                  setModal({ kind: "receipt", payment: p })
                                }
                              >
                                <Receipt size={16} />
                                Receipt
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="No payments in this period"
                    detail="Only actual receipts and refunds appear in this ledger."
                  />
                )}
              </section>
              <section className="panel spaced">
                <div className="panel-header">
                  <h2>Unpaid & partially paid consultations</h2>
                </div>
                {visitTable(
                  visits.filter(
                    (v) =>
                      charge(v) >
                      payments
                        .filter((p) => p.visitId === v.id)
                        .reduce((s, p) => s + received(p), 0),
                  ),
                )}
              </section>
            </>
          )}
          {page === "Expenses" && expenseAllowed && (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Expense ledger</h2>
                  <p>{pkr(summary.expenses)} in this period</p>
                </div>
                <button
                  className="btn"
                  onClick={() => setModal({ kind: "expense" })}
                >
                  <Plus size={16} />
                  Add expense
                </button>
              </div>
              {periodExpenses.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Expense</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {periodExpenses.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <strong>{e.title}</strong>
                            <small>{e.description}</small>
                          </td>
                          <td>{e.category}</td>
                          <td>{e.date}</td>
                          <td>{e.method}</td>
                          <td>{pkr(e.amount)}</td>
                          <td>
                            <button
                              className="text-btn"
                              onClick={() =>
                                setModal({ kind: "expense", expense: e })
                              }
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No expenses recorded" />
              )}
            </section>
          )}
          {page === "Reports" && (
            <Reports
              patients={patients}
              visits={periodVisits}
              payments={periodPayments}
              allVisits={visits}
              allPayments={payments}
              expenses={periodExpenses}
              financial={financial}
              expensesAllowed={expenseAllowed}
              from={from}
              to={to}
            />
          )}
          {page === "Settings" && (
            <SettingsPage
              print={print}
              fees={fees}
              doctor={user.role === "doctor"}
              financial={financial}
              onModal={setModal}
            />
          )}
          <footer className="footer">
            <span>
              Clearview <span className="muted">/</span> Thoughtful tools for
              better care
            </span>
            <span>Pakistan Standard Time · PKR</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button aria-label="Dismiss" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            (
              {
                patient: "Register patient",
                visit: "Appointment & visit",
                consult: "Consultation",
                payment: "Record payment or refund",
                expense: "Clinic expense",
                sync: "Synchronization",
                cancel: "Cancel appointment",
                receipt: "Payment receipt",
                staff: "Staff access",
                audit: "Audit history",
              } as any
            )[modal.kind] || "Details"
          }
          wide={["consult", "sync"].includes(modal.kind)}
          onClose={() => setModal(null)}
        >
          {modal.kind === "patient" && (
            <PatientForm
              patient={modal.patient}
              patients={patients}
              onSave={async (p: Patient) => {
                schemas.patients.parse(p);
                await store.save("patients", p);
                setModal(null);
                setProfile(p.id);
                setPage("Patients");
                setToast("Patient saved on this device");
              }}
            />
          )}
          {modal.kind === "visit" && (
            <VisitForm
              patients={patients}
              visits={visits}
              fees={fees}
              visit={modal.visit}
              patient={modal.patient}
              financial={financial}
              onSave={saveVisit}
              onStatus={statusVisit}
              onPrint={(v: Visit) => {
                const p = pv(v);
                if (p) printRecord(p, v.scheduledAt);
              }}
            />
          )}
          {modal.kind === "consult" && (
            <ConsultForm
              visit={modal.visit}
              patient={pv(modal.visit)}
              clinical={clinical}
              financial={financial}
              doctor={user.role === "doctor"}
              onSave={saveVisit}
              onPrint={() => {
                const p = pv(modal.visit);
                if (p) printRecord(p, modal.visit.scheduledAt);
              }}
            />
          )}
          {modal.kind === "payment" && (
            <PaymentForm
              visits={visits}
              payments={payments}
              name={name}
              onSave={async (p: Payment) => {
                schemas.payments.parse(p);
                await store.save("payments", p);
                setModal(null);
                setToast(
                  "Transaction saved locally; pending server validation",
                );
              }}
            />
          )}
          {modal.kind === "expense" && (
            <ExpenseForm
              expense={modal.expense}
              onSave={async (e: Expense) => {
                schemas.expenses.parse(e);
                await store.save("expenses", e);
                setModal(null);
                setToast("Expense saved on this device");
              }}
            />
          )}
          {modal.kind === "cancel" && (
            <CancelForm
              onSave={async (reason: string) =>
                saveVisit({
                  ...modal.visit,
                  status: "cancelled",
                  cancellationReason: reason,
                })
              }
            />
          )}
          {modal.kind === "sync" && (
            <div className="modal-body">
              <div className="notice">
                <ShieldCheck size={18} />
                Saved records and pending operations are encrypted in this
                browser. Keep this device’s data until synchronization is
                complete.
              </div>
              <p>
                {vault.outbox.length} pending operations. Other offline devices
                cannot see them yet.
              </p>
              <button
                className="btn secondary"
                onClick={() => act(() => store.sync(true))}
              >
                <RefreshCw size={16} />
                Synchronize all records
              </button>
              {vault.outbox.map((op) => (
                <div className="conflict" key={op.id}>
                  <strong>
                    {op.entity} · {op.recordId.slice(0, 12)}
                  </strong>
                  <p>{op.error || "Waiting to synchronize"}</p>
                  {op.error && (
                    <>
                      <button
                        className="btn secondary"
                        onClick={() => act(() => store.retryOp(op.id))}
                      >
                        Retry
                      </button>
                      {op.server && (
                        <button
                          className="btn danger"
                          onClick={() => {
                            if (
                              confirm(
                                "Discard this local edit and dependent edits to the same record? The server record will be retained.",
                              )
                            )
                              void act(() => store.acceptServer(op.id));
                          }}
                        >
                          Keep server version
                        </button>
                      )}
                      <button
                        className="text-btn"
                        onClick={() => downloadJson(op, "sync-conflict.json")}
                      >
                        Export local edit
                      </button>
                    </>
                  )}
                </div>
              ))}
              {!vault.outbox.length && (
                <Empty
                  title="Everything is synchronized"
                  detail="All locally saved operations have been accepted by the server."
                />
              )}
            </div>
          )}
          {modal.kind === "receipt" && (
            <ReceiptView
              payment={modal.payment}
              visits={visits}
              patients={patients}
            />
          )}
          {modal.kind === "staff" && <Staff />}
          {modal.kind === "audit" && <Audit />}
        </Modal>
      )}
    </div>
  );
}
function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [url, setUrl] = useState(store.apiUrl()),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-shell">
      <section className="login-story">
        <div className="brand light">
          <span className="brand-mark">
            <Eye size={28} />
          </span>
          <div>
            clearview<span>EYE CLINIC WORKSPACE</span>
          </div>
        </div>
        <div>
          <div className="eyebrow">BUILT AROUND YOUR PRACTICE</div>
          <h1>
            A clearer day.
            <br />
            Better patient care.
          </h1>
          <p>
            Patients, consultations and clinic finances.
            <br />
            Connected in one thoughtful workspace.
          </p>
        </div>
        <small>
          Independent private-practice software · Peshawar, Pakistan
        </small>
      </section>
      <section className="login-form">
        <div className="login-heading">
          <span className="eyebrow">WELCOME TO CLEARVIEW</span>
          <h2>Your clinic starts here.</h2>
          <p>Sign in to securely open your workspace.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void act(async () => {
              store.setApi(url);
              await store.login(email, password);
            }).finally(() => setBusy(false));
          }}
        >
          <Field label="Clinic API address">
            <input
              type="url"
              required
              placeholder="https://api.your-clinic.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field label="Email address">
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="doctor@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button className="btn full" disabled={busy}>
            {busy ? (
              <>
                <RefreshCw className="spin" size={17} />
                Unlocking…
              </>
            ) : (
              <>
                Open workspace <ArrowUpRight size={17} />
              </>
            )}
          </button>
        </form>
        <div className="login-info">
          <ShieldCheck size={19} />
          <p>
            Your local records are encrypted with your password. After an online
            sign-in, this device can work offline during the 8-hour session.
          </p>
        </div>
        <p className="login-caption">
          First setup? Start the API and create the doctor account using the
          included installation guide. There are no default credentials.
        </p>
      </section>
    </div>
  );
}
function SearchInput({ query, setQuery }: any) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        aria-label="Search patients"
        placeholder="Search name or patient number…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  );
}
function Stat({ label, value, icon: Icon, detail, color = "teal" }: any) {
  return (
    <section className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className={"stat-icon " + color}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail || "Based on locally available records"}</small>
    </section>
  );
}
function Submit({ label = "Save record" }: { label?: string }) {
  return (
    <div className="form-actions">
      <span>
        <ShieldCheck size={13} />
        Saved locally before syncing
      </span>
      <button type="submit" className="btn">
        <Check size={16} />
        {label}
      </button>
    </div>
  );
}
function PatientForm({ patient, patients, onSave }: any) {
  const [p, setP] = useState<Patient>(
    patient ||
      (() => {
        const id = newId();
        return {
          id,
          patientNumber: patientNumber(id),
          name: "",
          age: 0,
          address: "",
          gender: "unspecified",
          phone: "",
          createdAt: now(),
        };
      }),
  );
  const set = (k: string, v: any) => setP({ ...p, [k]: v });
  const matches = patients.filter(
    (x: Patient) =>
      x.id !== p.id &&
      p.name.length > 2 &&
      x.name.toLowerCase().includes(p.name.toLowerCase()),
  );
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        void act(() => onSave(p));
      }}
    >
      <div className="notice subtle">
        <Users size={17} />
        {patient
          ? "The patient number is permanent. Changes keep an audit trail."
          : "One patient profile, a lifetime of visits. Search first to avoid duplicates."}
      </div>
      <Field label="Patient name *">
        <input
          autoFocus
          required
          minLength={2}
          maxLength={150}
          value={p.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      {matches.length > 0 && (
        <div className="notice">
          Possible existing patients:{" "}
          {matches
            .map(
              (x: Patient) =>
                `${x.name} (${x.age}, ${x.address}, ${x.patientNumber})`,
            )
            .join("; ")}
          . Close and search before creating a duplicate.
        </div>
      )}
      <div className="form-grid">
        <Field label="Age in years *">
          <input
            type="number"
            min="0"
            max="125"
            required
            value={p.age}
            onChange={(e) => set("age", Number(e.target.value))}
          />
        </Field>
        <Field label="Sex">
          <select
            value={p.gender}
            onChange={(e) => set("gender", e.target.value)}
          >
            <option value="unspecified">Not recorded</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      <Field label="Address *">
        <textarea
          required
          minLength={2}
          maxLength={500}
          value={p.address}
          onChange={(e) => set("address", e.target.value)}
        />
      </Field>
      <Field label="Mobile number (optional)">
        <input
          type="tel"
          maxLength={30}
          value={p.phone}
          onChange={(e) => set("phone", e.target.value)}
        />
      </Field>
      <Field label="Permanent patient number">
        <input readOnly value={p.patientNumber} />
      </Field>
      <Submit label={patient ? "Save changes" : "Register patient"} />
    </form>
  );
}
function VisitForm({
  patients,
  visits,
  fees,
  visit,
  patient,
  financial,
  onSave,
  onStatus,
  onPrint,
}: any) {
  const [v, setV] = useState<any>(
    visit || {
      id: newId(),
      patientId: patient?.id || "",
      createdAt: now(),
      scheduledAt: now(),
      type:
        patient && visits.some((x: Visit) => x.patientId === patient.id)
          ? "follow_up"
          : "new",
      status: "waiting",
      fee: 0,
      discount: 0,
      waived: false,
      cancellationReason: "",
    },
  );
  const [search, setSearch] = useState("");
  const edit = !!visit;
  const set = (k: string, x: any) => setV({ ...v, [k]: x });
  useEffect(() => {
    if (!edit)
      setV((v: any) => ({
        ...v,
        fee: applicableFee(fees, dayInPKT(v.scheduledAt), v.type),
      }));
  }, [v.type, v.scheduledAt, fees.length]);
  const matches = patients.filter((p: Patient) =>
    [p.name, p.patientNumber].some((x) =>
      x.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const duplicate = visits.find(
    (x: Visit) =>
      x.id !== v.id &&
      x.patientId === v.patientId &&
      dayInPKT(x.scheduledAt) === dayInPKT(v.scheduledAt) &&
      !["cancelled", "no_show"].includes(x.status),
  );
  const last = visits
    .filter((x: Visit) => x.patientId === v.patientId && x.id !== v.id)
    .sort((a: Visit, b: Visit) =>
      b.scheduledAt.localeCompare(a.scheduledAt),
    )[0];
  const localDate = new Date(new Date(v.scheduledAt).getTime() + 5 * 3600000)
    .toISOString()
    .slice(0, 16);
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        void act(() => onSave(v));
      }}
    >
      <Field label="Find existing patient">
        <input
          placeholder="Name or full patient number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>
      <Field label="Patient *">
        <select
          required
          disabled={edit}
          value={v.patientId}
          onChange={(e) => {
            const id = e.target.value;
            setV({
              ...v,
              patientId: id,
              type: visits.some((x: Visit) => x.patientId === id)
                ? "follow_up"
                : "new",
            });
          }}
        >
          <option value="">Choose a patient</option>
          {matches.map((p: Patient) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.age} · {p.address} · {p.patientNumber}
            </option>
          ))}
        </select>
      </Field>
      {last && (
        <p className="muted">Previous visit: {dateLabel(last.scheduledAt)}</p>
      )}
      {duplicate && (
        <div className="notice">
          This patient already has a visit on this date. Check the existing
          appointment before saving.
        </div>
      )}
      <div className="form-grid">
        <Field label="Appointment (Pakistan time) *">
          <input
            type="datetime-local"
            required
            value={localDate}
            onChange={(e) => {
              if (e.target.value)
                set(
                  "scheduledAt",
                  new Date(e.target.value + ":00+05:00").toISOString(),
                );
            }}
          />
        </Field>
        <Field label="Visit type">
          <select value={v.type} onChange={(e) => set("type", e.target.value)}>
            <option value="new">New patient</option>
            <option value="follow_up">Follow-up</option>
          </select>
        </Field>
      </div>
      <Field label="Status">
        <select
          value={v.status}
          onChange={(e) => set("status", e.target.value)}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </Field>
      {v.status === "cancelled" && (
        <Field label="Cancellation reason *">
          <textarea
            required
            value={v.cancellationReason}
            onChange={(e) => set("cancellationReason", e.target.value)}
          />
        </Field>
      )}
      {financial && (
        <div className="form-grid">
          <Money
            label="Consultation fee (PKR)"
            value={v.fee || 0}
            setValue={(x) => set("fee", x)}
          />
          <Money
            label="Discount (PKR)"
            value={v.discount || 0}
            setValue={(x) => set("discount", x)}
          />
        </div>
      )}
      {financial && (
        <label className="check">
          <input
            type="checkbox"
            checked={v.waived || false}
            onChange={(e) => set("waived", e.target.checked)}
          />
          Waive consultation fee
        </label>
      )}
      {visit && (
        <div className="inline-actions">
          <button
            type="button"
            className="btn secondary"
            onClick={() => onPrint(v)}
          >
            <Printer size={15} />
            Reprint patient paper
          </button>
          {!["completed", "cancelled"].includes(v.status) && (
            <button
              type="button"
              className="text-btn danger"
              onClick={() => onStatus(v, "cancelled")}
            >
              Cancel appointment
            </button>
          )}
        </div>
      )}
      <Submit label={edit ? "Save appointment" : "Create visit"} />
    </form>
  );
}
function Money({
  label,
  value,
  setValue,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        max="10000000"
        step="0.01"
        required
        value={value / 100}
        onChange={(e) => setValue(Math.round(Number(e.target.value) * 100))}
      />
    </Field>
  );
}
function ConsultForm({
  visit,
  patient,
  clinical,
  financial,
  doctor,
  onSave,
  onPrint,
}: any) {
  const [v, setV] = useState(visit);
  const [c, setC] = useState(
    visit.clinical || {
      complaints: "",
      rightEye: "",
      leftEye: "",
      diagnosis: "",
      advice: "",
      notes: "",
      prescriptions: [],
    },
  );
  const locked = visit.status === "completed" && !doctor;
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        void act(() => onSave({ ...v, ...(clinical ? { clinical: c } : {}) }));
      }}
    >
      <div className="consult-patient">
        <span className="avatar">{initials(patient?.name || "Patient")}</span>
        <div>
          <h3>{patient?.name}</h3>
          <p>
            {patient?.age} years · {dateLabel(visit.scheduledAt)} ·{" "}
            {timeLabel(visit.scheduledAt)}
          </p>
        </div>
        <button type="button" className="btn secondary" onClick={onPrint}>
          <Printer size={16} />
          Print paper
        </button>
      </div>
      <div className="notice subtle">
        Clinical notes and prescriptions are optional. A visit can be completed
        with both left empty.
      </div>
      {locked && (
        <div className="notice">
          Finalized visit. Only the doctor can authorize amendments.
        </div>
      )}
      <fieldset disabled={locked}>
        {clinical ? (
          <>
            <Field label="Presenting complaints">
              <textarea
                value={c.complaints}
                onChange={(e) => setC({ ...c, complaints: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Right eye findings">
                <textarea
                  value={c.rightEye}
                  onChange={(e) => setC({ ...c, rightEye: e.target.value })}
                />
              </Field>
              <Field label="Left eye findings">
                <textarea
                  value={c.leftEye}
                  onChange={(e) => setC({ ...c, leftEye: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Diagnosis (entered by doctor)">
              <textarea
                value={c.diagnosis}
                onChange={(e) => setC({ ...c, diagnosis: e.target.value })}
              />
            </Field>
            <div className="section-title">
              <h3>Prescription</h3>
              <button
                type="button"
                className="text-btn"
                onClick={() =>
                  setC({
                    ...c,
                    prescriptions: [
                      ...c.prescriptions,
                      { medicine: "", dosage: "", frequency: "", duration: "" },
                    ],
                  })
                }
              >
                <Plus size={15} />
                Add medicine
              </button>
            </div>
            {c.prescriptions.map((p: any, i: number) => (
              <div className="prescription" key={i}>
                {["medicine", "dosage", "frequency", "duration"].map((k) => (
                  <Field key={k} label={k}>
                    <input
                      required={k === "medicine"}
                      value={p[k]}
                      onChange={(e) =>
                        setC({
                          ...c,
                          prescriptions: c.prescriptions.map(
                            (x: any, j: number) =>
                              j === i ? { ...x, [k]: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                ))}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove medicine"
                  onClick={() =>
                    setC({
                      ...c,
                      prescriptions: c.prescriptions.filter(
                        (_: any, j: number) => i !== j,
                      ),
                    })
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <Field label="Advice & follow-up instructions">
              <textarea
                value={c.advice}
                onChange={(e) => setC({ ...c, advice: e.target.value })}
              />
            </Field>
            <Field label="Additional notes">
              <textarea
                value={c.notes}
                onChange={(e) => setC({ ...c, notes: e.target.value })}
              />
            </Field>
            <Field label="Next follow-up date">
              <input
                type="date"
                value={c.followUpDate || ""}
                onChange={(e) =>
                  setC({ ...c, followUpDate: e.target.value || undefined })
                }
              />
            </Field>
          </>
        ) : (
          <div className="notice">
            Your role does not have permission to view clinical notes.
          </div>
        )}
        <Field label="Visit status">
          <select
            value={v.status}
            onChange={(e) => setV({ ...v, status: e.target.value })}
          >
            {["waiting", "in_consultation", "completed"].map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        {financial && (
          <p>Billable fee: {pkr(charge({ ...v, status: "completed" }))}</p>
        )}
        {!locked && (
          <Submit
            label={
              v.status === "completed"
                ? "Finalize consultation"
                : "Save consultation"
            }
          />
        )}
      </fieldset>
    </form>
  );
}
function PaymentForm({ visits, payments, name, onSave }: any) {
  const [p, setP] = useState<Payment>({
    id: newId(),
    visitId: "",
    amount: 0,
    kind: "payment",
    method: "cash",
    createdAt: now(),
    reason: "",
  });
  const set = (k: string, v: any) => setP({ ...p, [k]: v });
  const visit = visits.find((v: Visit) => v.id === p.visitId);
  const net = payments
    .filter((x: Payment) => x.visitId === p.visitId)
    .reduce((s: number, p: Payment) => s + received(p), 0);
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        const after = net + received(p);
        if (!visit || after < 0 || after > charge(visit))
          return notify(
            "Amount exceeds outstanding balance or available refund",
          );
        void act(() => onSave(p));
      }}
    >
      <Field label="Completed consultation *">
        <select
          required
          value={p.visitId}
          onChange={(e) => set("visitId", e.target.value)}
        >
          <option value="">Select consultation</option>
          {visits
            .filter((v: Visit) => v.status === "completed")
            .map((v: Visit) => (
              <option key={v.id} value={v.id}>
                {name(v.patientId)} · {dateLabel(v.scheduledAt)} ·{" "}
                {pkr(charge(v))}
              </option>
            ))}
        </select>
      </Field>
      {visit && (
        <div className="notice subtle">
          Charged: {pkr(charge(visit))} · Paid: {pkr(net)} · Outstanding:{" "}
          {pkr(charge(visit) - net)}
        </div>
      )}
      <div className="form-grid">
        <Field label="Transaction">
          <select value={p.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="payment">Payment received</option>
            <option value="refund">Refund paid</option>
          </select>
        </Field>
        <Field label="Method">
          <select
            value={p.method}
            onChange={(e) => set("method", e.target.value)}
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank transfer</option>
          </select>
        </Field>
      </div>
      <Money
        label="Amount (PKR) *"
        value={p.amount}
        setValue={(x) => set("amount", x)}
      />
      <Field
        label={p.kind === "refund" ? "Refund reason *" : "Reference / note"}
      >
        <textarea
          required={p.kind === "refund"}
          value={p.reason}
          onChange={(e) => set("reason", e.target.value)}
        />
      </Field>
      <p className="muted">
        Transactions are immutable. Use a refund to correct a receipt. Final
        validation occurs during sync.
      </p>
      <Submit label="Record transaction" />
    </form>
  );
}
function ExpenseForm({ expense, onSave }: any) {
  const [e, setE] = useState<Expense>(
    expense || {
      id: newId(),
      title: "",
      category: "miscellaneous",
      amount: 0,
      date: today(),
      method: "cash",
      description: "",
      createdAt: now(),
    },
  );
  const set = (k: string, v: any) => setE({ ...e, [k]: v });
  return (
    <form
      className="modal-body"
      onSubmit={(ev) => {
        ev.preventDefault();
        void act(() => onSave(e));
      }}
    >
      <Field label="Expense title *">
        <input
          minLength={2}
          required
          value={e.title}
          onChange={(ev) => set("title", ev.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Category">
          <select
            value={e.category}
            onChange={(ev) => set("category", ev.target.value)}
          >
            {[
              "salaries",
              "supplies",
              "printing",
              "utilities",
              "rent",
              "equipment",
              "miscellaneous",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            required
            value={e.date}
            onChange={(ev) => set("date", ev.target.value)}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Money
          label="Amount (PKR) *"
          value={e.amount}
          setValue={(x) => set("amount", x)}
        />
        <Field label="Method">
          <select
            value={e.method}
            onChange={(ev) => set("method", ev.target.value)}
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank transfer</option>
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={e.description}
          onChange={(ev) => set("description", ev.target.value)}
        />
      </Field>
      <Submit label="Save expense" />
    </form>
  );
}
function CancelForm({ onSave }: any) {
  const [reason, setReason] = useState("");
  return (
    <form
      className="modal-body"
      onSubmit={(e) => {
        e.preventDefault();
        void act(() => onSave(reason));
      }}
    >
      <Field label="Cancellation reason *">
        <textarea
          required
          minLength={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <Submit label="Cancel appointment" />
    </form>
  );
}
function downloadJson(data: any, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function Reports({
  patients,
  visits,
  payments,
  allVisits,
  allPayments,
  expenses,
  financial,
  expensesAllowed,
  from,
  to,
}: any) {
  const [kind, setKind] = useState("Appointments");
  const [search, setSearch] = useState("");
  const options = [
    "Patients",
    "Appointments",
    ...(financial
      ? ["Financial", ...(expensesAllowed ? ["Profit & loss"] : [])]
      : []),
    ...(expensesAllowed ? ["Expenses"] : []),
  ];
  const find = (id: string) => patients.find((p: Patient) => p.id === id);
  let data: Record<string, any>[] = [];
  if (kind === "Patients")
    data = patients
      .filter(
        (p: Patient) =>
          dayInPKT(p.createdAt) >= from && dayInPKT(p.createdAt) <= to,
      )
      .map((p: Patient) => ({
        Name: p.name,
        "Patient number": p.patientNumber,
        Age: p.age,
        Address: p.address,
        Registered: dayInPKT(p.createdAt),
        "Visits in period": visits.filter((v: Visit) => v.patientId === p.id)
          .length,
      }));
  if (kind === "Appointments")
    data = visits.map((v: Visit) => ({
      Patient: find(v.patientId)?.name,
      "Patient number": find(v.patientId)?.patientNumber,
      Date: dateLabel(v.scheduledAt),
      Time: timeLabel(v.scheduledAt),
      Type: v.type,
      Status: v.status,
    }));
  if (kind === "Financial")
    data = visits
      .filter((v: Visit) => v.status === "completed")
      .map((v: Visit) => ({
        Patient: find(v.patientId)?.name,
        Date: dateLabel(v.scheduledAt),
        "Charged PKR": charge(v) / 100,
        "Discount PKR": v.discount / 100,
        Waived: v.waived ? "Yes" : "No",
        "Outstanding at end PKR":
          (charge(v) -
            allPayments
              .filter(
                (p: Payment) =>
                  p.visitId === v.id && dayInPKT(p.createdAt) <= to,
              )
              .reduce((s: number, p: Payment) => s + received(p), 0)) /
          100,
        "Net received in period PKR":
          payments
            .filter((p: Payment) => p.visitId === v.id)
            .reduce((s: number, p: Payment) => s + received(p), 0) / 100,
      }))
      .concat(
        payments
          .filter(
            (p: Payment) => !visits.some((v: Visit) => v.id === p.visitId),
          )
          .map((p: Payment) => ({
            Patient: find(
              allVisits.find((v: Visit) => v.id === p.visitId)?.patientId || "",
            )?.name,
            Date: dateLabel(p.createdAt),
            "Charged PKR": 0,
            "Discount PKR": 0,
            Waived: "N/A",
            "Outstanding at end PKR": 0,
            "Net received in period PKR": received(p) / 100,
          })),
      );
  if (kind === "Expenses")
    data = expenses.map((e: Expense) => ({
      Title: e.title,
      Category: e.category,
      Date: e.date,
      Method: e.method,
      "Amount PKR": e.amount / 100,
    }));
  if (kind === "Profit & loss") {
    const dates = [
      ...new Set([
        ...payments.map((p: Payment) => dayInPKT(p.createdAt)),
        ...expenses.map((e: Expense) => e.date),
      ]),
    ].sort() as string[];
    data = dates.map((d) => {
      const revenue = payments
          .filter((p: Payment) => dayInPKT(p.createdAt) === d)
          .reduce((s: number, p: Payment) => s + received(p), 0),
        cost = expenses
          .filter((e: Expense) => e.date === d)
          .reduce((s: number, e: Expense) => s + e.amount, 0);
      return {
        Date: d,
        "Collected PKR": revenue / 100,
        "Expenses PKR": cost / 100,
        "Operating profit PKR": (revenue - cost) / 100,
      };
    });
  }
  data = data.filter((d) =>
    Object.values(d).some((v) =>
      String(v ?? "")
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
  );
  async function excel() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Report");
    XLSX.writeFile(wb, `clearview-${kind}-${from}-${to}.xlsx`);
  }
  async function pdf() {
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(18);
    doc.text(`Clearview - ${kind}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`${from} to ${to} | PKR | Locally available records`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [Object.keys(data[0] || { Result: "" })],
      body: data.map((d) => Object.values(d).map((v) => String(v ?? ""))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [7, 95, 96] },
    });
    doc.save(`clearview-${kind}-${from}.pdf`);
  }
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Clinic reports</h2>
          <p>
            {from} to {to} · Based on locally available synchronized records
          </p>
        </div>
        <div className="inline-actions">
          <button
            className="btn secondary"
            disabled={!data.length}
            onClick={() => void act(excel)}
          >
            <Download size={15} />
            Excel
          </button>
          <button
            className="btn secondary"
            disabled={!data.length}
            onClick={() => void act(pdf)}
          >
            <Download size={15} />
            PDF
          </button>
          <button className="btn secondary" onClick={() => window.print()}>
            <Printer size={15} />
            Print
          </button>
        </div>
      </div>
      <div className="tabs">
        {options.map((k) => (
          <button
            className={kind === k ? "active" : ""}
            key={k}
            onClick={() => setKind(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <div style={{ padding: "18px 22px" }}>
        <input
          aria-label="Search report"
          placeholder="Search report rows…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #e0e8e8",
            borderRadius: 5,
          }}
        />
      </div>
      {kind === "Profit & loss" && (
        <div className="notice subtle">
          Operating profit reflects recorded receipts, refunds and expenses.
          This is not a complete accounting statement.
        </div>
      )}
      {kind === "Financial" && (
        <div className="notice subtle">
          Charges use consultation dates. Receipts use payment dates, including
          receipts against earlier visits. Unpaid fees are not collected
          revenue.
        </div>
      )}
      {data.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {Object.keys(data[0]).map((k) => (
                  <th key={k}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}>
                  {Object.values(d).map((v: any, j) => (
                    <td key={j}>{String(v ?? "—")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No records for this report"
          detail="Choose another date range or add clinic records."
        />
      )}
    </section>
  );
}
function SettingsPage({ print, fees, doctor, financial, onModal }: any) {
  const [tab, setTab] = useState("Paper printing");
  return (
    <>
      <div className="settings-tabs">
        {[
          "Paper printing",
          ...(financial ? ["Consultation fees"] : []),
          ...(doctor ? ["Staff & security"] : []),
        ].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Paper printing" && (
        <PrintSettings config={print} doctor={doctor} />
      )}
      {tab === "Consultation fees" && (
        <FeeSettings fees={fees} doctor={doctor} />
      )}
      {tab === "Staff & security" && (
        <section className="panel settings-panel">
          <h2>Staff & security</h2>
          <p>
            Permissions are enforced on the server. Staff changes invalidate
            existing sessions.
          </p>
          <button
            className="btn secondary"
            onClick={() => onModal({ kind: "staff" })}
          >
            <Users size={16} />
            Manage attendants
          </button>
          <button
            className="btn secondary"
            onClick={() => onModal({ kind: "audit" })}
          >
            <ClipboardList size={16} />
            View audit history
          </button>
          <hr />
          <h3>Backup & restore</h3>
          <p>
            Use the included encrypted server backup and controlled restore
            scripts. Database administration is kept outside the receptionist
            workspace.
          </p>
          <p className="muted">
            Do not clear browser storage while records are pending
            synchronization.
          </p>
        </section>
      )}
    </>
  );
}
function PrintSettings({ config, doctor }: any) {
  const [p, setP] = useState<PrintConfig>(config),
    [selected, setSelected] = useState("name");
  const field = p.fields[selected as keyof typeof p.fields];
  const dummy: Patient = {
    id: newId(),
    patientNumber: "CV-00000000-0000-4000-8000-000000000000",
    name: "Sample Patient",
    age: 42,
    address: "Hayatabad, Peshawar",
    gender: "male",
    phone: "",
    createdAt: now(),
  };
  return (
    <div className="print-settings">
      <section className="panel settings-panel">
        <h2>Print onto your existing paper</h2>
        <p>
          Only patient text is printed. Paper headers and artwork stay on the
          original stationery.
        </p>
        <div className="notice subtle">
          Starting positions are approximate. Measure your paper, then test at
          100% scale with browser headers and footers disabled.
        </div>
        <fieldset disabled={!doctor}>
          <div className="form-grid">
            <Field label="Paper width (mm)">
              <input
                type="number"
                min="50"
                max="500"
                value={p.width}
                onChange={(e) => setP({ ...p, width: Number(e.target.value) })}
              />
            </Field>
            <Field label="Paper height (mm)">
              <input
                type="number"
                min="50"
                max="600"
                value={p.height}
                onChange={(e) => setP({ ...p, height: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Orientation">
            <select
              value={p.orientation}
              onChange={(e) => {
                const o = e.target.value as any;
                setP({
                  ...p,
                  orientation: o,
                  width: p.height,
                  height: p.width,
                });
              }}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </Field>
          <Field label="Field to position">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {Object.keys(p.fields).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            {[
              ["x", "Horizontal position (mm)"],
              ["y", "Vertical position (mm)"],
              ["size", "Font size (pt)"],
              ["width", "Text width (mm)"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={(field as any)[key]}
                  onChange={(e) =>
                    setP({
                      ...p,
                      fields: {
                        ...p.fields,
                        [selected]: { ...field, [key]: Number(e.target.value) },
                      },
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={p.bold}
              onChange={(e) => setP({ ...p, bold: e.target.checked })}
            />
            Bold text
          </label>
          <button
            className="btn"
            onClick={() =>
              void act(async () => {
                schemas.settings.parse(p);
                await store.save("settings", {
                  ...p,
                  createdAt: config.createdAt,
                });
                notify("Print calibration saved");
              })
            }
          >
            Save calibration
          </button>
        </fieldset>
        <button
          className="btn secondary spaced"
          onClick={() => {
            try {
              printPatient(dummy, p, now(), true);
            } catch (e: any) {
              notify(e.message);
            }
          }}
        >
          <Printer size={16} />
          Test print
        </button>
        <p className="muted">
          Choose the printer in your system print dialog. Use its margin
          settings if the printer cannot print near an edge.
        </p>
      </section>
      <section className="panel paper-preview">
        <div className="panel-header">
          <h3>Position preview</h3>
          <span className="muted">
            {p.width} × {p.height} mm
          </span>
        </div>
        <div
          className="paper"
          style={{ aspectRatio: `${p.width}/${p.height}` }}
        >
          {Object.entries(p.fields).map(([k, f]) => (
            <button
              key={k}
              className={selected === k ? "selected" : ""}
              style={{
                left: `${(f.x / p.width) * 100}%`,
                top: `${(f.y / p.height) * 100}%`,
                maxWidth: `${(f.width / p.width) * 100}%`,
              }}
              onClick={() => setSelected(k)}
            >
              {k === "name"
                ? "Sample Patient"
                : k === "age"
                  ? "42 / male"
                  : k === "address"
                    ? "Hayatabad"
                    : k === "date"
                      ? today()
                      : "CV-…"}
            </button>
          ))}
          <div className="paper-note">
            Text-only output
            <br />
            No stationery artwork is reproduced
          </div>
        </div>
      </section>
    </div>
  );
}
function FeeSettings({ fees, doctor }: any) {
  const [f, setF] = useState({
    id: newId(),
    standard: 200000,
    followUp: 100000,
    effectiveDate: today(),
    createdAt: now(),
  });
  return (
    <section className="panel settings-panel">
      <h2>Consultation fees</h2>
      <p>
        New fee schedules apply to new visits only. Existing visits keep their
        recorded fee.
      </p>
      {doctor && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await store.save("fees", f);
              setF({ ...f, id: newId(), createdAt: now() });
              notify("Fee schedule saved");
            });
          }}
        >
          <div className="form-grid">
            <Money
              label="Standard fee (PKR)"
              value={f.standard}
              setValue={(x) => setF({ ...f, standard: x })}
            />
            <Money
              label="Follow-up fee (PKR)"
              value={f.followUp}
              setValue={(x) => setF({ ...f, followUp: x })}
            />
          </div>
          <Field label="Effective date">
            <input
              type="date"
              required
              value={f.effectiveDate}
              onChange={(e) => setF({ ...f, effectiveDate: e.target.value })}
            />
          </Field>
          <button className="btn">Add fee schedule</button>
        </form>
      )}
      <div className="list spaced">
        {fees
          .sort((a: Fee, b: Fee) =>
            b.effectiveDate.localeCompare(a.effectiveDate),
          )
          .map((f: Fee) => (
            <div key={f.id}>
              <strong>{f.effectiveDate}</strong>
              <span>New: {pkr(f.standard)}</span>
              <span>Follow-up: {pkr(f.followUp)}</span>
            </div>
          ))}
      </div>
    </section>
  );
}
function ReceiptView({ payment, visits, patients }: any) {
  const v = visits.find((v: Visit) => v.id === payment.visitId),
    p = patients.find((p: Patient) => p.id === v?.patientId);
  return (
    <div className="modal-body receipt">
      <h2>Clearview · Private practice</h2>
      <Badge status={payment.kind} />
      <h3>{p?.name}</h3>
      <p>{p?.patientNumber}</p>
      <p>
        {dateLabel(payment.createdAt)} · {timeLabel(payment.createdAt)}
      </p>
      <hr />
      <h1>{pkr(payment.amount)}</h1>
      <p>
        {payment.method} · {payment.reason}
      </p>
      <code>{payment.id}</code>
      <p className="muted">
        {store.getVault()?.outbox.some((o) => o.recordId === payment.id)
          ? "Pending synchronization and server validation"
          : "Synchronized transaction"}
      </p>
      <button className="btn secondary" onClick={() => window.print()}>
        <Printer size={16} />
        Print receipt
      </button>
    </div>
  );
}
function Staff() {
  const [list, setList] = useState<any[]>([]),
    [error, setError] = useState(""),
    [f, setF] = useState<any>({
      name: "",
      email: "",
      password: "",
      permissions: [],
    });
  async function load() {
    try {
      setList(await store.request("/api/users"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="modal-body">
      {error && <div className="notice">{error}</div>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await store.request("/api/users", {
              method: "POST",
              body: JSON.stringify(f),
            });
            setF({ name: "", email: "", password: "", permissions: [] });
            await load();
            notify("Attendant created");
          });
        }}
      >
        <Field label="Attendant name">
          <input
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </Field>
        <Field label="Initial password (12+ characters)">
          <input
            type="password"
            required
            minLength={12}
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
          />
        </Field>
        <div className="inline-actions">
          {["clinical", "financial", "expenses"].map((p) => (
            <label className="check" key={p}>
              <input
                type="checkbox"
                checked={f.permissions.includes(p)}
                onChange={(e) =>
                  setF({
                    ...f,
                    permissions: e.target.checked
                      ? [...f.permissions, p]
                      : f.permissions.filter((x: string) => x !== p),
                  })
                }
              />
              {p}
            </label>
          ))}
        </div>
        <button className="btn">Create attendant</button>
      </form>
      <hr />
      {list.map((u) => (
        <div className="staff-row" key={u.id}>
          <strong>{u.name}</strong>
          <small>
            {u.email} · {u.role}
          </small>
          {u.role === "attendant" && (
            <>
              <div className="inline-actions">
                {["clinical", "financial", "expenses"].map((p) => (
                  <label className="check" key={p}>
                    <input
                      type="checkbox"
                      checked={u.permissions.includes(p)}
                      onChange={(e) =>
                        setList(
                          list.map((x) =>
                            x.id === u.id
                              ? {
                                  ...x,
                                  permissions: e.target.checked
                                    ? [...x.permissions, p]
                                    : x.permissions.filter(
                                        (y: string) => y !== p,
                                      ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    {p}
                  </label>
                ))}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={u.disabled}
                  onChange={(e) =>
                    setList(
                      list.map((x) =>
                        x.id === u.id
                          ? { ...x, disabled: e.target.checked }
                          : x,
                      ),
                    )
                  }
                />
                Disable account
              </label>
              <button
                className="btn secondary"
                onClick={() =>
                  void act(async () => {
                    await store.request("/api/users/" + u.id, {
                      method: "PATCH",
                      body: JSON.stringify({
                        permissions: u.permissions,
                        disabled: u.disabled,
                      }),
                    });
                    await load();
                    notify("Staff access updated");
                  })
                }
              >
                Save access
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
function Audit() {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    store
      .request("/api/audit")
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="modal-body">
      {error && <div className="notice">{error}</div>}
      <p>
        Latest 200 changes. Full before/after records are retained on the server
        for authorized investigation.
      </p>
      <div className="list">
        {rows.map((r) => (
          <div key={r.id}>
            <small>
              {dateLabel(r.at)} {timeLabel(r.at)}
            </small>
            <strong>{r.entity || r.action}</strong>
            <code>{r.recordId?.slice(0, 14)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
