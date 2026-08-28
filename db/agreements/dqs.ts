import type { ContractTerms } from "@/lib/contract"

export const DQS_TERMS: ContractTerms = {
  subtitle: "DQS Solutions & Staffing — Initial Website Project",
  source: "DQS Website Design, Development & Services Agreement (August 11, 2026)",
  preamble: [
    "This Website Design, Development & Services Agreement (the “Agreement”) is entered into as of August 11, 2026 (the “Effective Date”) by and between Karol Buczek, doing business as Tall Karol (“Consultant”), and DQS Solutions & Staffing (“Client”). Consultant and Client may each be called a “Party” and together the “Parties.”",
    "The Agreement includes the terms below and the attached project scope and schedule. If there is a conflict, a later written change order signed or approved in writing by both Parties controls only for the work described in that change order.",
  ],
  parties: [
    { role: "Consultant", name: "Karol Buczek, d/b/a Tall Karol" },
    { role: "Client", name: "DQS Solutions & Staffing" },
  ],
  paymentDue:
    "Invoices are due upon receipt and no later than five calendar days after issuance. Consultant may pause work, withhold launch or handoff, and adjust the schedule while any invoice is overdue. Overdue balances may accrue interest at 1.5% per month or the maximum lawful rate, whichever is lower, plus reasonable collection costs.",
  extraRateNote:
    "Unless otherwise agreed in writing, authorized additional and post-project work is billed at $90 USD per hour in 0.1-hour increments. Billable time includes design, development, research, planning, meetings, email, quality assurance, deployment, documentation, troubleshooting, and coordination performed for Client.",
  milestones: [
    {
      label: "Deposit — 40%",
      trigger:
        "Due upon signing; work and schedule are not reserved until received.",
      amountCents: 166400,
    },
    {
      label: "Deliverable 1 — 30%",
      trigger: "Due when Deliverable 1 is made available for review.",
      amountCents: 124800,
    },
    {
      label: "Deliverable 2 — Final — 30%",
      trigger:
        "Due when the sites are production-ready and before final DNS cutover, launch, and administrative handoff.",
      amountCents: 124800,
    },
  ],
  sections: [
    {
      heading: "1. Engagement and Scope",
      paragraphs: [
        "Client retains Consultant to establish a consolidated web foundation and deliver three brand websites as described in Schedule A. Consultant will perform the services professionally and in a manner consistent with generally accepted web-development practices.",
        "The project is fixed-scope. Anything not expressly included in Schedule A is excluded. Examples of excluded work include substantive copywriting, brand-identity development, custom business-system integrations, HubSpot implementation, ecommerce, multilingual functionality, legal or regulatory compliance consulting, ongoing hosting administration, ongoing maintenance, and work requested after the included feedback rounds.",
      ],
    },
    {
      heading: "2. Project Schedule",
      paragraphs: [
        "The target go-live date is September 14, 2026, assuming: (a) execution and deposit by August 17, 2026; (b) timely delivery of Client materials and access; and (c) all consolidated feedback and approvals by September 7, 2026.",
        "Dates are good-faith targets, not guarantees. Any Client delay, late approval, scope change, third-party outage, access issue, or event outside Consultant’s reasonable control extends affected dates by at least the length of the delay and may require rescheduling based on Consultant’s availability. If Client inactivity pauses the project for more than fifteen calendar days, Consultant may reschedule the remaining work. A pause exceeding thirty days may require a written restart plan and additional fee.",
      ],
    },
    {
      heading: "3. Fees and Payment",
      paragraphs: [
        "The fixed project fee is $4,160 USD.",
        "The deposit reserves capacity and is applied to the project fee. Once work begins, it is non-refundable except where required by law. Client is responsible for hosting, domains, premium plugins, stock assets, paid services, taxes, and third-party charges. Consultant will not incur a material third-party expense on Client’s behalf without approval.",
      ],
    },
    {
      heading: "4. Client Responsibilities",
      paragraphs: ["Client will:"],
      bullets: [
        "provide accurate copy, imagery, logos, brand assets, and other required materials before work begins on each site;",
        "provide timely administrative access to the existing DQS site, WordPress installations, hosting, domain registrar, DNS, analytics, and other required systems;",
        "designate one authorized point of contact who will provide consolidated feedback and approvals;",
        "review deliverables and respond within the stated review windows;",
        "verify the accuracy, legality, and completeness of all content and business claims before publication; and",
        "maintain appropriate credentials, permissions, privacy notices, and legal policies for its websites and business operations.",
      ],
      note: "Consultant may rely on instructions and approvals from Client’s designated contact. Client represents that it owns or has permission to use all materials it supplies and that those materials do not infringe third-party rights or violate applicable law.",
    },
    {
      heading: "5. Feedback, Delivery, and Acceptance",
      paragraphs: [
        "Each website includes two rounds of feedback. A “round” means one consolidated written list delivered by Client’s designated contact. Fragmented messages, conflicting stakeholder requests, or requests delivered after a round has closed may be combined into the next round or treated as additional work.",
        "Client will review each milestone within five business days after delivery. A deliverable is accepted when Client: (a) approves it in writing; (b) uses, publishes, or directs Consultant to launch it; or (c) does not provide a consolidated written list of material deficiencies within the review period. A material deficiency is a failure to conform to the written scope—not a new preference, new requirement, or change in business direction.",
        "Consultant will use reasonable efforts to correct timely reported material deficiencies. Acceptance does not eliminate the limited warranty in Section 10.",
      ],
    },
    {
      heading: "6. Changes and Additional Work",
      paragraphs: [
        "Any request outside the written scope requires written approval before Consultant is obligated to proceed. Consultant may describe the requested change, schedule impact, and either a fixed additional fee or time-and-materials billing.",
        "Any planning range is non-binding unless expressly identified as a fixed fee.",
      ],
    },
    {
      heading: "7. Intellectual Property",
      blocks: [
        {
          heading: "7.1 Client Materials",
          paragraphs: [
            "Client retains ownership of materials it supplies, including logos, copy, photographs, videos, data, and trademarks. Client grants Consultant a limited license to use those materials solely to perform the services and to exercise the portfolio rights below.",
          ],
        },
        {
          heading: "7.2 Site-Specific Deliverables",
          paragraphs: [
            "After full payment, Client owns the final site-specific copy, visual compositions, and configuration created exclusively for Client under this Agreement, excluding Consultant Tools and third-party materials.",
          ],
        },
        {
          heading: "7.3 Consultant Tools and Shared Platform",
          paragraphs: [
            "Consultant retains all right, title, and interest in pre-existing and reusable materials, including the DQS Foundations theme, DQS Core plugin and widgets, design-token architecture, templates, automation, command-line tools, code libraries, methods, processes, know-how, generic components, improvements, and derivatives that are not uniquely identifiable as Client content (“Consultant Tools”). Nothing in this Agreement transfers ownership of Consultant Tools or requires Consultant to stop using or developing them for other clients.",
            "After full payment, Consultant grants Client a perpetual, non-exclusive, worldwide, royalty-free license to use Consultant Tools as incorporated into the delivered websites owned or controlled by Client and its affiliated brands. Client may permit its employees and contractors to operate and maintain those websites, but may not sell, sublicense, publish as a standalone product, or commercially redistribute Consultant Tools.",
          ],
        },
        {
          heading: "7.4 Third-Party Materials",
          paragraphs: [
            "WordPress, Elementor, plugins, fonts, libraries, hosting services, stock assets, and other third-party materials remain governed by their respective licenses and terms. Consultant does not warrant continued availability, compatibility, price, or support of any third-party product.",
          ],
        },
        {
          heading: "7.5 Portfolio Use",
          paragraphs: [
            "After public launch, Consultant may identify Client as a client and display public-facing project screenshots, links, and a factual description in Consultant’s portfolio, proposals, awards submissions, and marketing unless Client opts out in writing before launch. Consultant will not disclose Client confidential information.",
          ],
        },
      ],
    },
    {
      heading: "8. Confidentiality",
      paragraphs: [
        "Each Party will protect non-public business, technical, financial, credential, and customer information received from the other Party using reasonable care and will use it only for this engagement. Confidential information does not include information that is public through no breach, already lawfully known, independently developed, or lawfully received from another source. A Party may disclose information when legally required after giving notice where permitted.",
      ],
    },
    {
      heading: "9. Accounts, Security, Privacy, and Backups",
      paragraphs: [
        "Consultant will use reasonable care when handling credentials and configuring the websites. No website or online service is completely secure or continuously available. Client remains responsible for account ownership, authorized users, password and multifactor-authentication practices, internal security policies, privacy notices, cookie consent, data-retention requirements, and legal compliance.",
        "Consultant will configure the hosting and backup features included in Schedule A, but hosting providers remain responsible for their infrastructure. Client should maintain independent copies of business-critical content and data. Malware remediation, incident response, legal compliance audits, and recovery from Client or third-party actions are additional services unless caused directly by Consultant’s willful misconduct.",
      ],
    },
    {
      heading: "10. Limited Warranty and Disclaimers",
      paragraphs: [
        "For thirty days after the applicable website launches, Consultant will correct reproducible defects that materially fail to conform to Schedule A at no additional professional fee, provided Client reports them promptly in writing. This warranty excludes issues caused by Client edits, third parties, platform or browser changes, expired licenses, hosting, malware, unsupported integrations, or use outside the intended configuration.",
        "Except for this limited warranty, the services and deliverables are provided “as is” to the maximum extent permitted by law. Consultant disclaims implied warranties of merchantability, fitness for a particular purpose, and non-infringement.",
        "SEO, AIEO, analytics, accessibility, security, page speed, and Core Web Vitals services are professional best efforts—not guarantees of rankings, indexing, AI citations, traffic, conversions, revenue, uninterrupted uptime, legal compliance, or any particular third-party score. Results may change because of Client content, hosting, devices, browsers, algorithms, competitors, plugins, and third-party scripts.",
      ],
    },
    {
      heading: "11. Maintenance and Support After Launch",
      paragraphs: [
        "Ongoing maintenance, hosting management, content changes, monitoring, reporting, and additions are not included beyond the limited warranty. They may be covered by a separate Website Care, retainer, or fractional-services agreement. Otherwise, authorized support is billed at the then-current ad hoc rate.",
      ],
    },
    {
      heading: "12. Suspension and Termination",
      paragraphs: [
        "Either Party may terminate for a material breach that remains uncured ten days after written notice. Consultant may suspend work immediately for overdue payment, unsafe or unlawful instructions, abuse, or loss of required access.",
        "Client may terminate for convenience by written notice. In that event, Client will pay for all milestones substantially completed, authorized time worked through termination, and approved non-cancellable commitments. Payments already earned are non-refundable. After payment, Consultant will provide completed Client-owned deliverables in their then-current state; unfinished work is not warranted or required to be production-ready.",
      ],
    },
    {
      heading: "13. Indemnification",
      paragraphs: [
        "Client will defend and indemnify Consultant and its subcontractors from third-party claims, damages, and reasonable costs arising from Client-supplied materials, Client’s products or services, unlawful or misleading Client content, Client’s misuse of the deliverables, or Client’s violation of privacy, advertising, employment, accessibility, intellectual-property, or other laws, except to the extent caused by Consultant’s gross negligence or willful misconduct.",
      ],
    },
    {
      heading: "14. Limitation of Liability",
      paragraphs: [
        "To the maximum extent permitted by law, neither Party will be liable to the other for indirect, incidental, special, exemplary, punitive, or consequential damages, including lost profits, lost revenue, lost data, or business interruption, even if advised that such damages were possible.",
        "Consultant’s total aggregate liability arising from this Agreement will not exceed the fees actually paid to Consultant under this Agreement. These limitations do not limit Client’s payment obligations or liability for infringement, misuse of Consultant Tools, or either Party’s fraud, gross negligence, or willful misconduct.",
      ],
    },
    {
      heading: "15. Independent Contractor",
      paragraphs: [
        "Consultant is an independent contractor, not an employee, partner, fiduciary, joint venturer, or agent of Client. Consultant controls the manner and means of performing the services and may use qualified subcontractors or automation while remaining responsible for the contracted deliverables. Neither Party may bind the other without written authority.",
      ],
    },
    {
      heading: "16. Force Majeure",
      paragraphs: [
        "Neither Party is liable for delay caused by events beyond reasonable control, including utility or internet failures, hosting outages, labor disruptions, natural disasters, war, civil disorder, government action, epidemics, cyberattacks not caused by that Party, or third-party platform failures. The affected Party will provide reasonable notice and resume performance when practical.",
      ],
    },
    {
      heading: "17. Governing Law and Disputes",
      paragraphs: [
        "The Parties will first attempt in good faith to resolve any dispute through direct discussion. This Agreement is governed by the laws of the State of Michigan, without regard to conflict-of-laws rules. The state and federal courts located in Wayne County, Michigan will have exclusive jurisdiction, and each Party consents to that venue.",
      ],
    },
    {
      heading: "18. General Terms",
      paragraphs: [
        "This Agreement and its schedules are the complete agreement regarding the project and replace prior discussions or proposals on the same subject. Amendments and waivers must be in writing and approved by authorized representatives of both Parties; email approval is sufficient for change orders and routine project decisions.",
        "Neither Party may assign this Agreement without the other’s written consent, except in connection with a merger, reorganization, or sale of substantially all relevant assets. If any provision is unenforceable, it will be narrowed to the minimum extent necessary and the remainder will continue. Failure to enforce a provision is not a waiver. Notices may be sent to the email addresses used by the Parties for this engagement. Electronic signatures and counterparts are valid and together form one agreement.",
      ],
    },
  ],
  schedules: [
    {
      title: "Schedule A",
      subtitle: "Project Scope and Deliverables",
      allocations: [
        {
          label: "A.1 Hosting — Initial Setup",
          amountCents: 16000,
          bullets: [
            "Managed hosting account setup",
            "Development and staging environments for the three websites",
            "SSL, available hosting backups, and deployment workflow configuration",
          ],
          note: "One-time setup. Future websites added to the same environment are separate projects but generally will not require repeating the account-level setup.",
        },
        {
          label: "A.2 DQS Web Foundation",
          amountCents: 80000,
          bullets: [
            "DQS Foundations custom Elementor child theme",
            "DQS Core custom Elementor widget/plugin system",
            "Reusable multi-brand design-token system and shared component foundation",
            "Installation and configuration for the three project websites",
          ],
        },
        {
          label: "A.3 DQS Website Rebuild",
          amountCents: 160000,
          bullets: [
            "Rebuild of the existing public DQS website and migration of existing public content identified at kickoff",
            "Design-system implementation and responsive development",
            "Forms, analytics, and tracking configuration",
            "Technical SEO and AIEO implementation, including structured data and content architecture",
            "Page-speed and Core Web Vitals optimization",
            "Two consolidated feedback rounds",
          ],
          note: "New pages, substantive copy rewrites, newly discovered private/archive content, complex data migration, and new integrations are excluded unless added by written change order.",
        },
        {
          label: "A.4 Axvor Website",
          amountCents: 64000,
          bullets: [
            "New website consisting of one to three pages",
            "Design-system application and responsive development",
            "Contact form, analytics, and tracking configuration",
            "Technical SEO, AIEO, page-speed, and Core Web Vitals optimization",
            "Two consolidated feedback rounds",
          ],
        },
        {
          label: "A.5 AIS Website",
          amountCents: 64000,
          bullets: [
            "New website consisting of one to three pages",
            "Design-system application and responsive development",
            "Contact form, analytics, and tracking configuration",
            "Technical SEO, AIEO, page-speed, and Core Web Vitals optimization",
            "Two consolidated feedback rounds",
          ],
        },
        {
          label: "A.6 Deployment and Post-Launch Audit",
          amountCents: 32000,
          bullets: [
            "Production deployment of all three websites",
            "DNS cutover and SSL verification",
            "Post-launch functional and visual QA audit",
            "Administrative-access handoff and concise documentation",
          ],
        },
      ],
      note: "Total fixed project fee: $4,160 USD",
    },
    {
      title: "Schedule B",
      subtitle: "Deliverable Schedule",
      tables: [
        {
          title: "Project Timeline",
          columns: ["Date", "Milestone", "Target result"],
          rows: [
            [
              "By Aug. 17, 2026",
              "Kickoff",
              "Agreement and deposit received; required access and initial materials provided.",
            ],
            [
              "Aug. 31, 2026",
              "Deliverable 1",
              "Foundation live; DQS and AIS available on staging for feedback; Axvor available as an in-progress staging preview.",
            ],
            [
              "By Sept. 7, 2026",
              "Feedback deadline",
              "Client returns all consolidated feedback, required decisions, and approvals.",
            ],
            [
              "Sept. 14, 2026",
              "Deliverable 2 / Go-live",
              "All three websites production-ready, launched after final payment, verified, and handed off.",
            ],
          ],
        },
      ],
      lists: [
        {
          title: "Deliverable 1 Includes",
          items: [
            "Managed hosting account and development/staging environments configured",
            "DQS Foundations and DQS Core installed and configured",
            "DQS and AIS staging builds ready for first-round review",
            "Initial in-progress feedback incorporated where provided on schedule",
            "Axvor design/build available as a staging preview",
          ],
        },
        {
          title: "Deliverable 2 Includes",
          items: [
            "Timely Deliverable 1 feedback incorporated into DQS and AIS",
            "Axvor design and build completed",
            "Technical SEO, AIEO, performance, and responsive QA finalized",
            "Production deployment, DNS cutover, and SSL verification",
            "Post-launch audit, administrative handoff, and documentation",
          ],
        },
        {
          title: "Required to Hold the Schedule",
          items: [
            "All copy, imagery, logos, and brand assets before each site’s build begins",
            "Administrative access to existing websites, hosting, domains, DNS, and registrar",
            "Hosting account purchased and owned directly by Client",
            "One designated point of contact providing consolidated feedback",
            "Feedback returned within each review window and final approvals by September 7",
            "Timely decisions regarding third-party tools, plugins, and integrations",
          ],
        },
      ],
    },
  ],
  signatures: [
    { role: "Consultant", name: "Karol Buczek, d/b/a Tall Karol" },
    { role: "Client", name: "DQS Solutions & Staffing" },
  ],
}
