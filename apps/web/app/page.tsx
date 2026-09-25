"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { services, tenant } from "@/lib/demo-data";

const styles = [
  { icon: "✦", label: "Clássicos", title: "Base essencial", text: "Uma experiência limpa, equilibrada e fácil de adaptar.", tone: "sage" },
  { icon: "N", label: "Modernos", title: "Detalhes atuais", text: "Composição contemporânea para uma marca que quer evoluir.", tone: "mint" },
  { icon: "B", label: "Bem-estar", title: "Cuidado próximo", text: "Espaço para apresentar seu atendimento com personalidade.", tone: "forest" },
  { icon: "T", label: "Texturas", title: "Presença visual", text: "Camadas de conteúdo que ajudam o visitante a decidir.", tone: "olive" },
  { icon: "C", label: "Combos", title: "Tudo conectado", text: "Serviços, agenda e contato em uma jornada contínua.", tone: "deep" }
];
const gallery = [
  { title: "Serviço 1", type: "Atendimento", tone: "sage" },
  { title: "Serviço 2", type: "Experiência", tone: "mint" },
  { title: "Serviço 3", type: "Cuidado", tone: "forest" },
  { title: "Produto 1", type: "Complemento", tone: "olive" }
];
const panelStyle = (index: number): CSSProperties => ({ ["--panel-index" as string]: index });

export default function HomePage() {
  const [activeStyle, setActiveStyle] = useState(0);
  const active = styles[activeStyle];
  return <main className="brand-site">
    <header className="brand-nav">
      <Link className="brand-lockup" href="#inicio"><span className="brand-symbol">M</span><span>{tenant.name}</span><small>Agenda</small></Link>
      <nav aria-label="Navegação principal"><a href="#inicio">Início</a><a href="#estilos">Experiência</a><a href="#servicos">Serviços</a><a href="#contato">Contato</a></nav>
      <Link className="green-button compact" href="/reservar">Agendar horário ↗</Link>
    </header>

    <section id="inicio" className="brand-hero"><div className="hero-abstract" aria-hidden="true"><span className="hero-orbit orbit-one"/><span className="hero-orbit orbit-two"/><span className="hero-block block-one"/><span className="hero-block block-two"/></div><div className="brand-hero-copy"><span className="green-kicker">Agendamento contemporâneo · simples de usar</span><h1>Seu tempo,<br/><em>bem cuidado.</em></h1><p>Uma presença digital clara para apresentar serviços, orientar escolhas e transformar interesse em horário confirmado.</p><div className="hero-actions"><Link className="green-button" href="/reservar">Ver serviços ↗</Link><a className="outline-button-light" href="#estilos">Explorar experiência ↓</a></div><div className="hero-meta"><span>DISPONIBILIDADE ONLINE</span><strong>24 HORAS</strong></div></div></section>

    <section id="estilos" className="style-section"><div className="style-heading"><span className="green-kicker">Uma base para sua marca</span><h2>Explore a experiência.</h2><p>O conteúdo pode mudar por empresa. A clareza do caminho continua a mesma.</p></div><div className="style-navigation" role="tablist" aria-label="Escolha uma característica"><div className="style-orbs">{styles.map((item, index) => <button key={item.label} type="button" role="tab" aria-selected={activeStyle === index} className={activeStyle === index ? "active" : ""} onClick={() => setActiveStyle(index)}><span className="orb-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></button>)}</div></div><div className="style-divider" aria-hidden="true"><span/></div><div className="style-feature"><div className={`feature-visual ${active.tone}`}><span className="visual-letter">{active.icon}</span><span className="visual-caption">{String(activeStyle + 1).padStart(2, "0")} · {active.label}</span></div><div className="feature-copy"><span className="green-kicker">{active.label}</span><h3>{active.title}</h3><p>{active.text}</p><Link href="/reservar">Escolher um horário ↗</Link></div></div><div className="style-carousel" aria-label="Destaques"><div className="style-scene"><div className="style-ring">{[...gallery, ...gallery, ...gallery, ...gallery, ...gallery].map((item, index) => <article className={`style-panel ${item.tone}`} style={panelStyle(index)} key={`${item.title}-${index}`}><span className="panel-mark">{item.title.slice(-1)}</span><span><small>{item.type}</small>{item.title}</span></article>)}</div></div></div></section>

    <section id="servicos" className="services-section"><div className="light-heading"><span className="green-kicker">Menu da casa</span><h2>Serviços & horários.</h2><p>Escolha uma opção e reserve um horário disponível em poucos passos.</p></div><div className="service-table"><div className="service-head"><span>Visual</span><span>Serviço</span><span>Detalhes</span><span>Ação</span></div>{services.map((service, index) => <article className="service-row" key={service.id}><div className={`service-visual tone-${index + 1}`}><span>{String(index + 1).padStart(2, "0")}</span></div><div><small>Opção · 0{index + 1}</small><h3>{service.name}</h3><span>{service.durationMinutes} min{service.price ? ` · R$ ${service.price.toFixed(2)}` : ""}</span></div><p>{service.description}</p><Link className="green-button compact" href={`/reservar?servico=${service.id}`}>Agendar ↗</Link></article>)}</div></section>

    <section id="inspiracao" className="inspiration-section"><div className="inspiration-heading"><span className="brand-symbol large">M</span><span className="green-kicker">Inspirações em movimento</span><h2>Encontre seu próximo horário.</h2><p>Um espaço visual para novidades, serviços e conteúdos que ajudam seu cliente a escolher.</p></div><div className="inspiration-carousel"><div className="inspiration-scene"><div className="inspiration-ring">{[...gallery, ...gallery, ...gallery, ...gallery, ...gallery].map((item, index) => <article className={`inspiration-panel ${item.tone}`} style={panelStyle(index)} key={`${item.title}-inspiration-${index}`}><span className="panel-mark">{item.title.slice(-1)}</span><span><small>{item.type}</small>{item.title}</span></article>)}</div></div></div></section>

    <section id="contato" className="contact-section"><div className="contact-glow" aria-hidden="true"/><div className="contact-wrap"><div className="contact-intro"><span className="green-kicker">Fale com a equipe</span><h2>Escolha o canal.<br/>A conversa começa daqui.</h2><p>Tire dúvidas, consulte horários ou conheça melhor os serviços pelo canal mais prático para você.</p></div><nav className="contact-stack" aria-label="Canais de contato"><Link className="contact-card" href="/reservar"><span className="contact-icon">AG</span><span><strong>Agendamento</strong><small>Escolha serviço, data e horário</small></span><b>↗</b></Link><Link className="contact-card" href="#servicos"><span className="contact-icon">SV</span><span><strong>Serviços</strong><small>Veja as opções disponíveis</small></span><b>↗</b></Link><Link className="contact-card" href="#inspiracao"><span className="contact-icon">IN</span><span><strong>Inspiração</strong><small>Conheça novidades e possibilidades</small></span><b>↗</b></Link><Link className="contact-card" href="mailto:contato@exemplo.com"><span className="contact-icon">@</span><span><strong>E-mail</strong><small>Contato formal e informações</small></span><b>↗</b></Link></nav></div></section>

    <footer className="site-footer"><div className="footer-main"><section className="footer-brand"><Link className="brand-lockup" href="#inicio"><span className="brand-symbol">M</span><span>{tenant.name}</span></Link><p>Uma base neutra para apresentar sua empresa e organizar seus horários.</p></section><nav className="footer-col" aria-label="Navegação"><h3>Navegação</h3><a href="#inicio">Início</a><a href="#estilos">Experiência</a><a href="#servicos">Serviços</a><a href="#contato">Contato</a></nav><nav className="footer-col" aria-label="Atendimento"><h3>Atendimento</h3><Link href="/reservar">Agendar horário</Link><a href="#contato">Falar com a equipe</a><a href="#inspiracao">Inspirações</a></nav><nav className="footer-col" aria-label="Horários"><h3>Horários</h3><span>Atendimento online</span><span>Disponibilidade atualizada</span><span>Confirmação imediata</span></nav></div><div className="footer-bottom"><span>© 2026 {tenant.name}. Todos os direitos reservados.</span><nav><a href="#inicio">Voltar ao início</a><Link href="/reservar">Agendar</Link><a href="#contato">Contato</a></nav></div></footer>
  </main>;
}
