import { PrismaClient, SourceType } from "@prisma/client";

const prisma = new PrismaClient();

const sources = [
  {
    name: "GDACS Alerts",
    url: "https://www.gdacs.org/xml/rss.xml",
    type: SourceType.OFFICIAL_FEED,
    trustScore: 0.9
  },
  {
    name: "ReliefWeb Updates",
    url: "https://reliefweb.int/updates/rss.xml",
    type: SourceType.RSS,
    trustScore: 0.85
  },
  {
    name: "WHO News",
    url: "https://www.who.int/rss-feeds/news-english.xml",
    type: SourceType.OFFICIAL_FEED,
    trustScore: 0.95
  },
  {
    name: "CDC Travel Health Notices",
    url: "https://wwwnc.cdc.gov/travel/rss/notices.xml",
    type: SourceType.OFFICIAL_FEED,
    trustScore: 0.92
  },
  {
    name: "ECDC Epidemiological Updates",
    url: "https://www.ecdc.europa.eu/en/taxonomy/term/1310/feed",
    type: SourceType.OFFICIAL_FEED,
    trustScore: 0.92
  },
  {
    name: "ECDC Risk Assessments",
    url: "https://www.ecdc.europa.eu/en/taxonomy/term/1295/feed",
    type: SourceType.OFFICIAL_FEED,
    trustScore: 0.92
  },
  {
    name: "USGS Significant Earthquakes",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.atom",
    type: SourceType.OPEN_DATA,
    trustScore: 0.9
  },
  {
    name: "CISA Cybersecurity Advisories",
    url: "https://www.cisa.gov/cybersecurity-advisories/all.xml",
    type: SourceType.OFFICIAL_FEED,
    trustScore: 0.88
  },
  {
    name: "NOAA NHC Atlantic Advisories",
    url: "https://www.nhc.noaa.gov/index-at.xml",
    type: SourceType.OFFICIAL_FEED,
    trustScore: 0.88
  },
  {
    name: "FDA Recalls",
    url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/recalls/rss.xml",
    type: SourceType.OFFICIAL_FEED,
    trustScore: 0.86
  }
] satisfies Array<{
  name: string;
  url: string;
  type: SourceType;
  trustScore: number;
}>;

async function main() {
  for (const source of sources) {
    await prisma.source.upsert({
      where: { url: source.url },
      update: {
        name: source.name,
        type: source.type,
        trustScore: source.trustScore
      },
      create: source
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
