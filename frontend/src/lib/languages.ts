/** Idiomas suportados pelo Whisper (ISO-639-1) com rótulo em pt-BR. */
export interface LanguageOption {
  value: string;
  label: string;
}

export const LANGUAGES: LanguageOption[] = [
  { value: "pt", label: "Português" },
  { value: "pt-br", label: "Português (Brasil)" },
  { value: "en", label: "Inglês" },
  { value: "es", label: "Espanhol" },
  { value: "fr", label: "Francês" },
  { value: "de", label: "Alemão" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "Japonês" },
  { value: "ko", label: "Coreano" },
  { value: "zh", label: "Chinês" },
  { value: "ru", label: "Russo" },
  { value: "ar", label: "Árabe" },
  { value: "hi", label: "Hindi" },
  { value: "nl", label: "Holandês" },
  { value: "pl", label: "Polonês" },
  { value: "tr", label: "Turco" },
  { value: "sv", label: "Sueco" },
  { value: "no", label: "Norueguês" },
  { value: "da", label: "Dinamarquês" },
  { value: "fi", label: "Finlandês" },
  { value: "cs", label: "Tcheco" },
  { value: "hu", label: "Húngaro" },
  { value: "ro", label: "Romeno" },
  { value: "el", label: "Grego" },
  { value: "he", label: "Hebraico" },
  { value: "fa", label: "Persa" },
  { value: "uk", label: "Ucraniano" },
  { value: "bg", label: "Búlgaro" },
  { value: "hr", label: "Croata" },
  { value: "sr", label: "Sérvio" },
  { value: "sk", label: "Eslovaco" },
  { value: "sl", label: "Esloveno" },
  { value: "lt", label: "Lituano" },
  { value: "lv", label: "Letão" },
  { value: "et", label: "Estoniano" },
  { value: "th", label: "Tailandês" },
  { value: "vi", label: "Vietnamita" },
  { value: "id", label: "Indonésio" },
  { value: "ms", label: "Malaio" },
  { value: "ta", label: "Tâmil" },
  { value: "te", label: "Telugo" },
  { value: "bn", label: "Bengali" },
  { value: "ur", label: "Urdu" },
  { value: "sw", label: "Suaíli" },
  { value: "af", label: "Africâner" },
  { value: "ca", label: "Catalão" },
  { value: "cy", label: "Galês" },
  { value: "eu", label: "Basco" },
  { value: "gl", label: "Galego" },
  { value: "is", label: "Islandês" },
  { value: "ga", label: "Irlandês" },
  { value: "mt", label: "Maltês" },
  { value: "sq", label: "Albanês" },
  { value: "mk", label: "Macedônio" },
  { value: "az", label: "Azerbaijano" },
  { value: "ka", label: "Georgiano" },
  { value: "hy", label: "Armênio" },
  { value: "kk", label: "Cazaque" },
  { value: "uz", label: "Uzbeque" },
  { value: "ne", label: "Nepalês" },
  { value: "si", label: "Cingalês" },
  { value: "my", label: "Birmanês" },
  { value: "km", label: "Khmer" },
  { value: "lo", label: "Lao" },
  { value: "ug", label: "Uigur" },
  { value: "mn", label: "Mongol" },
  { value: "tl", label: "Tagalo" },
];

export function languageLabel(code: string | null | undefined): string {
  if (!code) return "Auto (detectar)";
  const found = LANGUAGES.find((l) => l.value.toLowerCase() === code.toLowerCase());
  return found ? found.label : code;
}

export const AUTO_LANGUAGE = "";

export const languageOptions = [{ value: AUTO_LANGUAGE, label: "Auto (detectar)" }, ...LANGUAGES];