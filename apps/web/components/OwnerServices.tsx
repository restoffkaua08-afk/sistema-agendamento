"use client";

import { useCallback, useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number | null;
  active: boolean;
  staffIds: string[];
};
type Professional = { id: string; name: string };
type ServiceForm = Omit<Service, "id" | "priceCents"> & { price: string };
type ServicesPayload = { services: Service[]; staff: Professional[] };

const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const emptyForm: ServiceForm = { name: "", description: "", durationMinutes: 30, bufferMinutes: 0, price: "", active: true, staffIds: [] };

function priceInput(cents: number | null): string {
  return cents === null ? "" : `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

function parsePrice(value: string): number | null | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 2_147_483_647 ? cents : undefined;
}

async function responseMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({})) as { message?: string };
  return payload.message ?? "Não foi possível salvar o serviço.";
}

export function OwnerServices({ token, tenantSlug }: { token: string; tenantSlug: string }) {
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadServices = useCallback(async (signal?: AbortSignal) => {
    if (!apiBase) {
      setError("Configure NEXT_PUBLIC_API_URL para administrar os serviços.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${apiBase}/v1/owner/${encodeURIComponent(tenantSlug)}/services`, {
        headers: { Authorization: `Bearer ${token}` },
        signal
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json() as ServicesPayload;
      setServices(payload.services ?? []);
      setProfessionals(payload.staff ?? []);
      setError("");
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os serviços.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [tenantSlug, token]);

  useEffect(() => {
    const controller = new AbortController();
    void loadServices(controller.signal);
    return () => controller.abort();
  }, [loadServices]);

  function editService(service: Service) {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      price: priceInput(service.priceCents),
      active: service.active,
      staffIds: service.staffIds.filter((id) => professionals.some((person) => person.id === id))
    });
    setError("");
    setMessage("");
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
    setMessage("");
  }

  function toggleProfessional(id: string) {
    setForm((current) => ({
      ...current,
      staffIds: current.staffIds.includes(id)
        ? current.staffIds.filter((staffId) => staffId !== id)
        : [...current.staffIds, id]
    }));
  }

  function payloadFromForm(): Omit<Service, "id"> | null {
    const priceCents = parsePrice(form.price);
    if (priceCents === undefined) {
      setError("Informe o preço em reais, com até duas casas decimais.");
      return null;
    }
    if (form.active && form.staffIds.length === 0) {
      setError("Associe ao menos um profissional ativo a um serviço publicado.");
      return null;
    }
    return {
      name: form.name,
      description: form.description,
      durationMinutes: Number(form.durationMinutes),
      bufferMinutes: Number(form.bufferMinutes),
      priceCents,
      active: form.active,
      staffIds: form.staffIds
    };
  }

  async function saveService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = payloadFromForm();
    if (!payload) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const url = `${apiBase}/v1/owner/${encodeURIComponent(tenantSlug)}/services${editingId ? `/${encodeURIComponent(editingId)}` : ""}`;
      const response = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      resetForm();
      setMessage(editingId ? "Serviço atualizado." : "Serviço cadastrado.");
      await loadServices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o serviço.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleService(service: Service) {
    const activeStaffIds = service.staffIds.filter((id) => professionals.some((person) => person.id === id));
    setBusyId(service.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${apiBase}/v1/owner/${encodeURIComponent(tenantSlug)}/services/${encodeURIComponent(service.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...service, active: !service.active, staffIds: activeStaffIds })
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage(service.active ? "Serviço desativado; agendamentos existentes foram preservados." : "Serviço publicado.");
      await loadServices();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar o serviço.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="servicos" className="card service-admin">
      <div className="section-head">
        <div>
          <div className="eyebrow">Site público</div>
          <h2>Serviços</h2>
          <p className="muted">Os serviços ativos aparecem na página de agendamento.</p>
        </div>
        <button className="button secondary" type="button" onClick={() => void loadServices()}>Atualizar</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      <div className="service-admin-layout">
        <div className="service-admin-list" aria-label="Serviços cadastrados">
          {loading ? <p className="muted">Carregando serviços...</p> : services.length ? services.map((service) => (
            <article className="service-admin-item" key={service.id}>
              <div>
                <span className={`badge ${service.active ? "" : "badge-muted"}`}>{service.active ? "Publicado" : "Desativado"}</span>
                <h3>{service.name}</h3>
                <p className="muted">{service.durationMinutes} min{service.priceCents === null ? "" : ` · R$ ${(service.priceCents / 100).toFixed(2).replace(".", ",")}`}</p>
              </div>
              <div className="service-admin-actions">
                <button className="button secondary" type="button" onClick={() => editService(service)}>Editar</button>
                <button className="button secondary" type="button" disabled={busyId === service.id} onClick={() => void toggleService(service)}>{service.active ? "Desativar" : "Ativar"}</button>
              </div>
            </article>
          )) : <p className="empty-state">Ainda não há serviços cadastrados.</p>}
        </div>
        <form className="service-admin-form" onSubmit={saveService}>
          <div>
            <div className="eyebrow">{editingId ? "Editar cadastro" : "Novo cadastro"}</div>
            <h3>{editingId ? "Atualizar serviço" : "Adicionar serviço"}</h3>
          </div>
          <label className="field">Nome<input value={form.name} maxLength={100} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="field">Descrição<textarea value={form.description} maxLength={1000} rows={3} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="service-admin-numbers">
            <label className="field">Duração (min)<input type="number" min={5} max={720} step={1} value={form.durationMinutes} required onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></label>
            <label className="field">Intervalo (min)<input type="number" min={0} max={240} step={1} value={form.bufferMinutes} required onChange={(event) => setForm({ ...form, bufferMinutes: Number(event.target.value) })} /></label>
          </div>
          <label className="field">Preço (R$)<input inputMode="decimal" placeholder="65,00" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /><small className="muted">Deixe em branco para não exibir preço.</small></label>
          <fieldset className="service-admin-staff">
            <legend>Profissionais que realizam este serviço</legend>
            {professionals.length ? professionals.map((person) => (
              <label key={person.id}><input type="checkbox" checked={form.staffIds.includes(person.id)} onChange={() => toggleProfessional(person.id)} />{person.name}</label>
            )) : <p className="muted">Nenhum profissional ativo está cadastrado.</p>}
          </fieldset>
          <label className="service-admin-active"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Publicado no site</label>
          <div className="actions">
            <button className="button" type="submit" disabled={saving || loading || !apiBase}>{saving ? "Salvando..." : "Salvar serviço"}</button>
            {editingId && <button className="button secondary" type="button" onClick={resetForm}>Cancelar edição</button>}
          </div>
        </form>
      </div>
    </section>
  );
}
