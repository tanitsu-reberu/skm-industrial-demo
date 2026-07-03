import Link from "next/link";
import { ArrowRight, Mail, Phone } from "lucide-react";
import { AnimatedSection } from "@/components/animated-section";
import { ContactRequestForm } from "@/components/contact-request-form";
import { PageTransition } from "@/components/page-transition";
import { ParticleBackground } from "@/components/particle-background";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { advantageCards, services } from "@/lib/services";
import { siteConfig } from "@/lib/site-config";
import { formatMoney } from "@/lib/utils";

const stats = [
  ["24/7", "выезд на объект"],
  ["11", "направлений работ"],
  ["до 72 ч", "диагностика и план работ"],
];

export default function HomePage() {
  return (
    <PageTransition>
      <main>
        <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden border-b border-border">
          <ParticleBackground />
          <div className="section-shell relative z-10 flex min-h-[calc(100vh-4rem)] items-center py-16">
            <div className="max-w-4xl">
              <Badge className="mb-6 border-primary/40 bg-primary/10 text-white">Вентиляция · Чиллеры · Фанкойлы</Badge>
              <h1 className="font-display text-4xl font-semibold leading-[1.04] text-white sm:text-6xl lg:text-7xl">
                Монтаж, ремонт и обслуживание систем вентиляции и холодоснабжения.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-muted sm:text-lg">
                СКМ выполняет монтаж, ремонт, диагностику и техническое обслуживание вентиляции, чиллеров,
                фанкойлов и систем холодоснабжения для коммерческих и промышленных объектов.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/services">
                    Смотреть услуги
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <a href="#request">Оставить заявку</a>
                </Button>
              </div>
              <div className="mt-12 grid gap-3 md:grid-cols-3">
                {stats.map(([value, label]) => (
                  <div key={value} className="rounded-lg border border-border bg-card/70 p-4 backdrop-blur">
                    <p className="font-display text-2xl font-semibold text-white">{value}</p>
                    <p className="mt-1 text-sm text-muted">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <AnimatedSection>
          <div className="section-shell">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <Badge>О компании</Badge>
                <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-5xl">
                  Комплексный подход к микроклимату объекта.
                </h2>
                <p className="mt-5 text-base leading-8 text-muted">
                  Компания занимается профессиональным монтажом, ремонтом и техническим обслуживанием систем
                  вентиляции и холодоснабжения. Мы работаем с приточными и вытяжными системами вентиляции,
                  чиллерами и фанкойлами различных типов на объектах разной сложности.
                </p>
                <p className="mt-4 text-base leading-8 text-muted">
                  Наши специалисты выезжают на объект, проводят диагностику, оценивают состояние оборудования,
                  автоматики, гидравлических контуров и воздухораспределения. После обследования заказчик получает
                  понятный план работ: от точечного ремонта до комплексной модернизации системы под новые нагрузки.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {advantageCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Card key={card.title} className="transition duration-300 hover:-translate-y-1 hover:border-primary/60">
                      <CardHeader>
                        <div className="mb-4 grid h-11 w-11 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <CardTitle>{card.title}</CardTitle>
                        <CardDescription>{card.text}</CardDescription>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection className="border-y border-border bg-surface">
          <div className="section-shell">
            <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <Badge>Популярные услуги</Badge>
                <h2 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
                  Работы для вентиляции и холодоснабжения
                </h2>
              </div>
              <Button asChild variant="secondary">
                <Link href="/services">Весь каталог</Link>
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {services.slice(0, 3).map((service) => (
                <Card key={service.slug} className="group transition duration-300 hover:-translate-y-1 hover:border-primary/60">
                  <CardHeader>
                    <Badge>{service.category}</Badge>
                    <CardTitle className="mt-4">{service.title}</CardTitle>
                    <CardDescription>{service.shortDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="font-display text-lg font-semibold text-white">от {formatMoney(service.price)}</span>
                    <Link className="text-sm font-semibold text-primary" href={`/services/${service.slug}`}>
                      Подробнее
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection>
          <div className="section-shell">
            <div id="request" className="rounded-lg border border-border bg-card p-6 sm:p-8">
              <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                <div>
                  <Badge>Связаться с нами</Badge>
                  <h2 className="mt-4 font-display text-3xl font-semibold text-white">Оставить заявку</h2>
                  <p className="mt-4 max-w-2xl leading-7 text-muted">
                    Опишите задачу по вентиляции, чиллеру, фанкойлам или системе холодоснабжения. Укажите телефон,
                    а инженер свяжется с вами, уточнит детали объекта и предложит следующий шаг.
                  </p>
                  <div className="mt-6 grid gap-3">
                    <Button asChild variant="secondary">
                      <a href={siteConfig.phoneHref}>
                        <Phone className="h-4 w-4" />
                        {siteConfig.phone}
                      </a>
                    </Button>
                    <Button asChild variant="secondary">
                      <a href={siteConfig.emailHref}>
                        <Mail className="h-4 w-4" />
                        {siteConfig.email}
                      </a>
                    </Button>
                  </div>
                </div>
                <ContactRequestForm />
              </div>
            </div>
          </div>
        </AnimatedSection>
      </main>
    </PageTransition>
  );
}
