// Country calling codes for the phone question's country picker.
export const COUNTRIES: { iso: string; name: string; dial: string }[] = [
  ["US", "United States", "1"], ["CA", "Canada", "1"], ["GB", "United Kingdom", "44"], ["AU", "Australia", "61"],
  ["NZ", "New Zealand", "64"], ["IE", "Ireland", "353"], ["AE", "United Arab Emirates", "971"], ["SA", "Saudi Arabia", "966"],
  ["QA", "Qatar", "974"], ["KW", "Kuwait", "965"], ["BH", "Bahrain", "973"], ["OM", "Oman", "968"], ["JO", "Jordan", "962"],
  ["EG", "Egypt", "20"], ["MA", "Morocco", "212"], ["DZ", "Algeria", "213"], ["TN", "Tunisia", "216"], ["NG", "Nigeria", "234"],
  ["GH", "Ghana", "233"], ["KE", "Kenya", "254"], ["ZA", "South Africa", "27"], ["ET", "Ethiopia", "251"], ["SO", "Somalia", "252"],
  ["SD", "Sudan", "249"], ["TZ", "Tanzania", "255"], ["UG", "Uganda", "256"], ["IN", "India", "91"], ["PK", "Pakistan", "92"],
  ["BD", "Bangladesh", "880"], ["LK", "Sri Lanka", "94"], ["NP", "Nepal", "977"], ["AF", "Afghanistan", "93"], ["TR", "Turkey", "90"],
  ["IR", "Iran", "98"], ["IQ", "Iraq", "964"], ["LB", "Lebanon", "961"], ["SY", "Syria", "963"], ["PS", "Palestine", "970"],
  ["ID", "Indonesia", "62"], ["MY", "Malaysia", "60"], ["SG", "Singapore", "65"], ["PH", "Philippines", "63"], ["TH", "Thailand", "66"],
  ["VN", "Vietnam", "84"], ["CN", "China", "86"], ["HK", "Hong Kong", "852"], ["JP", "Japan", "81"], ["KR", "South Korea", "82"],
  ["DE", "Germany", "49"], ["FR", "France", "33"], ["ES", "Spain", "34"], ["IT", "Italy", "39"], ["NL", "Netherlands", "31"],
  ["BE", "Belgium", "32"], ["CH", "Switzerland", "41"], ["AT", "Austria", "43"], ["SE", "Sweden", "46"], ["NO", "Norway", "47"],
  ["DK", "Denmark", "45"], ["FI", "Finland", "358"], ["PL", "Poland", "48"], ["PT", "Portugal", "351"], ["GR", "Greece", "30"],
  ["RU", "Russia", "7"], ["UA", "Ukraine", "380"], ["BR", "Brazil", "55"], ["MX", "Mexico", "52"], ["AR", "Argentina", "54"],
  ["CO", "Colombia", "57"], ["CL", "Chile", "56"], ["PE", "Peru", "51"], ["JM", "Jamaica", "1876"], ["TT", "Trinidad and Tobago", "1868"],
].map(([iso, name, dial]) => ({ iso, name, dial }));

export const flag = (iso: string): string =>
  String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));

/** Split "+61478545589" into a country and the national number. Longest dial-code wins. */
export function splitPhone(value: string): { iso: string; national: string } | null {
  const m = /^\+(\d+)/.exec(value.trim());
  if (!m) return null;
  const digits = m[1];
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  const hit = sorted.find((c) => digits.startsWith(c.dial));
  return hit ? { iso: hit.iso, national: digits.slice(hit.dial.length) } : null;
}
