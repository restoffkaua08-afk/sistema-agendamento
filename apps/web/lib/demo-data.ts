import type { PublicTenant, Service, Staff } from "@agenda/contracts";

export const tenant: PublicTenant = { slug: "marca", name: "Marca", tagline: "Seu horário, do seu jeito.", accent: "#2e7658", contactLabel: "Fale com a equipe" };
export const services: Service[] = [
  { id: "service-1", name: "Serviço 1", description: "Uma descrição curta e clara para este serviço.", durationMinutes: 45, price: 60 },
  { id: "service-2", name: "Serviço 2", description: "Outra opção disponível para você escolher.", durationMinutes: 60, price: 85 },
  { id: "service-3", name: "Serviço 3", description: "Atendimento personalizado com horário reservado.", durationMinutes: 30, price: 45 }
];
export const staff: Staff[] = [
  { id: "staff-1", name: "Profissional 1", role: "Atendimento", serviceIds: services.map((service) => service.id) },
  { id: "staff-2", name: "Profissional 2", role: "Atendimento", serviceIds: ["service-1", "service-2"] }
];
export const slots = ["09:00", "10:00", "11:30", "13:30", "14:30", "16:00"];
