"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { tenant } from "@/lib/demo-data";
import { OwnerServices } from "./OwnerServices";

type OwnerAppointment = { id: string; readableNumber: string; startsAt: string; endsAt: string; status: string; serviceName: string; customerName: string; customerEmail: string | null; customerPhone: string | null; staffName: string };
const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const apiPath = (path: string) => `${apiBase}/v1${path}`;
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const time = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function OwnerPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<OwnerAppointment[]>([]);
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [date, setDate] = useState(() => today());

  useEffect(() => { setToken(window.localStorage.getItem("agenda-session")); setLoading(false); }, []);

  const loadAppointments = useCallback(async (session: string, appointmentDate: string, signal?: AbortSignal) => {
    if (!apiBase) { setError("Configure NEXT_PUBLIC_API_URL para conectar o painel à API."); return; }
    setError("");
    try {
      const response = await fetch(apiPath(`/owner/${tenant.slug}/appointments?date=${appointmentDate}`), { headers: { Authorization: `Bearer ${session}` }, signal });
      if (response.status === 401) { window.localStorage.removeItem("agenda-session"); setToken(null); setError("Sua sessão expirou. Entre novamente."); return; }
      if (!response.ok) throw new Error();
      const payload = await response.json() as { appointments?: OwnerAppointment[] };
      setAppointments(payload.appointments ?? []);
    } catch { if (!signal?.aborted) setError("Não foi possível carregar a agenda. Verifique a API e tente novamente."); }
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState === "visible") void loadAppointments(token, date, controller.signal); };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); controller.abort(); };
  }, [token, date, loadAppointments]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!apiBase) { setError("Configure NEXT_PUBLIC_API_URL para conectar o painel à API."); return; }
    setError("");
    try {
      const response = await fetch(apiPath("/auth/login"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...credentials, tenantSlug: tenant.slug }) });
      if (!response.ok) throw new Error();
      const payload = await response.json() as { token: string };
      window.localStorage.setItem("agenda-session", payload.token);
      setToken(payload.token);
    } catch { setError("E-mail, senha ou estabelecimento inválidos."); }
  }

  async function changeStatus(id: string, status: "cancelled" | "completed") {
    if (!token) return;
    setBusyId(id); setError("");
    try {
      const response = await fetch(apiPath(`/owner/${tenant.slug}/appointments/${id}`), { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error();
      await loadAppointments(token, date);
    } catch { setError("Não foi possível atualizar este agendamento."); }
    finally { setBusyId(""); }
  }

  if (loading) return <main><div className="shell"><section className="card"><p className="muted">Carregando painel...</p></section></div></main>;
  return <main><div className="shell"><header className="panel-nav"><Link className="brand" href="/"><span className="brand-mark">M</span>{tenant.name}</Link><div className="actions"><Link className="button secondary" href="/reservar">Ver página pública</Link>{token && <button className="button secondary" onClick={() => { window.localStorage.removeItem("agenda-session"); setToken(null); }}>Sair</button>}</div></header>{!token ? <section className="card auth-card"><div className="eyebrow">Área protegida</div><h1 style={{ fontSize: "clamp(2rem,5vw,3.3rem)" }}>Acesse sua agenda.</h1><p className="muted">Entre para acompanhar clientes, horários e o funcionamento do estabelecimento.</p><form onSubmit={login} className="form-grid"><label className="field">E-mail<input type="email" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })} autoComplete="email" required /></label><label className="field">Senha<input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} autoComplete="current-password" required /></label><div className="actions"><button className="button" type="submit">Entrar</button></div></form>{error && <p className="error" role="alert">{error}</p>}</section> : <div className="panel-layout"><nav className="side-nav" aria-label="Área da equipe"><a href="#agenda">Agenda</a><a href="#servicos">Serviços</a></nav><section id="agenda"><div className="eyebrow">Área da equipe</div><h1 style={{ fontSize: "clamp(2.2rem,5vw,4rem)" }}>Agenda do dia.</h1><p className="muted">{date} · horários reservados online.</p><div className="stats"><div className="card"><span className="muted">Nesta data</span><strong>{appointments.length}</strong><span className="muted">atendimentos</span></div><div className="card"><span className="muted">Confirmados</span><strong>{appointments.filter((item) => item.status === "confirmed" || item.status === "pending").length}</strong><span className="muted">horários</span></div><div className="card"><span className="muted">Concluídos</span><strong>{appointments.filter((item) => item.status === "completed").length}</strong><span className="muted">atendimentos</span></div></div><div className="card"><div className="section-head"><div><h2>Horários reservados</h2><p className="muted">Atualização automática a cada 30 segundos enquanto o painel estiver aberto.</p></div><div className="actions"><label className="field">Data da agenda<input type="date" value={date} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label><button className="button secondary" type="button" onClick={() => token && void loadAppointments(token, date)}>Atualizar</button></div></div><div className="appointment-list">{appointments.length ? appointments.map((item) => <div className="appointment" key={item.id}><div><strong>{time(item.startsAt)} · {item.customerName}</strong><div className="muted">{item.serviceName} com {item.staffName} · {item.readableNumber}</div><small className="muted">{item.customerPhone ?? item.customerEmail ?? "Sem contato"}</small></div><div className="actions"><span className="badge">{item.status}</span>{(item.status === "confirmed" || item.status === "pending") && <><button className="button secondary" disabled={busyId === item.id} onClick={() => void changeStatus(item.id, "completed")}>Concluir</button><button className="button secondary" disabled={busyId === item.id} onClick={() => void changeStatus(item.id, "cancelled")}>Cancelar</button></>}</div></div>) : <p className="empty-state">Nenhum agendamento nesta data.</p>}</div></div>{error && <p className="error" role="alert">{error}</p>}<OwnerServices token={token} tenantSlug={tenant.slug} /></section></div>}</div></main>;
}

