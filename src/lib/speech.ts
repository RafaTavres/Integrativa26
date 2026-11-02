/**
 * Tipos mínimos da Web Speech API.
 *
 * O TypeScript não traz `SpeechRecognition` em todas as versões do lib.dom e
 * os navegadores ainda usam o prefixo `webkit`. Estes tipos cobrem só o que o
 * Estokar usa: ditado contínuo em português, com resultado parcial.
 */

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: string;
  readonly message?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;

  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "O navegador não liberou o microfone ou a transcrição. Permita o acesso e tente de novo.";
    case "audio-capture":
      return "Nenhum microfone foi encontrado. Confira o aparelho e tente de novo.";
    case "network":
      return "A transcrição automática não conseguiu falar com o serviço do navegador. Você pode gravar e escrever o que falou.";
    case "no-speech":
      return "Não ouvimos nada. Tente falar um pouco mais perto do microfone.";
    case "language-not-supported":
      return "Este navegador não transcreve em português. Você pode gravar e escrever o que falou.";
    default:
      return "A transcrição automática parou. Você ainda pode escrever o que falou.";
  }
}
