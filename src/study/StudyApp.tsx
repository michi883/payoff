import { useEffect, useMemo, useState } from "react";
import { Brand } from "../components/Brand";
import { StoryCard } from "../components/StoryCard";
import { CANONICAL_STUDY } from "../domain/seed";
import type { BeatReaction, ReactionEmotion, StudyResponseExport } from "../domain/types";
import { REACTION_EMOTIONS } from "../domain/types";
import { decodeStudyStimulus } from "./share";

const BEAT_DURATION_MS = 5600;
type Stage = "intro" | "playing" | "questions" | "complete";

type FormState = {
  endingEmotion: ReactionEmotion | "";
  endingEmotionOther: string;
  interpretation: string;
  wasSurprised: "yes" | "no" | "";
  surpriseDetail: string;
  predictionPoint: "not_predicted" | "before_story" | `beat_${1 | 2 | 3 | 4 | 5 | 6}` | "";
  changedBeatId: string;
  changedWhy: string;
  quoteConsent: boolean;
};

const initialForm: FormState = {
  endingEmotion: "",
  endingEmotionOther: "",
  interpretation: "",
  wasSurprised: "",
  surpriseDetail: "",
  predictionPoint: "",
  changedBeatId: "",
  changedWhy: "",
  quoteConsent: false,
};

function responseId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function StudyApp() {
  const stimulus = useMemo(
    () => decodeStudyStimulus(new URLSearchParams(window.location.search).get("stimulus")) ?? CANONICAL_STUDY,
    [],
  );
  const beats = stimulus.beats;
  const [stage, setStage] = useState<Stage>("intro");
  const [beatIndex, setBeatIndex] = useState(0);
  const [isSecondPass, setIsSecondPass] = useState(false);
  const [secondPassComplete, setSecondPassComplete] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [beatReactions, setBeatReactions] = useState<Record<string, ReactionEmotion | "">>(() =>
    Object.fromEntries(beats.map((beat) => [beat.id, ""])),
  );
  const [exportValue, setExportValue] = useState<StudyResponseExport | null>(null);
  const [copied, setCopied] = useState(false);

  const currentBeat = beats[beatIndex];
  const progress = ((beatIndex + 1) / beats.length) * 100;

  useEffect(() => {
    if (stage !== "playing") return;
    const timer = window.setTimeout(() => {
      if (beatIndex < beats.length - 1) {
        setBeatIndex((index) => index + 1);
      } else {
        setStage("questions");
        if (isSecondPass) setSecondPassComplete(true);
      }
    }, BEAT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [beatIndex, beats.length, isSecondPass, stage]);

  const canSubmit = useMemo(
    () =>
      Boolean(
        form.endingEmotion &&
          form.interpretation.trim() &&
          form.wasSurprised &&
          form.predictionPoint &&
          form.changedBeatId &&
          form.changedWhy.trim(),
      ),
    [form],
  );

  function startPlayback(secondPass = false) {
    setBeatIndex(0);
    setIsSecondPass(secondPass);
    setStage("playing");
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submitResponse(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !form.endingEmotion || !form.predictionPoint || !form.changedBeatId || !form.wasSurprised) return;

    const secondPass: BeatReaction[] | undefined = secondPassComplete && Object.values(beatReactions).some(Boolean)
      ? beats.flatMap((beat) => {
          const emotion = beatReactions[beat.id];
          return emotion ? [{ beatId: beat.id, emotion }] : [];
        })
      : undefined;

    const payload: StudyResponseExport = {
      schema: "payoff-study-response/v1",
      study: {
        projectId: stimulus.projectId,
        storyVersionId: stimulus.storyVersionId,
        storyHash: stimulus.storyHash,
        targetWasHidden: true,
        firstViewingWasUninterrupted: true,
      },
      response: {
        id: responseId(),
        storyVersionId: stimulus.storyVersionId,
        storyHash: stimulus.storyHash,
        submittedAt: new Date().toISOString(),
        endingEmotion: form.endingEmotion,
        endingEmotionOther: form.endingEmotionOther.trim() || undefined,
        interpretation: form.interpretation.trim(),
        wasSurprised: form.wasSurprised === "yes",
        surpriseDetail: form.surpriseDetail.trim() || undefined,
        predictionPoint: form.predictionPoint,
        changedBeatId: form.changedBeatId,
        changedWhy: form.changedWhy.trim(),
        quoteConsent: form.quoteConsent,
        secondPass,
      },
    };
    setExportValue(payload);
    setStage("complete");
  }

  function downloadResponse() {
    if (!exportValue) return;
    const blob = new Blob([JSON.stringify(exportValue, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payoff-response-${exportValue.response.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyResponse() {
    if (!exportValue) return;
    await navigator.clipboard.writeText(JSON.stringify(exportValue, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (stage === "playing") {
    return (
      <main className="study-player">
        <header className="study-player__header">
          <Brand compact />
          <span>{isSecondPass ? "Optional second viewing" : "Uninterrupted first viewing"}</span>
          <span>{beatIndex + 1} / {beats.length}</span>
        </header>
        <div className="study-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <section className="study-stage" aria-label={`Story beat ${beatIndex + 1}`}>
          <div className="study-stage__art">
            <StoryCard beat={{ ...currentBeat, intendedEmotion: "" }} compact />
          </div>
          <p className="study-stage__eyebrow">Beat {String(currentBeat.order).padStart(2, "0")}</p>
          <h1>{currentBeat.title}</h1>
          <p className="study-stage__action">{currentBeat.action}</p>
          {currentBeat.line && <p className="study-stage__line">“{currentBeat.line}”</p>}
        </section>
        <p className="study-player__note">The story advances automatically. There are no questions until it ends.</p>
      </main>
    );
  }

  if (stage === "complete" && exportValue) {
    return (
      <main className="study-shell">
        <header className="study-nav"><Brand /><span>Story response</span></header>
        <section className="study-complete panel">
          <span className="kicker">Response ready</span>
          <h1>Thank you for watching.</h1>
          <p>Your anonymous response is ready to send to the creator. It contains no name, email address, or device identifier.</p>
          <div className="study-complete__actions">
            <button className="primary-button" onClick={downloadResponse}>Download response</button>
            <button className="secondary-button" onClick={() => void copyResponse()}>{copied ? "Copied" : "Copy response"}</button>
          </div>
          <p className="microcopy">Send the downloaded response file to the creator. Only responses matching this exact story can be imported.</p>
        </section>
      </main>
    );
  }

  if (stage === "intro") {
    return (
      <main className="study-shell">
        <header className="study-nav"><Brand /><span>Story response</span></header>
        <section className="study-intro">
          <div>
            <span className="kicker">A short story in six beats</span>
            <h1>Watch once.<br />Tell us what stayed.</h1>
            <p>You’ll see the entire story without interruptions. After it ends, answer five short questions about your own reaction. There are no right answers.</p>
            <button className="primary-button primary-button--large" onClick={() => startPlayback(false)}>Begin uninterrupted viewing <span>→</span></button>
            <p className="microcopy">About 40 seconds · Anonymous · No emotional target is shown</p>
          </div>
          <div className="study-intro__poster" aria-hidden="true">
            <div className="poster-card poster-card--back"><span>06</span></div>
            <div className="poster-card poster-card--mid"><span>03</span></div>
            <div className="poster-card poster-card--front">
              <span>01</span>
              <strong>{stimulus.title}</strong>
              <i>{stimulus.format}</i>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="study-shell">
      <header className="study-nav"><Brand /><span>Private response</span></header>
      <form className="study-form" onSubmit={submitResponse}>
        <section className="study-form__intro">
          <span className="kicker">First reaction</span>
          <h1>What did you experience?</h1>
          <p>Answer from memory before reviewing individual beats. The creator’s intended response is intentionally hidden.</p>
        </section>

        <section className="question-card">
          <span className="question-number">01</span>
          <fieldset>
            <legend>What emotion did the ending leave you with?</legend>
            <div className="choice-grid">
              {REACTION_EMOTIONS.map((emotion) => (
                <label className="choice-pill" key={emotion}>
                  <input
                    type="radio"
                    name="endingEmotion"
                    value={emotion}
                    checked={form.endingEmotion === emotion}
                    onChange={() => updateForm("endingEmotion", emotion)}
                  />
                  <span>{emotion}</span>
                </label>
              ))}
            </div>
            <label className="field-label">
              Another word, if useful <span>optional</span>
              <input value={form.endingEmotionOther} maxLength={80} onChange={(event) => updateForm("endingEmotionOther", event.target.value)} />
            </label>
          </fieldset>
        </section>

        <section className="question-card">
          <span className="question-number">02</span>
          <label className="field-label field-label--large">
            What do you think the story means?
            <textarea required maxLength={800} value={form.interpretation} onChange={(event) => updateForm("interpretation", event.target.value)} />
          </label>
        </section>

        <section className="question-card">
          <span className="question-number">03</span>
          <fieldset>
            <legend>Did anything surprise you?</legend>
            <div className="choice-row">
              {(["yes", "no"] as const).map((value) => (
                <label className="choice-pill" key={value}>
                  <input type="radio" name="surprised" checked={form.wasSurprised === value} onChange={() => updateForm("wasSurprised", value)} />
                  <span>{value === "yes" ? "Yes" : "No"}</span>
                </label>
              ))}
            </div>
            <label className="field-label">
              What surprised you, if anything? <span>optional</span>
              <textarea maxLength={500} value={form.surpriseDetail} onChange={(event) => updateForm("surpriseDetail", event.target.value)} />
            </label>
          </fieldset>
        </section>

        <section className="question-card question-card--split">
          <span className="question-number">04</span>
          <label className="field-label">
            When did you predict the ending?
            <select required value={form.predictionPoint} onChange={(event) => updateForm("predictionPoint", event.target.value as FormState["predictionPoint"])}>
              <option value="">Choose one</option>
              <option value="not_predicted">I didn’t predict it</option>
              <option value="before_story">Before the story began</option>
              {beats.map((beat) => <option key={beat.id} value={`beat_${beat.order}`}>During beat {beat.order}</option>)}
            </select>
          </label>
          <label className="field-label">
            Which beat most changed your reaction?
            <select required value={form.changedBeatId} onChange={(event) => updateForm("changedBeatId", event.target.value)}>
              <option value="">Choose one</option>
              {beats.map((beat) => <option key={beat.id} value={beat.id}>Beat {beat.order}: {beat.title}</option>)}
            </select>
          </label>
          <label className="field-label field-label--full">
            Why did that beat change your reaction?
            <textarea required maxLength={800} value={form.changedWhy} onChange={(event) => updateForm("changedWhy", event.target.value)} />
          </label>
        </section>

        <section className="optional-pass panel">
          <div>
            <span className="kicker">Optional second pass</span>
            <h2>Want to tag each beat?</h2>
            <p>This second viewing is recorded separately because you already know the ending.</p>
          </div>
          {!secondPassComplete ? (
            <button type="button" className="secondary-button" onClick={() => startPlayback(true)}>Watch again</button>
          ) : (
            <div className="second-pass-grid">
              {beats.map((beat) => (
                <label key={beat.id}>
                  <span>{beat.order}. {beat.title}</span>
                  <select value={beatReactions[beat.id]} onChange={(event) => setBeatReactions((current) => ({ ...current, [beat.id]: event.target.value as ReactionEmotion }))}>
                    <option value="">No tag</option>
                    {REACTION_EMOTIONS.map((emotion) => <option key={emotion} value={emotion}>{emotion}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
        </section>

        <label className="consent-row">
          <input type="checkbox" checked={form.quoteConsent} onChange={(event) => updateForm("quoteConsent", event.target.checked)} />
          <span>My anonymous written comments may be quoted publicly. <small>Optional; counts can still be used if unchecked.</small></span>
        </label>

        <div className="study-submit">
          <p>No name, email, IP address, or device data is requested.</p>
          <button className="primary-button primary-button--large" type="submit" disabled={!canSubmit}>Prepare anonymous response <span>→</span></button>
        </div>
      </form>
    </main>
  );
}
