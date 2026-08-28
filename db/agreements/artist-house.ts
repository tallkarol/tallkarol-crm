import type { ContractTerms } from "@/lib/contract"

export const ARTIST_HOUSE_TERMS: ContractTerms = {
  subtitle: "Automated Daily Reports",
  source: "AR_Intelligence_Agreement — execution copy (April 7, 2026)",
  preamble: [
    "This Project Agreement is entered into as of April 7, 2026 (“Project Kickoff”) between Karol Buczek (Tall Karol) (“Developer”) and Artist House (“Client”).",
  ],
  parties: [
    { role: "Developer", name: "Karol Buczek (Tall Karol)" },
    { role: "Client", name: "Artist House" },
  ],
  milestones: [
    {
      label: "Downpayment (40%)",
      trigger: "Upon signing",
      amountCents: 340000,
    },
    {
      label: "Deliverable 1 (30%)",
      trigger: "Upon delivery",
      amountCents: 255000,
    },
    {
      label: "Deliverable 2 — Final (30%)",
      trigger: "Upon delivery",
      amountCents: 255000,
    },
  ],
  sections: [
    {
      heading: "Deliverable 1 ($2,550)",
      bullets: [
        "Initial UI with sample CSV",
        "Soundcharts API integration",
        "Database setup (PostgreSQL with schema for artists, charts, social metrics)",
        "Sample CSV report demonstrating data collection",
        "Email delivery system configured (SendGrid)",
        "Initial 7 days of historical chart data populated",
      ],
    },
    {
      heading: "Deliverable 2 — Final ($2,550)",
      bullets: [
        "Refined UI based on feedback",
        "Refined CSV workbook based on feedback",
        "Daily automated report generation with all available metrics listed below",
        "Automated daily email delivery at scheduled time (6 AM)",
        "Production deployment on Railway or Render hosting",
        "Source code and credentials handoff",
        "Documentation for system operation and maintenance",
        "Social Discovery Hashtag Monitoring (contingent on service availability — see details below)",
      ],
    },
    {
      heading: "CSV Report Data Specifications",
      paragraphs: [
        "All metrics below are contingent on availability in Soundcharts API. If specific data points are unavailable, nearest equivalent metrics will be substituted.",
      ],
      blocks: [
        {
          heading: "Artist Growth Metrics",
          bullets: [
            "Artist Followers (Nominal): Follower count increases across Spotify, TikTok, Instagram",
            "Artist Followers (%): Percentage growth in followers across platforms",
            "YouTube Subscribers (Nominal & %)",
          ],
        },
        {
          heading: "Chart & Platform Activity",
          bullets: [
            "Spotify Top 200 (Global & US)",
            "Spotify Viral Charts (key markets)",
            "iTunes Charts (charting tracks)",
            "Amazon Music Charts (tracks & albums)",
            "SoundCloud Overall & New & Hot",
            "Shazam Charts",
            "TikTok Music Charts (U.S.)",
            "Genius Charts (overall & genre)",
          ],
        },
        {
          heading: "Streaming & Consumption",
          paragraphs: [
            "Platform-specific data is contingent on available data within the Soundcharts API.",
          ],
          bullets: [
            "Song consumption growth across platforms (Nominal & %)",
            "Artist catalog consumption growth (Nominal & %)",
            "iTunes Track Sales (Nominal & %)",
          ],
        },
      ],
    },
    {
      heading: "Social Discovery Hashtag Monitoring",
      paragraphs: [
        "CONTINGENT FEATURE: This feature is dependent on availability of a suitable data service (such as Pentos) or successful implementation of a scraper maintained via Apify or similar managed service. Developer is open to scraper solutions provided they are maintained via a managed service platform and do not violate respective terms of service, usage policies, and licensing restrictions of the underlying third-party providers. If technically infeasible, data quality is insufficient, or no suitable service exists, this component will be excluded from the final deliverable without reduction in the $8,500 project cost.",
        "Target hashtags: #newmusic, #songwriter, #musicdiscovery, #newartist, #independentmusic, #indiesleaze, #altpop, #indiepop, #bedroompop, #indiefolk, #singersongwriter.",
        "For each hashtag, the tool will surface (if technically feasible):",
      ],
      bullets: [
        "Top performing posts",
        "Songs used in those posts",
        "Associated artists",
        "Engagement velocity (growth rate)",
        "Artists appearing repeatedly across multiple discovery hashtags",
      ],
    },
    {
      heading: "Warranty & Support",
      paragraphs: [
        "Developer warrants and represents that: (a) the system is fit for its intended purpose and will operate as specified in this agreement; and (b) the system and all elements thereof do not infringe on the rights of any third party, including without limitation, intellectual property rights and rights of privacy. Developer will provide 30 days of warranty support from the date of Deliverable 2 completion. This includes bug fixes and corrections to ensure the system operates as specified in this agreement. The warranty does not cover:",
      ],
      bullets: [
        "Changes in third-party API specifications or availability",
        "Feature enhancements or additions beyond original scope",
        "Issues caused by client modifications to the source code",
        "Ongoing hosting costs or API subscription fees",
      ],
    },
    {
      heading: "Data Usage & Third-Party Compliance",
      paragraphs: [
        "The A&R Intelligence Tool utilizes third-party data sources and APIs, including but not limited to Soundcharts and any additional services integrated as part of this project. The Developer makes reasonable efforts to design and implement the system in accordance with publicly available documentation and best practices related to such services.",
        "The Client acknowledges that all data accessed through the system is subject to the respective terms of service, usage policies, and licensing restrictions of the underlying third-party providers. The Client is solely responsible for ensuring that their use, distribution, storage, or commercialization of such data complies with all applicable terms, laws, and regulations.",
        "The Developer shall not be held liable for Client’s misuse of data, violation of third-party terms, or legal consequences arising from the Client’s misuse of the system after delivery. This includes, but is not limited to, downstream usage of exported data, redistribution of reports, or integration into other systems not explicitly covered within this agreement.",
        "By engaging with this project, the Client agrees to indemnify and hold harmless the Developer from any claims, damages, or liabilities resulting from improper or non-compliant use of the data or system. In no event shall Developer’s total aggregate liability exceed the total amount actually paid by Client under this agreement.",
      ],
    },
    {
      heading: "Ownership & Work-for-Hire",
      paragraphs: [
        "All final deliverables specifically created for the Client under this Agreement (the “Deliverables”) shall be considered “work made for hire” to the extent permitted by law and, upon full payment, shall be owned exclusively by the Client.",
        "To the extent any Deliverables do not qualify as work made for hire, the Developer hereby assigns to the Client all right, title, and interest in and to such Deliverables upon full payment.",
        "Notwithstanding the foregoing, the Developer retains ownership of all pre-existing materials, tools, frameworks, methodologies, code libraries, and general know-how used in the creation of the Deliverables (“Developer Materials”). The Client is granted a perpetual, non-exclusive, royalty-free license to use, modify, and operate such Developer Materials solely as incorporated into the Deliverables.",
        "The Developer reserves the right to reuse, adapt, and further develop the underlying concepts, architecture, and non-client-specific components for other projects.",
      ],
    },
    {
      heading: "Miscellaneous",
      paragraphs: [
        "This agreement shall be governed by and interpreted in accordance with the laws of the State of New York applicable to agreements entered into and wholly performed in said State, without regard to any conflict of laws principles. Any action brought to enforce the terms of this Agreement shall be brought only in the courts of competent jurisdiction, state or federal, located within New York County, New York and each party hereto consents to the jurisdiction of said Courts.",
        "This agreement contains the entire understanding of the parties hereto relating to the subject matter hereof and cannot be changed or terminated except in a writing signed by all parties. A signed copy of this agreement transmitted by facsimile or scanned into an image file (e.g., PDF/JPEG) and transmitted via email shall, for all purposes, be treated as if it were delivered containing an original manual signature of the party whose signature appears thereon and shall be binding.",
        "It is expressly agreed that Developer is acting as an independent contractor and that nothing herein contained shall constitute a partnership, a joint venture, agency or employment relationship between Developer and Client.",
      ],
    },
    {
      heading: "Estimated Timeline",
      paragraphs: [
        "Total Development Time: 3–4 weeks from Project Kickoff (depending on level of feedback).",
        "Deliverable 1: Week 3. Deliverable 2: Week 4–5.",
      ],
    },
  ],
  operatingCostsNote:
    "These costs are the client's responsibility and are not included in the $8,500 development fee.",
  operatingCosts: [
    { label: "Soundcharts Standard API", amount: "$250/month" },
    { label: "Infrastructure (Railway/Render)", amount: "$5–10/month" },
    { label: "Email delivery (SendGrid)", amount: "$0 (free tier)" },
    {
      label: "Hashtag monitoring service (if implemented)",
      amount: "$100–200/month (e.g., Pentos, Apify, or alternative)",
    },
  ],
  operatingCostsTotal: "$355–460/month",
  signatures: [
    { role: "Developer", name: "Karol Buczek, Tall Karol" },
    { role: "Client", name: "Artist House" },
  ],
}
