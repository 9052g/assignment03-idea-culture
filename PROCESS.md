# Process

## Starting idea

I wanted an interactive space where someone plants unrelated words and watches ideas spread like a living network. When two networks meet, their intersection becomes the birthplace of a new association. The result can be a question, an abstract concept, a contradiction or an image, rather than necessarily a product or a physical place.

## Design and development

I explored several visual approaches. Early versions were too circular, straight, or fuzzy; I used slime-mould references to move toward branching, interconnected veins with an irregular outline. Each colony has a finite growing area. A new colony at an intersection can grow in turn, instead of one network expanding forever. Ideas are generated gradually so the screen does not fill all at once.

Two people tried the experience. They clicked once and did not know what to do next. In response, I added a short, changing instruction explaining how to plant the first and second words and what to expect when the networks meet. This revision still needs another user test.

## AI use and decisions

I used OpenAI Codex to help develop the interface, growth behaviour, local model integration and documentation. Codex helped implement a growing network whose intersections produce ideas; I kept this interaction. I rejected earlier results that looked too circular or fuzzy and associations that sounded like generic invented products or places, and asked for more organic branching and a wider range of abstract associations. The running artwork uses the local Ollama `qwen3:8b` model to generate associations; its output is variable and is not guaranteed to be useful.

## Next steps

Retest the revised instructions; add a screenshot or recording and a sample demonstration for markers who cannot run the local model. This repository begins with a snapshot of an existing local prototype, so earlier design iterations are described above rather than represented as Git commits.
