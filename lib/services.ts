import {
  AirVent,
  Cog,
  Gauge,
  HardHat,
  PackageCheck,
  Settings2,
  ShieldCheck,
  Wrench,
} from "lucide-react";

export const serviceCategories = [
  "Все",
  "Диагностика и выезд",
  "Компрессоры",
  "Вентиляция и приточные системы",
  "Редукторы и гидравлика",
] as const;

export type ServiceCategory = Exclude<(typeof serviceCategories)[number], "Все">;

export type Service = {
  id: number;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  price: number;
  category: ServiceCategory;
  estimatedDuration: string;
  image: string;
  included: string[];
};

// To add a new service: place a photo in /public/services, then append a typed object
// with a unique id, slug, category from serviceCategories, price and included steps.
// Good photos: real industrial compressor rooms, clean ventilation units, gearbox
// workshops, hydraulic press service bays, close-ups of gauges, rotors and tools.
export const services: Service[] = [
  {
    id: 1,
    slug: "diagnostika-kompressorov-na-obekte",
    title: "Диагностика компрессоров на объекте",
    shortDescription: "Выезд инженера, инструментальная проверка, дефектовка и план работ.",
    description:
      "Проводим комплексную диагностику винтовых и поршневых компрессоров на производственной площадке: проверяем давление, температуру, вибрации, утечки, состояние масла, фильтров, электрики и автоматики. По итогам заказчик получает понятное заключение с приоритетами ремонта и сметой.",
    price: 15000,
    category: "Диагностика и выезд",
    estimatedDuration: "1 рабочий день",
    image: "/services/compressor-diagnostics.svg",
    included: ["Выезд специалиста", "Проверка рабочих параметров", "Дефектная ведомость", "Рекомендации по ремонту"],
  },
  {
    id: 2,
    slug: "remont-vintovyh-kompressorov",
    title: "Ремонт винтовых компрессоров",
    shortDescription: "Сервис винтовых блоков, замена расходников, восстановление узлов.",
    description:
      "Выполняем ремонт винтовых компрессоров промышленных марок: от планового ТО до восстановления винтового блока и системы сепарации масла. Работаем с электрической частью, пневмолиниями, охлаждением и контроллерами.",
    price: 45000,
    category: "Компрессоры",
    estimatedDuration: "2-5 рабочих дней",
    image: "/services/screw-compressor-repair.svg",
    included: ["Разборка и дефектовка", "Замена фильтров и сепаратора", "Проверка винтового блока", "Пусконаладка"],
  },
  {
    id: 3,
    slug: "remont-porshnevyh-kompressorov",
    title: "Ремонт поршневых компрессоров",
    shortDescription: "Диагностика цилиндропоршневой группы, клапанов и приводов.",
    description:
      "Восстанавливаем поршневые компрессоры после перегрева, потери производительности, повышенного шума и утечек. Проверяем клапанные плиты, кольца, цилиндры, приводные ремни, ресиверы и автоматику безопасности.",
    price: 38000,
    category: "Компрессоры",
    estimatedDuration: "2-4 рабочих дня",
    image: "/services/piston-compressor-service.svg",
    included: ["Дефектовка ЦПГ", "Замена клапанов и колец", "Проверка ресивера", "Контроль герметичности"],
  },
  {
    id: 4,
    slug: "to-vintovyh-kompressorov",
    title: "Плановое ТО винтовых компрессоров",
    shortDescription: "Регламентное обслуживание для стабильной работы без простоев.",
    description:
      "Проводим регулярное ТО по моточасам: меняем масло, воздушные и масляные фильтры, сепараторы, проверяем привод, теплообменники, клапаны минимального давления, датчики и настройки контроллера.",
    price: 28000,
    category: "Компрессоры",
    estimatedDuration: "4-8 часов",
    image: "/services/compressor-maintenance.svg",
    included: ["Комплект расходников", "Замена масла", "Настройка контроллера", "Акт выполненных работ"],
  },
  {
    id: 5,
    slug: "obsluzhivanie-pritochnyh-ustanovok",
    title: "Обслуживание приточных установок",
    shortDescription: "Сервис приточек: фильтры, автоматика, вентиляторы, теплообменники.",
    description:
      "Обслуживаем приточные вентиляционные установки на производственных и коммерческих объектах. Проверяем вентиляторные секции, калориферы, фильтры, клапаны, датчики, автоматику и качество притока.",
    price: 32000,
    category: "Вентиляция и приточные системы",
    estimatedDuration: "1 рабочий день",
    image: "/services/air-handling-unit.svg",
    included: ["Осмотр секций", "Замена фильтров", "Проверка автоматики", "Балансировка режимов"],
  },
  {
    id: 6,
    slug: "diagnostika-ventilyacii",
    title: "Чистка и диагностика вентиляции",
    shortDescription: "Инспекция каналов, замеры воздуха, очистка и рекомендации.",
    description:
      "Проверяем вентиляционные системы на загрязнение, шум, падение производительности и неправильную балансировку. Проводим очистку доступных участков, замеры расхода воздуха и готовим план восстановления.",
    price: 26000,
    category: "Вентиляция и приточные системы",
    estimatedDuration: "1-2 рабочих дня",
    image: "/services/ventilation-cleaning.svg",
    included: ["Осмотр воздуховодов", "Замеры расхода воздуха", "Очистка узлов", "Отчет по системе"],
  },
  {
    id: 7,
    slug: "remont-reduktorov",
    title: "Ремонт промышленных редукторов",
    shortDescription: "Дефектовка шестерен, валов, подшипников и уплотнений.",
    description:
      "Выполняем ремонт и восстановление редукторов технологического оборудования: замена подшипников, уплотнений, ремонт валов, шестерен, корпусных посадок и контроль соосности.",
    price: 52000,
    category: "Редукторы и гидравлика",
    estimatedDuration: "3-7 рабочих дней",
    image: "/services/gearbox-repair.svg",
    included: ["Разборка редуктора", "Дефектовка зубчатых пар", "Замена подшипников", "Сборка и испытание"],
  },
  {
    id: 8,
    slug: "remont-gidravlicheskih-sistem",
    title: "Ремонт гидравлических систем",
    shortDescription: "Гидростанции, насосы, цилиндры, клапаны и прессовое оборудование.",
    description:
      "Обслуживаем гидравлические прессы и линии: ищем утечки, проверяем давление, насосы, распределители, цилиндры и фильтрацию. Восстанавливаем стабильность усилия и безопасность работы.",
    price: 58000,
    category: "Редукторы и гидравлика",
    estimatedDuration: "2-6 рабочих дней",
    image: "/services/hydraulic-press-service.svg",
    included: ["Диагностика давления", "Поиск утечек", "Ремонт цилиндров", "Настройка клапанов"],
  },
  {
    id: 9,
    slug: "postavka-zapchastey-dlya-kompressorov",
    title: "Поставка и замена запчастей",
    shortDescription: "Подбор, поставка и монтаж расходников и узлов для компрессоров.",
    description:
      "Подбираем оригинальные и качественные совместимые запчасти: фильтры, сепараторы, масла, ремни, клапаны, датчики, подшипники и элементы автоматики. Можем выполнить замену на объекте с гарантией.",
    price: 12000,
    category: "Компрессоры",
    estimatedDuration: "От 1 дня",
    image: "/services/compressor-spare-parts.svg",
    included: ["Подбор по модели", "Проверка совместимости", "Поставка", "Монтаж и проверка"],
  },
  {
    id: 10,
    slug: "kapitalnyy-remont-oborudovaniya",
    title: "Капитальный ремонт оборудования",
    shortDescription: "Полное восстановление промышленных узлов с испытаниями.",
    description:
      "Комплексно восстанавливаем компрессорное, вентиляционное, редукторное и гидравлическое оборудование. Берем на себя дефектовку, закупку комплектующих, ремонт, сборку, испытания и ввод в эксплуатацию.",
    price: 95000,
    category: "Диагностика и выезд",
    estimatedDuration: "5-14 рабочих дней",
    image: "/services/industrial-overhaul.svg",
    included: ["Полная дефектовка", "Смета и график", "Ремонт узлов", "Испытания под нагрузкой"],
  },
];

export const categoryIcon = {
  "Диагностика и выезд": Gauge,
  Компрессоры: Settings2,
  "Вентиляция и приточные системы": AirVent,
  "Редукторы и гидравлика": Cog,
} satisfies Record<ServiceCategory, typeof Gauge>;

export const advantageCards = [
  {
    icon: ShieldCheck,
    title: "Ответственность за простой",
    text: "Работаем так, чтобы оборудование возвращалось в эксплуатацию быстро и предсказуемо.",
  },
  {
    icon: HardHat,
    title: "Инженерный подход",
    text: "Сначала параметры, дефектовка и причина отказа. Затем ремонт, а не случайная замена деталей.",
  },
  {
    icon: Wrench,
    title: "Сервис на объекте",
    text: "Выездные бригады закрывают диагностику, ТО и часть ремонтов без перевозки оборудования.",
  },
  {
    icon: PackageCheck,
    title: "Запчасти и расходники",
    text: "Подбираем фильтры, масла, ремни, клапаны, подшипники и узлы под конкретные модели.",
  },
];

export function getServiceBySlug(slug: string) {
  return services.find((service) => service.slug === slug);
}
