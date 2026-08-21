export type TermsSection = {
  id: string;
  heading: string;
  paragraphs: string[];
};

export type MobileTermsDocument = {
  title: string;
  productName: string;
  companyName: string;
  venueName: string;
  effectiveDate: string;
  intro: string;
  sections: TermsSection[];
};

const COMPANY = "Stellar Society Group";
const PRODUCT = "Stellar Society Operational Hub";
const EFFECTIVE_DATE = "21 August 2026";

export function buildMobileTerms(venueName: string): MobileTermsDocument {
  const venue = venueName.trim() || "this venue";

  return {
    title: "Terms & Conditions",
    productName: PRODUCT,
    companyName: COMPANY,
    venueName: venue,
    effectiveDate: EFFECTIVE_DATE,
    intro: `These Terms & Conditions govern your use of the ${PRODUCT} (the “Hub”) at ${venue}. They sit alongside your employment contract, ${COMPANY} policies, venue house rules, and applicable UAE law. By signing in or continuing to use the Hub you confirm that you have read, understood, and agree to be bound by them.`,
    sections: [
      {
        id: "acceptance",
        heading: "1. Acceptance",
        paragraphs: [
          `Access to the Hub is granted only to authorised ${COMPANY} employees, contractors, and other workers assigned to ${venue} or another group venue.`,
          "If you do not agree to these terms, you must stop using the Hub immediately and notify your manager. Continued use after any update constitutes acceptance of the revised terms.",
        ],
      },
      {
        id: "who",
        heading: "2. Who must comply",
        paragraphs: [
          "These terms apply to every person who is given a Hub account, including full-time, part-time, probationary, casual, agency, and contractor staff.",
          "Managers who grant access remain responsible for ensuring their teams understand these rules. Sharing an account, leaving a session unlocked, or allowing another person to act in your name is a breach by you.",
        ],
      },
      {
        id: "purpose",
        heading: "3. Purpose of the Hub",
        paragraphs: [
          `The Hub is an internal operations system for ${COMPANY} venues. It is provided solely to support authorised work: scheduling and people records, revenue and accounting, HACCP and food-safety logs, guest sentiment, recipes and pour books, maintenance, tasks, events, and related operational tools.`,
          "The Hub is not a personal communication service, social network, or public website. Personal use is limited to what is strictly incidental to your duties.",
        ],
      },
      {
        id: "policies",
        heading: "4. Company policies and workplace rules",
        paragraphs: [
          `You must follow all ${COMPANY} and ${venue} policies while using the Hub, including but not limited to: code of conduct, confidentiality, data protection, anti-harassment, health and safety, food safety, cash and inventory control, uniform and asset rules, and IT / acceptable-use policies.`,
          "Where a Hub screen, alert, or workflow asks you to acknowledge a policy, complete a checklist, or confirm a record, you must do so truthfully and without delay. Clicking through, skipping required fields, or entering false information is a disciplinary matter.",
        ],
      },
      {
        id: "access",
        heading: "5. Access, credentials, and authorised use",
        paragraphs: [
          "Your login is personal. You must not share passwords, session links, QR host URLs, or device PINs. You must lock or sign out when you leave a device.",
          "You may only open modules, records, and venues you are authorised to use. Attempting to bypass permissions, use another person’s account, or access a venue you are not assigned to is prohibited.",
          "If you suspect credentials have been compromised, report it immediately to your manager and to Hub administrators so access can be revoked or reset.",
        ],
      },
      {
        id: "data",
        heading: "6. Data management and confidentiality",
        paragraphs: [
          "Information in the Hub is confidential company property. This includes employee records, payroll and leave data, guest reviews, sales and cash figures, supplier invoices, recipes, pour specifications, HACCP logs, incident reports, and internal communications.",
          "You must not copy, screenshot, export, print, forward, or discuss Hub data outside authorised work channels unless a manager has expressly approved it for a legitimate business purpose.",
          "Do not store Hub data on personal devices, personal cloud accounts, WhatsApp, or other unapproved apps. Do not leave printed reports, tablets, or open screens unattended in public or guest areas.",
        ],
      },
      {
        id: "personal-data",
        heading: "7. Personal data processing",
        paragraphs: [
          `${COMPANY} processes personal data in the Hub to run the business: identity and employment details, attendance, leave, payroll, certifications, visas and documents, photos, device and login activity, and communications sent through the system.`,
          "Processing is carried out for employment administration, legal and regulatory compliance (including UAE labour, immigration, health and safety, and tax obligations), operational control, security, and dispute handling. Where required, it is also carried out for the company’s legitimate interests in protecting people, guests, assets, and brand.",
          "You must only view or handle another person’s data when it is necessary for your role. Curiosity, gossip, or sharing a colleague’s records is a serious breach. You must keep employee and guest personal data accurate when you are responsible for entering it, and you must report errors you cannot correct.",
        ],
      },
      {
        id: "guest-commercial",
        heading: "8. Guest, commercial, and operational records",
        paragraphs: [
          "Sales, cash, discounts, waiter reports, GP and cost of sales, invoices, and accounting entries must be complete, timely, and honest. Altering, omitting, or fabricating figures is fraud and will be treated as such.",
          "HACCP, temperature, cleaning, allergen, and food-safety records must reflect what actually happened at the time. Back-filling, copying previous days, or signing for checks you did not perform is prohibited and may also breach food-safety law.",
          "Guest reviews, sentiment actions, and guest personal details must be handled professionally. Do not publish, mock, or share guest content outside authorised reply and escalation workflows.",
        ],
      },
      {
        id: "sharing",
        heading: "9. Content sharing and communications",
        paragraphs: [
          "Anything you enter, upload, or send in the Hub — notes, photos, comments, replies to reviews, task updates, emails triggered from the Hub — is a company communication. Write as if it will be audited.",
          "You must not share, post, or leak Hub content on social media, messaging apps, or with press, competitors, suppliers, or guests unless you are expressly authorised to do so.",
          "External emails generated from the Hub (payslips, document requests, uniform or asset terms, guest replies) must use approved templates and must not include extra personal commentary, unauthorised attachments, or data about other people.",
        ],
      },
      {
        id: "uploads",
        heading: "10. Uploads, photos, and files",
        paragraphs: [
          "Upload only files that are required for work: staff photos, documents, invoices, HACCP evidence, and similar operational records. Do not upload personal photos, copyrighted material you do not have the right to use, malware, or offensive content.",
          "Images of people, guests, or workplaces must respect privacy, dignity, and venue house rules. Do not photograph guests, payment cards, passports, or sensitive documents except as required by an authorised process.",
          "Files you upload may be converted, stored, and retained by the company. You have no expectation of personal privacy in Hub uploads.",
        ],
      },
      {
        id: "integrity",
        heading: "11. Accuracy, integrity, and audit",
        paragraphs: [
          "You are responsible for the accuracy of records you create or approve. If you make a mistake, correct it through the proper workflow or report it. Do not hide errors.",
          "The Hub keeps audit trails: who signed in, what was viewed, created, changed, approved, emailed, or deleted. Those logs may be used in investigations, performance reviews, and legal proceedings.",
          "Deleting, falsifying, or attempting to conceal records to avoid accountability is a serious offence.",
        ],
      },
      {
        id: "security",
        heading: "12. Security and devices",
        paragraphs: [
          "Use only company-approved devices and networks where required. Do not jailbreak, sideload unauthorised software, or disable security controls on devices used for the Hub.",
          "Do not connect the Hub to public or untrusted Wi-Fi for sensitive work (payroll, HR documents, cash, or guest data) unless a company VPN or approved method is in place.",
          "Report lost or stolen devices that may still be signed in without delay.",
        ],
      },
      {
        id: "monitoring",
        heading: "13. Monitoring",
        paragraphs: [
          `${COMPANY} may monitor Hub use to protect the business, guests, and staff. This includes login times, IP and device information, pages opened, records changed, messages sent, and files uploaded.`,
          "There is no reasonable expectation of privacy when using the Hub. Monitoring will be carried out in line with UAE law and company policy.",
        ],
      },
      {
        id: "ip",
        heading: "14. Intellectual property",
        paragraphs: [
          `The Hub, its design, recipes, pour books, processes, reports, and content are owned by ${COMPANY} or its licensors. You receive a limited, revocable licence to use them only while employed or engaged and only for authorised work.`,
          "You may not copy, reverse engineer, scrape, or reuse Hub materials for another employer, a personal business, or any third party.",
        ],
      },
      {
        id: "prohibited",
        heading: "15. Prohibited use",
        paragraphs: [
          "You must not: harass, bully, or discriminate through the Hub; access data you have no business seeing; commit or conceal theft, fraud, or cash irregularities; interfere with food-safety or legal records; introduce malware; attempt to hack, scrape, or overload the system; use the Hub to compete with the company; or do anything unlawful.",
          "You must not use the Hub while it would be unsafe or in breach of service standards — for example during service in a way that puts guests or colleagues at risk.",
        ],
      },
      {
        id: "consequences",
        heading: "16. Consequences of non-compliance",
        paragraphs: [
          "Breaches will be investigated. Depending on severity, consequences may include a recorded warning, mandatory retraining, restriction or removal of Hub access, suspension, termination of employment or engagement for cause, recovery of losses (including salary deduction where lawful and previously agreed for uniforms, assets, or similar), and referral to the police or other authorities.",
          "Serious or dishonest breaches — including data leaks, falsified HACCP or sales records, unauthorised sharing of employee or guest information, and attempts to bypass security — will ordinarily be treated as gross misconduct.",
          "The company may also pursue civil claims for damage, regulatory penalties, and injunctive relief. These terms do not limit any right ${COMPANY} has under your contract or UAE law.",
        ],
      },
      {
        id: "reporting",
        heading: "17. Incident reporting",
        paragraphs: [
          "Report immediately to your manager and Hub administrators: suspected data leaks, lost devices, unauthorised access, incorrect or fraudulent records, and any request to ignore these terms.",
          "Good-faith reports of genuine issues will not be treated as misconduct. Deliberately false reports may be.",
        ],
      },
      {
        id: "changes",
        heading: "18. Changes to these terms",
        paragraphs: [
          `${COMPANY} may update these terms as the Hub, the law, or company policy changes. The effective date at the top of this page will be revised. Material changes may also be notified in the Hub or by email.`,
          "Your continued use after an update is acceptance of the new terms. If you cannot accept them, stop using the Hub and speak to your manager.",
        ],
      },
      {
        id: "law",
        heading: "19. Governing law",
        paragraphs: [
          `These terms are governed by the laws of the United Arab Emirates, including applicable Federal Decree-Laws on labour relations and personal data protection, and by the policies of ${COMPANY} and ${venue}.`,
          "They do not replace your employment contract. If there is a conflict, the contract and mandatory UAE law prevail, then company policy, then these terms.",
        ],
      },
      {
        id: "contact",
        heading: "20. Questions",
        paragraphs: [
          `Questions about these terms, data handling, or your Hub access should go first to your manager at ${venue}, then to Human Resources or Hub administrators.`,
          `Nothing in this page is legal advice to you personally. It is the company’s statement of the rules that apply when you use the ${PRODUCT}.`,
        ],
      },
    ],
  };
}
