/**
 * ISO 3166-1 countries.
 *
 * Stored as pipe-delimited rows rather than objects to keep 249 entries
 * reviewable in a diff: a changed digit in a numeric code is visible on one
 * line instead of buried in six.
 *
 *   alpha2 | alpha3 | numeric | dial | currency | region | subregion
 *
 * The English name is not in the table. It comes from Intl.DisplayNames at seed
 * time, which is maintained by CLDR and already correct — hand-typing 249 names
 * is 249 chances to misspell one, and "Türkiye" versus "Turkey" is exactly the
 * kind of edit that arrives later and has to be applied by hand otherwise.
 *
 * Dial codes are E.164 without the plus. They are not unique: the NANP shares 1
 * across twenty countries, and Kazakhstan shares 7 with Russia.
 */
export const COUNTRY_ROWS: readonly string[] = [
  // ── Africa ─────────────────────────────────────────────────────────────
  "DZ|DZA|012|213|DZD|Africa|Northern Africa",
  "EG|EGY|818|20|EGP|Africa|Northern Africa",
  "LY|LBY|434|218|LYD|Africa|Northern Africa",
  "MA|MAR|504|212|MAD|Africa|Northern Africa",
  "SD|SDN|729|249|SDG|Africa|Northern Africa",
  "TN|TUN|788|216|TND|Africa|Northern Africa",
  "EH|ESH|732|212|MAD|Africa|Northern Africa",
  "AO|AGO|024|244|AOA|Africa|Middle Africa",
  "CM|CMR|120|237|XAF|Africa|Middle Africa",
  "CF|CAF|140|236|XAF|Africa|Middle Africa",
  "TD|TCD|148|235|XAF|Africa|Middle Africa",
  "CG|COG|178|242|XAF|Africa|Middle Africa",
  "CD|COD|180|243|CDF|Africa|Middle Africa",
  "GQ|GNQ|226|240|XAF|Africa|Middle Africa",
  "GA|GAB|266|241|XAF|Africa|Middle Africa",
  "ST|STP|678|239|STN|Africa|Middle Africa",
  "BW|BWA|072|267|BWP|Africa|Southern Africa",
  "SZ|SWZ|748|268|SZL|Africa|Southern Africa",
  "LS|LSO|426|266|LSL|Africa|Southern Africa",
  "NA|NAM|516|264|NAD|Africa|Southern Africa",
  "ZA|ZAF|710|27|ZAR|Africa|Southern Africa",
  "BI|BDI|108|257|BIF|Africa|Eastern Africa",
  "KM|COM|174|269|KMF|Africa|Eastern Africa",
  "DJ|DJI|262|253|DJF|Africa|Eastern Africa",
  "ER|ERI|232|291|ERN|Africa|Eastern Africa",
  "ET|ETH|231|251|ETB|Africa|Eastern Africa",
  "KE|KEN|404|254|KES|Africa|Eastern Africa",
  "MG|MDG|450|261|MGA|Africa|Eastern Africa",
  "MW|MWI|454|265|MWK|Africa|Eastern Africa",
  "MU|MUS|480|230|MUR|Africa|Eastern Africa",
  "YT|MYT|175|262|EUR|Africa|Eastern Africa",
  "MZ|MOZ|508|258|MZN|Africa|Eastern Africa",
  "RE|REU|638|262|EUR|Africa|Eastern Africa",
  "RW|RWA|646|250|RWF|Africa|Eastern Africa",
  "SC|SYC|690|248|SCR|Africa|Eastern Africa",
  "SO|SOM|706|252|SOS|Africa|Eastern Africa",
  "SS|SSD|728|211|SSP|Africa|Eastern Africa",
  "TZ|TZA|834|255|TZS|Africa|Eastern Africa",
  "UG|UGA|800|256|UGX|Africa|Eastern Africa",
  "ZM|ZMB|894|260|ZMW|Africa|Eastern Africa",
  "ZW|ZWE|716|263|ZWG|Africa|Eastern Africa",
  "BJ|BEN|204|229|XOF|Africa|Western Africa",
  "BF|BFA|854|226|XOF|Africa|Western Africa",
  "CV|CPV|132|238|CVE|Africa|Western Africa",
  "CI|CIV|384|225|XOF|Africa|Western Africa",
  "GM|GMB|270|220|GMD|Africa|Western Africa",
  "GH|GHA|288|233|GHS|Africa|Western Africa",
  "GN|GIN|324|224|GNF|Africa|Western Africa",
  "GW|GNB|624|245|XOF|Africa|Western Africa",
  "LR|LBR|430|231|LRD|Africa|Western Africa",
  "ML|MLI|466|223|XOF|Africa|Western Africa",
  "MR|MRT|478|222|MRU|Africa|Western Africa",
  "NE|NER|562|227|XOF|Africa|Western Africa",
  "NG|NGA|566|234|NGN|Africa|Western Africa",
  "SH|SHN|654|290|SHP|Africa|Western Africa",
  "SN|SEN|686|221|XOF|Africa|Western Africa",
  "SL|SLE|694|232|SLE|Africa|Western Africa",
  "TG|TGO|768|228|XOF|Africa|Western Africa",

  // ── Americas ───────────────────────────────────────────────────────────
  "AG|ATG|028|1|XCD|Americas|Caribbean",
  "AI|AIA|660|1|XCD|Americas|Caribbean",
  "AW|ABW|533|297|AWG|Americas|Caribbean",
  "BS|BHS|044|1|BSD|Americas|Caribbean",
  "BB|BRB|052|1|BBD|Americas|Caribbean",
  "BQ|BES|535|599|USD|Americas|Caribbean",
  "CU|CUB|192|53|CUP|Americas|Caribbean",
  "CW|CUW|531|599|ANG|Americas|Caribbean",
  "DM|DMA|212|1|XCD|Americas|Caribbean",
  "DO|DOM|214|1|DOP|Americas|Caribbean",
  "GD|GRD|308|1|XCD|Americas|Caribbean",
  "GP|GLP|312|590|EUR|Americas|Caribbean",
  "HT|HTI|332|509|HTG|Americas|Caribbean",
  "JM|JAM|388|1|JMD|Americas|Caribbean",
  "KY|CYM|136|1|KYD|Americas|Caribbean",
  "MQ|MTQ|474|596|EUR|Americas|Caribbean",
  "MS|MSR|500|1|XCD|Americas|Caribbean",
  "PR|PRI|630|1|USD|Americas|Caribbean",
  "BL|BLM|652|590|EUR|Americas|Caribbean",
  "KN|KNA|659|1|XCD|Americas|Caribbean",
  "LC|LCA|662|1|XCD|Americas|Caribbean",
  "MF|MAF|663|590|EUR|Americas|Caribbean",
  "VC|VCT|670|1|XCD|Americas|Caribbean",
  "SX|SXM|534|1|ANG|Americas|Caribbean",
  "TT|TTO|780|1|TTD|Americas|Caribbean",
  "TC|TCA|796|1|USD|Americas|Caribbean",
  "VG|VGB|092|1|USD|Americas|Caribbean",
  "VI|VIR|850|1|USD|Americas|Caribbean",
  "BZ|BLZ|084|501|BZD|Americas|Central America",
  "CR|CRI|188|506|CRC|Americas|Central America",
  "SV|SLV|222|503|USD|Americas|Central America",
  "GT|GTM|320|502|GTQ|Americas|Central America",
  "HN|HND|340|504|HNL|Americas|Central America",
  "MX|MEX|484|52|MXN|Americas|Central America",
  "NI|NIC|558|505|NIO|Americas|Central America",
  "PA|PAN|591|507|PAB|Americas|Central America",
  "AR|ARG|032|54|ARS|Americas|South America",
  "BO|BOL|068|591|BOB|Americas|South America",
  "BR|BRA|076|55|BRL|Americas|South America",
  "CL|CHL|152|56|CLP|Americas|South America",
  "CO|COL|170|57|COP|Americas|South America",
  "EC|ECU|218|593|USD|Americas|South America",
  "FK|FLK|238|500|FKP|Americas|South America",
  "GF|GUF|254|594|EUR|Americas|South America",
  "GY|GUY|328|592|GYD|Americas|South America",
  "PY|PRY|600|595|PYG|Americas|South America",
  "PE|PER|604|51|PEN|Americas|South America",
  "SR|SUR|740|597|SRD|Americas|South America",
  "UY|URY|858|598|UYU|Americas|South America",
  "VE|VEN|862|58|VES|Americas|South America",
  "BM|BMU|060|1|BMD|Americas|Northern America",
  "CA|CAN|124|1|CAD|Americas|Northern America",
  "GL|GRL|304|299|DKK|Americas|Northern America",
  "PM|SPM|666|508|EUR|Americas|Northern America",
  "US|USA|840|1|USD|Americas|Northern America",

  // ── Asia ───────────────────────────────────────────────────────────────
  "KZ|KAZ|398|7|KZT|Asia|Central Asia",
  "KG|KGZ|417|996|KGS|Asia|Central Asia",
  "TJ|TJK|762|992|TJS|Asia|Central Asia",
  "TM|TKM|795|993|TMT|Asia|Central Asia",
  "UZ|UZB|860|998|UZS|Asia|Central Asia",
  "CN|CHN|156|86|CNY|Asia|Eastern Asia",
  "HK|HKG|344|852|HKD|Asia|Eastern Asia",
  "JP|JPN|392|81|JPY|Asia|Eastern Asia",
  "KP|PRK|408|850|KPW|Asia|Eastern Asia",
  "KR|KOR|410|82|KRW|Asia|Eastern Asia",
  "MO|MAC|446|853|MOP|Asia|Eastern Asia",
  "MN|MNG|496|976|MNT|Asia|Eastern Asia",
  "TW|TWN|158|886|TWD|Asia|Eastern Asia",
  "BN|BRN|096|673|BND|Asia|South-eastern Asia",
  "KH|KHM|116|855|KHR|Asia|South-eastern Asia",
  "ID|IDN|360|62|IDR|Asia|South-eastern Asia",
  "LA|LAO|418|856|LAK|Asia|South-eastern Asia",
  "MY|MYS|458|60|MYR|Asia|South-eastern Asia",
  "MM|MMR|104|95|MMK|Asia|South-eastern Asia",
  "PH|PHL|608|63|PHP|Asia|South-eastern Asia",
  "SG|SGP|702|65|SGD|Asia|South-eastern Asia",
  "TH|THA|764|66|THB|Asia|South-eastern Asia",
  "TL|TLS|626|670|USD|Asia|South-eastern Asia",
  "VN|VNM|704|84|VND|Asia|South-eastern Asia",
  "AF|AFG|004|93|AFN|Asia|Southern Asia",
  "BD|BGD|050|880|BDT|Asia|Southern Asia",
  "BT|BTN|064|975|BTN|Asia|Southern Asia",
  "IN|IND|356|91|INR|Asia|Southern Asia",
  "IR|IRN|364|98|IRR|Asia|Southern Asia",
  "MV|MDV|462|960|MVR|Asia|Southern Asia",
  "NP|NPL|524|977|NPR|Asia|Southern Asia",
  "PK|PAK|586|92|PKR|Asia|Southern Asia",
  "LK|LKA|144|94|LKR|Asia|Southern Asia",
  "AM|ARM|051|374|AMD|Asia|Western Asia",
  "AZ|AZE|031|994|AZN|Asia|Western Asia",
  "BH|BHR|048|973|BHD|Asia|Western Asia",
  "CY|CYP|196|357|EUR|Asia|Western Asia",
  "GE|GEO|268|995|GEL|Asia|Western Asia",
  "IQ|IRQ|368|964|IQD|Asia|Western Asia",
  "IL|ISR|376|972|ILS|Asia|Western Asia",
  "JO|JOR|400|962|JOD|Asia|Western Asia",
  "KW|KWT|414|965|KWD|Asia|Western Asia",
  "LB|LBN|422|961|LBP|Asia|Western Asia",
  "OM|OMN|512|968|OMR|Asia|Western Asia",
  "PS|PSE|275|970|ILS|Asia|Western Asia",
  "QA|QAT|634|974|QAR|Asia|Western Asia",
  "SA|SAU|682|966|SAR|Asia|Western Asia",
  "SY|SYR|760|963|SYP|Asia|Western Asia",
  "TR|TUR|792|90|TRY|Asia|Western Asia",
  "AE|ARE|784|971|AED|Asia|Western Asia",
  "YE|YEM|887|967|YER|Asia|Western Asia",

  // ── Europe ─────────────────────────────────────────────────────────────
  "BY|BLR|112|375|BYN|Europe|Eastern Europe",
  "BG|BGR|100|359|BGN|Europe|Eastern Europe",
  "CZ|CZE|203|420|CZK|Europe|Eastern Europe",
  "HU|HUN|348|36|HUF|Europe|Eastern Europe",
  "MD|MDA|498|373|MDL|Europe|Eastern Europe",
  "PL|POL|616|48|PLN|Europe|Eastern Europe",
  "RO|ROU|642|40|RON|Europe|Eastern Europe",
  "RU|RUS|643|7|RUB|Europe|Eastern Europe",
  "SK|SVK|703|421|EUR|Europe|Eastern Europe",
  "UA|UKR|804|380|UAH|Europe|Eastern Europe",
  "AX|ALA|248|358|EUR|Europe|Northern Europe",
  "DK|DNK|208|45|DKK|Europe|Northern Europe",
  "EE|EST|233|372|EUR|Europe|Northern Europe",
  "FO|FRO|234|298|DKK|Europe|Northern Europe",
  "FI|FIN|246|358|EUR|Europe|Northern Europe",
  "GG|GGY|831|44|GBP|Europe|Northern Europe",
  "IS|ISL|352|354|ISK|Europe|Northern Europe",
  "IE|IRL|372|353|EUR|Europe|Northern Europe",
  "IM|IMN|833|44|GBP|Europe|Northern Europe",
  "JE|JEY|832|44|GBP|Europe|Northern Europe",
  "LV|LVA|428|371|EUR|Europe|Northern Europe",
  "LT|LTU|440|370|EUR|Europe|Northern Europe",
  "NO|NOR|578|47|NOK|Europe|Northern Europe",
  "SJ|SJM|744|47|NOK|Europe|Northern Europe",
  "SE|SWE|752|46|SEK|Europe|Northern Europe",
  "GB|GBR|826|44|GBP|Europe|Northern Europe",
  "AL|ALB|008|355|ALL|Europe|Southern Europe",
  "AD|AND|020|376|EUR|Europe|Southern Europe",
  "BA|BIH|070|387|BAM|Europe|Southern Europe",
  "HR|HRV|191|385|EUR|Europe|Southern Europe",
  "GI|GIB|292|350|GIP|Europe|Southern Europe",
  "GR|GRC|300|30|EUR|Europe|Southern Europe",
  "VA|VAT|336|39|EUR|Europe|Southern Europe",
  "IT|ITA|380|39|EUR|Europe|Southern Europe",
  "MT|MLT|470|356|EUR|Europe|Southern Europe",
  "ME|MNE|499|382|EUR|Europe|Southern Europe",
  "MK|MKD|807|389|MKD|Europe|Southern Europe",
  "PT|PRT|620|351|EUR|Europe|Southern Europe",
  "SM|SMR|674|378|EUR|Europe|Southern Europe",
  "RS|SRB|688|381|RSD|Europe|Southern Europe",
  "SI|SVN|705|386|EUR|Europe|Southern Europe",
  "ES|ESP|724|34|EUR|Europe|Southern Europe",
  "AT|AUT|040|43|EUR|Europe|Western Europe",
  "BE|BEL|056|32|EUR|Europe|Western Europe",
  "FR|FRA|250|33|EUR|Europe|Western Europe",
  "DE|DEU|276|49|EUR|Europe|Western Europe",
  "LI|LIE|438|423|CHF|Europe|Western Europe",
  "LU|LUX|442|352|EUR|Europe|Western Europe",
  "MC|MCO|492|377|EUR|Europe|Western Europe",
  "NL|NLD|528|31|EUR|Europe|Western Europe",
  "CH|CHE|756|41|CHF|Europe|Western Europe",

  // ── Oceania ────────────────────────────────────────────────────────────
  "AS|ASM|016|1|USD|Oceania|Polynesia",
  "AU|AUS|036|61|AUD|Oceania|Australia and New Zealand",
  "CK|COK|184|682|NZD|Oceania|Polynesia",
  "CX|CXR|162|61|AUD|Oceania|Australia and New Zealand",
  "CC|CCK|166|61|AUD|Oceania|Australia and New Zealand",
  "FJ|FJI|242|679|FJD|Oceania|Melanesia",
  "PF|PYF|258|689|XPF|Oceania|Polynesia",
  "GU|GUM|316|1|USD|Oceania|Micronesia",
  "KI|KIR|296|686|AUD|Oceania|Micronesia",
  "MH|MHL|584|692|USD|Oceania|Micronesia",
  "FM|FSM|583|691|USD|Oceania|Micronesia",
  "NR|NRU|520|674|AUD|Oceania|Micronesia",
  "NC|NCL|540|687|XPF|Oceania|Melanesia",
  "NZ|NZL|554|64|NZD|Oceania|Australia and New Zealand",
  "NU|NIU|570|683|NZD|Oceania|Polynesia",
  "NF|NFK|574|672|AUD|Oceania|Australia and New Zealand",
  "MP|MNP|580|1|USD|Oceania|Micronesia",
  "PW|PLW|585|680|USD|Oceania|Micronesia",
  "PG|PNG|598|675|PGK|Oceania|Melanesia",
  "PN|PCN|612|64|NZD|Oceania|Polynesia",
  "WS|WSM|882|685|WST|Oceania|Polynesia",
  "SB|SLB|090|677|SBD|Oceania|Melanesia",
  "TK|TKL|772|690|NZD|Oceania|Polynesia",
  "TO|TON|776|676|TOP|Oceania|Polynesia",
  "TV|TUV|798|688|AUD|Oceania|Polynesia",
  "VU|VUT|548|678|VUV|Oceania|Melanesia",
  "WF|WLF|876|681|XPF|Oceania|Polynesia",

  // ── Antarctica and remote territories ──────────────────────────────────
  "AQ|ATA|010|672|USD|Antarctica|Antarctica",
  "BV|BVT|074|47|NOK|Antarctica|Antarctica",
  "TF|ATF|260|262|EUR|Antarctica|Antarctica",
  "HM|HMD|334|61|AUD|Antarctica|Antarctica",
  "GS|SGS|239|500|GBP|Antarctica|Antarctica",
  "IO|IOT|086|246|USD|Africa|Eastern Africa",
  "UM|UMI|581|1|USD|Oceania|Micronesia",
];

export interface CountrySeed {
  code: string;
  alpha3: string;
  numeric: string;
  name: string;
  dialCode: string;
  currency: string;
  region: string;
  subregion: string;
}

/**
 * Names come from CLDR via Intl. `of()` returns the code itself when a region is
 * unknown to the runtime, which would store "XK" as a country name — so that
 * case falls back to the code and is visible rather than silently wrong.
 */
export function countrySeeds(): CountrySeed[] {
  const display = new Intl.DisplayNames(["en"], { type: "region" });

  return COUNTRY_ROWS.map((row) => {
    const [code, alpha3, numeric, dialCode, currency, region, subregion] = row.split("|") as [
      string, string, string, string, string, string, string,
    ];

    let name = code;
    try {
      name = display.of(code) ?? code;
    } catch {
      name = code;
    }

    return { code, alpha3, numeric, name, dialCode, currency, region, subregion };
  });
}
