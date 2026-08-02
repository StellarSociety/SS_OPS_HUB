type PhoneCountry = { code: string; label: string; name: string };

/** ITU-T E.164 calling codes — one row per territory (may share a dial code). */
const PHONE_COUNTRY_ROWS: PhoneCountry[] = [
  { code: "+93", label: "AF", name: "Afghanistan" },
  { code: "+355", label: "AL", name: "Albania" },
  { code: "+213", label: "DZ", name: "Algeria" },
  { code: "+1684", label: "AS", name: "American Samoa" },
  { code: "+376", label: "AD", name: "Andorra" },
  { code: "+244", label: "AO", name: "Angola" },
  { code: "+1264", label: "AI", name: "Anguilla" },
  { code: "+1268", label: "AG", name: "Antigua and Barbuda" },
  { code: "+54", label: "AR", name: "Argentina" },
  { code: "+374", label: "AM", name: "Armenia" },
  { code: "+297", label: "AW", name: "Aruba" },
  { code: "+61", label: "AU", name: "Australia" },
  { code: "+43", label: "AT", name: "Austria" },
  { code: "+994", label: "AZ", name: "Azerbaijan" },
  { code: "+1242", label: "BS", name: "Bahamas" },
  { code: "+973", label: "BH", name: "Bahrain" },
  { code: "+880", label: "BD", name: "Bangladesh" },
  { code: "+1246", label: "BB", name: "Barbados" },
  { code: "+375", label: "BY", name: "Belarus" },
  { code: "+32", label: "BE", name: "Belgium" },
  { code: "+501", label: "BZ", name: "Belize" },
  { code: "+229", label: "BJ", name: "Benin" },
  { code: "+1441", label: "BM", name: "Bermuda" },
  { code: "+975", label: "BT", name: "Bhutan" },
  { code: "+591", label: "BO", name: "Bolivia" },
  { code: "+387", label: "BA", name: "Bosnia and Herzegovina" },
  { code: "+267", label: "BW", name: "Botswana" },
  { code: "+55", label: "BR", name: "Brazil" },
  { code: "+246", label: "IO", name: "British Indian Ocean Territory" },
  { code: "+1284", label: "VG", name: "British Virgin Islands" },
  { code: "+673", label: "BN", name: "Brunei" },
  { code: "+359", label: "BG", name: "Bulgaria" },
  { code: "+226", label: "BF", name: "Burkina Faso" },
  { code: "+257", label: "BI", name: "Burundi" },
  { code: "+855", label: "KH", name: "Cambodia" },
  { code: "+237", label: "CM", name: "Cameroon" },
  { code: "+1", label: "CA", name: "Canada" },
  { code: "+238", label: "CV", name: "Cape Verde" },
  { code: "+1345", label: "KY", name: "Cayman Islands" },
  { code: "+236", label: "CF", name: "Central African Republic" },
  { code: "+235", label: "TD", name: "Chad" },
  { code: "+56", label: "CL", name: "Chile" },
  { code: "+86", label: "CN", name: "China" },
  { code: "+61", label: "CX", name: "Christmas Island" },
  { code: "+61", label: "CC", name: "Cocos Islands" },
  { code: "+57", label: "CO", name: "Colombia" },
  { code: "+269", label: "KM", name: "Comoros" },
  { code: "+682", label: "CK", name: "Cook Islands" },
  { code: "+506", label: "CR", name: "Costa Rica" },
  { code: "+385", label: "HR", name: "Croatia" },
  { code: "+53", label: "CU", name: "Cuba" },
  { code: "+599", label: "CW", name: "Curaçao" },
  { code: "+357", label: "CY", name: "Cyprus" },
  { code: "+420", label: "CZ", name: "Czech Republic" },
  { code: "+243", label: "CD", name: "DR Congo" },
  { code: "+45", label: "DK", name: "Denmark" },
  { code: "+253", label: "DJ", name: "Djibouti" },
  { code: "+1767", label: "DM", name: "Dominica" },
  { code: "+1809", label: "DO", name: "Dominican Republic" },
  { code: "+593", label: "EC", name: "Ecuador" },
  { code: "+20", label: "EG", name: "Egypt" },
  { code: "+503", label: "SV", name: "El Salvador" },
  { code: "+240", label: "GQ", name: "Equatorial Guinea" },
  { code: "+291", label: "ER", name: "Eritrea" },
  { code: "+372", label: "EE", name: "Estonia" },
  { code: "+268", label: "SZ", name: "Eswatini" },
  { code: "+251", label: "ET", name: "Ethiopia" },
  { code: "+500", label: "FK", name: "Falkland Islands" },
  { code: "+298", label: "FO", name: "Faroe Islands" },
  { code: "+679", label: "FJ", name: "Fiji" },
  { code: "+358", label: "FI", name: "Finland" },
  { code: "+33", label: "FR", name: "France" },
  { code: "+594", label: "GF", name: "French Guiana" },
  { code: "+689", label: "PF", name: "French Polynesia" },
  { code: "+241", label: "GA", name: "Gabon" },
  { code: "+220", label: "GM", name: "Gambia" },
  { code: "+995", label: "GE", name: "Georgia" },
  { code: "+49", label: "DE", name: "Germany" },
  { code: "+233", label: "GH", name: "Ghana" },
  { code: "+350", label: "GI", name: "Gibraltar" },
  { code: "+30", label: "GR", name: "Greece" },
  { code: "+299", label: "GL", name: "Greenland" },
  { code: "+1473", label: "GD", name: "Grenada" },
  { code: "+590", label: "GP", name: "Guadeloupe" },
  { code: "+1671", label: "GU", name: "Guam" },
  { code: "+502", label: "GT", name: "Guatemala" },
  { code: "+44", label: "GG", name: "Guernsey" },
  { code: "+224", label: "GN", name: "Guinea" },
  { code: "+245", label: "GW", name: "Guinea-Bissau" },
  { code: "+592", label: "GY", name: "Guyana" },
  { code: "+509", label: "HT", name: "Haiti" },
  { code: "+504", label: "HN", name: "Honduras" },
  { code: "+852", label: "HK", name: "Hong Kong" },
  { code: "+36", label: "HU", name: "Hungary" },
  { code: "+354", label: "IS", name: "Iceland" },
  { code: "+91", label: "IN", name: "India" },
  { code: "+62", label: "ID", name: "Indonesia" },
  { code: "+98", label: "IR", name: "Iran" },
  { code: "+964", label: "IQ", name: "Iraq" },
  { code: "+353", label: "IE", name: "Ireland" },
  { code: "+44", label: "IM", name: "Isle of Man" },
  { code: "+972", label: "IL", name: "Israel" },
  { code: "+39", label: "IT", name: "Italy" },
  { code: "+225", label: "CI", name: "Ivory Coast" },
  { code: "+1876", label: "JM", name: "Jamaica" },
  { code: "+81", label: "JP", name: "Japan" },
  { code: "+44", label: "JE", name: "Jersey" },
  { code: "+962", label: "JO", name: "Jordan" },
  { code: "+7", label: "KZ", name: "Kazakhstan" },
  { code: "+254", label: "KE", name: "Kenya" },
  { code: "+686", label: "KI", name: "Kiribati" },
  { code: "+383", label: "XK", name: "Kosovo" },
  { code: "+965", label: "KW", name: "Kuwait" },
  { code: "+996", label: "KG", name: "Kyrgyzstan" },
  { code: "+856", label: "LA", name: "Laos" },
  { code: "+371", label: "LV", name: "Latvia" },
  { code: "+961", label: "LB", name: "Lebanon" },
  { code: "+266", label: "LS", name: "Lesotho" },
  { code: "+231", label: "LR", name: "Liberia" },
  { code: "+218", label: "LY", name: "Libya" },
  { code: "+423", label: "LI", name: "Liechtenstein" },
  { code: "+370", label: "LT", name: "Lithuania" },
  { code: "+352", label: "LU", name: "Luxembourg" },
  { code: "+853", label: "MO", name: "Macau" },
  { code: "+261", label: "MG", name: "Madagascar" },
  { code: "+265", label: "MW", name: "Malawi" },
  { code: "+60", label: "MY", name: "Malaysia" },
  { code: "+960", label: "MV", name: "Maldives" },
  { code: "+223", label: "ML", name: "Mali" },
  { code: "+356", label: "MT", name: "Malta" },
  { code: "+692", label: "MH", name: "Marshall Islands" },
  { code: "+596", label: "MQ", name: "Martinique" },
  { code: "+222", label: "MR", name: "Mauritania" },
  { code: "+230", label: "MU", name: "Mauritius" },
  { code: "+262", label: "YT", name: "Mayotte" },
  { code: "+52", label: "MX", name: "Mexico" },
  { code: "+691", label: "FM", name: "Micronesia" },
  { code: "+373", label: "MD", name: "Moldova" },
  { code: "+377", label: "MC", name: "Monaco" },
  { code: "+976", label: "MN", name: "Mongolia" },
  { code: "+382", label: "ME", name: "Montenegro" },
  { code: "+1664", label: "MS", name: "Montserrat" },
  { code: "+212", label: "MA", name: "Morocco" },
  { code: "+258", label: "MZ", name: "Mozambique" },
  { code: "+95", label: "MM", name: "Myanmar" },
  { code: "+264", label: "NA", name: "Namibia" },
  { code: "+674", label: "NR", name: "Nauru" },
  { code: "+977", label: "NP", name: "Nepal" },
  { code: "+31", label: "NL", name: "Netherlands" },
  { code: "+687", label: "NC", name: "New Caledonia" },
  { code: "+64", label: "NZ", name: "New Zealand" },
  { code: "+505", label: "NI", name: "Nicaragua" },
  { code: "+227", label: "NE", name: "Niger" },
  { code: "+234", label: "NG", name: "Nigeria" },
  { code: "+683", label: "NU", name: "Niue" },
  { code: "+850", label: "KP", name: "North Korea" },
  { code: "+389", label: "MK", name: "North Macedonia" },
  { code: "+1670", label: "MP", name: "Northern Mariana Islands" },
  { code: "+47", label: "NO", name: "Norway" },
  { code: "+968", label: "OM", name: "Oman" },
  { code: "+92", label: "PK", name: "Pakistan" },
  { code: "+680", label: "PW", name: "Palau" },
  { code: "+970", label: "PS", name: "Palestine" },
  { code: "+507", label: "PA", name: "Panama" },
  { code: "+675", label: "PG", name: "Papua New Guinea" },
  { code: "+595", label: "PY", name: "Paraguay" },
  { code: "+51", label: "PE", name: "Peru" },
  { code: "+63", label: "PH", name: "Philippines" },
  { code: "+48", label: "PL", name: "Poland" },
  { code: "+351", label: "PT", name: "Portugal" },
  { code: "+1", label: "PR", name: "Puerto Rico" },
  { code: "+974", label: "QA", name: "Qatar" },
  { code: "+242", label: "CG", name: "Republic of the Congo" },
  { code: "+262", label: "RE", name: "Réunion" },
  { code: "+40", label: "RO", name: "Romania" },
  { code: "+7", label: "RU", name: "Russia" },
  { code: "+250", label: "RW", name: "Rwanda" },
  { code: "+590", label: "BL", name: "Saint Barthélemy" },
  { code: "+290", label: "SH", name: "Saint Helena" },
  { code: "+1869", label: "KN", name: "Saint Kitts and Nevis" },
  { code: "+1758", label: "LC", name: "Saint Lucia" },
  { code: "+590", label: "MF", name: "Saint Martin" },
  { code: "+508", label: "PM", name: "Saint Pierre and Miquelon" },
  { code: "+1784", label: "VC", name: "Saint Vincent and the Grenadines" },
  { code: "+685", label: "WS", name: "Samoa" },
  { code: "+378", label: "SM", name: "San Marino" },
  { code: "+239", label: "ST", name: "São Tomé and Príncipe" },
  { code: "+966", label: "SA", name: "Saudi Arabia" },
  { code: "+221", label: "SN", name: "Senegal" },
  { code: "+381", label: "RS", name: "Serbia" },
  { code: "+248", label: "SC", name: "Seychelles" },
  { code: "+232", label: "SL", name: "Sierra Leone" },
  { code: "+65", label: "SG", name: "Singapore" },
  { code: "+1721", label: "SX", name: "Sint Maarten" },
  { code: "+421", label: "SK", name: "Slovakia" },
  { code: "+386", label: "SI", name: "Slovenia" },
  { code: "+677", label: "SB", name: "Solomon Islands" },
  { code: "+252", label: "SO", name: "Somalia" },
  { code: "+27", label: "ZA", name: "South Africa" },
  { code: "+82", label: "KR", name: "South Korea" },
  { code: "+211", label: "SS", name: "South Sudan" },
  { code: "+34", label: "ES", name: "Spain" },
  { code: "+94", label: "LK", name: "Sri Lanka" },
  { code: "+249", label: "SD", name: "Sudan" },
  { code: "+597", label: "SR", name: "Suriname" },
  { code: "+47", label: "SJ", name: "Svalbard and Jan Mayen" },
  { code: "+46", label: "SE", name: "Sweden" },
  { code: "+41", label: "CH", name: "Switzerland" },
  { code: "+963", label: "SY", name: "Syria" },
  { code: "+886", label: "TW", name: "Taiwan" },
  { code: "+992", label: "TJ", name: "Tajikistan" },
  { code: "+255", label: "TZ", name: "Tanzania" },
  { code: "+66", label: "TH", name: "Thailand" },
  { code: "+670", label: "TL", name: "Timor-Leste" },
  { code: "+228", label: "TG", name: "Togo" },
  { code: "+690", label: "TK", name: "Tokelau" },
  { code: "+676", label: "TO", name: "Tonga" },
  { code: "+1868", label: "TT", name: "Trinidad and Tobago" },
  { code: "+216", label: "TN", name: "Tunisia" },
  { code: "+90", label: "TR", name: "Turkey" },
  { code: "+993", label: "TM", name: "Turkmenistan" },
  { code: "+1649", label: "TC", name: "Turks and Caicos Islands" },
  { code: "+688", label: "TV", name: "Tuvalu" },
  { code: "+256", label: "UG", name: "Uganda" },
  { code: "+380", label: "UA", name: "Ukraine" },
  { code: "+971", label: "AE", name: "United Arab Emirates" },
  { code: "+44", label: "GB", name: "United Kingdom" },
  { code: "+1", label: "US", name: "United States" },
  { code: "+598", label: "UY", name: "Uruguay" },
  { code: "+998", label: "UZ", name: "Uzbekistan" },
  { code: "+678", label: "VU", name: "Vanuatu" },
  { code: "+379", label: "VA", name: "Vatican City" },
  { code: "+58", label: "VE", name: "Venezuela" },
  { code: "+84", label: "VN", name: "Vietnam" },
  { code: "+1340", label: "VI", name: "U.S. Virgin Islands" },
  { code: "+681", label: "WF", name: "Wallis and Futuna" },
  { code: "+212", label: "EH", name: "Western Sahara" },
  { code: "+967", label: "YE", name: "Yemen" },
  { code: "+260", label: "ZM", name: "Zambia" },
  { code: "+263", label: "ZW", name: "Zimbabwe" },
];

export const DEFAULT_PHONE_COUNTRY_CODE = "+971";

/**
 * One option per dial code. Shared codes (e.g. +1) keep every country name
 * searchable while the trigger still shows the compact code.
 */
function buildPickerCodes(): PhoneCountry[] {
  const byCode = new Map<string, PhoneCountry>();
  for (const row of PHONE_COUNTRY_ROWS) {
    const existing = byCode.get(row.code);
    if (!existing) {
      byCode.set(row.code, { ...row });
      continue;
    }
    byCode.set(row.code, {
      code: row.code,
      label: existing.label.includes(row.label)
        ? existing.label
        : `${existing.label}/${row.label}`,
      name: `${existing.name}; ${row.name}`,
    });
  }

  const all = [...byCode.values()];
  const preferred = all.filter((c) => c.code === DEFAULT_PHONE_COUNTRY_CODE);
  const rest = all
    .filter((c) => c.code !== DEFAULT_PHONE_COUNTRY_CODE)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...preferred, ...rest];
}

export const PHONE_COUNTRY_CODES = buildPickerCodes();

const CODES_BY_LENGTH = [...new Set(PHONE_COUNTRY_CODES.map((c) => c.code))].sort(
  (a, b) => b.length - a.length,
);

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Join dial code + national digits into a compact international string. */
export function joinPhone(countryCode: string, national: string): string {
  const nationalDigits = digitsOnly(national);
  if (!nationalDigits) return "";
  const code = countryCode.startsWith("+")
    ? countryCode
    : `+${digitsOnly(countryCode)}`;
  return `${code}${nationalDigits}`;
}

/**
 * Split a stored phone into dial code + national number.
 * Prefers the longest matching known dial code; falls back to UAE.
 */
export function splitPhone(raw: string | null | undefined): {
  countryCode: string;
  national: string;
} {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return { countryCode: DEFAULT_PHONE_COUNTRY_CODE, national: "" };
  }

  const normalized = trimmed.startsWith("00")
    ? `+${trimmed.slice(2)}`
    : trimmed.startsWith("+")
      ? trimmed
      : trimmed;

  if (normalized.startsWith("+")) {
    const rest = digitsOnly(normalized.slice(1));
    for (const code of CODES_BY_LENGTH) {
      const codeDigits = digitsOnly(code);
      if (rest.startsWith(codeDigits)) {
        return {
          countryCode: code,
          national: rest.slice(codeDigits.length),
        };
      }
    }
    return {
      countryCode: DEFAULT_PHONE_COUNTRY_CODE,
      national: rest,
    };
  }

  return {
    countryCode: DEFAULT_PHONE_COUNTRY_CODE,
    national: digitsOnly(normalized),
  };
}

/** Digits-only international number for https://wa.me/<number>. */
export function whatsappChatUrl(raw: string | null | undefined): string | null {
  const digits = digitsOnly(raw ?? "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}
