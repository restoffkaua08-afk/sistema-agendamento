import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Marca", short_name: "Marca", description: "Agendamentos simples para clientes e equipes.", start_url: "/", display: "standalone", background_color: "#f7faf6", theme_color: "#17211b", lang: "pt-BR" };
}
