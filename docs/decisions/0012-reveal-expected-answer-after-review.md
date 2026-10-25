# 0012: Reveal the expected answer of failed answers after review

Status: accepted. Supersedes the wording of NFR-2 ("never sent to the client before or after submission").

## Context
The review only said why an answer failed. For learning, the learner also wants to see the correct answer once the attempt is graded. The original rule kept expected answers server-only so that they could not be read before answering.

## Decision
`questions.expected_answer` stays server-only while the learner can still answer: `GET /questionnaires/:id` never contains it. `GET /submissions/:id` returns `expectedAnswer` for an answer only when the submission is `reviewed` and that answer's verdict is `failed`; it is `null` for passed answers and for submissions that are not reviewed. The submission page shows it as "Poprawna odpowiedź: …". NFR-2 is rewritten accordingly.

## Alternatives
Reveal for every answer (more exposure than needed; passed answers gain nothing); keep the original rule (feedback alone has to carry the correction, which often paraphrases the answer anyway).

## Consequences
A learner can read the correct answers of a set after one attempt and retype them in "Rozwiąż ponownie", so repeated attempts measure memory of the answers, not understanding. Accepted for a single-user study tool. Tests assert both the questionnaire omission and the failed-only reveal.
