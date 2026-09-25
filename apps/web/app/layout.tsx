import type { Metadata } from "next";
import "./globals.css";
import { PwaRegister } from "./PwaRegister";

export const metadata: Metadata = { title: "Marca | Agendamentos", description: "Agendamentos simples para clientes e equipes." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><PwaRegister />{children}</body></html>;
}
