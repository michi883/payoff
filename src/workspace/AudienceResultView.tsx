import { useState } from "react";
import type { AudienceResultViewModel } from "../domain/audience";
import type { StoryBeat } from "../domain/types";

const matchLabels = {
  strong: "Strong match",
  partial: "Partial match",
  missed: "Missed target",
  insufficient: "Not enough evidence",
};

function beatLabel(beats: StoryBeat[], beatId: string | null) {
  const beat = beats.find((candidate) => candidate.id === beatId);
  return beat ? `Beat ${beat.order} · ${beat.title}` : "No single beat yet";
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AudienceResultView({
  result,
  beats,
  onUnderstand,
}: {
  result: AudienceResultViewModel;
  beats: StoryBeat[];
  onUnderstand: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isAI = result.source === "ai";
  const isRehearsal = result.evidenceKind === "rehearsal";
  const sourceLabel = isAI
    ? "AI Audience · simulated"
    : isRehearsal
      ? "Human Audience · Rehearsal data"
      : `Human Audience · ${result.audienceSize} real ${result.audienceSize === 1 ? "viewer" : "viewers"}`;

  return (
    <section className="audience-report" aria-label={`${isAI ? "AI" : "Human"} Audience report`}>
      <header className="report-source">
        <div>
          <span className={`source-mark source-mark--${result.source}`} aria-hidden="true" />
          <strong>{sourceLabel}</strong>
        </div>
        {isAI && <p>Useful as an early check. Not human evidence.</p>}
        {isRehearsal && <p>Synthetic development fixture. Not real viewer evidence.</p>}
      </header>

      <section className="report-overview">
        <div className="report-verdict">
          <span>Overall result</span>
          <h2 className={`report-match report-match--${result.match}`}>{matchLabels[result.match]}</h2>
        </div>

        <div className="report-arcs" aria-label="Intended and observed emotional arcs">
          <article>
            <span>You wanted</span>
            <strong>{result.intendedPayoff}</strong>
          </article>
          <span className="arc-divider" aria-hidden="true">→</span>
          <article>
            <span>Audience felt</span>
            <strong>{result.audienceLanding}</strong>
          </article>
        </div>

        <div className="report-takeaways" aria-label="Three main takeaways">
          <article>
            <span className="takeaway-icon takeaway-icon--landed" aria-hidden="true">✓</span>
            <div><h3>What landed</h3><p>{result.whatLanded}</p></div>
          </article>
          <article>
            <span className="takeaway-icon takeaway-icon--drifted" aria-hidden="true">↗</span>
            <div><h3>Where it drifted</h3><p>{result.whereItDrifted}</p></div>
          </article>
          <article>
            <span className="takeaway-icon takeaway-icon--opportunity" aria-hidden="true">✦</span>
            <div><h3>Biggest opportunity</h3><p>{result.biggestOpportunity}</p></div>
          </article>
        </div>

        <div className="report-actions">
          <button className="primary-button" onClick={onUnderstand}>Understand why</button>
          <button
            className="secondary-button"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? "Hide details" : "See details"}
          </button>
        </div>
      </section>

      {detailsOpen && (
        <section className="report-details" aria-label="Audience report details">
          <header><span className="kicker">Supporting evidence</span><h3>What shaped the result</h3></header>

          <section className="detail-arc">
            <span>Emotional progression</span>
            <div className="arc-steps">
              {result.observedArc.map((emotion, index) => <span key={`${emotion}-${index}`}>{emotion}</span>)}
            </div>
          </section>

          <div className="detail-grid">
            <article>
              <span>Strongest beat</span>
              <h4>{beatLabel(beats, result.strongestBeat.beatId)}</h4>
              <p>{result.strongestBeat.why}</p>
            </article>
            <article>
              <span>Weakest or confusing beat</span>
              <h4>{beatLabel(beats, result.weakestBeat.beatId)}</h4>
              <p>{result.weakestBeat.why}</p>
            </article>
            <article>
              <span>Main risk</span>
              <h4>{result.mainRisk}</h4>
            </article>
            <article>
              <span>What changed the audience</span>
              <h4>{beatLabel(beats, result.changedAudience.beatId)}</h4>
              <p>{result.changedAudience.why}</p>
            </article>
          </div>

          {result.disagreements.length > 0 && (
            <section className="detail-disagreements">
              <span>Where perspectives differed</span>
              <ul>{result.disagreements.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}

          <section className="reaction-notes">
            <div className="section-heading">
              <span>Audience reactions</span>
              <h3>{isAI ? "Perspective notes" : isRehearsal ? "Rehearsal response notes" : "Viewer comments"}</h3>
            </div>
            <div className="reaction-grid">
              {result.reactions.map((reaction, index) => (
                <article key={`${reaction.label}-${index}`}>
                  <strong>{reaction.label}</strong>
                  <p>{reaction.note}</p>
                  {reaction.evidence && <small>{reaction.evidence}</small>}
                </article>
              ))}
            </div>
          </section>

          <dl className="report-method">
            <div><dt>{isAI ? "Confidence" : "Evidence strength"}</dt><dd>{result.evidenceStrength}</dd></div>
            <div><dt>How this was made</dt><dd>{result.methodology}</dd></div>
            <div><dt>Source</dt><dd>{result.provenance}</dd></div>
            <div><dt>Tested</dt><dd>{formatDate(result.testedAt)}</dd></div>
          </dl>
        </section>
      )}
    </section>
  );
}
