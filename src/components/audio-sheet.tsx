"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  AudioLines,
  Check,
  Mic,
  RotateCcw,
  Square,
  TriangleAlert,
} from "lucide-react";
import { Sheet } from "./sheet";
import { MoneyInput } from "./money-input";
import { PaymentPicker } from "./payment-picker";
import { QuantityStepper } from "./quantity-stepper";
import { useActions } from "./action-provider";
import { useApp } from "@/lib/store";
import { useToast } from "./toast";
import { formatBRL, formatBRLInput, parseMoneyInput } from "@/lib/format";
import { cn } from "@/lib/cn";
import { formatAudioDuration, parseAudioTranscript } from "@/lib/audio";
import {
  getSpeechRecognitionConstructor,
  speechErrorMessage,
  type SpeechRecognitionLike,
} from "@/lib/speech";
import type { PaymentMethod } from "@/lib/types";

/** Um recado curto basta: item, quantidade, valor e como pagou. */
const MAX_SECONDS = 90;

type Phase = "record" | "review" | "success";
type AudioMode = "both" | "transcribe" | "record";

interface AudioSheetProps {
  onClose: () => void;
}

function describeMicError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "O microfone não foi liberado. Permita o acesso nas configurações do navegador e tente de novo.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "Nenhum microfone foi encontrado neste aparelho.";
    }
    if (error.name === "NotReadableError") {
      return "O microfone está sendo usado por outro aplicativo. Feche-o e tente de novo.";
    }
  }
  return "Não conseguimos acessar o microfone. Você ainda pode escrever o que vendeu.";
}

function pickMimeType(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function AudioSheet({ onClose }: AudioSheetProps) {
  const {
    products,
    createAudioDraft,
  } = useApp();
  const { openReview } = useActions();
  const { toast } = useToast();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("record");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null);
  const [recordingSupported, setRecordingSupported] = useState<boolean | null>(
    null,
  );
  const [isAndroid, setIsAndroid] = useState(false);
  const [mode, setMode] = useState<AudioMode>("both");

  const [productId, setProductId] = useState<string | undefined>();
  const [quantity, setQuantity] = useState(1);
  const [amountInput, setAmountInput] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    PaymentMethod | undefined
  >();
  const [confidence, setConfidence] = useState<number | undefined>();
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const keepListeningRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const interimRef = useRef("");
  const timerRef = useRef<number | undefined>(undefined);
  const startedAtRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const availableProducts = products
    .filter((product) => !product.trackStock || product.stock > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const selectedProduct = products.find((product) => product.id === productId);
  const amountCents = parseMoneyInput(amountInput);

  useEffect(() => {
    const hasSpeech = Boolean(getSpeechRecognitionConstructor());
    const hasRecorder =
      typeof window !== "undefined" &&
      typeof window.MediaRecorder !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia);
    const android = /Android/i.test(navigator.userAgent);

    setSpeechSupported(hasSpeech);
    setRecordingSupported(hasRecorder);
    setIsAndroid(android);

    // No Android, o microfone só pode ser usado por uma API por vez:
    // MediaRecorder e SpeechRecognition não funcionam juntos.
    if (hasSpeech && hasRecorder) setMode(android ? "transcribe" : "both");
    else if (hasSpeech) setMode("transcribe");
    else setMode("record");
  }, []);

  // Solta microfone, transcrição, timers e o áudio temporário ao fechar.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      keepListeningRef.current = false;
      if (timerRef.current !== undefined) {
        window.clearInterval(timerRef.current);
      }
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          // O navegador pode já ter encerrado a sessão.
        }
      }
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Ignora: o componente está sendo desmontado.
        }
      }
      const stream = streamRef.current;
      streamRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (recording && elapsed >= MAX_SECONDS) {
      stopRecording();
    }
    // stopRecording só encerra a gravação corrente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, elapsed]);

  function appendTranscript(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const current = finalTranscriptRef.current.trim();
    // O mesmo trecho pode chegar como parcial e depois como final. Não
    // repetimos o que já está no fim do texto.
    if (current.endsWith(clean)) return;
    finalTranscriptRef.current = `${current} ${clean}`
      .replace(/\s+/g, " ")
      .trim();
    setTranscript(finalTranscriptRef.current);
    setSpeechError(null);
  }

  function startRecognition(): boolean {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return false;

    try {
      const recognition = new Recognition();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setSpeechError(null);
      };

      recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) finalText += ` ${text}`;
          else interimText += ` ${text}`;
        }
        if (finalText.trim()) appendTranscript(finalText);
        interimRef.current = interimText.replace(/\s+/g, " ").trim();
        setInterim(interimRef.current);
      };

      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        keepListeningRef.current = false;
        setSpeechError(speechErrorMessage(event.error));
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        if (!keepListeningRef.current) return;
        // O Chrome encerra sozinho depois de um silêncio. Retomamos enquanto
        // a gravação estiver ativa para não perder a segunda frase.
        window.setTimeout(() => {
          if (!keepListeningRef.current) return;
          try {
            recognition.start();
            recognitionRef.current = recognition;
          } catch {
            // Se não der para retomar, o texto já obtido continua válido.
          }
        }, 350);
      };

      keepListeningRef.current = true;
      recognition.start();
      recognitionRef.current = recognition;
      return true;
    } catch {
      keepListeningRef.current = false;
      setSpeechError(
        "Não conseguimos iniciar a transcrição automática. Você pode escrever o que falou.",
      );
      return false;
    }
  }

  function stopRecording() {
    keepListeningRef.current = false;
    setRecording(false);

    if (timerRef.current !== undefined) {
      window.clearInterval(timerRef.current);
      timerRef.current = undefined;
    }

    const recognition = recognitionRef.current;
    const hadRecognition = Boolean(recognition);
    recognitionRef.current = null;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // Sessão já encerrada.
      }
    }

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Ignora.
      }
    }

    // O último trecho pode ter ficado só como "interim". Guardamos para o
    // usuário não perder a frase final.
    if (interimRef.current) {
      appendTranscript(interimRef.current);
      interimRef.current = "";
      setInterim("");
    }

    if (
      hadRecognition &&
      mode !== "record" &&
      speechSupported !== false
    ) {
      window.setTimeout(() => {
        if (!mountedRef.current || finalTranscriptRef.current.trim()) return;
        setSpeechError(
          isAndroid
            ? "Não captamos fala para transcrever. Fale mais perto do microfone ou use o modo Gravar áudio."
            : "Não captamos fala para transcrever. Tente falar mais perto do microfone ou escreva o que vendeu.",
        );
      }, 900);
    }
  }

  async function startRecording() {
    if (recording) return;
    setMicError(null);
    setSpeechError(null);
    setTranscript("");
    setInterim("");
    setElapsed(0);
    finalTranscriptRef.current = "";
    interimRef.current = "";

    const wantsSpeech = mode !== "record" && speechSupported !== false;
    const wantsRecorder = mode !== "transcribe" && recordingSupported !== false;

    if (!wantsSpeech && !wantsRecorder) {
      setMicError(
        "Este navegador não permite gravar áudio aqui. Você pode escrever o que vendeu.",
      );
      return;
    }

    if (wantsRecorder && !navigator.mediaDevices?.getUserMedia) {
      setMicError(
        "Este navegador não permite gravar áudio aqui. Você pode escrever o que vendeu.",
      );
      return;
    }

    if (wantsSpeech && !getSpeechRecognitionConstructor()) {
      setSpeechError(
        "Este navegador não oferece transcrição automática. Escreva o que falou abaixo.",
      );
      if (!wantsRecorder) return;
    }

    // No modo só transcrição, começa pelo reconhecimento: é ele que pede o
    // microfone e precisa ser iniciado dentro do toque da pessoa.
    if (!wantsRecorder) {
      const started = startRecognition();
      if (!started) return;
      startedAtRef.current = performance.now();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const seconds = (performance.now() - startedAtRef.current) / 1000;
        setElapsed(Math.floor(seconds));
      }, 250);
      return;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      setAudioUrl(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        chunksRef.current = [];
        if (blob.size > 0 && mountedRef.current) {
          if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          setAudioUrl(url);
        }
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
      };

      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = performance.now();
      setRecording(true);

      timerRef.current = window.setInterval(() => {
        const seconds = (performance.now() - startedAtRef.current) / 1000;
        setElapsed(Math.floor(seconds));
      }, 250);

      if (wantsSpeech) startRecognition();
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setMicError(describeMicError(error));
      setRecording(false);
    }
  }

  function resetRecording() {
    stopRecording();
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    setTranscript("");
    setInterim("");
    setElapsed(0);
    setMicError(null);
    setSpeechError(null);
    finalTranscriptRef.current = "";
    interimRef.current = "";
  }

  function chooseMode(next: AudioMode) {
    if (recording || next === mode) return;
    resetRecording();
    setMode(next);
  }

  function handleTranscriptChange(value: string) {
    setTranscript(value);
    finalTranscriptRef.current = value;
  }

  function goToReview() {
    const text = transcript.trim();
    const parsed = parseAudioTranscript(text, availableProducts);
    const product = availableProducts.find(
      (item) => item.id === parsed.productId,
    );
    const nextQuantity = product?.trackStock
      ? Math.min(parsed.quantity, Math.max(1, product.stock))
      : parsed.quantity;
    const cents = parsed.amountCents ?? product?.priceCents;

    setProductId(product?.id);
    setQuantity(nextQuantity);
    setAmountInput(
      cents
        ? formatBRLInput(
            parsed.amountCents && nextQuantity === parsed.quantity
              ? cents
              : (product?.priceCents ?? 0) * nextQuantity,
          )
        : "",
    );
    setAmountTouched(false);
    setPaymentMethod(parsed.paymentMethod);
    setConfidence(parsed.confidence);
    setAttempted(false);
    setSaveError(null);
    setPhase("review");
  }

  function chooseProduct(nextId: string) {
    const product = availableProducts.find((item) => item.id === nextId);
    setProductId(product?.id);
    setSaveError(null);
    setAttempted(false);
    if (!product) return;

    const nextQuantity = product.trackStock
      ? Math.min(quantity, Math.max(1, product.stock))
      : quantity;
    setQuantity(nextQuantity);
    if (!amountTouched) {
      setAmountInput(formatBRLInput(product.priceCents * nextQuantity));
    }
  }

  function changeQuantity(next: number) {
    setQuantity(next);
    if (!amountTouched && selectedProduct) {
      setAmountInput(formatBRLInput(selectedProduct.priceCents * next));
    }
  }

  async function handleSave() {
    setAttempted(true);
    setSaveError(null);
    if (saving) return;
    if (!selectedProduct || amountCents < 1) return;
    if (selectedProduct.trackStock && quantity > selectedProduct.stock) {
      setSaveError(
        `Só há ${selectedProduct.stock} em estoque. Ajuste a quantidade para continuar.`,
      );
      return;
    }

    setSaving(true);
    try {
      const draft = await createAudioDraft({
        productId: selectedProduct.id,
        quantity,
        amountCents,
        paymentMethod,
        transcript,
        aiConfidence: confidence,
      });
      setCreatedId(draft.id);
      setPhase("success");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Não conseguimos salvar o rascunho agora.",
      );
    } finally {
      setSaving(false);
    }
  }

  function keepForLater() {
    onClose();
    router.push("/");
    toast("Rascunho guardado. Confira na tela inicial.", "info");
  }

  const productError =
    attempted && !selectedProduct ? "Escolha o item que você vendeu." : null;
  const amountError =
    attempted && amountCents < 1 ? "Informe quanto entrou." : null;
  const hasText = transcript.trim().length > 0;
  const hasCapture = Boolean(audioUrl) || hasText;
  const canChooseMode = Boolean(
    isAndroid && speechSupported && recordingSupported,
  );

  const title =
    phase === "record"
      ? "Falar a venda"
      : phase === "review"
        ? "Confira o que você falou"
        : "Rascunho salvo";

  const description =
    phase === "record"
      ? "Fale em uma frase. Depois você confere antes de entrar no caixa."
      : phase === "review"
        ? "Ajuste o que estiver errado. Nada entra no caixa até você confirmar."
        : "O rascunho ficou guardado para você revisar com calma.";

  return (
    <Sheet
      title={title}
      description={description}
      onClose={onClose}
      footer={
        phase === "record" ? (
          <button
            type="button"
            onClick={goToReview}
            disabled={!hasText || recording}
            className="btn btn-primary h-14 w-full text-base"
          >
            Revisar o que falei
            <ArrowRight className="size-5" strokeWidth={2.2} />
          </button>
        ) : phase === "review" ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPhase("record")}
              className="btn btn-secondary h-14 flex-1 text-sm"
            >
              <RotateCcw className="size-4" strokeWidth={2.2} />
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              aria-busy={saving || undefined}
              className="btn btn-primary h-14 flex-[1.6] text-base"
            >
              {saving ? "Salvando…" : "Salvar rascunho"}
              <Check className="size-5" strokeWidth={2.4} />
            </button>
          </div>
        ) : null
      }
    >
      {phase === "record" ? (
        <div className="space-y-5">
          {canChooseMode ? (
            <section className="rounded-[4px] border border-line bg-paper p-3">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">
                Como quer registrar?
              </p>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">
                No Android, o navegador não grava e transcreve ao mesmo tempo.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => chooseMode("transcribe")}
                  disabled={recording}
                  aria-pressed={mode === "transcribe"}
                  className={cn(
                    "flex min-h-[3.25rem] items-center gap-2 rounded-[4px] border p-2.5 text-left text-[0.75rem] font-bold transition-colors disabled:opacity-60",
                    mode === "transcribe"
                      ? "border-terracotta bg-terracotta-soft text-ink"
                      : "border-line bg-cream text-ink",
                  )}
                >
                  <Mic className="size-4 flex-none text-terracotta-dark" />
                  Transcrever
                </button>
                <button
                  type="button"
                  onClick={() => chooseMode("record")}
                  disabled={recording}
                  aria-pressed={mode === "record"}
                  className={cn(
                    "flex min-h-[3.25rem] items-center gap-2 rounded-[4px] border p-2.5 text-left text-[0.75rem] font-bold transition-colors disabled:opacity-60",
                    mode === "record"
                      ? "border-terracotta bg-terracotta-soft text-ink"
                      : "border-line bg-cream text-ink",
                  )}
                >
                  <AudioLines className="size-4 flex-none text-terracotta-dark" />
                  Gravar áudio
                </button>
              </div>
              <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted">
                {mode === "transcribe"
                  ? "O texto aparece ao vivo; o áudio não fica salvo neste modo."
                  : "O áudio fica disponível para ouvir; escreva o texto abaixo."}
              </p>
            </section>
          ) : null}

          <div className="rounded-[4px] border border-line bg-cream p-4 text-center">
            {recording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="relative mx-auto grid size-24 place-items-center rounded-full bg-terracotta text-cream transition-colors hover:bg-terracotta-dark"
                aria-label="Parar gravação"
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-terracotta/25" />
                <Square className="relative size-7 fill-current" strokeWidth={1.8} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startRecording()}
                disabled={mode !== "transcribe" && recordingSupported === false}
                className="mx-auto grid size-24 place-items-center rounded-full bg-terracotta text-cream transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={hasCapture ? "Gravar de novo" : "Começar a gravar"}
              >
                <Mic className="size-9" strokeWidth={1.8} />
              </button>
            )}

            <p className="mt-3 text-sm font-bold text-ink">
              {recording
                ? "Ouvindo… fale à vontade"
                : hasCapture
                  ? audioUrl
                    ? "Áudio gravado"
                    : "Transcrição pronta"
                  : "Toque para falar"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {recording
                ? `${formatAudioDuration(elapsed)} de ${formatAudioDuration(MAX_SECONDS)}`
                : mode === "transcribe"
                  ? "Transcrição ao vivo. O áudio não é guardado neste modo."
                  : "Item, quantidade, valor e como pagou. Até 1 minuto e meio."}
            </p>

            {audioUrl ? (
              <audio
                controls
                src={audioUrl}
                className="mx-auto mt-3 w-full max-w-sm"
              >
                Seu navegador não reproduz este áudio.
              </audio>
            ) : null}
          </div>

          {micError ? (
            <p className="flex items-start gap-2 rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3 text-xs font-medium leading-relaxed text-terracotta-dark">
              <TriangleAlert className="mt-0.5 size-4 flex-none" strokeWidth={2.1} />
              {micError}
            </p>
          ) : null}

          <div>
            <div className="flex items-end justify-between gap-3">
              <label htmlFor="audio-transcript" className="field-label">
                O que você falou?
              </label>
              {recording && mode !== "record" ? (
                <span className="mb-1 text-[0.6875rem] font-semibold text-terracotta-dark">
                  Transcrevendo…
                </span>
              ) : null}
            </div>
            <textarea
              id="audio-transcript"
              value={transcript}
              onChange={(event) => handleTranscriptChange(event.target.value)}
              rows={4}
              className="text-input min-h-[6.5rem] resize-y"
              placeholder="Ex: Vendi dois bolos de cenoura por cem reais no pix."
            />
            {interim ? (
              <p className="mt-1.5 text-xs italic leading-snug text-muted">
                {interim}
              </p>
            ) : null}
            <p className="field-hint">
              {speechSupported === false
                ? "Este navegador não transcreve sozinho. Grave normalmente e escreva o que falou aqui."
                : mode === "record"
                  ? "Neste modo o áudio é gravado e a transcrição fica manual."
                  : mode === "transcribe"
                    ? "A transcrição aparece ao vivo; o áudio não é guardado."
                    : "A transcrição aparece aqui e pode ser corrigida antes de revisar."}
            </p>
          </div>

          {speechError ? (
            <p className="rounded-[4px] border border-mustard/40 bg-mustard-soft p-3 text-xs font-medium leading-relaxed text-mustard-dark">
              {speechError}
            </p>
          ) : null}

          {speechSupported && mode === "both" && !recording ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => chooseMode("transcribe")}
                className="text-left text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
              >
                Tentar só a transcrição, sem áudio
              </button>
              <button
                type="button"
                onClick={() => chooseMode("record")}
                className="text-left text-[0.6875rem] font-bold text-muted underline underline-offset-2"
              >
                Prefiro gravar só o áudio
              </button>
            </div>
          ) : null}

          {!isAndroid &&
          mode !== "both" &&
          speechSupported &&
          recordingSupported &&
          !recording ? (
            <button
              type="button"
              onClick={() => chooseMode("both")}
              className="text-left text-[0.6875rem] font-bold text-muted underline underline-offset-2"
            >
              Usar áudio e transcrição juntos
            </button>
          ) : null}

          {recordingSupported === false && mode !== "transcribe" ? (
            <p className="rounded-[4px] border border-line bg-cream p-3 text-xs leading-relaxed text-muted">
              A gravação de áudio não está disponível neste navegador. Você
              pode escrever a venda acima e seguir para a revisão.
            </p>
          ) : null}

          {hasCapture && !recording ? (
            <button
              type="button"
              onClick={resetRecording}
              className="btn btn-secondary h-11 w-full text-sm"
            >
              <RotateCcw className="size-4" strokeWidth={2.2} />
              Gravar de novo
            </button>
          ) : null}

          <div className="rounded-[4px] border border-line bg-cream p-3">
            <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">
              <AudioLines className="size-3.5" strokeWidth={2.2} />
              Como funciona
            </p>
            <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink/80">
              {mode === "transcribe"
                ? "Neste modo o navegador ouve e transcreve ao vivo; o áudio não é guardado. O texto fica editável antes de revisar."
                : mode === "record"
                  ? "O áudio é gravado no seu navegador e usado só para esta revisão. Ele não é enviado nem guardado no servidor; escreva o texto abaixo."
                  : "O áudio é gravado no seu navegador e usado só para esta revisão. Ele não é enviado nem guardado no servidor. A transcrição automática depende do navegador e pode falhar — por isso o texto fica editável."}
            </p>
          </div>
        </div>
      ) : null}

      {phase === "review" ? (
        <div className="space-y-5">
          <div className="rounded-[4px] border border-mustard/40 bg-mustard-soft/70 p-3">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-mustard-dark">
              O que ouvimos
            </p>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink">
              “{transcript.trim() || "Áudio sem transcrição automática."}”
            </p>
            <button
              type="button"
              onClick={() => setPhase("record")}
              className="mt-2 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
            >
              Editar o que falei
            </button>
          </div>

          <div>
            <label htmlFor="audio-product" className="field-label">
              O que você vendeu?
            </label>
            <select
              id="audio-product"
              value={productId ?? ""}
              onChange={(event) => chooseProduct(event.target.value)}
              className="text-input"
              aria-invalid={Boolean(productError) || undefined}
            >
              <option value="">Escolha o item</option>
              {availableProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} — {formatBRL(product.priceCents)}
                </option>
              ))}
            </select>
            {productError ? (
              <p className="mt-2 text-xs font-medium text-terracotta-dark">
                {productError}
              </p>
            ) : null}
          </div>

          <div>
            <span className="field-label">Quantas unidades?</span>
            <div className="flex items-center gap-3">
              <QuantityStepper
                value={quantity}
                onChange={changeQuantity}
                max={
                  selectedProduct?.trackStock
                    ? Math.max(1, selectedProduct.stock)
                    : 9999
                }
              />
              {selectedProduct?.trackStock ? (
                <span className="text-xs text-muted">
                  {selectedProduct.stock} em estoque
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <label htmlFor="audio-amount" className="field-label">
              Quanto entrou?
            </label>
            <MoneyInput
              id="audio-amount"
              value={amountInput}
              onChange={(value) => {
                setAmountInput(value);
                setAmountTouched(true);
                setSaveError(null);
              }}
              ariaLabel="Quanto entrou"
              invalid={Boolean(amountError)}
            />
            {amountError ? (
              <p className="mt-2 text-xs font-medium text-terracotta-dark">
                {amountError}
              </p>
            ) : null}
          </div>

          <div>
            <span className="field-label">
              Como pagou?{" "}
              <span className="font-medium normal-case tracking-normal text-muted">
                (se souber)
              </span>
            </span>
            <PaymentPicker value={paymentMethod} onChange={setPaymentMethod} />
            <p className="field-hint">
              Se ficar em branco, você escolhe na confirmação da venda.
            </p>
          </div>

          {saveError ? (
            <p className="flex items-start gap-2 rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3 text-xs font-medium leading-relaxed text-terracotta-dark">
              <TriangleAlert className="mt-0.5 size-4 flex-none" strokeWidth={2.1} />
              {saveError}
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="py-4 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-sage-soft text-sage-dark">
            <Check className="size-8" strokeWidth={2.4} />
          </span>
          <h3 className="display mt-4 text-[1.5rem] leading-tight text-ink">
            Anotado para conferir
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            {selectedProduct?.name} · {quantity}{" "}
            {quantity === 1 ? "unidade" : "unidades"} ·{" "}
            {formatBRL(amountCents)}
          </p>
          <p className="mx-auto mt-3 max-w-sm rounded-[4px] border border-line bg-cream p-3 text-xs leading-relaxed text-ink/80">
            Ainda não entrou no caixa e o estoque não baixou. Ao confirmar na
            revisão, tudo é registrado de uma vez.
          </p>

          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={() => {
                if (!createdId) return;
                openReview(createdId);
              }}
              className="btn btn-primary h-14 w-full text-base"
            >
              Conferir agora
              <ArrowRight className="size-5" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={keepForLater}
              className="btn btn-secondary h-12 w-full text-sm"
            >
              Deixar para depois
            </button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
