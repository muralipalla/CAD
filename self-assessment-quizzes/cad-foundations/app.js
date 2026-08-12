const form = document.querySelector("[data-quiz-form]");
const submitButton = document.querySelector("[data-submit]");
const resetButton = document.querySelector("[data-reset]");
const scoreNode = document.querySelector("[data-score]");
const messageNode = document.querySelector("[data-message]");
const scoreTitle = document.querySelector("#score-title");
const answers = { q1: "b", q2: "a", q3: "b", q4: "b", q5: "b", q6: "a" };

function gradeQuiz() {
  const data = new FormData(form);
  const unanswered = Object.keys(answers).filter((name) => !data.get(name));
  if (unanswered.length) {
    messageNode.textContent = `Answer ${unanswered.length} remaining question${unanswered.length === 1 ? "" : "s"} before checking.`;
    const first = form.querySelector(`[name="${unanswered[0]}"]`);
    first?.focus();
    return;
  }

  let score = 0;
  for (const [name, correctAnswer] of Object.entries(answers)) {
    const question = form.querySelector(`[data-question="${name}"]`);
    const correct = data.get(name) === correctAnswer;
    score += correct ? 1 : 0;
    question.classList.toggle("correct", correct);
    question.classList.toggle("incorrect", !correct);
    const feedback = question.querySelector("[data-feedback]");
    feedback.textContent = `${correct ? "Correct. " : "Review: "}${feedback.textContent.replace(/^(Correct\. |Review: )/, "")}`;
  }

  const total = Object.keys(answers).length;
  scoreNode.textContent = `${score}/${total}`;
  scoreNode.setAttribute("aria-label", `Score ${score} of ${total}`);
  scoreNode.classList.add("complete");
  scoreTitle.textContent = score === total ? "Strong foundation" : score >= 4 ? "Nearly there" : "Worth a review";
  messageNode.textContent = score === total
    ? "Excellent—your answers show a secure grasp of the core ideas."
    : score >= 4
      ? "Read the highlighted explanations, then try the missed ideas in a module."
      : "Use the explanations as a map for what to revisit before trying again.";
  submitButton.hidden = true;
  resetButton.hidden = false;
  for (const input of form.querySelectorAll("input")) input.disabled = true;
  scoreNode.focus();
}

function resetQuiz() {
  for (const input of form.querySelectorAll("input")) input.disabled = false;
  form.reset();
  for (const question of form.querySelectorAll("[data-question]")) {
    question.classList.remove("correct", "incorrect");
    const feedback = question.querySelector("[data-feedback]");
    feedback.textContent = feedback.textContent.replace(/^(Correct\. |Review: )/, "");
  }
  scoreNode.textContent = "—";
  scoreNode.setAttribute("aria-label", "Quiz not yet scored");
  scoreNode.classList.remove("complete");
  scoreTitle.textContent = "Ready when you are";
  messageNode.textContent = "Answer all six questions, then check your understanding.";
  submitButton.hidden = false;
  resetButton.hidden = true;
  form.querySelector("input")?.focus();
}

submitButton?.addEventListener("click", gradeQuiz);
resetButton?.addEventListener("click", resetQuiz);
