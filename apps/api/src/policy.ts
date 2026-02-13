const EMERGENCY_KEYWORDS = [
  "emergency",
  "urgent",
  "chest pain",
  "shortness of breath",
  "suicide",
  "overdose",
  "unconscious",
  "bleeding"
];

export function detectEmergency(message: string): boolean {
  const lower = message.toLowerCase();
  return EMERGENCY_KEYWORDS.some((keyword) => lower.includes(keyword));
}
