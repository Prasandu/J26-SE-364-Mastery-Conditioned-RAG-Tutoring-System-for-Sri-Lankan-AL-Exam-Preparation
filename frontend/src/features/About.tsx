import { Card, SectionHeading } from "@/components/Card";
import { Hero } from "@/components/Hero";

const MARKERS = [
  {
    name: "Answer key",
    detail:
      "Plain code. Compares an MCQ choice with the official key, including questions where more than one option is accepted.",
  },
  {
    name: "Chemistry checker",
    detail:
      "Plain code. Reads numbers, units and formulas out of an answer and compares them with tolerance, so 0.0800 mol dm-3 and 8.00 x 10^-2 mol dm-3 both count.",
  },
  {
    name: "AI judge",
    detail:
      "A language model, asked about each marking point separately. It must quote the student's own words as evidence and say how sure it is.",
  },
  {
    name: "Teacher",
    detail:
      "The final say. Anything the machines disagree about, or are not confident about, waits for a person.",
  },
];

export function About() {
  return (
    <div className="space-y-8">
      <Hero eyebrow="J26-SE-364" title="How this system marks">
        <p>
          A final year research project at SLIIT, testing whether A/L Chemistry answers can be
          marked point by point, accurately enough to be useful, with a teacher kept in the loop.
        </p>
      </Hero>

      <Card>
        <SectionHeading>Four markers, one answer</SectionHeading>
        <p className="text-sm text-slate-600">
          A question is not marked as a whole. The official scheme splits it into separate points,
          and each point is decided on its own by whichever marker can judge it.
        </p>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          {MARKERS.map((marker) => (
            <div key={marker.name}>
              <dt className="font-medium text-slate-900">{marker.name}</dt>
              <dd className="mt-1 text-sm text-slate-600">{marker.detail}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <SectionHeading>Checking each other</SectionHeading>
        <p className="text-sm text-slate-600">
          The chemistry checker and the AI judge decide the same point independently, without seeing
          each other's answer. If they agree, the mark stands. If they disagree, or the AI is not
          sure enough, the point goes to a teacher instead of being guessed.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          How often each marker matches a teacher is the result this project reports.
        </p>
      </Card>

      <Card>
        <SectionHeading>Your answers, not the camera's</SectionHeading>
        <p className="text-sm text-slate-600">
          Handwriting and MCQ sheets are read by machine, but what the machine read is always shown
          to you first, and you can correct it before anything is marked. The marking is about your
          chemistry, not about how clearly you write or how good your phone is.
        </p>
      </Card>

      <Card>
        <SectionHeading>Privacy</SectionHeading>
        <p className="text-sm text-slate-600">
          Scripts are stored under a code, never a name. Marks given here are for research only.
          They do not appear on any school record and have no effect on the G.C.E. (A/L)
          examination.
        </p>
      </Card>
    </div>
  );
}
